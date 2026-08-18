import { and, asc, desc, eq, gt, max, sql } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';

import {
  foldPlaylistRows,
  LIKED_SONGS_ID,
  reorder,
  type PlaylistSummary,
} from '@/services/playlists/order';

import { db } from '../client';
import { albums, artists, playlistTracks, playlists, trackStats, tracks } from '../schema';

/* Re-exported so screens keep importing playlist types from the query module. */
export type { PlaylistSummary };
export { LIKED_SONGS_ID };

/**
 * Playlists and their contents.
 *
 * `playlist_tracks` is keyed `(playlist_id, position)` with a unique index, so
 * position is part of the identity rather than a hint. Every write below has
 * to leave positions contiguous from zero — a gap is invisible until a reorder
 * lands two rows on the same number and the insert fails.
 */

export interface PlaylistEntry {
  trackId: number;
  position: number;
  fileUri: string;
  title: string;
  artistName: string | null;
  albumName: string | null;
  durationMs: number;
  artworkPath: string | null;
  playCount: number;
  isFavorite: boolean;
}

const entrySelection = {
  trackId: tracks.id,
  fileUri: tracks.fileUri,
  title: tracks.title,
  artistName: artists.name,
  albumName: albums.name,
  durationMs: tracks.durationMs,
  artworkPath: tracks.artworkPath,
  playCount: sql<number>`coalesce(${trackStats.playCount}, 0)`,
  isFavorite: sql`coalesce(${trackStats.isFavorite}, 0)`.mapWith(Boolean),
};

/**
 * Live list of playlists, newest first, with their sizes and mosaic covers.
 *
 * One flat query returning a row per playlist entry, folded in JS, rather than
 * `GROUP BY` in SQL. That is deliberate and it is about the mosaic: the covers
 * have to be *the first four in playlist order*, and SQLite does not guarantee
 * the order of values inside `group_concat` — the `ORDER BY` argument only
 * arrived in 3.44, so relying on it silently depends on which SQLite the Expo
 * SDK happens to bundle. A grid showing four arbitrary covers instead of the
 * first four is the kind of wrong nobody notices until they care.
 *
 * The cost is one row per playlist entry instead of one per playlist, which for
 * a few hundred entries is nothing, and it keeps the count and the covers coming
 * from a single query — so they cannot disagree.
 */
export function usePlaylists(): PlaylistSummary[] {
  const query = db
    .select({
      id: playlists.id,
      name: playlists.name,
      position: playlistTracks.position,
      artworkPath: tracks.artworkPath,
      coverPath: playlists.artworkPath,
      isFavorite: sql`${playlists.isFavorite}`.mapWith(Boolean),
    })
    .from(playlists)
    .leftJoin(playlistTracks, eq(playlistTracks.playlistId, playlists.id))
    .leftJoin(tracks, eq(tracks.id, playlistTracks.trackId))
    /*
     * Liked first, then most recently liked, then the ordinary order.
     *
     * The second key is `favoriteAt` rather than `updatedAt` because liking a
     * playlist is not editing it: sorting the pinned group by `updatedAt` would
     * drop a freshly liked old playlist into the middle of the pins, so the
     * heart would appear to have moved it somewhere arbitrary.
     */
    .orderBy(
      sql`${playlists.isFavorite} DESC`,
      sql`${playlists.favoriteAt} DESC`,
      sql`${playlists.updatedAt} DESC`,
      asc(playlistTracks.position),
    );

  const { data } = useLiveQuery(query);
  return foldPlaylistRows(data);
}

/** Live contents of one playlist, in playlist order. */
export function usePlaylistEntries(playlistId: number): PlaylistEntry[] {
  const query = db
    .select({
      position: playlistTracks.position,
      ...entrySelection,
      /*
       * Real counts, not the zero this used to select. Shuffling a playlist
       * runs the same algorithms as shuffling the library, and `discovery` and
       * `favorites` both weight on these — fed constants they degrade silently
       * into `pure`, which looks like the setting being ignored.
       */
    })
    .from(playlistTracks)
    .innerJoin(tracks, eq(tracks.id, playlistTracks.trackId))
    .leftJoin(artists, eq(artists.id, tracks.artistId))
    .leftJoin(albums, eq(albums.id, tracks.albumId))
    .leftJoin(trackStats, eq(trackStats.trackId, tracks.id))
    .where(and(eq(playlistTracks.playlistId, playlistId), eq(tracks.isMissing, 0)))
    .orderBy(asc(playlistTracks.position));

  const { data } = useLiveQuery(query, [playlistId]);
  return data;
}

/**
 * Live favourite tracks, newest favourite first, presented as a virtual playlist.
 *
 * **`from(trackStats)`, and the order of the joins is the whole point.**
 * `useLiveQuery` re-runs a query when a table changes, and the only table it
 * watches is the one in `FROM` — it reads `query.config.table` and compares the
 * name, so joined tables are invisible to it. Selecting `from(tracks)` meant
 * this list watched `tracks` and never `track_stats`, and liking a song writes
 * only to `track_stats`.
 *
 * The result was the reported split: the Playlists tab showed "0 tracks" beside
 * Liked Songs while the detail screen showed the real ones. Neither number was
 * computed differently — this is one query, used by both — the tab simply had
 * a copy from whenever it last mounted and was never told anything had changed.
 *
 * Favourites are `track_stats` rows, so watching that table is also the honest
 * description of what this list is.
 */
