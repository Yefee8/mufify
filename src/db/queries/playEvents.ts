import { eq, sql } from 'drizzle-orm';

import { classifyListen, type ListenOutcome } from '@/services/stats/playCounting';
import { periodKeys, type WeekStart } from '@/services/stats/periodKeys';
import { foldDeltas, rollupDeltas } from '@/services/stats/rollups';

import { db } from '../client';
import { playEvents, statsRollups, tracks, trackStats, type PlayEvent } from '../schema';

export interface RecordListenInput {
  trackId: number;
  durationMs: number;
  msPlayed: number;
  /** When playback started. Period keys come from this, not from "now". */
  startedAt: Date;
  sourceType: 'library' | 'album' | 'artist' | 'playlist' | 'queue';
  sourceId?: number;
  /** Null when playing sequentially. */
  shuffleAlgorithm?: string;
  completed?: boolean;
}

/**
 * Record one listen.
 *
 * Period keys are written here, once, from the local time the listen started.
 * Deriving them at read time gives wrong answers across DST and travel and
 * forces a table scan — see `src/services/stats/periodKeys.ts`.
 *
 * Rollups are updated here too, incrementally. Statistics screens read
 * `stats_rollups` and never aggregate `play_events`, so if this and the events
 * ever disagree the screens show numbers that are wrong but plausible —
 * `src/services/stats/rollups.test.ts` compares the incremental result against
 * a brute-force recount to keep them honest.
 */
export async function recordListen(
  input: RecordListenInput,
  weekStart: WeekStart,
): Promise<{ event: PlayEvent | null; outcome: ListenOutcome }> {
  const outcome = classifyListen(input.msPlayed, input.durationMs);
  const keys = periodKeys(input.startedAt, weekStart);

  const [event] = await db
    .insert(playEvents)
    .values({
      trackId: input.trackId,
      startedAtUtc: input.startedAt.getTime(),
      msPlayed: input.msPlayed,
      completed: input.completed ? 1 : 0,
      outcome,
      sourceType: input.sourceType,
      sourceId: input.sourceId ?? null,
      shuffleAlgorithm: input.shuffleAlgorithm ?? null,
      weekKey: keys.week,
      monthKey: keys.month,
      yearKey: keys.year,
    })
    .returning();

  await db
    .insert(trackStats)
    .values({
      trackId: input.trackId,
      // A partial moves neither counter but still contributes its
      // milliseconds, so total listening time stays honest.
      playCount: outcome === 'play' ? 1 : 0,
      skipCount: outcome === 'skip' ? 1 : 0,
      msPlayedTotal: input.msPlayed,
      lastPlayedAt: input.startedAt.getTime(),
    })
    .onConflictDoUpdate({
      target: trackStats.trackId,
      set: {
        playCount: sql`${trackStats.playCount} + ${outcome === 'play' ? 1 : 0}`,
        skipCount: sql`${trackStats.skipCount} + ${outcome === 'skip' ? 1 : 0}`,
        msPlayedTotal: sql`${trackStats.msPlayedTotal} + ${input.msPlayed}`,
        lastPlayedAt: input.startedAt.getTime(),
      },
    });

  await applyRollups(input, keys, outcome);

  return { event: event ?? null, outcome };
}

/**
 * Fold this listen into every `(period, entity)` cell it touches.
 *
 * The artist and album come from the track row rather than the caller: the
 * player knows what it is playing, not how the library has it classified, and
 * a rollup keyed on the wrong artist is invisible until the year-end summary
 * looks wrong.
 */
async function applyRollups(
  input: RecordListenInput,
  keys: ReturnType<typeof periodKeys>,
  outcome: ListenOutcome,
): Promise<void> {
  const [row] = await db
    .select({ artistId: tracks.artistId, albumId: tracks.albumId })
    .from(tracks)
    .where(eq(tracks.id, input.trackId))
    .limit(1);

  const deltas = foldDeltas(
    rollupDeltas({
      subject: {
        trackId: input.trackId,
        artistId: row?.artistId ?? null,
        albumId: row?.albumId ?? null,
        playlistId: input.sourceType === 'playlist' ? (input.sourceId ?? null) : null,
      },
      keys,
      msPlayed: input.msPlayed,
      countsAsPlay: outcome === 'play',
    }),
  );

  const now = Date.now();

  for (const delta of deltas) {
    await db
      .insert(statsRollups)
      .values({
        periodType: delta.periodType,
        periodKey: delta.periodKey,
        entityType: delta.entityType,
        entityId: delta.entityId,
        playCount: delta.playCount,
        msPlayed: delta.msPlayed,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          statsRollups.periodType,
          statsRollups.periodKey,
          statsRollups.entityType,
          statsRollups.entityId,
        ],
        set: {
          playCount: sql`${statsRollups.playCount} + ${delta.playCount}`,
          msPlayed: sql`${statsRollups.msPlayed} + ${delta.msPlayed}`,
          updatedAt: now,
        },
      });
  }
}

export function listEventsForTrack(trackId: number, limit = 50) {
  return db
    .select()
    .from(playEvents)
    .where(eq(playEvents.trackId, trackId))
    .orderBy(sql`${playEvents.startedAtUtc} DESC`)
    .limit(limit);
}

export async function deleteAllHistory(): Promise<void> {
  await db.delete(playEvents);
  await db.delete(trackStats);
}
