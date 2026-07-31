import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';

import { db } from '../client';
import { needsRescan } from '@/services/scanner/trackMapping';

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

/** Resolve or create an artist, returning its id. */
async function artistIdFor(name: string | null): Promise<number | null> {
  if (!name) return null;

  await db
    .insert(artists)
    .values({ name, sortName: sortNameOf(name) })
    .onConflictDoNothing();

  const [row] = await db
    .select({ id: artists.id })
    .from(artists)
    .where(eq(artists.name, name))
    .limit(1);
  return row?.id ?? null;
}

async function albumIdFor(name: string | null, artistId: number | null): Promise<number | null> {
  if (!name) return null;

  await db.insert(albums).values({ name, artistId }).onConflictDoNothing();

  const [row] = await db
    .select({ id: albums.id })
    .from(albums)
    .where(
      and(
        eq(albums.name, name),
        artistId === null ? isNull(albums.artistId) : eq(albums.artistId, artistId),
      ),
    )
    .limit(1);
  return row?.id ?? null;
}

/**
 * Stage one write.
 *
 * Rows whose `(fileSize, dateModified)` already match what is stored are
 * skipped outright — that pair is the incremental rescan key. Without this
 * check every launch rewrote every row: five queries per track, so ~2,600 for
 * a 500-track library and ~50,000 for a 10,000-track one, all to write back
 * values that had not changed.
 */
export async function saveEnumerated(rows: EnumeratedRow[]): Promise<void> {
  if (rows.length === 0) return;

  const existing = await existingFingerprints(rows.map((row) => row.fileUri));

  for (const row of rows) {
    if (!needsRescan(existing.get(row.fileUri) ?? null, row)) continue;

    const artistId = await artistIdFor(row.artistName);
    const albumId = await albumIdFor(row.albumName, artistId);

    await db
      .insert(tracks)
      .values({
        mediaStoreId: row.mediaStoreId,
        fileUri: row.fileUri,
        title: row.title,
        artistId,
        albumId,
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
      })
      .onConflictDoUpdate({
        target: tracks.fileUri,
        set: {
          title: sql`excluded.title`,
          durationMs: sql`excluded.duration_ms`,
          fileSize: sql`excluded.file_size`,
          dateModified: sql`excluded.date_modified`,
          // A file that came back is no longer missing.
          isMissing: sql`0`,
        },
      });
  }
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

/** Stage two write. Sets `lastScannedAt`, which is what marks a row done. */
export async function saveEnriched(rows: EnrichedRow[]): Promise<void> {
  const now = Date.now();

  for (const { fileUri, fields } of rows) {
    await db
      .update(tracks)
      .set({
        ...(fields.title ? { title: fields.title } : {}),
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
 * that the automatic sweep would find anyway, so deleting them here would
 * take playlist entries and play history with them to remove something the
 * next scan puts straight back. Removing a folder means "stop re-indexing
 * this path", not "delete this music".
 */
export async function removeScanFolder(id: number): Promise<void> {
  await db.delete(scanFolders).where(eq(scanFolders.id, id));
}
