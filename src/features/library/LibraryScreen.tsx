import { Music, SearchX } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, View } from 'react-native';

import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Screen } from '@/components/ui/Screen';
import type { TrackListItem } from '@/db/queries/tracks';
import { useMessages } from '@/i18n';
import { useLifecycleTrace } from '@/services/perf/useLifecycleTrace';
import { isPermissionError } from '@/services/scanner/permission';

import { AddToPlaylistSheet } from '../playlists/components/AddToPlaylistSheet';
import { useCurrentTrack, usePlaybackControls } from '../player/hooks/usePlayback';
import { toPlayable } from '../player/toPlayable';
import { LibraryHeader } from './components/LibraryHeader';
import { ScanBanner } from './components/ScanBanner';
import { SearchField } from './components/SearchField';
import { SelectionBar } from './components/SelectionBar';
import { TrackActionSheet, type TrackAction } from './components/TrackActionSheet';
import { TrackInfoSheet } from './components/TrackInfoSheet';
import { TrackList } from './components/TrackList';
import { TrackListSkeleton } from './components/TrackListSkeleton';
import { useDebounced } from './hooks/useDebounced';
import { useTracks } from './hooks/useLibrary';
import { useScan } from './hooks/useScan';
import { useSelection } from './hooks/useSelection';
import { useTrackActions } from './hooks/useTrackActions';

/** Opens this app's page in system settings, where the permission switch is. */
function openAppSettings(): void {
  void Linking.openSettings();
}

/**
 * The library: every present track, with the scan that fills it.
 *
 * This screen decides *what* happens to a track — play it, queue it, select it,
 * describe it. `TrackList` decides how a row is drawn, and the sheets decide how
 * a choice is offered. The four states — loading, scanning, failed, empty — are
 * all here, per the States rule, and the scan banner sits above the list rather
 * than replacing it so the user can keep scrolling.
 */
export function LibraryScreen() {
  useLifecycleTrace('LibraryScreen');
  const { t, i18n } = useTranslation();
  const messages = useMessages('library.empty');

  const [search, setSearch] = useState('');
  // The field stays instant; only the query waits.
  const { tracks, isLoading } = useTracks(useDebounced(search));
  /*
   * The launch sweep waits for the list to be on screen. Firing it on mount put
   * a MediaStore enumeration on the JS thread alongside the first library query
   * — see `useScan` and docs/performance.md.
   */
  const { progress, isScanning, isRefreshing, scanLibrary, addFolder, rescan, cancel } =
    useScan(!isLoading);

  const { playFrom } = usePlaybackControls();
  const currentTrack = useCurrentTrack();
  const selection = useSelection();
  const { addToQueue, playNext, toggleFavorite } = useTrackActions();

  /** Which track's action sheet is open. */
  const [actionTarget, setActionTarget] = useState<TrackListItem | null>(null);
  /** Which track's info sheet is open. */
  const [infoTarget, setInfoTarget] = useState<TrackListItem | null>(null);
  /** Tracks queued for "add to playlist". Empty means the sheet is closed. */
  const [playlistTargets, setPlaylistTargets] = useState<readonly number[]>([]);

  const hasFailed = !isScanning && progress.phase === 'failed';
  const permissionFailed = isPermissionError(progress.error);
  const permissionBlocked = progress.error === 'permission-blocked';

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
      if (selection.isActive) {
        selection.toggle(id);
        return;
      }
      const index = tracks.findIndex((track) => track.id === id);
      if (index === -1) return;
      playFrom(tracks.map(toPlayable), index);
    },
    [tracks, playFrom, selection],
  );

  const onLongPress = useCallback(
    (id: number) => {
      // Long-pressing during a selection extends it rather than opening a sheet
      // about one row — the user is plainly in the middle of picking several.
      if (selection.isActive) {
        selection.toggle(id);
        return;
      }
      setActionTarget(find(id));
    },
    [selection, find],
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

  const onSelectionPlaylist = useCallback(() => {
    setPlaylistTargets(selection.ids);
  }, [selection.ids]);

  const closePlaylistSheet = useCallback(() => {
    setPlaylistTargets([]);
    selection.clear();
  }, [selection]);

  return (
    <Screen title={t('library.title')}>
      <LibraryHeader
        count={tracks.length}
        isScanning={isScanning}
        onAddMusic={addFolder}
        onStartSelecting={selection.activate}
      />

      <SearchField value={search} onChange={setSearch} />

      {isScanning ? <ScanBanner progress={progress} onCancel={cancel} /> : null}

      {hasFailed ? (
        <ErrorState
          message={
            permissionBlocked
              ? t('library.scanError.permissionBlocked')
              : permissionFailed
                ? t('library.scanError.permission')
                : t('library.scanError.generic')
          }
          detail={permissionFailed ? null : progress.error}
          /*
            A permanent denial cannot be undone by asking again, so retrying
            would silently do nothing. Send the user where the switch actually
            is instead.
          */
          retryLabel={
            permissionBlocked ? t('library.scanError.openSettings') : t('library.scanError.retry')
          }
          onRetry={permissionBlocked ? openAppSettings : scanLibrary}
        />
      ) : null}

      {/*
        The list owns whatever height is left, explicitly. Without a bounded flex
        parent a virtualized list keeps the height it first measured, so mounting
        the scan banner above it shrank the space without shrinking the list —
        which is where the blank band above the first row during "Reading tags…"
        came from.
      */}
      <View className="flex-1">
        {isLoading ? (
          <TrackListSkeleton />
        ) : (
          <TrackList
            tracks={tracks}
            locale={i18n.language}
            selection={selection}
            onPress={onPress}
            onLongPress={onLongPress}
            onSwipeToQueue={onSwipeToQueue}
            currentTrackId={currentTrack?.id ?? null}
            isRefreshing={isRefreshing}
            onRefresh={rescan}
            empty={
              hasFailed ? null : search.trim() ? (
                /* No hits is not an empty library — offering "Add music" here
                   would answer a question the user did not ask. */
                <EmptyState icon={SearchX} messages={[t('library.noResults', { term: search })]} />
              ) : (
                <EmptyState
                  icon={Music}
                  messages={messages}
                  actionLabel={t('library.emptyAction')}
                  onAction={addFolder}
                />
              )
            }
          />
        )}
      </View>

      {selection.isActive ? (
        <SelectionBar
          count={selection.ids.length}
          total={tracks.length}
          onSelectAll={() => selection.toggleAll(tracks.map((track) => track.id))}
          onAddToQueue={onSelectionQueue}
          onAddToPlaylist={onSelectionPlaylist}
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
    </Screen>
  );
}
