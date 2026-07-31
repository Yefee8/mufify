import { useCallback, useSyncExternalStore } from 'react';

import { AudioEngine } from '@/services/audio/AudioEngine';
import type { PlayableTrack, PlaybackState } from '@/services/audio/types';

/**
 * Subscribe to the engine.
 *
 * `useSyncExternalStore` rather than `useState` + `useEffect` because that is
 * exactly what it is for: the engine is a store that lives outside React and
 * outlives every screen. It also gets tearing right during concurrent renders,
 * which a hand-rolled subscription does not.
 */
export function usePlayback(): PlaybackState {
  return useSyncExternalStore(subscribe, getSnapshot);
}

function subscribe(onChange: () => void): () => void {
  return AudioEngine.subscribe(onChange);
}

function getSnapshot(): PlaybackState {
  return AudioEngine.getState();
}

export interface PlaybackControls {
  /** Play a track from within a list, making that list the queue. */
  playFrom: (tracks: PlayableTrack[], index: number) => void;
  toggle: () => void;
  next: () => void;
  previous: () => void;
  seekTo: (positionMs: number) => void;
}

/** Stable callbacks for the transport. Safe to pass to a memoized row. */
export function usePlaybackControls(): PlaybackControls {
  const playFrom = useCallback((tracks: PlayableTrack[], index: number) => {
    void AudioEngine.setQueue(tracks, index);
  }, []);

  const toggle = useCallback(() => AudioEngine.toggle(), []);
  const next = useCallback(() => void AudioEngine.advance(true), []);
  const previous = useCallback(() => void AudioEngine.previous(), []);
  const seekTo = useCallback((positionMs: number) => void AudioEngine.seekTo(positionMs), []);

  return { playFrom, toggle, next, previous, seekTo };
}
