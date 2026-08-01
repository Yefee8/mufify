import { and, asc, count, eq, inArray, isNull, sql } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';

import * as perf from '@/services/perf';
import { needsRescan } from '@/services/scanner/trackMapping';

import { db } from '../client';

import { albums, artists, scanFolders, tracks } from '../schema';

/**
 * Writes the scanner performs. Kept here rather than in the scanner service
 * because only src/db may speak Drizzle — the service takes these as injected
 * ports, which is also what makes it testable without a device.
 */

export interface EnumeratedRow {
  mediaStoreId: string | null;
  fileUri: string;
  title: string;
  artistName: string | null;
  albumName: string | null;
  albumArtist: string | null;
  genre: string | null;
  trackNo: number | null;
  discNo: number | null;
  year: number | null;
  durationMs: number;
  fileSize: number | null;
  dateAdded: number;
  dateModified: number;
}

function sortNameOf(name: string): string {
  return name
    .toLocaleLowerCase('tr')
    .replace(/^(the|a|an)\s+/u, '')
    .trim();
}

/**
 * Rows per statement.
 *
 * SQLite's `SQLITE_MAX_VARIABLE_NUMBER` is 32766 on anything modern but 999 on
 * older builds, and which one Expo bundles is not something to bet a scan on. A
 * track insert binds fifteen columns, so sixty rows is 900 parameters — under
 * the pessimistic ceiling, and still one statement instead of sixty.
 */
const TRACK_CHUNK = 60;
/** Names bind one parameter each, so this can be far larger. */
const NAME_CHUNK = 300;

function chunked<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    out.push(items.slice(index, index + size));
  }
  return out;
}

/**
 * Resolve every artist in a batch to an id, creating the missing ones.
 *
 * Two statements per chunk instead of two per *track*. The version this replaced
 * did an insert and a select for each row, inside a loop over the whole page —
 * see the note on `saveEnumerated`.
 */
async function resolveArtists(names: readonly string[]): Promise<Map<string, number>> {
  const distinct = [...new Set(names)];
  const byName = new Map<string, number>();
  if (distinct.length === 0) return byName;

  for (const chunk of chunked(distinct, NAME_CHUNK)) {
    await db
      .insert(artists)
      .values(chunk.map((name) => ({ name, sortName: sortNameOf(name) })))
      .onConflictDoNothing();

    const rows = await db
      .select({ id: artists.id, name: artists.name })
      .from(artists)
      .where(inArray(artists.name, chunk));

    for (const row of rows) byName.set(row.name, row.id);
  }

  return byName;
}

/** `(album, artist)` as one map key. Artist may legitimately be absent. */
function albumKey(name: string, artistId: number | null): string {
  return `${artistId ?? ''}\u0000${name}`;
}

/**
 * Resolve every `(album, artist)` pair in a batch to an id.
 *
 * Reads before writing rather than relying on `onConflictDoNothing`, because the
 * unique index is on `(name, artist_id)` and **SQLite treats each NULL as
 * distinct in a unique index**. An album with no artist would therefore never
 * conflict with itself, and a blind upsert would add another row for it on every
 * single scan. Selecting first sidesteps that entirely.
 */
async function resolveAlbums(
  pairs: readonly { name: string; artistId: number | null }[],
): Promise<Map<string, number>> {
  const wanted = new Map<string, { name: string; artistId: number | null }>();
  for (const pair of pairs) wanted.set(albumKey(pair.name, pair.artistId), pair);

  const byKey = new Map<string, number>();
  if (wanted.size === 0) return byKey;

  const names = [...new Set([...wanted.values()].map((pair) => pair.name))];

  for (const chunk of chunked(names, NAME_CHUNK)) {
    const rows = await db
      .select({ id: albums.id, name: albums.name, artistId: albums.artistId })
      .from(albums)
      .where(inArray(albums.name, chunk));

    for (const row of rows) byKey.set(albumKey(row.name, row.artistId), row.id);
  }

  const missing = [...wanted.entries()].filter(([key]) => !byKey.has(key));

  for (const chunk of chunked(missing, NAME_CHUNK)) {
    const created = await db
      .insert(albums)
      .values(chunk.map(([, pair]) => ({ name: pair.name, artistId: pair.artistId })))
      .returning({ id: albums.id, name: albums.name, artistId: albums.artistId });

    for (const row of created) byKey.set(albumKey(row.name, row.artistId), row.id);
  }

  return byKey;
}

