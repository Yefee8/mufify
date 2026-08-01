import { CheckSquare, FolderPlus, RefreshCw } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import { useThemeColors } from '@/theme/useTheme';

export interface LibraryHeaderProps {
  /** `tracks.length` — never a separate count query. */
  count: number;
  /** Hides the count while scanning, when it is still climbing. */
  isScanning: boolean;
  /** Sweep MediaStore. Confirmed first — it reads every audio file on the device. */
  onScan: () => void;
  /** Open the system folder picker. */
  onAddFolder: () => void;
  onStartSelecting: () => void;
}

/**
 * The count, and the three things you can do to the whole library.
 *
 * The count is always `tracks.length` of the array the list renders. Two live
 * queries over the same table drift, and the header once read "14 tracks" above
 * nothing — see the performance rules.
 *
 * Scanning has its own button here rather than happening on launch. It is the
 * only control in the app that reads every audio file on the device, so it is
 * the one control that has to be pressed rather than assumed — see
 * `docs/adr/010-scanning-is-user-initiated.md`. Having it always present, rather
 * than only in the empty state, is the other half of that: a user who adds music
 * later needs to reach it without emptying their library first.
 */
export function LibraryHeader({
  count,
  isScanning,
  onScan,
  onAddFolder,
  onStartSelecting,
}: LibraryHeaderProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();

  return (
    <View className="flex-row items-center gap-1 px-6 pb-4">
      <Text className="flex-1 font-mono text-sm text-muted">
        {isScanning ? '' : t('library.trackCount', { count })}
      </Text>

      {/* Selection is reachable from here as well as from a long press: the
          gesture is faster once you know it, and invisible until you do. */}
      <Pressable
        onPress={onStartSelecting}
        disabled={count === 0}
        accessibilityRole="button"
        accessibilityLabel={t('track.select')}
        accessibilityState={{ disabled: count === 0 }}
        className="min-h-11 min-w-11 items-center justify-center"
      >
        <CheckSquare color={count === 0 ? colors.etch : colors.legend} size={20} strokeWidth={2} />
      </Pressable>

      <Pressable
        onPress={onAddFolder}
        disabled={isScanning}
        accessibilityRole="button"
        accessibilityLabel={t('library.addFolder')}
        accessibilityState={{ disabled: isScanning }}
        className="min-h-11 min-w-11 items-center justify-center"
      >
        <FolderPlus color={isScanning ? colors.etch : colors.legend} size={20} strokeWidth={2} />
      </Pressable>

      <Pressable
        onPress={onScan}
        disabled={isScanning}
        accessibilityRole="button"
        accessibilityLabel={t('library.scan')}
        accessibilityState={{ disabled: isScanning }}
        className="min-h-11 flex-row items-center gap-2 rounded-sm border border-subtle px-4"
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
    </View>
  );
}
