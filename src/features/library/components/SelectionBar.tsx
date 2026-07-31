import { CheckCheck, ListEnd, ListMusic, X } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import { useThemeColors } from '@/theme/useTheme';

export interface SelectionBarProps {
  count: number;
  /** Total rows on screen, for the select-all label. */
  total: number;
  onSelectAll: () => void;
  onAddToQueue: () => void;
  onAddToPlaylist: () => void;
  onCancel: () => void;
}

/**
 * What you can do with a selection.
 *
 * Sits at the bottom, where the thumb already is, rather than in the header —
 * the selection is made by tapping rows, so the actions belong next to the
 * hand doing the tapping.
 *
 * The two actions are disabled at zero rather than hidden. A bar whose buttons
 * appear and disappear as the count crosses one is harder to aim at than a bar
 * whose buttons are always in the same place.
 */
export function SelectionBar({
  count,
  total,
  onSelectAll,
  onAddToQueue,
  onAddToPlaylist,
  onCancel,
}: SelectionBarProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const empty = count === 0;

  return (
    <View className="flex-row items-center gap-1 border-t border-subtle bg-surface-elevated px-4 py-2">
      <Pressable
        onPress={onCancel}
        accessibilityRole="button"
        accessibilityLabel={t('selection.cancel')}
        className="min-h-11 min-w-11 items-center justify-center"
      >
        <X color={colors.label} size={22} strokeWidth={2} />
      </Pressable>

      <Text className="flex-1 px-2 font-mono text-sm text-primary">
        {t('selection.count', { count })}
      </Text>

      <Pressable
        onPress={onSelectAll}
        accessibilityRole="button"
        accessibilityLabel={count === total ? t('selection.none') : t('selection.all')}
        className="min-h-11 min-w-11 items-center justify-center"
      >
        <CheckCheck
          color={count === total && total > 0 ? colors.signal : colors.label}
          size={22}
          strokeWidth={2}
        />
      </Pressable>

      <Pressable
        onPress={onAddToQueue}
        disabled={empty}
        accessibilityRole="button"
        accessibilityLabel={t('selection.addToQueue')}
        accessibilityState={{ disabled: empty }}
        className="min-h-11 min-w-11 items-center justify-center"
      >
        <ListEnd color={empty ? colors.etch : colors.label} size={22} strokeWidth={2} />
      </Pressable>

      <Pressable
        onPress={onAddToPlaylist}
        disabled={empty}
        accessibilityRole="button"
        accessibilityLabel={t('selection.addToPlaylist')}
        accessibilityState={{ disabled: empty }}
        className="min-h-11 min-w-11 items-center justify-center"
      >
        <ListMusic color={empty ? colors.etch : colors.label} size={22} strokeWidth={2} />
      </Pressable>
    </View>
  );
}
