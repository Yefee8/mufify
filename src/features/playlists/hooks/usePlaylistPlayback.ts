import { useCallback, useMemo } from 'react';

import type { PlaylistEntry } from '@/db/queries/playlists';
import { AudioEngine } from '@/services/audio/AudioEngine';
import { LIBRARY_SOURCE, type PlayableTrack, type QueueSource } from '@/services/audio/types';
import { getShuffleAlgorithm } from '@/services/settings';

export interface PlaylistPlayback {
  playAll: () => void;
  shuffleAll: () => Promise<void>;
  /** Start at the entry holding this position, with the rest queued behind. */
  playAt: (position: number) => void;
}

/**
 * Starting a playlist, three ways.
 *
 * Out of the screen because the screen had passed 300 lines, and because these
 * three share two facts the screen has no other use for: how an entry becomes
 * something the engine can play, and what the queue calls its source.
 *
 * User playlists declare themselves as the queue's source, which is what puts
 * rows in `stats_rollups` under entity type 'playlist'. Without it the
 * top-playlists list is permanently empty and looks like a user who never plays
 * playlists. Liked Songs is not a playlist row, so it reports as the library.
 */
export function usePlaylistPlayback(
  entries: readonly PlaylistEntry[],
  playlistId: number,
  isLiked: boolean,
): PlaylistPlayback {
  const source = useMemo<QueueSource>(
    () => (isLiked ? LIBRARY_SOURCE : { type: 'playlist', id: playlistId }),
    [isLiked, playlistId],
  );

  const playAll = useCallback(() => {
    if (entries.length > 0) void AudioEngine.setQueue(entries.map(toPlayable), 0, source);
  }, [entries, source]);

  /*
   * Shuffle uses whichever algorithm Settings has selected, read at press time.
   * The queue is set first and shuffled second rather than shuffling the array
   * and setting it: the engine keeps the unshuffled order as `sourceQueue`, so
   * turning shuffle off later restores the playlist's real running order instead
   * of freezing whatever random arrangement started.
   */
  const shuffleAll = useCallback(async () => {
    if (entries.length === 0) return;
    await AudioEngine.setQueue(entries.map(toPlayable), 0, source);
    await AudioEngine.setShuffled(true, getShuffleAlgorithm());
  }, [entries, source]);

  const playAt = useCallback(
    (position: number) => {
      const index = entries.findIndex((entry) => entry.position === position);
      if (index !== -1) void AudioEngine.setQueue(entries.map(toPlayable), index, source);
    },
    [entries, source],
  );

  return { playAll, shuffleAll, playAt };
}

/** A playlist entry as the engine wants it. */
function toPlayable(entry: PlaylistEntry): PlayableTrack {
  return {
    id: entry.trackId,
    uri: entry.fileUri,
    title: entry.title,
    artistName: entry.artistName,
    albumName: entry.albumName,
    durationMs: entry.durationMs,
    artworkPath: entry.artworkPath,
    playCount: entry.playCount,
    isFavorite: entry.isFavorite,
  };
}
