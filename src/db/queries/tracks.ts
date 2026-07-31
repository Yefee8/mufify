import { and, asc, count, eq, like, or, sql } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';

import { db } from '../client';
import { albums, artists, trackStats, tracks, type NewTrack } from '../schema';

/** A track with its artist and album names resolved, ready for a list row. */
export interface TrackListItem {
  id: number;
  /**
   * Selected even though no row renders it: tapping a row starts playback, and
   * fetching the URI at that moment would put a database round trip between
   * the tap and the sound.
   */
  fileUri: string;
  title: string;
  artistName: string | null;
  albumName: string | null;
  durationMs: number;
  artworkPath: string | null;
  /**
   * Lifetime plays, for the discovery shuffle. Zero when the track has never
   * been played, since `track_stats` only gains a row on the first listen.
   */
  playCount: number;
}

const listSelection = {
  id: tracks.id,
  fileUri: tracks.fileUri,
  title: tracks.title,
  artistName: artists.name,
  albumName: albums.name,
  durationMs: tracks.durationMs,
  artworkPath: tracks.artworkPath,
  playCount: sql<number>`coalesce(${trackStats.playCount}, 0)`,
};

/** Present tracks, alphabetical, case-insensitive. */
export function listTracks(limit = 100, offset = 0) {
  return db
    .select(listSelection)
    .from(tracks)
    .leftJoin(artists, eq(tracks.artistId, artists.id))
    .leftJoin(albums, eq(tracks.albumId, albums.id))
    .leftJoin(trackStats, eq(trackStats.trackId, tracks.id))
    .where(eq(tracks.isMissing, 0))
    .orderBy(asc(sql`${tracks.title} COLLATE NOCASE`))
    .limit(limit)
    .offset(offset);
}

/** Title, artist or album — the search box matches all three. */
export function searchTracks(term: string, limit = 100) {
  const pattern = `%${term}%`;
  return db
    .select(listSelection)
    .from(tracks)
    .leftJoin(artists, eq(tracks.artistId, artists.id))
    .leftJoin(albums, eq(tracks.albumId, albums.id))
    .leftJoin(trackStats, eq(trackStats.trackId, tracks.id))
    .where(
      and(
        eq(tracks.isMissing, 0),
        or(like(tracks.title, pattern), like(artists.name, pattern), like(albums.name, pattern)),
      ),
    )
    .orderBy(asc(sql`${tracks.title} COLLATE NOCASE`))
    .limit(limit);
}

export async function getTrackById(id: number) {
  const [row] = await db.select().from(tracks).where(eq(tracks.id, id)).limit(1);
  return row ?? null;
}

export async function countTracks(): Promise<number> {
  const [row] = await db.select({ value: count() }).from(tracks).where(eq(tracks.isMissing, 0));
  return row?.value ?? 0;
}

/**
 * The live track list, re-running whenever the table changes.
 *
 * Same `isMissing = 0` predicate as `useTrackCount`, deliberately: the header
 * count and the rows below it must come from one definition of "present", or
 * the screen reports a number it cannot show. `LIST_SELECTION` and the shared
 * `where` exist so that stays true by construction rather than by review.
 *
 * `useLiveQuery` lives here rather than in a feature hook so Drizzle stays
 * behind the src/db boundary, which ESLint enforces.
 */
export function useTracks(search = ''): { tracks: TrackListItem[]; isLoading: boolean } {
  const term = search.trim();
  // `%` and `_` are LIKE wildcards. Unescaped, typing "%" matches everything
  // and the list appears not to filter at all.
  const pattern = `%${term.replace(/[\\%_]/gu, (char) => `\\${char}`)}%`;

  const query = db
    .select(listSelection)
    .from(tracks)
    .leftJoin(artists, eq(tracks.artistId, artists.id))
    .leftJoin(albums, eq(tracks.albumId, albums.id))
    .leftJoin(trackStats, eq(trackStats.trackId, tracks.id))
    .where(
      term
        ? and(
            eq(tracks.isMissing, 0),
            or(
              sql`${tracks.title} LIKE ${pattern} ESCAPE '\\'`,
              sql`${artists.name} LIKE ${pattern} ESCAPE '\\'`,
              sql`${albums.name} LIKE ${pattern} ESCAPE '\\'`,
            ),
          )
        : eq(tracks.isMissing, 0),
    )
    .orderBy(asc(sql`${tracks.title} COLLATE NOCASE`));

  const { data, updatedAt } = useLiveQuery(query, [term]);

  // `updatedAt` is undefined until the first result lands. Without it an empty
  // library and a library that has not been read yet are the same value, and
  // the screen flashes its empty state before the rows arrive.
  return { tracks: data, isLoading: updatedAt === undefined };
}

/**
 * The technical strip for one track.
 *
 * Queried on demand rather than carried on `PlayableTrack`: it is seven more
 * columns that only one screen reads, and the queue holds the whole library.
 * Nullable throughout — below API 31 the retriever reports no sample rate or
 * bit depth, and stage two may not have reached this row yet.
 */
export function useTrackSpec(trackId: number | null) {
  const query = db
    .select({
      container: tracks.container,
      codec: tracks.codec,
      bitrateKbps: tracks.bitrateKbps,
      sampleRateHz: tracks.sampleRateHz,
      bitDepth: tracks.bitDepth,
      channels: tracks.channels,
      fileSize: tracks.fileSize,
    })
    .from(tracks)
    .where(eq(tracks.id, trackId ?? -1))
    .limit(1);

  const { data } = useLiveQuery(query, [trackId]);
  return data[0] ?? null;
}

/**
 * Insert or update by `fileUri`, which is the stable identity of a track — a
 * rescan must not create a second row for a file it has already seen.
 */
export async function upsertTracks(rows: NewTrack[]): Promise<void> {
  if (rows.length === 0) return;

  await db
    .insert(tracks)
    .values(rows)
    .onConflictDoUpdate({
      target: tracks.fileUri,
      set: {
        title: sql`excluded.title`,
        durationMs: sql`excluded.duration_ms`,
        dateModified: sql`excluded.date_modified`,
        fileSize: sql`excluded.file_size`,
        isMissing: sql`0`,
      },
    });
}

/**
 * A file that has gone is marked, never deleted, so playlist entries and play
 * history survive an unmounted SD card.
 */
export async function markMissing(trackIds: number[]): Promise<void> {
  if (trackIds.length === 0) return;
  await db
    .update(tracks)
    .set({ isMissing: 1 })
    .where(sql`${tracks.id} IN ${trackIds}`);
}
