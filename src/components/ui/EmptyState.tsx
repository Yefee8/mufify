import { Pressable, Text, View } from 'react-native';

export interface EmptyStateProps {
  /** Already translated. Plain statement plus the way out — no apology. */
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

/** Empty state: says what is missing and offers the action, nothing else. */
export function EmptyState({ message, actionLabel, onAction }: EmptyStateProps) {
  return (
    <View className="flex-1 items-center justify-center gap-6 px-6">
      <Text className="text-center text-base text-muted">{message}</Text>
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
