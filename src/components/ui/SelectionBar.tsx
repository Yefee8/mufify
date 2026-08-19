import type { LucideIcon } from 'lucide-react-native';
import { CheckCheck, X } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import { SPACING } from '@/theme/tokens';
import { useThemeColors } from '@/theme/useTheme';

export interface SelectionAction {
  id: string;
  /** Already translated, for the screen reader. The bar shows icons only. */
  label: string;
  icon: LucideIcon;
  /** Draws in the accent. One per bar, at most. */
  emphasis?: boolean;
}

export interface SelectionBarProps {
  count: number;
  actions: readonly SelectionAction[];
  onSelect: (id: string) => void;
  onSelectAll: () => void;
  onClose: () => void;
  /** Height of the mini player, so the bar clears it. */
  bottomInset: number;
}

/**
 * What you can do to the rows you have ticked.
 *
 * A bar rather than a sheet, because the selection it acts on is the thing on
 * screen behind it: a modal would cover the list while the user is still
 * deciding what is in the list. It sits above the mini player rather than over
 * it — playback does not stop because somebody is tidying up.
 *
 * **Actions stay live at zero selected**, and pressing one does nothing but
 * buzz. That is deliberate: disabling them would leave the user pressing a
 * dead icon with no explanation, and the count beside them already says why
 * nothing happened.
 *
 * Icons only, with labels for the screen reader. Four verbs in Turkish do not
 * fit across a phone, and the alternative — dropping one into an overflow menu
 * — hides the destructive one behind the least discoverable control on screen.
 */
export function SelectionBar({
  count,
  actions,
  onSelect,
  onSelectAll,
  onClose,
  bottomInset,
}: SelectionBarProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();

  return (
    <View
      style={{ bottom: bottomInset }}
      className="absolute inset-x-0 flex-row items-center gap-2 border-t border-subtle bg-surface-elevated px-4 py-2"
    >
      <Pressable
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={t('common.close')}
        className="min-h-11 min-w-11 items-center justify-center"
      >
        <X color={colors.label} size={20} strokeWidth={2} />
      </Pressable>

      <Text className="flex-1 font-mono text-sm text-primary">
        {t('library.selection.count', { count })}
      </Text>

      <Pressable
        onPress={onSelectAll}
        accessibilityRole="button"
        accessibilityLabel={t('library.selection.selectAll')}
        className="min-h-11 min-w-11 items-center justify-center"
      >
        <CheckCheck color={colors.legend} size={20} strokeWidth={2} />
      </Pressable>

      {actions.map((action) => (
        <Pressable
          key={action.id}
          onPress={() => onSelect(action.id)}
          accessibilityRole="button"
          accessibilityLabel={action.label}
          style={{ marginLeft: SPACING[1] }}
          className="min-h-11 min-w-11 items-center justify-center"
        >
          <action.icon
            color={action.emphasis ? colors.signal : colors.label}
            size={20}
            strokeWidth={2}
          />
        </Pressable>
      ))}
    </View>
  );
}