/**
 * Stage one write.
 *
 * Rows whose `(fileSize, dateModified)` already match what is stored are skipped
 * outright — that pair is the incremental rescan key.
 *
 * **Set-based, and that is the whole point.** This used to loop over the page
 * doing five awaited round trips per track: insert artist, select artist, insert
 * album, select album, upsert track. At the default page size of 500 that is
 * ~2,500 sequential queries in one un-yielded block, and it is what "the
 * large-library scan freezes the app" meant: a first scan skipped nothing and
 * could hold the JS thread for the whole page.
 *
 * The fingerprint skip that was already here only helps a *re*-scan, where most
 * rows are unchanged. The first scan — the one a new user sees — skipped nothing
 * and paid the full cost.
 *
 * Now it is two statements for all the artists, two for all the albums, and one
 * per sixty tracks, with a yield between chunks so a long page cannot hold the
 * frame either. See docs/performance.md for the after number.
 */
export async function saveEnumerated(rows: EnumeratedRow[]): Promise<void> {
  if (rows.length === 0) return;

  perf.mark('saveEnumerated');
  perf.mark('scan.fingerprints');
  const existing = await existingFingerprints(rows.map((row) => row.fileUri));
  perf.measure('scan.fingerprints', rows.length);

  const changed = rows.filter((row) => needsRescan(existing.get(row.fileUri) ?? null, row));

  if (changed.length === 0) {
    perf.measure('saveEnumerated', `rows=${rows.length} written=0`);
    return;
  }

  perf.mark('scan.artists');
  const artistIds = await resolveArtists(
    changed
      .flatMap((row) => [row.artistName, row.albumArtist])
      .filter((name): name is string => name !== null),
  );
  perf.measure('scan.artists', artistIds.size);

  perf.mark('scan.albums');
  const albumIds = await resolveAlbums(
    changed.flatMap((row) =>
      row.albumName === null
        ? []
        : [{ name: row.albumName, artistId: albumArtistIdOf(row, artistIds) }],
    ),
  );
  perf.measure('scan.albums', albumIds.size);

  /*
   * Busy time, not wall-clock. Wall-clock now includes the deliberate yields,
   * which is exactly the time the UI *is* free — measuring it would punish the
   * fix for working. What freezes a screen is the longest stretch between two
   * yields, so that is what is recorded.
   */
  let busyMs = 0;
  let longestBlockMs = 0;
  let sinceYieldMs = 0;

  for (const chunk of chunked(changed, TRACK_CHUNK)) {
    const startedAt = Date.now();

    await db
      .insert(tracks)
      .values(
        chunk.map((row) => {
          const artistId = artistIdOf(row, artistIds);
          return {
            mediaStoreId: row.mediaStoreId,
            fileUri: row.fileUri,
            title: row.title,
            artistId,
            albumId:
              row.albumName === null
                ? null
                : (albumIds.get(albumKey(row.albumName, albumArtistIdOf(row, artistIds))) ?? null),
            albumArtist: row.albumArtist,
            genre: row.genre,
            trackNo: row.trackNo,
            discNo: row.discNo,
            year: row.year,
            durationMs: row.durationMs,
            fileSize: row.fileSize,
            dateAdded: row.dateAdded,
            dateModified: row.dateModified,
            isMissing: 0,
          };
        }),
      )
      .onConflictDoUpdate({
        target: tracks.fileUri,
        set: {
          title: sql`excluded.title`,
          artistId: sql`excluded.artist_id`,
          albumId: sql`excluded.album_id`,
          albumArtist: sql`excluded.album_artist`,
          genre: sql`excluded.genre`,
          trackNo: sql`excluded.track_no`,
          discNo: sql`excluded.disc_no`,
          year: sql`excluded.year`,
          durationMs: sql`excluded.duration_ms`,
          fileSize: sql`excluded.file_size`,
          dateModified: sql`excluded.date_modified`,
          // A changed file must go back through stage two for fresh tags.
          lastScannedAt: null,
          // A file that came back is no longer missing.
          isMissing: sql`0`,
        },
      });

    const block = Date.now() - startedAt;
    busyMs += block;
    sinceYieldMs += block;
    longestBlockMs = Math.max(longestBlockMs, block);

    /*
     * Yield on a time budget, not on every chunk. A chunk is ~30ms, so yielding
     * after each one released the thread three times more often than necessary
     * and paid the yield's own cost every time. Holding the thread for up to
     * 50ms and then letting go keeps the UI responsive for a fraction of the
     * wall-clock.
     */
    if (sinceYieldMs >= YIELD_BUDGET_MS) {
      sinceYieldMs = 0;
      await yieldToEventLoop();
    }
  }

  perf.measure(
    'saveEnumerated',
    `rows=${rows.length} written=${changed.length} busy=${busyMs}ms longestBlock=${longestBlockMs}ms`,
  );
}

