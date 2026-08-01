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
import { SelectionBar } from './components/SelectionBar';
import { TrackActionSheet, type TrackAction } from './components/TrackActionSheet';
import { TrackInfoSheet } from './components/TrackInfoSheet';
import { TrackList } from './components/TrackList';
import { TrackListSkeleton } from './components/TrackListSkeleton';
import { useSelection } from './hooks/useSelection';
import { useTrackActions } from './hooks/useTrackActions';

export interface LibraryTracksProps {
  tracks: TrackListItem[];
  /** Skeleton instead of a list while true. */
  isLoading: boolean;
  isRefreshing: boolean;
  onRefresh: () => void;
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
 * *tracks* — selection, the action sheet, the info sheet, playing — and the
 * screen above owns the *library*: scanning, searching, and which view is on
 * screen.
 */
export function LibraryTracks({
  tracks,
  isLoading,
  isRefreshing,
  onRefresh,
  search,
  suppressEmpty,
  onScan,
}: LibraryTracksProps) {
  const { t, i18n } = useTranslation();
  const messages = useMessages('library.empty');

  const { playFrom } = usePlaybackControls();
  const currentTrack = useCurrentTrack();

  /*
   * Destructured, not held as an object. Every callback below would otherwise
   * list `selection` as a dependency and be rebuilt on every render, which
   * rebuilt every visible row — 47 of them per checkbox tap, measured. The
   * individual functions are stable; only `isActive` and `ids` actually move.
   */
  const selection = useSelection();
  const { isActive: isSelecting, ids: selectedIdList, toggle: toggleSelected } = selection;

  /** The selection as a Set, built once per change rather than once per row. */
  const selectedIds = useMemo(() => new Set(selectedIdList), [selectedIdList]);
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
   * means by tapping a row — not "play this one thing and stop". While
   * selecting, the same tap ticks a box instead.
   */
  const onPress = useCallback(
    (id: number) => {
      if (isSelecting) {
        toggleSelected(id);
        return;
      }
      const index = trackIndexById.get(id);
      if (index === undefined) return;
      perf.mark('library.play.handler');
      perf.mark('library.play.toMiniPlayer');
      playFrom(playableTracks, index);
      perf.measure('library.play.handler', playableTracks.length);
    },
    [trackIndexById, playFrom, playableTracks, isSelecting, toggleSelected],
  );

  const onLongPress = useCallback(
    (id: number) => {
      // Long-pressing during a selection extends it rather than opening a sheet
      // about one row — the user is plainly in the middle of picking several.
      if (isSelecting) {
        toggleSelected(id);
        return;
      }
      setActionTarget(find(id));
    },
    [isSelecting, toggleSelected, find],
  );

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
        case 'select':
          selection.begin(track.id);
          return;
        case 'info':
          setInfoTarget(track);
          return;
      }
    },
    [actionTarget, playNext, addToQueue, toggleFavorite, selection],
  );

  const onSelectionQueue = useCallback(() => {
    // Resolved in selection order, so the queue takes them as they were picked.
    const picked = selection.ids
      .map(find)
      .filter((track): track is TrackListItem => track !== null);
    addToQueue(picked);
    selection.clear();
  }, [addToQueue, selection, find]);

  const closePlaylistSheet = useCallback(() => {
    setPlaylistTargets([]);
    selection.clear();
  }, [selection]);

  return (
    <>
      <View className="flex-1">
        {isLoading ? (
          <TrackListSkeleton />
        ) : (
          <TrackList
            tracks={tracks}
            locale={i18n.language}
            isSelecting={isSelecting}
            selectedIds={selectedIds}
            onPress={onPress}
            onLongPress={onLongPress}
            onSwipeToQueue={onSwipeToQueue}
            currentTrackId={currentTrack?.id ?? null}
            isRefreshing={isRefreshing}
            onRefresh={onRefresh}
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

      {isSelecting ? (
        <SelectionBar
          count={selection.ids.length}
          total={tracks.length}
          onSelectAll={() => selection.toggleAll(tracks.map((track) => track.id))}
          onAddToQueue={onSelectionQueue}
          onAddToPlaylist={() => setPlaylistTargets(selection.ids)}
          onCancel={selection.clear}
        />
      ) : null}

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
