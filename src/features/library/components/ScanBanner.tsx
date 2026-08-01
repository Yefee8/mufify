import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import { ProgressBar } from '@/components/ui/ProgressBar';
import type { ScanProgress } from '@/services/scanner/scanner';

export interface ScanBannerProps {
  progress: ScanProgress;
  onCancel: () => void;
}

/**
 * Scan progress, shown above the list rather than instead of it.
 *
 * The performance rule promises the user can scroll throughout a scan, which
 * is only true if there is something to scroll: replacing the library with a
 * progress screen would make the scan feel blocking even though it is not.
 * Rows appear underneath this as they are found.
 */
export function ScanBanner({ progress, onCancel }: ScanBannerProps) {
  const { t } = useTranslation();
  const ratio = progress.total > 0 ? progress.processed / progress.total : 0;

  /*
   * Both stages report a total only once they have counted, and counting is
   * itself a query that takes a moment on a large library. Until then the
   * honest thing is to say nothing rather than "0 / 0", which reads as a scan
   * that found nothing rather than one that has not looked yet.
   *
   * The label and the Stop button appear immediately either way, so the banner
   * still confirms the press the instant it happens.
   */
  const hasTotal = progress.total > 0;

  const label =
    progress.phase === 'enumerating'
      ? t('library.scanning.enumerating')
      : t('library.scanning.enriching');

  return (
    <View className="gap-3 border-b border-subtle px-6 pb-4">
      <View className="flex-row items-center justify-between">
        <Text className="font-body text-sm text-muted">{label}</Text>
        <Pressable
          onPress={onCancel}
          accessibilityRole="button"
          accessibilityLabel={t('library.scanning.cancel')}
          className="min-h-11 justify-center"
        >
          <Text className="font-body-medium text-sm text-accent">
            {t('library.scanning.cancel')}
          </Text>
        </Pressable>
      </View>

      <ProgressBar value={ratio} accessibilityLabel={label} />

      {hasTotal ? (
        <Text className="font-mono text-sm text-muted">
          {progress.processed} / {progress.total}
        </Text>
      ) : null}
    </View>
  );
}
