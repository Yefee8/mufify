import { Music, Plus } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Screen } from '@/components/ui/Screen';
import { useMessages } from '@/i18n';
import { useThemeColors } from '@/theme/useTheme';

import { useTrackCount } from './hooks/useLibrary';
import { useScan } from './hooks/useScan';

/**
 * Phase 4 replaces the count with the actual list. The four states — scanning,
 * failed, empty, populated — are all here already, per the States rule.
 */
export function LibraryScreen() {
  const { t } = useTranslation();
  const messages = useMessages('library.empty');
  const colors = useThemeColors();

  const trackCount = useTrackCount();
  const { progress, isScanning, scanLibrary, addFolder, cancel } = useScan();

  const ratio = progress.total > 0 ? progress.processed / progress.total : 0;
  const hasFailed = !isScanning && progress.phase === 'failed';
  const isEmpty = !isScanning && !hasFailed && trackCount === 0;

  return (
    <Screen title={t('library.title')}>
      {/* Adding music is reachable from anywhere, not only when empty. */}
      <View className="flex-row items-center justify-between px-6 pb-4">
        <Text className="font-mono text-sm text-muted">
          {isScanning ? '' : t('library.trackCount', { count: trackCount })}
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

      {isScanning ? (
        <View className="gap-3 px-6">
          <View className="flex-row items-center justify-between">
            <Text className="font-body text-sm text-muted">
              {progress.phase === 'enumerating'
                ? t('library.scanning.enumerating')
                : t('library.scanning.enriching')}
            </Text>
            <Pressable
              onPress={cancel}
              accessibilityRole="button"
              accessibilityLabel={t('library.scanning.cancel')}
              className="min-h-11 justify-center"
            >
              <Text className="font-body-medium text-sm text-accent">
                {t('library.scanning.cancel')}
              </Text>
            </Pressable>
          </View>

          <ProgressBar value={ratio} accessibilityLabel={t('library.scanning.enumerating')} />

          <Text className="font-mono text-sm text-muted">
            {progress.processed} / {progress.total}
          </Text>
        </View>
      ) : null}

      {hasFailed ? (
        <ErrorState
          message={
            progress.error === 'permission-denied'
              ? t('library.scanError.permission')
              : t('library.scanError.generic')
          }
          detail={progress.error === 'permission-denied' ? null : progress.error}
          retryLabel={t('library.scanError.retry')}
          onRetry={scanLibrary}
        />
      ) : null}

      {isEmpty ? (
        <EmptyState
          icon={Music}
          messages={messages}
          actionLabel={t('library.emptyAction')}
          onAction={addFolder}
        />
      ) : null}
    </Screen>
  );
}
