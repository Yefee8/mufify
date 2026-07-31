import { FlashList, type ListRenderItem } from '@shopify/flash-list';
import { Music, Plus } from 'lucide-react-native';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Pressable, RefreshControl, Text, View } from 'react-native';

import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Screen } from '@/components/ui/Screen';
import type { TrackListItem } from '@/db/queries/tracks';
import { useMessages } from '@/i18n';
import { isPermissionError } from '@/services/scanner/permission';
import { useThemeColors } from '@/theme/useTheme';

import { ScanBanner } from './components/ScanBanner';
import { TrackListSkeleton } from './components/TrackListSkeleton';
import { TrackRow } from './components/TrackRow';
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
 * Playback arrives in Phase 3; until then a row press is inert. The four
 * states — loading, scanning, failed, empty — are all here, per the States
 * rule, and the scan banner sits above the list rather than replacing it so
 * the user can keep scrolling while it runs.
 */
export function LibraryScreen() {
  const { t, i18n } = useTranslation();
  const messages = useMessages('library.empty');
  const colors = useThemeColors();

  const { tracks, isLoading } = useTracks();
  const { progress, isScanning, scanLibrary, addFolder, rescan, cancel } = useScan();

  const hasFailed = !isScanning && progress.phase === 'failed';
  const permissionFailed = isPermissionError(progress.error);
  const permissionBlocked = progress.error === 'permission-blocked';

  const handleTrackPress = useCallback((id: number) => {
    // Phase 3 hands this to the audio engine. Kept as a stable callback now so
    // that wiring it up does not mean touching the memoized row.
    void id;
  }, []);

  const renderItem = useCallback<ListRenderItem<TrackListItem>>(
    ({ item }) => (
      <TrackRow track={item} locale={i18n.language} onPress={handleTrackPress} />
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
              refreshing={isScanning}
              onRefresh={rescan}
              tintColor={colors.signal}
              colors={[colors.signal]}
              progressBackgroundColor={colors.panel}
            />
          }
          ListEmptyComponent={
            hasFailed ? null : (
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
    </Screen>
  );
}
