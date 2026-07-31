import { and, asc, eq, gt, max, sql } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';

import { db } from '../client';
import { albums, artists, playlistTracks, playlists, tracks } from '../schema';

/**
 * Playlists and their contents.
 *
 * `playlist_tracks` is keyed `(playlist_id, position)` with a unique index, so
 * position is part of the identity rather than a hint. Every write below has
 * to leave positions contiguous from zero — a gap is invisible until a reorder
 * lands two rows on the same number and the insert fails.
 */

export interface PlaylistSummary {
  id: number;
  name: string;
  trackCount: number;
  /** Cover of the first track, for the list thumbnail. Null when empty. */
  artworkPath: string | null;
}

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
}

/** Live list of playlists, newest first, with their sizes. */
export function usePlaylists(): PlaylistSummary[] {
  const query = db
    .select({
      id: playlists.id,
      name: playlists.name,
      trackCount: sql<number>`count(${playlistTracks.trackId})`,
      artworkPath: sql<string | null>`min(${tracks.artworkPath})`,
    })
    .from(playlists)
    .leftJoin(playlistTracks, eq(playlistTracks.playlistId, playlists.id))
    .leftJoin(tracks, eq(tracks.id, playlistTracks.trackId))
    .groupBy(playlists.id)
    .orderBy(sql`${playlists.updatedAt} DESC`);

  const { data } = useLiveQuery(query);
  return data;
}

/** Live contents of one playlist, in playlist order. */
export function usePlaylistEntries(playlistId: number): PlaylistEntry[] {
  const query = db
    .select({
      trackId: tracks.id,
      position: playlistTracks.position,
      fileUri: tracks.fileUri,
      title: tracks.title,
      artistName: artists.name,
      albumName: albums.name,
      durationMs: tracks.durationMs,
      artworkPath: tracks.artworkPath,
      playCount: sql<number>`0`,
    })
    .from(playlistTracks)
    .innerJoin(tracks, eq(tracks.id, playlistTracks.trackId))
    .leftJoin(artists, eq(artists.id, tracks.artistId))
    .leftJoin(albums, eq(albums.id, tracks.albumId))
    .where(and(eq(playlistTracks.playlistId, playlistId), eq(tracks.isMissing, 0)))
    .orderBy(asc(playlistTracks.position));

  const { data } = useLiveQuery(query, [playlistId]);
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
    .values(trackIds.map((trackId) => ({ playlistId, trackId, position: position++, addedAt: now })));

  await db.update(playlists).set({ updatedAt: now }).where(eq(playlists.id, playlistId));
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
