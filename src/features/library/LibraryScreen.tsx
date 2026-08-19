import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, View } from 'react-native';

import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ErrorState } from '@/components/ui/ErrorState';
import { Screen } from '@/components/ui/Screen';
import { SegmentedControl, type SegmentedControlOption } from '@/components/ui/SegmentedControl';
import { LikedFilter } from '@/components/ui/LikedFilter';
import { PlayShuffleBar } from '@/components/ui/PlayShuffleBar';
import { WarningBanner } from '@/components/ui/WarningBanner';
import { useAlbumCards, useArtistCards } from '@/db/queries/tracks';
import { AudioEngine } from '@/services/audio/AudioEngine';
import { getShuffleAlgorithm } from '@/services/settings';
import { useLifecycleTrace } from '@/services/perf/useLifecycleTrace';

import { toPlayable } from '../player/toPlayable';
import { LibraryHeader } from './components/LibraryHeader';
import { FolderImportModal } from './components/FolderImportModal';
import { ScanBanner } from './components/ScanBanner';
import { SearchField } from './components/SearchField';
import { LibraryCollections } from './LibraryCollections';
import { LibraryTracks } from './LibraryTracks';
import { useCollectionRouting } from './hooks/useCollectionRouting';
import { useDebounced } from './hooks/useDebounced';
import { useAudioPermission } from './hooks/useAudioPermission';
import { useTracks } from './hooks/useLibrary';
import { useScan } from './hooks/useScan';

/** Which face of the library is on screen. */
const VIEWS = ['tracks', 'artists', 'albums'] as const;
type LibraryView = (typeof VIEWS)[number];

/** Opens this app's page in system settings, where the permission switch is. */
function openAppSettings(): void {
  void Linking.openSettings();
}

/**
 * The library, in three views: tracks, artists, albums.
 *
 * This screen owns the *library* — scanning, searching, which view is showing —
 * and delegates each view to a component that owns the things in it. That split
 * happened because the tracks view alone had reached the 300-line limit; adding
 * two more views to the same file was not an option, and the boundary it forced
 * is the right one anyway.
 *
 * Genres are absent. The tech stack doc lists them alongside artists and albums,
 * and MediaStore's genre tagging is unreliable enough on real libraries that a
 * genre shelf is mostly one bucket called "Unknown" — see
 * `docs/adr/012-artist-and-album-shelves.md`.
 */
