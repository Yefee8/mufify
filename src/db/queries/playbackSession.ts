import { eq } from 'drizzle-orm';

import { db } from '../client';
import { playbackSession } from '../schema';

/** The saved session, as stored: ids, not tracks. */
export interface StoredSession {
  queue: number[];
  sourceQueue: number[];
  queueIndex: number;
  positionMs: number;
  shuffled: boolean;
  shuffleAlgorithm: string | null;
  repeat: string;
  sourceType: string;
  sourceId: number | null;
}

const ROW = 1;

/** The last saved session, or null when nothing was playing. */
export async function loadPlaybackSession(): Promise<StoredSession | null> {
  const [row] = await db.select().from(playbackSession).where(eq(playbackSession.id, ROW));
  if (row === undefined) return null;
  return {
    queue: parseIds(row.queue),
    sourceQueue: parseIds(row.sourceQueue),
    queueIndex: row.queueIndex,
    positionMs: row.positionMs,
    shuffled: row.shuffled === 1,
    shuffleAlgorithm: row.shuffleAlgorithm,
    repeat: row.repeat,
    sourceType: row.sourceType,
    sourceId: row.sourceId,
  };
}

/** Replace the saved session — the queue changed. */
export async function savePlaybackSession(session: StoredSession): Promise<void> {
  const values = {
    id: ROW,
    queue: JSON.stringify(session.queue),
    sourceQueue: JSON.stringify(session.sourceQueue),
    queueIndex: session.queueIndex,
    positionMs: session.positionMs,
    shuffled: session.shuffled ? 1 : 0,
    shuffleAlgorithm: session.shuffleAlgorithm,
    repeat: session.repeat,
    sourceType: session.sourceType,
    sourceId: session.sourceId,
    updatedAt: Date.now(),
  };
  await db
    .insert(playbackSession)
    .values(values)
    .onConflictDoUpdate({ target: playbackSession.id, set: values });
}

/**
 * Move the saved position, and nothing else — the cheap write that runs while
 * a track plays, so the queue's JSON is not rewritten every few seconds.
 */
export async function savePlaybackPosition(
  queueIndex: number,
  positionMs: number,
  repeat: string,
): Promise<void> {
  await db
    .update(playbackSession)
    .set({ queueIndex, positionMs, repeat, updatedAt: Date.now() })
    .where(eq(playbackSession.id, ROW));
}

/** Nothing is queued any more: the queue was cleared. */
export async function clearPlaybackSession(): Promise<void> {
  await db.delete(playbackSession).where(eq(playbackSession.id, ROW));
}

function parseIds(text: string): number[] {
  try {
    const parsed: unknown = JSON.parse(text);
    return Array.isArray(parsed) ? parsed.filter((id): id is number => typeof id === 'number') : [];
  } catch {
    // A row that does not parse is a session that cannot be restored, not a crash.
    return [];
  }
}
