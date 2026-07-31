import { useCallback } from 'react';

import type { TrackListItem } from '@/db/queries/tracks';
import { setFavorite } from '@/db/queries/tracks';
import { AudioEngine } from '@/services/audio/AudioEngine';
import { commitFeedback, rejectFeedback } from '@/services/haptics';

import { toPlayable } from '../../player/toPlayable';

export interface TrackActions {
  /** Append to the end of the queue. */
  addToQueue: (tracks: TrackListItem[]) => void;
  /** Insert directly after what is playing. */
  playNext: (tracks: TrackListItem[]) => void;
  /** Flip the favourite flag. */
  toggleFavorite: (track: TrackListItem) => void;
}

/**
 * The queue and favourite actions, in one place.
 *
 * Both the swipe gesture, the long-press sheet and the selection bar do these,
 * and each one wants the same haptic and the same empty-input guard. Duplicating
 * that across three call sites is how one of them ends up silently doing
 * nothing.
 *
 * An empty list gets a rejection buzz rather than a success one. "Add to queue"
 * with nothing selected is a press that cannot work, and confirming it is worse
 * than saying no.
 */
export function useTrackActions(): TrackActions {
  const addToQueue = useCallback((tracks: TrackListItem[]) => {
    if (tracks.length === 0) {
      rejectFeedback();
      return;
    }
    commitFeedback();
    void AudioEngine.enqueue(tracks.map(toPlayable));
  }, []);

  const playNext = useCallback((tracks: TrackListItem[]) => {
    if (tracks.length === 0) {
      rejectFeedback();
      return;
    }
    commitFeedback();
    void AudioEngine.playNext(tracks.map(toPlayable));
  }, []);

  const toggleFavorite = useCallback((track: TrackListItem) => {
    commitFeedback();
    void setFavorite(track.id, !track.isFavorite);
  }, []);

  return { addToQueue, playNext, toggleFavorite };
}
