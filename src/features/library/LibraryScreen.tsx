import { FlashList, type ListRenderItem } from '@shopify/flash-list';
import { Music, Plus, SearchX } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Pressable, RefreshControl, Text, View } from 'react-native';

import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Screen } from '@/components/ui/Screen';
import type { TrackListItem } from '@/db/queries/tracks';
import { useMessages } from '@/i18n';
import { isPermissionError } from '@/services/scanner/permission';
import { useThemeColors } from '@/theme/useTheme';

import { AddToPlaylistSheet } from '../playlists/components/AddToPlaylistSheet';
import { usePlaybackControls } from '../player/hooks/usePlayback';
import { toPlayable } from '../player/toPlayable';
import { ScanBanner } from './components/ScanBanner';
import { SearchField } from './components/SearchField';
import { TrackListSkeleton } from './components/TrackListSkeleton';
import { TrackRow } from './components/TrackRow';
import { useDebounced } from './hooks/useDebounced';
import { useTracks } from './hooks/useLibrary';
import { useScan } from './hooks/useScan';

/** Opens this app's page in system settings, where the permission switch is. */
function openAppSettings(): void {
  void Linking.openSettings();
}

function keyExtractor(track: TrackListItem): string {
  return String(track.id);
}

/**
 * The library: every present track, with the scan that fills it.
 *
 * Tapping a row plays it and makes the visible list the queue; long-pressing
 * offers to add it to a playlist. The four states — loading, scanning, failed,
 * empty — are all here, per the States rule, and the scan banner sits above
 * the list rather than replacing it so the user can keep scrolling.
 */
export function LibraryScreen() {
  const { t, i18n } = useTranslation();
  const messages = useMessages('library.empty');
  const colors = useThemeColors();

  const [search, setSearch] = useState('');
  // The field stays instant; only the query waits.
  const { tracks, isLoading } = useTracks(useDebounced(search));
  const { progress, isScanning, isRefreshing, scanLibrary, addFolder, rescan, cancel } = useScan();
  const { playFrom } = usePlaybackControls();
  const [playlistTarget, setPlaylistTarget] = useState<number | null>(null);

  const hasFailed = !isScanning && progress.phase === 'failed';
  const permissionFailed = isPermissionError(progress.error);
  const permissionBlocked = progress.error === 'permission-blocked';

  /*
   * Playing a track makes the list it came from the queue, which is what a
   * user means by tapping a row — not "play this one thing and stop".
   */
  const handleTrackPress = useCallback(
    (id: number) => {
      const index = tracks.findIndex((track) => track.id === id);
      if (index === -1) return;
      playFrom(tracks.map(toPlayable), index);
    },
    [tracks, playFrom],
  );

  const closePlaylistSheet = useCallback(() => setPlaylistTarget(null), []);

  const renderItem = useCallback<ListRenderItem<TrackListItem>>(
    ({ item }) => (
      <TrackRow
        track={item}
        locale={i18n.language}
        onPress={handleTrackPress}
        onLongPress={setPlaylistTarget}
      />
    ),
    [handleTrackPress, i18n.language],
  );

  return (
    <Screen title={t('library.title')}>
      {/* Adding music is reachable from anywhere, not only when empty. */}
      <View className="flex-row items-center justify-between px-6 pb-4">
        <Text className="font-mono text-sm text-muted">
          {isScanning ? '' : t('library.trackCount', { count: tracks.length })}
        </Text>

        <Pressable
          onPress={addFolder}
          disabled={isScanning}
          accessibilityRole="button"
          accessibilityLabel={t('library.addMusic')}
          accessibilityState={{ disabled: isScanning }}
          className="min-h-11 flex-row items-center gap-2 rounded-sm border border-subtle px-4"
        >
          <Plus color={isScanning ? colors.etch : colors.signal} size={18} strokeWidth={2} />
          <Text
            className={
              isScanning
                ? 'font-body-medium text-sm text-muted'
                : 'font-body-medium text-sm text-accent'
            }
          >
            {t('library.addMusic')}
          </Text>
        </Pressable>
      </View>

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
        The list owns whatever height is left, explicitly. Without a bounded
        flex parent a virtualized list keeps the height it first measured, so
        mounting the scan banner above it shrank the space without shrinking
        the list — which is where the blank band above the first row during
        "Reading tags…" came from.
      */}
      <View className="flex-1">
        {isLoading ? (
          <TrackListSkeleton />
        ) : (
            <FlashList
            data={tracks}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            /*
              Pull to refresh re-indexes and sweeps. Without it a user who has
              just copied files in has no way to make the app look again short of
              restarting it — and Android's own scanner may not have noticed yet
              either.
            */
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={rescan}
                tintColor={colors.signal}
                colors={[colors.signal]}
                progressBackgroundColor={colors.panel}
              />
            }
            ListEmptyComponent={
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

      <AddToPlaylistSheet trackId={playlistTarget} onClose={closePlaylistSheet} />
    </Screen>
  );
}
