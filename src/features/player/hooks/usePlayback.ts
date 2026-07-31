import { useCallback, useSyncExternalStore } from 'react';

import { AudioEngine } from '@/services/audio/AudioEngine';
import { getShuffleAlgorithm } from '@/services/settings';
import type { PlayableTrack, PlaybackState } from '@/services/audio/types';

/**
 * Subscribe to the whole engine state, position included.
 *
 * `useSyncExternalStore` rather than `useState` + `useEffect` because that is
 * exactly what it is for: the engine is a store that lives outside React and
 * outlives every screen. It also gets tearing right during concurrent renders,
 * which a hand-rolled subscription does not.
 *
 * **This re-renders twice a second while anything is playing**, because the
 * engine reports position on a 500ms interval. That is correct for the Now
 * Playing screen and wrong for everything else — see `usePlaybackPhase` and
 * `useCurrentTrack` below, and prefer them.
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

/*
 * Narrow subscriptions.
 *
 * These exist because the mini player is permanently mounted and only needs to
 * know *what* is playing, not *where* it is. Measured on the Pixel_7 AVD over
 * ten seconds of playback: 20 mini-player renders with the full subscription,
 * 0 with these. Twenty is exactly the 2 Hz status interval.
 *
 * Both snapshots are referentially stable when nothing has changed, which is
 * what `useSyncExternalStore` requires to skip a render: `phase` is a string,
 * and `state.track` keeps its identity across position updates because `emit`
 * only replaces the key it is given. Returning a fresh object from either of
 * these would defeat the whole point and loop instead.
 */

/** Just whether it is playing, loading, paused or idle. */
export function usePlaybackPhase(): PlaybackState['phase'] {
  return useSyncExternalStore(subscribe, getPhase);
}

/** Just what is loaded. Null when idle. */
export function useCurrentTrack(): PlayableTrack | null {
  return useSyncExternalStore(subscribe, getTrack);
}

function getPhase(): PlaybackState['phase'] {
  return AudioEngine.getState().phase;
}

function getTrack(): PlayableTrack | null {
  return AudioEngine.getState().track;
}

export interface PlaybackControls {
  /** Toggle shuffle, using whichever algorithm Settings has selected. */
  toggleShuffle: () => void;
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
  // The algorithm is read at press time rather than captured, so changing it
  // in Settings takes effect on the next shuffle without a remount.
  const toggleShuffle = useCallback(() => {
    void AudioEngine.setShuffled(!AudioEngine.isShuffled(), getShuffleAlgorithm());
  }, []);
  const next = useCallback(() => void AudioEngine.advance(true), []);
  const previous = useCallback(() => void AudioEngine.previous(), []);
  const seekTo = useCallback((positionMs: number) => void AudioEngine.seekTo(positionMs), []);

  return { playFrom, toggle, toggleShuffle, next, previous, seekTo };
}
