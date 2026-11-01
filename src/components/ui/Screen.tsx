import type { ReactNode } from 'react';
import { Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/** Matches `ShortWindowSplit`: one idea of what counts as a short window. */
const SHORT_HEIGHT = 520;

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
 *
 * The title shrinks in a short window for the same reason `ShortWindowSplit`
 * exists: a landscape phone is about 400 points tall, and a display face at
 * three times the body size with room to breathe is a tenth of that spent on a
 * word the user just tapped to get here.
 */
export function Screen({ title, children }: ScreenProps) {
  const { height } = useWindowDimensions();
  const short = height < SHORT_HEIGHT;

  return (
    <SafeAreaView edges={['top', 'left', 'right']} className="flex-1 bg-surface">
      <View className={short ? 'px-6 pb-2 pt-3' : 'px-6 pb-4 pt-6'}>
        <Text
          className={`font-display text-primary ${short ? 'text-2xl' : 'text-3xl'}`}
          accessibilityRole="header"
        >
          {title}
        </Text>
      </View>
      {children}
    </SafeAreaView>
  );
}
