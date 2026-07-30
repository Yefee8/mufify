import { TriangleAlert } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';

import { useThemeColors } from '@/theme/useTheme';

export interface ErrorStateProps {
  /** Already translated. One plain sentence about what failed. */
  message: string;
  /** Raw detail — shown small, below. Never the only thing on screen. */
  detail?: string | null;
  retryLabel?: string;
  onRetry?: () => void;
}

/**
 * Something failed. Say what, offer the way out, never dead-end on a raw
 * error string.
 */
export function ErrorState({ message, detail, retryLabel, onRetry }: ErrorStateProps) {
  const colors = useThemeColors();

  return (
    <View className="flex-1 items-center justify-center gap-4 px-6">
      <TriangleAlert color={colors.legend} size={40} strokeWidth={1.5} />

      <Text className="text-center font-body text-base text-primary">{message}</Text>

      {detail ? (
        <Text className="text-center font-mono text-sm text-muted" numberOfLines={3}>
          {detail}
        </Text>
      ) : null}

      {retryLabel && onRetry ? (
        <Pressable
          onPress={onRetry}
          accessibilityRole="button"
          accessibilityLabel={retryLabel}
          className="mt-2 min-h-11 justify-center rounded-sm border border-accent px-6"
        >
          <Text className="font-body-medium text-base text-accent">{retryLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
