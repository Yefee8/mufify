import { useCallback, useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

export interface ScrubberProps {
  positionMs: number;
  durationMs: number;
  onSeek: (positionMs: number) => void;
  /** Already translated. */
  accessibilityLabel: string;
}

/**
 * The seek bar.
 *
 * The drag runs entirely in a Reanimated worklet — the performance rule says
 * playback progress must not set React state sixty times a second, and a
 * scrub is the same problem with a finger attached. React only hears about it
 * once, on release, when the seek actually happens.
 */
export function Scrubber({ positionMs, durationMs, onSeek, accessibilityLabel }: ScrubberProps) {
  const [width, setWidth] = useState(0);
  const dragRatio = useSharedValue(-1);

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    setWidth(event.nativeEvent.layout.width);
  }, []);

  const commit = useCallback(
    (ratio: number) => {
      if (durationMs > 0) onSeek(Math.round(ratio * durationMs));
    },
    [durationMs, onSeek],
  );

  const pan = Gesture.Pan()
    .minDistance(0)
    .onBegin((event) => {
      if (width > 0) dragRatio.value = clamp(event.x / width);
    })
    .onUpdate((event) => {
      if (width > 0) dragRatio.value = clamp(event.x / width);
    })
    .onEnd(() => {
      if (dragRatio.value >= 0) runOnJS(commit)(dragRatio.value);
    })
    .onFinalize(() => {
      // Hand control back to the incoming position updates. Releasing this
      // before the seek lands would snap the thumb backwards for one frame.
      dragRatio.value = -1;
    });

  const played = durationMs > 0 ? clampJs(positionMs / durationMs) : 0;

  const fillStyle = useAnimatedStyle(() => ({
    width: `${(dragRatio.value >= 0 ? dragRatio.value : played) * 100}%`,
  }));

  return (
    <GestureDetector gesture={pan}>
      {/* Padded vertically so the touch target clears 44px while the bar stays a hairline. */}
      <View
        onLayout={onLayout}
        accessibilityRole="adjustable"
        accessibilityLabel={accessibilityLabel}
        accessibilityValue={{ min: 0, max: durationMs, now: positionMs }}
        className="justify-center py-4"
      >
        <View className="h-1 w-full rounded-full bg-surface-elevated">
          <Animated.View className="h-1 rounded-full bg-accent" style={fillStyle} />
        </View>
      </View>
    </GestureDetector>
  );
}

function clamp(value: number): number {
  'worklet';
  return Math.min(1, Math.max(0, value));
}

function clampJs(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}