export function LibraryScreen() {
  useLifecycleTrace('LibraryScreen');
  const { t } = useTranslation();

  const [view, setView] = useState<LibraryView>('tracks');
  const [search, setSearch] = useState('');
  const [likedOnly, setLikedOnly] = useState(false);
  // The field stays instant; only the query waits.
  const { tracks, isLoading } = useTracks(useDebounced(search), likedOnly);
  const { progress, isScanning, scanLibrary, pickFolder, importFolder, isFolderImporting, cancel } =
    useScan();
  const permission = useAudioPermission();

  const artists = useArtistCards();
  const albums = useAlbumCards();
  const { openArtist, openAlbum } = useCollectionRouting();
  const collectionCards = view === 'artists' ? artists : albums;
  const displayedTrackCount =
    view === 'tracks'
      ? tracks.length
      : collectionCards.reduce((total, card) => total + card.trackCount, 0);

  /** True while the scan confirmation is on screen. */
  const [confirmingScan, setConfirmingScan] = useState(false);
  const askToScan = useCallback(() => setConfirmingScan(true), []);
  const [pendingFolder, setPendingFolder] = useState<string | null>(null);
  const chooseFolder = useCallback(async () => {
    const uri = await pickFolder();
    if (uri) setPendingFolder(uri);
  }, [pickFolder]);
  const confirmFolderImport = useCallback(() => {
    const uri = pendingFolder;
    setPendingFolder(null);
    if (uri) void importFolder(uri);
  }, [importFolder, pendingFolder]);

  /*
   * Start the whole library, from the top or shuffled.
   *
   * Whatever the list is currently showing, filtered search included: the bar
   * sits under the search field and starting something other than what is on
   * screen would be a different feature wearing the same button.
   */
  const playAll = useCallback(() => {
    if (tracks.length > 0) void AudioEngine.setQueue(tracks.map(toPlayable), 0);
  }, [tracks]);

  const shuffleAll = useCallback(() => {
    if (tracks.length === 0) return;
    // Queue first, shuffle second: the engine keeps the unshuffled order, so
    // turning shuffle off later restores the list's real order.
    void (async () => {
      await AudioEngine.setQueue(tracks.map(toPlayable), 0);
      await AudioEngine.setShuffled(true, getShuffleAlgorithm());
    })();
  }, [tracks]);

  const hasFailed = !isScanning && progress.phase === 'failed';

  /*
   * A permanent denial cannot be undone by asking again — the system drops the
   * request without showing anything — so that case sends the user to the page
   * where the switch actually is, rather than handing them a button that
   * silently does nothing.
   */
  const askAgain = useCallback(() => {
    if (permission.blocked) openAppSettings();
    else void permission.request();
  }, [permission]);

  const viewOptions: SegmentedControlOption<LibraryView>[] = VIEWS.map((value) => ({
    value,
    label: t(`library.view.${value}`),
  }));

  /*
   * Skeleton while the query is in flight *and* while a scan has not yet
   * produced a first row.
   *
   * The second case is the fix for a contradiction: with an empty library and a
   * scan running, the list showed its empty state — "No music found yet. Scan
   * the device" with a Scan button — directly underneath a banner reporting a
   * scan in progress. Two parts of one screen disagreeing about whether anything
   * was happening.
   */
  const waiting = isLoading || (isScanning && tracks.length === 0);

  return (
    <Screen title={t('library.title')}>
      <LibraryHeader
        count={displayedTrackCount}
        isScanning={isScanning}
        onAddFolder={chooseFolder}
        onScan={askToScan}
      />

      <View className="px-6 pb-4">
        <SegmentedControl
          options={viewOptions}
          value={view}
          onChange={setView}
          accessibilityLabel={t('library.view.label')}
        />
      </View>

      {/* Both narrow the track list, so they share a row. Artists and albums are
          grids of a few cards and need neither, and hiding them there makes that
          obvious rather than puzzling. */}
      {view === 'tracks' ? (
        <View className="mb-4 flex-row items-center gap-3 px-6">
          <SearchField value={search} onChange={setSearch} inRow />
          <LikedFilter
            active={likedOnly}
            onChange={setLikedOnly}
            accessibilityLabel={t('library.likedFilter')}
          />
        </View>
      ) : null}

      {/* Starting the whole library from the top, rather than only by tapping a
          row — which starts at that row. Hidden while there is nothing to play. */}
      {view === 'tracks' ? (
        <PlayShuffleBar onPlay={playAll} onShuffle={shuffleAll} disabled={tracks.length === 0} />
      ) : null}

      {/*
        Above the list rather than in place of it, and present for as long as
        the refusal is — not only in the seconds after a scan. Without the
        permission MediaStore returns nothing rather than failing, so a library
        that looks merely empty is the symptom this explains.
      */}
      {permission.denied ? (
        <WarningBanner
          message={
            permission.blocked
              ? t('library.scanError.permissionBlocked')
              : t('library.scanError.permission')
          }
          actionLabel={
            permission.blocked ? t('library.scanError.openSettings') : t('library.scanError.grant')
          }
          onAction={askAgain}
        />
      ) : null}

      {isScanning && !isFolderImporting ? (
        <ScanBanner progress={progress} onCancel={cancel} />
      ) : null}

      {hasFailed ? (
        <ErrorState
          message={t('library.scanError.generic')}
          detail={progress.error}
          retryLabel={t('library.scanError.retry')}
          onRetry={chooseFolder}
        />
      ) : null}

      {/*
        Every view owns whatever height is left, explicitly. Without a bounded
        flex parent a virtualized list keeps the height it first measured, so
        mounting the scan banner above it shrinks the space without shrinking the
        list — which is where the blank band above the first row came from.
      */}
      {view === 'tracks' ? (
        <LibraryTracks
          tracks={tracks}
          isLoading={waiting}
          search={search}
          likedOnly={likedOnly}
          suppressEmpty={hasFailed}
          onAddFolder={chooseFolder}
        />
      ) : (
        <LibraryCollections
          kind={view === 'artists' ? 'artist' : 'album'}
          cards={collectionCards}
          isLoading={waiting}
          onOpen={view === 'artists' ? openArtist : openAlbum}
        />
      )}

      {/*
        Scanning reads every audio file on the device, so it says so before it
        starts. There is no progress estimate to offer — MediaStore does not
        report a count until it has been asked.
      */}
      <ConfirmDialog
        visible={confirmingScan}
        title={t('library.scanConfirm.title')}
        body={t('library.scanConfirm.body')}
        confirmLabel={t('library.scan')}
        onConfirm={() => {
          setConfirmingScan(false);
          void scanLibrary();
        }}
        onCancel={() => setConfirmingScan(false)}
      />
      <ConfirmDialog
        visible={pendingFolder !== null}
        title={t('library.folderImportConfirm.title')}
        body={t('library.folderImportConfirm.body')}
        confirmLabel={t('library.import')}
        onConfirm={confirmFolderImport}
        onCancel={() => setPendingFolder(null)}
      />
      {isFolderImporting ? <FolderImportModal progress={progress} onCancel={cancel} /> : null}
    </Screen>
  );
}
