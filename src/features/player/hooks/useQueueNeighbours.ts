import { useMemo, useSyncExternalStore } from 'react';

import { AudioEngine, type QueueSnapshot } from '@/services/audio/AudioEngine';
import type { PlayableTrack } from '@/services/audio/types';

export interface QueueNeighbours {
  previous: PlayableTrack | null;
  current: PlayableTrack | null;
  next: PlayableTrack | null;
}

/**
 * What is playing, and what sits either side of it in the queue.
 *
 * The carousel needs all three mounted at once. That is the whole point of it:
 * the neighbouring artwork is already decoded and on screen just off the edge,
 * so dragging sideways reveals a real image instead of a blank square that
 * fills in a moment later.
 *
 * Subscribes to the engine's queue rather than its playback state — state is
 * emitted twice a second for the position, and re-deriving this at 2 Hz would
 * hand the carousel a new object on every tick.
 *
 * Null at either end rather than wrapping. Repeat-all does wrap, but the queue
 * screen and the transport both treat the ends as ends, and a carousel that
 * silently loops from the last track back to the first would be showing the
 * user something the skip button would not do.
 */
export function useQueueNeighbours(): QueueNeighbours {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot);

  return useMemo(() => {
    const { tracks, index } = snapshot;
    if (index < 0) return { previous: null, current: null, next: null };

    return {
      previous: tracks[index - 1] ?? null,
      current: tracks[index] ?? null,
      next: tracks[index + 1] ?? null,
    };
  }, [snapshot]);
}

function subscribe(onChange: () => void): () => void {
  return AudioEngine.subscribeQueue(onChange);
}

function getSnapshot(): QueueSnapshot {
  return AudioEngine.getQueueSnapshot();
}
