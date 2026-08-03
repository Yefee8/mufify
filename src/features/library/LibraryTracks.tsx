import { Music, SearchX } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { EmptyState } from '@/components/ui/EmptyState';
import type { TrackListItem } from '@/db/queries/tracks';
import { useMessages } from '@/i18n';
import * as perf from '@/services/perf';

import { AddToPlaylistSheet } from '../playlists/components/AddToPlaylistSheet';
import { useCurrentTrack, usePlaybackControls } from '../player/hooks/usePlayback';
import { toPlayable } from '../player/toPlayable';
import { TrackActionSheet, type TrackAction } from './components/TrackActionSheet';
import { TrackInfoSheet } from './components/TrackInfoSheet';
import { TrackList } from './components/TrackList';
import { TrackListSkeleton } from './components/TrackListSkeleton';
import { useTrackActions } from './hooks/useTrackActions';

export interface LibraryTracksProps {
  tracks: TrackListItem[];
  /** Skeleton instead of a list while true. */
  isLoading: boolean;
  /** The active search term, so "no results" can quote it. */
  search: string;
  /** Suppresses the empty state — the screen is already showing an error. */
  suppressEmpty: boolean;
  /** Offered by the empty state when the library has never been filled. */
  onScan: () => void;
}

/**
 * The track list and everything you can do to a track.
 *
 * Split out of `LibraryScreen`, which had reached exactly the 300-line limit
 * `AGENTS.md` sets. The division is by subject rather than by size: this owns
 * *tracks* — the action sheet, the info sheet, playing — and the
 * screen above owns the *library*: scanning, searching, and which view is on
 * screen.
 */
export function LibraryTracks({
  tracks,
  isLoading,
  search,
  suppressEmpty,
  onScan,
}: LibraryTracksProps) {
  const { t, i18n } = useTranslation();
  const messages = useMessages('library.empty');

  const { playFrom } = usePlaybackControls();
  const currentTrack = useCurrentTrack();

  const { addToQueue, playNext, toggleFavorite } = useTrackActions();
  // Queue conversion belongs to a data change, not to a row press.
  const playableTracks = useMemo(() => {
    perf.mark('library.playableQueue');
    const playable = tracks.map(toPlayable);
    perf.measure('library.playableQueue', playable.length);
    return playable;
  }, [tracks]);
  const trackIndexById = useMemo(
    () => new Map(tracks.map((track, index) => [track.id, index])),
    [tracks],
  );

  /** Which track's action sheet is open. */
  const [actionTarget, setActionTarget] = useState<TrackListItem | null>(null);
  /** Which track's info sheet is open. */
  const [infoTarget, setInfoTarget] = useState<TrackListItem | null>(null);
  /** Tracks queued for "add to playlist". Empty means the sheet is closed. */
  const [playlistTargets, setPlaylistTargets] = useState<readonly number[]>([]);

  const find = useCallback(
    (id: number) => tracks.find((track) => track.id === id) ?? null,
    [tracks],
  );

  /*
   * Playing a track makes the list it came from the queue, which is what a user
   * means by tapping a row — not "play this one thing and stop".
   */
  const onPress = useCallback(
    (id: number) => {
      const index = trackIndexById.get(id);
      if (index === undefined) return;
      perf.mark('library.play.handler');
      perf.mark('library.play.toMiniPlayer');
      playFrom(playableTracks, index);
      perf.measure('library.play.handler', playableTracks.length);
    },
    [trackIndexById, playFrom, playableTracks],
  );

  const onLongPress = useCallback((id: number) => setActionTarget(find(id)), [find]);

  const onSwipeToQueue = useCallback(
    (id: number) => {
      const track = find(id);
      if (track) addToQueue([track]);
    },
    [find, addToQueue],
  );

  const onAction = useCallback(
    (action: TrackAction) => {
      const track = actionTarget;
      if (!track) return;

      switch (action) {
        case 'playNext':
          playNext([track]);
          return;
        case 'addToQueue':
          addToQueue([track]);
          return;
        case 'addToPlaylist':
          setPlaylistTargets([track.id]);
          return;
        case 'favorite':
          toggleFavorite(track);
          return;
        case 'info':
          setInfoTarget(track);
          return;
      }
    },
    [actionTarget, playNext, addToQueue, toggleFavorite],
  );

  const closePlaylistSheet = useCallback(() => {
    setPlaylistTargets([]);
  }, []);

  return (
    <>
      <View className="flex-1">
        {isLoading ? (
          <TrackListSkeleton />
        ) : (
          <TrackList
            tracks={tracks}
            locale={i18n.language}
            onPress={onPress}
            onLongPress={onLongPress}
            onSwipeToQueue={onSwipeToQueue}
            currentTrackId={currentTrack?.id ?? null}
            empty={
              suppressEmpty ? null : search.trim() ? (
                /* No hits is not an empty library — offering a scan here would
                   answer a question the user did not ask. */
                <EmptyState icon={SearchX} messages={[t('library.noResults', { term: search })]} />
              ) : (
                <EmptyState
                  icon={Music}
                  messages={messages}
                  actionLabel={t('library.scan')}
                  onAction={onScan}
                />
              )
            }
          />
        )}
      </View>

      <TrackActionSheet
        track={actionTarget}
        onSelect={onAction}
        onClose={() => setActionTarget(null)}
      />
      <TrackInfoSheet track={infoTarget} onClose={() => setInfoTarget(null)} />
      <AddToPlaylistSheet trackIds={playlistTargets} onClose={closePlaylistSheet} />
    </>
  );
}
