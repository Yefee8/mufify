import { and, desc, eq, sql } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';

import type { PeriodType } from '@/services/stats/rollups';

import { db } from '../client';
import { artists, statsRollups, tracks } from '../schema';

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
  title: string;
  subtitle: string | null;
  playCount: number;
  msPlayed: number;
}

export interface PeriodTotals {
  playCount: number;
  msPlayed: number;
  /** Distinct tracks heard in the period. */
  trackCount: number;
}

/** Top tracks for a period, most played first. */
export function useTopTracks(periodType: PeriodType, periodKey: string, limit = 10) {
  const query = db
    .select({
      id: tracks.id,
      title: tracks.title,
      subtitle: artists.name,
      playCount: statsRollups.playCount,
      msPlayed: statsRollups.msPlayed,
    })
    .from(statsRollups)
    .innerJoin(tracks, eq(tracks.id, statsRollups.entityId))
    .leftJoin(artists, eq(artists.id, tracks.artistId))
    .where(
      and(
        eq(statsRollups.periodType, periodType),
        eq(statsRollups.periodKey, periodKey),
        eq(statsRollups.entityType, 'track'),
      ),
    )
    .orderBy(desc(statsRollups.playCount), desc(statsRollups.msPlayed))
    .limit(limit);

  const { data } = useLiveQuery(query, [periodType, periodKey, limit]);
  return data;
}

/** Top artists for a period. */
export function useTopArtists(periodType: PeriodType, periodKey: string, limit = 10) {
  const query = db
    .select({
      id: artists.id,
      title: artists.name,
      subtitle: sql<string | null>`null`,
      playCount: statsRollups.playCount,
      msPlayed: statsRollups.msPlayed,
    })
    .from(statsRollups)
    .innerJoin(artists, eq(artists.id, statsRollups.entityId))
    .where(
      and(
        eq(statsRollups.periodType, periodType),
        eq(statsRollups.periodKey, periodKey),
        eq(statsRollups.entityType, 'artist'),
      ),
    )
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
    .where(
      and(
        eq(statsRollups.periodType, periodType),
        eq(statsRollups.periodKey, periodKey),
        eq(statsRollups.entityType, 'track'),
      ),
    );

  const { data } = useLiveQuery(query, [periodType, periodKey]);
  return data[0] ?? { playCount: 0, msPlayed: 0, trackCount: 0 };
}

/** Wipe listening history. Rollups go with it, or the screens keep the ghosts. */
export async function deleteAllStats(): Promise<void> {
  await db.delete(statsRollups);
}
