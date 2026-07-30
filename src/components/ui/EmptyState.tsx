import type { LucideIcon } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useThemeColors } from '@/theme/useTheme';

export interface EmptyStateProps {
  icon: LucideIcon;
  /**
   * Several ways of saying the same thing. One is picked per mount, so the
   * app does not read like a recording. Resolve these with `useMessages`.
   */
  messages: readonly string[];
  actionLabel?: string;
  onAction?: () => void;
}

/**
 * An empty screen is an invitation, not a failure. Icon, one line, and the
 * way out — no mascot, no apology, no emoji.
 */
export function EmptyState({ icon: Icon, messages, actionLabel, onAction }: EmptyStateProps) {
  const colors = useThemeColors();

  // Picked once per mount. The index rather than the string, so switching
  // language keeps the same line instead of jumping to a different one.
  const [index] = useState(() => Math.floor(Math.random() * Math.max(messages.length, 1)));
  const message = messages[index % Math.max(messages.length, 1)] ?? '';

  return (
    <View className="flex-1 items-center justify-center gap-6 px-6">
      <Icon color={colors.legend} size={48} strokeWidth={1.5} />

      <Text className="text-center font-body text-base text-muted">{message}</Text>

      {actionLabel && onAction ? (
        <Pressable
          onPress={onAction}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          className="min-h-11 justify-center rounded-sm bg-accent px-6"
        >
          <Text className="font-body-medium text-base text-on-accent">{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
