import { eq, sql } from 'drizzle-orm';

import { classifyListen, type ListenOutcome } from '@/services/stats/playCounting';
import { periodKeys, type WeekStart } from '@/services/stats/periodKeys';

import { db } from '../client';
import { playEvents, trackStats, type PlayEvent } from '../schema';

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
 * Rollup upserts land in Phase 7 and will hang off this function.
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

  return { event: event ?? null, outcome };
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
