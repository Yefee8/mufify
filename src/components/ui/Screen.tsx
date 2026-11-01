import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export interface ScreenProps {
  /** Already translated. Screens do not call `t()` on behalf of their parent. */
  title: string;
  children?: ReactNode;
}

/**
 * Standard screen frame: safe area, surface, and the display-face title.
 *
 * Left and right as well as top. They are zero in portrait, which is why the
 * app got away without them while it was locked to portrait; turned sideways
 * on a three-button device the navigation bar becomes a column down one edge,
 * and a title or a list that runs under it is unreadable at best and
 * untappable at worst. Not `bottom`: the mini player and the tab bar own that
 * end, and a screen that also reserved it would leave a gap above them.
 */
export function Screen({ title, children }: ScreenProps) {
  return (
    <SafeAreaView edges={['top', 'left', 'right']} className="flex-1 bg-surface">
      <View className="px-6 pb-4 pt-6">
        <Text className="font-display text-3xl text-primary" accessibilityRole="header">
          {title}
        </Text>
      </View>
      {children}
    </SafeAreaView>
  );
}
