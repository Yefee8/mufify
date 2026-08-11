import { Disc3, User } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, View } from 'react-native';

import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ErrorState } from '@/components/ui/ErrorState';
import { Screen } from '@/components/ui/Screen';
import { SegmentedControl, type SegmentedControlOption } from '@/components/ui/SegmentedControl';
import { SkeletonCards } from '@/components/ui/Skeleton';
import { useAlbumCards, useArtistCards } from '@/db/queries/tracks';
import { useLifecycleTrace } from '@/services/perf/useLifecycleTrace';
import { isPermissionError } from '@/services/scanner/permission';

import { CollectionGrid } from './components/CollectionGrid';
import { LibraryHeader } from './components/LibraryHeader';
import { FolderImportModal } from './components/FolderImportModal';
import { SearchField } from './components/SearchField';
import { LibraryTracks } from './LibraryTracks';
import { useCollectionRouting } from './hooks/useCollectionRouting';
import { useDebounced } from './hooks/useDebounced';
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
  // The field stays instant; only the query waits.
  const { tracks, isLoading } = useTracks(useDebounced(search));
  const { progress, isScanning, pickFolder, importFolder, isFolderImporting, cancel } = useScan();

  const artists = useArtistCards();
  const albums = useAlbumCards();
  const { openArtist, openAlbum } = useCollectionRouting();
  const collectionCards = view === 'artists' ? artists : albums;
  const displayedTrackCount =
    view === 'tracks'
      ? tracks.length
      : collectionCards.reduce((total, card) => total + card.trackCount, 0);

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

  const hasFailed = !isScanning && progress.phase === 'failed';
  const permissionFailed = isPermissionError(progress.error);
  const permissionBlocked = progress.error === 'permission-blocked';

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
      />

      <View className="px-6 pb-4">
        <SegmentedControl
          options={viewOptions}
          value={view}
          onChange={setView}
          accessibilityLabel={t('library.view.label')}
        />
      </View>

      {/* Search filters tracks only. An artist grid of two cards does not need
          a search box, and hiding it makes that obvious rather than puzzling. */}
      {view === 'tracks' ? <SearchField value={search} onChange={setSearch} /> : null}

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
          onRetry={permissionBlocked ? openAppSettings : chooseFolder}
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
          suppressEmpty={hasFailed}
          onAddFolder={chooseFolder}
        />
      ) : (
        <View className="flex-1">
          {waiting ? (
            <SkeletonCards />
          ) : (
            <CollectionGrid
              kind={view === 'artists' ? 'artist' : 'album'}
              cards={collectionCards}
              icon={view === 'artists' ? User : Disc3}
              onPress={view === 'artists' ? openArtist : openAlbum}
              empty={null}
            />
          )}
        </View>
      )}

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
