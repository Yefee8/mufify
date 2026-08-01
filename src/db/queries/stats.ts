import { and, desc, eq, sql } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';

import type { PeriodType } from '@/services/stats/rollups';

import { db } from '../client';
import { albums, artists, playlists, statsRollups, tracks } from '../schema';

/**
 * Everything the statistics screens read.
 *
 * `stats_rollups` and nothing else — `AGENTS.md` forbids aggregating
 * `play_events` in a screen query, because that is a table scan over the whole
 * listening history every time somebody opens a tab, and it grows forever.
 * The rollups are maintained incrementally in `recordListen`.
 */

export interface TopEntry {
  id: number;
  /** Null only for the reserved unknown artist or album rollup row. */
  title: string | null;
  subtitle: string | null;
  playCount: number;
  msPlayed: number;
  /** Bare path into the artwork cache. Null when there is nothing to show. */
  artworkPath: string | null;
}

export interface PeriodTotals {
  playCount: number;
  msPlayed: number;
  /** Distinct tracks heard in the period. */
  trackCount: number;
}

/** The rollup rows for one period and entity type, ranked. Shared `where`. */
function rankedRollups(periodType: PeriodType, periodKey: string, entityType: string) {
  return and(
    eq(statsRollups.periodType, periodType),
    eq(statsRollups.periodKey, periodKey),
    eq(statsRollups.entityType, entityType),
  );
}

/**
 * Any album's cover, taken from a track that has one.
 *
 * `albums.artwork_path` exists in the schema and the scanner never fills it —
 * artwork is extracted per file, so the cover lives on the tracks. A correlated
 * subquery rather than a join because it must return exactly one row per album
 * and a join would multiply the rollup row by every track on the record.
 *
 * Bounded by the `limit` on the outer query, so this runs ten times, not once
 * per album in the library.
 */
const albumCover = sql<string | null>`(
  SELECT t.artwork_path FROM tracks t
  WHERE t.album_id = ${albums.id} AND t.artwork_path IS NOT NULL
  LIMIT 1
)`;

/** The same, for an artist. */
const artistCover = sql<string | null>`(
  SELECT t.artwork_path FROM tracks t
  WHERE t.artist_id = ${artists.id} AND t.artwork_path IS NOT NULL
  LIMIT 1
)`;

/** The same, for a playlist: the first track in it that has a cover. */
const playlistCover = sql<string | null>`(
  SELECT t.artwork_path FROM playlist_tracks pt
  JOIN tracks t ON t.id = pt.track_id
  WHERE pt.playlist_id = ${playlists.id} AND t.artwork_path IS NOT NULL
  ORDER BY pt.position
  LIMIT 1
)`;

/** Top tracks for a period, most played first. */
export function useTopTracks(periodType: PeriodType, periodKey: string, limit = 10) {
  const query = db
    .select({
      id: tracks.id,
      title: tracks.title,
      subtitle: artists.name,
      playCount: statsRollups.playCount,
      msPlayed: statsRollups.msPlayed,
      artworkPath: tracks.artworkPath,
    })
    .from(statsRollups)
    .innerJoin(tracks, eq(tracks.id, statsRollups.entityId))
    .leftJoin(artists, eq(artists.id, tracks.artistId))
    .where(rankedRollups(periodType, periodKey, 'track'))
    .orderBy(desc(statsRollups.playCount), desc(statsRollups.msPlayed))
    .limit(limit);

  const { data } = useLiveQuery(query, [periodType, periodKey, limit]);
  return data;
}

/** Top artists for a period. */
export function useTopArtists(periodType: PeriodType, periodKey: string, limit = 10) {
  const query = db
    .select({
      id: statsRollups.entityId,
      title: artists.name,
      subtitle: sql<string | null>`null`,
      playCount: statsRollups.playCount,
      msPlayed: statsRollups.msPlayed,
      artworkPath: artistCover,
    })
    .from(statsRollups)
    .leftJoin(artists, eq(artists.id, statsRollups.entityId))
    .where(rankedRollups(periodType, periodKey, 'artist'))
    .orderBy(desc(statsRollups.playCount), desc(statsRollups.msPlayed))
    .limit(limit);

  const { data } = useLiveQuery(query, [periodType, periodKey, limit]);
  return data;
}

/** Top albums for a period. */
export function useTopAlbums(periodType: PeriodType, periodKey: string, limit = 10) {
  const query = db
    .select({
      id: statsRollups.entityId,
      title: albums.name,
      subtitle: artists.name,
      playCount: statsRollups.playCount,
      msPlayed: statsRollups.msPlayed,
      artworkPath: albumCover,
    })
    .from(statsRollups)
    .leftJoin(albums, eq(albums.id, statsRollups.entityId))
    .leftJoin(artists, eq(artists.id, albums.artistId))
    .where(rankedRollups(periodType, periodKey, 'album'))
    .orderBy(desc(statsRollups.playCount), desc(statsRollups.msPlayed))
    .limit(limit);

  const { data } = useLiveQuery(query, [periodType, periodKey, limit]);
  return data;
}

/**
 * Top playlists for a period.
 *
 * Empty until something is played *from* a playlist — the rollup is keyed on
 * where the queue came from, not on whether the track happens to be in one.
 * See `QueueSource` in `src/services/audio/types.ts`.
 */
export function useTopPlaylists(periodType: PeriodType, periodKey: string, limit = 10) {
  const query = db
    .select({
      id: playlists.id,
      title: playlists.name,
      subtitle: sql<string | null>`null`,
      playCount: statsRollups.playCount,
      msPlayed: statsRollups.msPlayed,
      artworkPath: playlistCover,
    })
    .from(statsRollups)
    .innerJoin(playlists, eq(playlists.id, statsRollups.entityId))
    .where(rankedRollups(periodType, periodKey, 'playlist'))
    .orderBy(desc(statsRollups.playCount), desc(statsRollups.msPlayed))
    .limit(limit);

  const { data } = useLiveQuery(query, [periodType, periodKey, limit]);
  return data;
}

/**
 * Period totals.
 *
 * Summed over the `track` rows only. Adding artist and album rows in as well
 * would count every listen three times — they are the same listening seen
 * from different angles, not additional listening.
 */
export function usePeriodTotals(periodType: PeriodType, periodKey: string): PeriodTotals {
  const query = db
    .select({
      playCount: sql<number>`coalesce(sum(${statsRollups.playCount}), 0)`,
      msPlayed: sql<number>`coalesce(sum(${statsRollups.msPlayed}), 0)`,
      trackCount: sql<number>`count(*)`,
    })
    .from(statsRollups)
    .where(rankedRollups(periodType, periodKey, 'track'));

  const { data } = useLiveQuery(query, [periodType, periodKey]);
  return data[0] ?? { playCount: 0, msPlayed: 0, trackCount: 0 };
}

/** Wipe listening history. Rollups go with it, or the screens keep the ghosts. */
export async function deleteAllStats(): Promise<void> {
  await db.delete(statsRollups);
}