interface ArtistAlbumMetadata {
  artistName: string | null;
  albumArtist: string | null;
}

function artistIdOf(row: ArtistAlbumMetadata, artistIds: Map<string, number>): number | null {
  return row.artistName === null ? null : (artistIds.get(row.artistName) ?? null);
}

/** An album artist is authoritative for the album relationship when tagged. */
function albumArtistIdOf(row: ArtistAlbumMetadata, artistIds: Map<string, number>): number | null {
  const name = row.albumArtist ?? row.artistName;
  return name === null ? null : (artistIds.get(name) ?? null);
}

/**
 * How long the scanner may hold the thread before it has to let go.
 *
 * Three frames at 60Hz. Short enough that a dropped touch is not perceptible,
 * long enough that the yields themselves do not dominate.
 */
const YIELD_BUDGET_MS = 50;

/**
 * Hand the event loop back.
 *
 * `setTimeout(0)` rather than `requestIdleCallback`, and that is a measured
 * choice rather than the obvious one. An idle callback is the *correct*
 * primitive — it waits for a genuinely free frame — but on the Pixel_7 AVD each
 * one took roughly 700ms to fire even with `{ timeout: 50 }`, because a busy or
 * starved thread simply never reports idle and the timeout is not honoured
 * tightly. Nine of them turned a 150ms write into a 6.4-second one.
 *
 * A macrotask yield is weaker: it lets pending touches, timers and React work
 * run, but does not guarantee a paint. Paired with the budget below that is the
 * better trade — the thread is released often enough to stay responsive, and the
 * scan finishes in something close to its actual cost.
 */
function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

/**
 * The stored `(fileSize, dateModified)` for a batch of URIs, in one query.
 *
 * One `IN` lookup per batch rather than one per row — the point of skipping
 * unchanged files is lost if finding out costs a query each.
 */
async function existingFingerprints(
  fileUris: string[],
): Promise<Map<string, { fileSize: number | null; dateModified: number }>> {
  if (fileUris.length === 0) return new Map();

  const rows = await db
    .select({
      fileUri: tracks.fileUri,
      fileSize: tracks.fileSize,
      dateModified: tracks.dateModified,
    })
    .from(tracks)
    .where(inArray(tracks.fileUri, fileUris));

  return new Map(
    rows.map((row) => [row.fileUri, { fileSize: row.fileSize, dateModified: row.dateModified }]),
  );
}

export interface EnrichedRow {
  fileUri: string;
  fields: {
    title?: string;
    artistName: string | null;
    albumName: string | null;
    albumArtist: string | null;
    genre: string | null;
    trackNo: number | null;
    discNo: number | null;
    year: number | null;
    container: string | null;
    codec: string | null;
    bitrateKbps: number | null;
    sampleRateHz: number | null;
    bitDepth: number | null;
    channels: number | null;
    artworkPath: string | null;
  };
}

/**
 * Stage two write. Sets `lastScannedAt`, which is what marks a row done.
 *
 * One transaction for the batch rather than one per row. Each bare `UPDATE` is
 * its own implicit transaction and therefore its own commit; twenty-five of them
 * is twenty-five commits to write twenty-five rows. Wrapping the batch does not
 * change what is written, only how many times SQLite is asked to make it durable.
 *
 * Still a loop rather than one statement, deliberately: every row sets twelve
 * different values, so a single statement would be a twelve-way `CASE file_uri`
 * — harder to read than the loop and no faster once the commits are gone.
 */
export async function saveEnriched(rows: EnrichedRow[]): Promise<void> {
  if (rows.length === 0) return;

  perf.mark('saveEnriched');
  const now = Date.now();
  const artistIds = await resolveArtists(
    rows
      .flatMap(({ fields }) => [fields.artistName, fields.albumArtist])
      .filter((name): name is string => name !== null),
  );
  const albumIds = await resolveAlbums(
    rows.flatMap(({ fields }) => {
      if (fields.albumName === null) return [];
      const artistId = albumArtistIdOf(fields, artistIds);
      return [{ name: fields.albumName, artistId }];
    }),
  );

  await db.transaction(async (tx) => {
    for (const { fileUri, fields } of rows) {
      const artistId =
        fields.artistName === null ? null : (artistIds.get(fields.artistName) ?? null);
      await tx
        .update(tracks)
        .set({
          ...(fields.title ? { title: fields.title } : {}),
          artistId,
          albumId:
            fields.albumName === null
              ? null
              : (albumIds.get(albumKey(fields.albumName, albumArtistIdOf(fields, artistIds))) ??
                null),
          albumArtist: fields.albumArtist,
          genre: fields.genre,
          trackNo: fields.trackNo,
          discNo: fields.discNo,
          year: fields.year,
          container: fields.container,
          codec: fields.codec,
          bitrateKbps: fields.bitrateKbps,
          sampleRateHz: fields.sampleRateHz,
          bitDepth: fields.bitDepth,
          channels: fields.channels,
          artworkPath: fields.artworkPath,
          lastScannedAt: now,
        })
        .where(eq(tracks.fileUri, fileUri));
    }
  });

  perf.measure('saveEnriched', `rows=${rows.length}`);
}