export function useFavoriteEntries(): PlaylistEntry[] {
  const query = db
    .select({
      position: sql<number>`row_number() over (order by ${trackStats.favoriteAt} desc, ${tracks.id} desc) - 1`,
      ...entrySelection,
    })
    .from(trackStats)
    .innerJoin(tracks, eq(tracks.id, trackStats.trackId))
    .leftJoin(artists, eq(artists.id, tracks.artistId))
    .leftJoin(albums, eq(albums.id, tracks.albumId))
    .where(and(eq(trackStats.isFavorite, 1), eq(tracks.isMissing, 0)))
    .orderBy(desc(trackStats.favoriteAt), desc(tracks.id));

  const { data } = useLiveQuery(query);
  return data;
}

export async function createPlaylist(name: string): Promise<number | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;

  const now = Date.now();
  const [row] = await db
    .insert(playlists)
    .values({ name: trimmed, createdAt: now, updatedAt: now })
    .returning({ id: playlists.id });

  return row?.id ?? null;
}

/**
 * Like or unlike a playlist.
 *
 * `favoriteAt` is cleared on the way out rather than left behind, so a playlist
 * liked, unliked and liked again sorts by when it was *last* liked. A stale
 * timestamp would put it back where it used to be, which reads as the list
 * ignoring the tap.
 *
 * `updatedAt` is deliberately untouched: it means "the contents changed", and
 * the playlists list uses it for ordering. Bumping it here would shuffle the
 * unliked part of the list every time somebody liked something.
 */
export async function setPlaylistFavorite(id: number, isFavorite: boolean): Promise<void> {
  await db
    .update(playlists)
    .set({ isFavorite: isFavorite ? 1 : 0, favoriteAt: isFavorite ? Date.now() : null })
    .where(eq(playlists.id, id));
}

export async function renamePlaylist(id: number, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) return;
  await db
    .update(playlists)
    .set({ name: trimmed, updatedAt: Date.now() })
    .where(eq(playlists.id, id));
}

/** Entries go with it — `playlist_tracks` cascades on delete. */
export async function deletePlaylist(id: number): Promise<void> {
  await db.delete(playlists).where(eq(playlists.id, id));
}

/**
 * Append tracks to the end.
 *
 * Positions continue from whatever is already there rather than restarting,
 * and duplicates are allowed: putting the same track in a playlist twice is a
 * choice a person can legitimately make, and silently refusing it is more
 * surprising than honouring it.
 */
export async function addTracksToPlaylist(playlistId: number, trackIds: number[]): Promise<void> {
  if (trackIds.length === 0) return;

  const [row] = await db
    .select({ highest: max(playlistTracks.position) })
    .from(playlistTracks)
    .where(eq(playlistTracks.playlistId, playlistId));

  const now = Date.now();
  let position = (row?.highest ?? -1) + 1;

  await db
    .insert(playlistTracks)
    .values(
      trackIds.map((trackId) => ({ playlistId, trackId, position: position++, addedAt: now })),
    );

  await db.update(playlists).set({ updatedAt: now }).where(eq(playlists.id, playlistId));
}

/**
 * Move one entry to a new position, keeping the rest contiguous.
 *
 * Done as a full rewrite of the affected span rather than a clever three-step
 * swap, and the reason is the unique index on `(playlist_id, position)`. Any
 * intermediate state where two rows share a position fails the constraint, so
 * every row between the old and new slot is first parked at a negative position
 * — outside the range real rows ever occupy — and then written back. Three
 * statements, no temporary table, and no window where the index can be violated.
 *
 * Wrapped in a transaction: a reorder that half-applied would leave a playlist
 * whose positions have a gap, and the *next* reorder would then fail rather than
 * this one, which is the worst possible place to discover it.
 */
export async function movePlaylistEntry(
  playlistId: number,
  from: number,
  to: number,
): Promise<void> {
  if (from === to) return;

  await db.transaction(async (tx) => {
    const rows = await tx
      .select({ trackId: playlistTracks.trackId, position: playlistTracks.position })
      .from(playlistTracks)
      .where(eq(playlistTracks.playlistId, playlistId))
      .orderBy(asc(playlistTracks.position));

    const order = reorder(
      rows.map((row) => row.position),
      from,
      to,
    );
    if (order === null) return;

    // Park everything out of the way first. Negative positions cannot collide
    // with the ones being written, and no reader sees them — the whole thing is
    // one transaction.
    await tx
      .update(playlistTracks)
      .set({ position: sql`-1 - ${playlistTracks.position}` })
      .where(eq(playlistTracks.playlistId, playlistId));

    for (const [index, original] of order.entries()) {
      await tx
        .update(playlistTracks)
        .set({ position: index })
        .where(
          and(
            eq(playlistTracks.playlistId, playlistId),
            eq(playlistTracks.position, -1 - original),
          ),
        );
    }

    await tx.update(playlists).set({ updatedAt: Date.now() }).where(eq(playlists.id, playlistId));
  });
}

/**
 * Remove one entry and close the gap.
 *
 * Closing the gap is not tidiness: positions are half of the unique key, so a
 * hole left behind turns the next reorder into a constraint violation.
 */
export async function removeFromPlaylist(playlistId: number, position: number): Promise<void> {
  await db
    .delete(playlistTracks)
    .where(and(eq(playlistTracks.playlistId, playlistId), eq(playlistTracks.position, position)));

  await db
    .update(playlistTracks)
    .set({ position: sql`${playlistTracks.position} - 1` })
    .where(and(eq(playlistTracks.playlistId, playlistId), gt(playlistTracks.position, position)));

  await db.update(playlists).set({ updatedAt: Date.now() }).where(eq(playlists.id, playlistId));
}
