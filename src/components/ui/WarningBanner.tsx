import { TriangleAlert } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';

import { useThemeColors } from '@/theme/useTheme';

export interface WarningBannerProps {
  /** Already translated. One plain sentence about what is wrong. */
  message: string;
  /** Already translated. The way out — never a bare acknowledgement. */
  actionLabel: string;
  onAction: () => void;
}

/**
 * Something is wrong and there is one thing to do about it.
 *
 * Distinct from `ErrorState`, which is `flex-1` and owns the whole region
 * where content would have been: that is right for a screen that has nothing
 * to show and wrong for a library that has music in it and one missing
 * permission. Stacked above the list, this one takes the height of its text
 * and leaves the content underneath usable.
 *
 * The action is required rather than optional. A warning that only announces a
 * problem leaves the user to work out where the switch is, and the case this
 * exists for — a refused permission — has a specific answer that the app knows
 * and they do not.
 */
export function WarningBanner({ message, actionLabel, onAction }: WarningBannerProps) {
  const colors = useThemeColors();

  return (
    <View className="mx-6 mb-4 flex-row items-center gap-3 rounded-sm border border-subtle bg-surface-elevated px-4 py-3">
      <TriangleAlert color={colors.signal} size={20} strokeWidth={2} />

      <Text className="flex-1 font-body text-sm text-primary">{message}</Text>

      <Pressable
        onPress={onAction}
        accessibilityRole="button"
        accessibilityLabel={actionLabel}
        className="min-h-11 justify-center rounded-sm border border-accent px-4"
      >
        <Text className="font-body-medium text-sm text-accent">{actionLabel}</Text>
      </Pressable>
    </View>
  );
}
