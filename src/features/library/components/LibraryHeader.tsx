import { FolderPlus, RefreshCw } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import { useThemeColors } from '@/theme/useTheme';

export interface LibraryHeaderProps {
  /** `tracks.length` — never a separate count query. */
  count: number;
  /** Hides the count while a folder is being imported, when it is still climbing. */
  isScanning: boolean;
  /** Open the system folder picker. */
  onAddFolder: () => void;
  /** Sweep every audio file on the device. Confirmed before it starts. */
  onScan: () => void;
}

/**
 * The count, and the one thing you do to the library from here.
 *
 * The count is always `tracks.length` of the array the list renders. Two live
 * queries over the same table drift, and the header once read "14 tracks" above
 * nothing — see the performance rules.
 *
 * **Choosing a folder says so.** It was an unlabelled folder icon next to a
 * labelled Scan button, which testers did not read as a control at all — they
 * found the sweep instead, which is the slower and blunter of the two.
 *
 * The device-wide sweep is here too, and second. It is still user-initiated,
 * per `docs/adr/010`. Moving it to Settings alone made it hard to find at the
 * moment people look for it — with an empty library, on the library screen —
 * so it is back, labelled, and visibly the quieter of the two: an outline
 * button next to a filled one, in the order you would try them.
 */
export function LibraryHeader({ count, isScanning, onAddFolder, onScan }: LibraryHeaderProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();

  return (
    <View className="flex-row items-center gap-1 px-6 pb-4">
      <Text numberOfLines={1} className="flex-1 font-mono text-sm text-muted">
        {isScanning ? '' : t('library.trackCount', { count })}
      </Text>

      <Pressable
        onPress={onScan}
        disabled={isScanning}
        android_ripple={{ color: colors.etch }}
        accessibilityRole="button"
        accessibilityLabel={t('library.scan')}
        accessibilityState={{ disabled: isScanning }}
        className="min-h-11 flex-row items-center gap-2 rounded-sm border border-subtle px-3"
      >
        <RefreshCw color={isScanning ? colors.etch : colors.legend} size={16} strokeWidth={2} />
        <Text
          className={
            isScanning ? 'font-body-medium text-sm text-muted' : 'font-body-medium text-sm text-primary'
          }
        >
          {t('library.scan')}
        </Text>
      </Pressable>

      <Pressable
        onPress={onAddFolder}
        disabled={isScanning}
        android_ripple={{ color: colors.etch }}
        accessibilityRole="button"
        accessibilityLabel={t('library.addFolder')}
        accessibilityState={{ disabled: isScanning }}
        className="min-h-11 flex-row items-center gap-2 rounded-sm bg-accent px-3"
      >
        <FolderPlus color={isScanning ? colors.etch : colors.onSignal} size={16} strokeWidth={2} />
        <Text
          className={
            isScanning
              ? 'font-body-medium text-sm text-muted'
              : 'font-body-medium text-sm text-on-accent'
          }
        >
          {t('library.addFolder')}
        </Text>
      </Pressable>
    </View>
  );
}
