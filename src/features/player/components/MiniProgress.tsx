import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { AudioEngine } from '@/services/audio/AudioEngine';

/** How often the engine reports position. Must match the engine's interval. */
const STATUS_INTERVAL_MS = 500;

/**
 * The mini player's progress hairline.
 *
 * Its own component, and the only thing in the tab bar subtree that hears about
 * playback position. The mini player used to read the whole engine state, so
 * every position tick reconciled the whole strip — measured at 20 renders per
 * ten seconds of playback, and 0 once this moved out.
 *
 * Width lives in a Reanimated shared value rather than React state, per the
 * performance rule that playback progress must not set state on a timer. The
 * engine reports every 500ms; `withTiming` over exactly that interval turns
 * those steps into continuous movement, so the bar is smooth without anything
 * re-rendering at all. React renders this component once.
 */
export function MiniProgress() {
  const ratio = useSharedValue(0);

  useEffect(() => {
    return AudioEngine.subscribe((state) => {
      const next = state.durationMs > 0 ? Math.min(1, state.positionMs / state.durationMs) : 0;

      /*
       * A backwards jump is a seek or a new track, not progress. Animating it
       * would slide the bar left over half a second, which reads as rewinding.
       */
      if (next < ratio.value) ratio.value = next;
      else ratio.value = withTiming(next, { duration: STATUS_INTERVAL_MS });
    });
  }, [ratio]);

  const fill = useAnimatedStyle(() => ({ width: `${ratio.value * 100}%` }));

  return (
    <View className="h-1 w-full bg-surface">
      <Animated.View className="h-1 bg-accent" style={fill} />
    </View>
  );
}
