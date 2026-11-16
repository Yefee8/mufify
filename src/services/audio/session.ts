import { SHUFFLE_ALGORITHMS, type ShuffleAlgorithm } from '@/services/shuffle';

import type { QueueSource, RepeatMode } from './types';

/** A saved session, as ids — what `db/queries/playbackSession` stores. */
export interface SessionIds {
  queue: readonly number[];
  sourceQueue: readonly number[];
  queueIndex: number;
  positionMs: number;
  shuffled: boolean;
  shuffleAlgorithm: string | null;
  repeat: string;
  sourceType: string;
  sourceId: number | null;
}

/** The same session with tracks in place of ids, ready for the engine. */
export interface RestoredSession<T> {
  queue: T[];
  sourceQueue: T[];
  index: number;
  positionMs: number;
  shuffled: boolean;
  shuffleAlgorithm: ShuffleAlgorithm | null;
  repeat: RepeatMode;
  source: QueueSource;
}

const REPEAT_MODES: readonly RepeatMode[] = ['off', 'all', 'one'];
const SOURCE_TYPES: readonly QueueSource['type'][] = [
  'library',
  'album',
  'artist',
  'playlist',
  'queue',
];

/**
 * Put a saved session back together from the tracks that still exist.
 *
 * Tracks deleted or gone missing since are dropped from both queues. If the
 * current one is among them, the session resumes at the next survivor — the
 * track that would have played next — or the last one before it, from the
 * start rather than at a position that belonged to another file. Nothing left
 * means nothing to restore.
 *
 * Every stored value is checked rather than trusted: the row may have been
 * written by another version, and a session that cannot be read is better
 * dropped than half-applied.
 */
export function rebuildSession<T extends { id: number }>(
  stored: SessionIds,
  found: ReadonlyMap<number, T>,
): RestoredSession<T> | null {
  const queue: T[] = [];
  let index = -1;
  let resumedElsewhere = false;

  for (const [position, id] of stored.queue.entries()) {
    const track = found.get(id);
    if (track === undefined) continue;
    if (position === stored.queueIndex) index = queue.length;
    else if (index === -1 && position > stored.queueIndex) {
      // The current track is gone; the first survivor after it takes its place.
      index = queue.length;
      resumedElsewhere = true;
    }
    queue.push(track);
  }

  if (queue.length === 0) return null;
  if (index === -1) {
    index = queue.length - 1;
    resumedElsewhere = true;
  }

  const sourceQueue = stored.sourceQueue.flatMap((id) => {
    const track = found.get(id);
    return track === undefined ? [] : [track];
  });

  const algorithm = SHUFFLE_ALGORITHMS.find((name) => name === stored.shuffleAlgorithm) ?? null;
  const repeat = REPEAT_MODES.find((mode) => mode === stored.repeat) ?? 'off';
  const type = SOURCE_TYPES.find((name) => name === stored.sourceType) ?? 'library';

  return {
    queue,
    // Without its original order a shuffled queue cannot be un-shuffled; the
    // queue as it stands is then the order there is.
    sourceQueue: sourceQueue.length > 0 ? sourceQueue : queue,
    index,
    positionMs: resumedElsewhere ? 0 : Math.max(0, stored.positionMs),
    shuffled: stored.shuffled && algorithm !== null,
    shuffleAlgorithm: algorithm,
    repeat,
    source:
      type === 'library' || stored.sourceId === null ? { type } : { type, id: stored.sourceId },
  };
}