/**
 * Rows stage two has not reached. `lastScannedAt` being null is the queue —
 * no separate table, and a scan that dies mid-way resumes exactly where it
 * stopped.
 */
export async function listUnenrichedUris(limit: number): Promise<string[]> {
  const rows = await db
    .select({ fileUri: tracks.fileUri })
    .from(tracks)
    .where(and(isNull(tracks.lastScannedAt), eq(tracks.isMissing, 0)))
    .limit(limit);

  return rows.map((row) => row.fileUri);
}

/** How many rows stage two still has to open. The enrich progress denominator. */
export async function countUnenriched(): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(tracks)
    .where(and(isNull(tracks.lastScannedAt), eq(tracks.isMissing, 0)));

  return row?.value ?? 0;
}

/**
 * Mark every present track this sweep did not see.
 *
 * `is_missing = 1`, never a delete: the file may be on an SD card that is not
 * mounted right now, and deleting would take its playlist entries and play
 * history with it.
 *
 * A `NOT IN` over ten thousand bound parameters is not an option — SQLite caps
 * them near 999 — so the seen set goes into a temporary table and the sweep is
 * one indexed anti-join. A track that reappears is un-marked by
 * `saveEnumerated`, which already resets `is_missing` on conflict.
 */
export async function retireUnseen(seenFileUris: string[]): Promise<void> {
  // An empty sweep means the query returned nothing at all — a revoked
  // permission, most likely. Retiring the whole library on that basis would
  // turn a permissions problem into apparent data loss.
  if (seenFileUris.length === 0) return;

  await db.run(sql`CREATE TEMP TABLE IF NOT EXISTS seen_uris (uri TEXT PRIMARY KEY)`);
  await db.run(sql`DELETE FROM seen_uris`);

  // Chunked well under SQLite's parameter ceiling.
  const CHUNK = 400;
  for (let index = 0; index < seenFileUris.length; index += CHUNK) {
    const values = sql.join(
      seenFileUris.slice(index, index + CHUNK).map((uri) => sql`(${uri})`),
      sql`, `,
    );
    await db.run(sql`INSERT OR IGNORE INTO seen_uris (uri) VALUES ${values}`);
  }

  await db.run(
    sql`UPDATE ${tracks} SET is_missing = 1
        WHERE is_missing = 0 AND file_uri NOT IN (SELECT uri FROM seen_uris)`,
  );

  await db.run(sql`DROP TABLE seen_uris`);
}

/**
 * Folders the user added by hand, on top of whatever MediaStore indexes.
 *
 * Adding is cumulative. `onConflictDoNothing` against the unique `uri` index
 * means picking the same folder twice is a no-op rather than a duplicate row,
 * and picking a second folder never displaces the first — a library assembled
 * from four places stays assembled from four places.
 */
export async function addScanFolder(uri: string): Promise<void> {
  await db.insert(scanFolders).values({ uri, enabled: 1 }).onConflictDoNothing();
}

export async function listScanFolders() {
  return db.select().from(scanFolders).where(eq(scanFolders.enabled, 1));
}

export interface ScanFolder {
  id: number;
  uri: string;
}

/**
 * Live list of added folders, for the settings screen.
 *
 * Ordered by id so the list reads in the order folders were added, which is
 * the order the user remembers adding them in.
 */
export function useScanFolders(): ScanFolder[] {
  const query = db
    .select({ id: scanFolders.id, uri: scanFolders.uri })
    .from(scanFolders)
    .where(eq(scanFolders.enabled, 1))
    .orderBy(asc(scanFolders.id));

  const { data } = useLiveQuery(query);
  return data;
}

/**
 * Forget a folder.
 *
 * The row goes; the tracks stay. Those tracks are ordinary MediaStore content
 * that a later library scan would find anyway, so deleting them here would
 * take playlist entries and play history with them to remove something the
 * next scan puts straight back. Removing a folder means "stop re-indexing
 * this path", not "delete this music".
 */
export async function removeScanFolder(id: number): Promise<void> {
  await db.delete(scanFolders).where(eq(scanFolders.id, id));
}
