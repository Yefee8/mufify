import { useCallback, useState } from 'react';
import { Text, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import { formatFrequency, formatGain, mbToDb } from '@/services/equalizer/curve';

export interface BandSliderProps {
  centerHz: number;
  /** Current gain in millibels. */
  levelMb: number;
  minLevelMb: number;
  maxLevelMb: number;
  /** Fires continuously while dragging — the effect is meant to be heard. */
  onChange: (levelMb: number) => void;
  disabled: boolean;
  /** Already translated, names the band. */
  accessibilityLabel: string;
}

/**
 * One band, as a bar with zero in the middle.
 *
 * Centred rather than filled from the left, because a band's resting state is
 * *no change* and a bar that fills from one end makes flat look like a setting
 * near the bottom rather than the middle.
 *
 * The drag runs in a worklet, like `Scrubber`, but unlike a seek it reports on
 * every update: an equaliser that only applies on release cannot be adjusted
 * by ear, which is the only way anyone adjusts one.
 */
export function BandSlider({
  centerHz,
  levelMb,
  minLevelMb,
  maxLevelMb,
  onChange,
  disabled,
  accessibilityLabel,
}: BandSliderProps) {
  const [width, setWidth] = useState(0);
  const dragRatio = useSharedValue(-1);

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    setWidth(event.nativeEvent.layout.width);
  }, []);

  const commit = useCallback(
    (ratio: number) => {
      onChange(Math.round(minLevelMb + ratio * (maxLevelMb - minLevelMb)));
    },
    [maxLevelMb, minLevelMb, onChange],
  );

  const pan = Gesture.Pan()
    .minDistance(0)
    .enabled(!disabled)
    .onBegin((event) => {
      if (width > 0) {
        dragRatio.value = clamp(event.x / width);
        runOnJS(commit)(dragRatio.value);
      }
    })
    .onUpdate((event) => {
      if (width > 0) {
        dragRatio.value = clamp(event.x / width);
        runOnJS(commit)(dragRatio.value);
      }
    })
    .onFinalize(() => {
      dragRatio.value = -1;
    });

  const span = maxLevelMb - minLevelMb;
  const ratio = span === 0 ? 0.5 : clampJs((levelMb - minLevelMb) / span);
  // Where 0dB sits, which is the middle only when the range is symmetrical.
  const zero = span === 0 ? 0.5 : clampJs((0 - minLevelMb) / span);

  const fillStyle = useAnimatedStyle(() => {
    const at = dragRatio.value >= 0 ? dragRatio.value : ratio;
    const left = Math.min(at, zero);
    const right = Math.max(at, zero);
    return { left: `${left * 100}%`, width: `${(right - left) * 100}%` };
  });

  return (
    <View className={disabled ? 'opacity-40' : undefined}>
      <View className="flex-row items-baseline justify-between">
        <Text className="font-mono text-xs text-muted">{formatFrequency(centerHz)}</Text>
        <Text className="font-mono text-xs text-primary">{formatGain(mbToDb(levelMb))}</Text>
      </View>

      <GestureDetector gesture={pan}>
        {/* Padded so the touch target clears 44px while the bar stays thin. */}
        <View
          onLayout={onLayout}
          accessibilityRole="adjustable"
          accessibilityLabel={accessibilityLabel}
          accessibilityValue={{ min: minLevelMb, max: maxLevelMb, now: levelMb }}
          accessibilityState={{ disabled }}
          className="justify-center py-3"
        >
          <View className="h-1 w-full rounded-full bg-surface-elevated">
            {/* The zero mark, so the middle is visible when nothing is set. */}
            <View
              style={{ left: `${zero * 100}%` }}
              className="absolute h-3 w-0.5 -translate-y-1 bg-surface-elevated"
            />
            <Animated.View className="absolute h-1 rounded-full bg-accent" style={fillStyle} />
          </View>
        </View>
      </GestureDetector>
    </View>
  );
}

function clamp(value: number): number {
  'worklet';
  return Math.min(1, Math.max(0, value));
}

function clampJs(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}
