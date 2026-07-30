import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export interface ScreenProps {
  /** Already translated. Screens do not call `t()` on behalf of their parent. */
  title: string;
  children?: ReactNode;
}

/** Standard screen frame: safe area, surface, and the display-face title. */
export function Screen({ title, children }: ScreenProps) {
  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-surface">
      <View className="px-6 pb-4 pt-6">
        <Text className="font-display text-3xl text-primary" accessibilityRole="header">
          {title}
        </Text>
      </View>
      {children}
    </SafeAreaView>
  );
}
