import { RefreshCw } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Pressable, Text, View } from 'react-native';

import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { WarningBanner } from '@/components/ui/WarningBanner';
import { ScanBanner } from '@/features/library/components/ScanBanner';
import { useAudioPermission } from '@/features/library/hooks/useAudioPermission';
import { useScan } from '@/features/library/hooks/useScan';
import { SPACING } from '@/theme/tokens';
import { useThemeColors } from '@/theme/useTheme';

/**
 * Sweep every audio file the device has indexed.
 *
 * It used to sit in the library header beside the folder picker, which made
 * the blunter of the two look like the ordinary way to add music — testers
 * reached for it first and waited through a full sweep to get one album. It is
 * still user-initiated, per `docs/adr/010`; it is just filed as the maintenance
 * action it is.
 *
 * Progress and cancelling live here with it. `useScan` keeps its state per
 * instance, so the sweep has to be shown where it is started.
 */
export function ScanDeviceRow() {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const { progress, isScanning, scanLibrary, cancel } = useScan();
  const permission = useAudioPermission();
  const [confirming, setConfirming] = useState(false);

  const askAgain = useCallback(() => {
    // Asking again after a permanent denial does nothing — the system drops the
    // request without showing a dialog — so that case goes to the switch.
    if (permission.blocked) void Linking.openSettings();
    else void permission.request();
  }, [permission]);

  const onConfirm = useCallback(() => {
    setConfirming(false);
    void scanLibrary();
  }, [scanLibrary]);

  const failed = !isScanning && progress.phase === 'failed';

  return (
    <View style={{ gap: SPACING[3] }}>
      <Pressable
        onPress={() => setConfirming(true)}
        disabled={isScanning}
        android_ripple={{ color: colors.etch }}
        accessibilityRole="button"
        accessibilityLabel={t('library.scan')}
        accessibilityState={{ disabled: isScanning }}
        className="min-h-11 flex-row items-center gap-2 self-start rounded-sm border border-subtle px-4"
      >
        <RefreshCw color={isScanning ? colors.etch : colors.signal} size={16} strokeWidth={2} />
        <Text
          className={
            isScanning
              ? 'font-body-medium text-sm text-muted'
              : 'font-body-medium text-sm text-accent'
          }
        >
          {t('library.scan')}
        </Text>
      </Pressable>

      <Text className="font-body text-sm text-muted">{t('settings.folders.scanHint')}</Text>

      {isScanning ? <ScanBanner progress={progress} onCancel={cancel} /> : null}

      {/*
        A refusal used to print one muted line here with nothing to press, on
        the screen whose whole job is to *be* where you fix things. The banner
        carries the way out, and shows for as long as the permission is missing
        rather than only after a scan has been attempted.
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

      {failed ? (
        <Text className="font-body text-sm text-muted">{t('library.scanError.generic')}</Text>
      ) : null}

      {/*
        Says what it is about to do before it does it. There is no progress
        estimate to promise — MediaStore reports no count until it has been
        asked — so the copy talks about the size of the library instead.
      */}
      <ConfirmDialog
        visible={confirming}
        title={t('library.scanConfirm.title')}
        body={t('library.scanConfirm.body')}
        confirmLabel={t('library.scan')}
        onConfirm={onConfirm}
        onCancel={() => setConfirming(false)}
      />
    </View>
  );
}
