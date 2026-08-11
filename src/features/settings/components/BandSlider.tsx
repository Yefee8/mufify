import { useCallback, useState } from 'react';
import { Text, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import { formatFrequency, mbToDb } from '@/services/equalizer/curve';

export interface BandSliderProps {
  centerHz: number;
  /** Current gain in millibels. */
  levelMb: number;
  minLevelMb: number;
  maxLevelMb: number;
  /** Fires continuously while dragging — the effect is meant to be heard. */
  onChange: (levelMb: number) => void;
  /** Already translated, names the band. */
  accessibilityLabel: string;
}

/** The tallest a column can be and still leave the section on one screen. */
const TRACK_HEIGHT = 132;

/**
 * One band, as a vertical fader.
 *
 * Vertical because that is what an equaliser looks like everywhere else, and
 * because five horizontal rows with a frequency on each was most of a screen
 * for a control whose whole point is being read at a glance: the shape of the
 * curve is the information, and a column of bars shows it in one look.
 *
 * Zero is the middle of the track, not the bottom. A band's resting state is
 * *no change*, and a fader that fills from the floor makes flat look like a
 * setting near the bottom rather than the middle.
 *
 * The drag runs in a worklet, like `Scrubber`, but unlike a seek it reports on
 * every update: an equaliser that only applies on release cannot be adjusted by
 * ear, which is the only way anyone adjusts one.
 */
export function BandSlider({
  centerHz,
  levelMb,
  minLevelMb,
  maxLevelMb,
  onChange,
  accessibilityLabel,
}: BandSliderProps) {
  const [height, setHeight] = useState(TRACK_HEIGHT);
  const dragRatio = useSharedValue(-1);

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const measured = event.nativeEvent.layout.height;
    if (measured > 0) setHeight(measured);
  }, []);

  const commit = useCallback(
    (ratio: number) => {
      onChange(Math.round(minLevelMb + ratio * (maxLevelMb - minLevelMb)));
    },
    [maxLevelMb, minLevelMb, onChange],
  );

  const pan = Gesture.Pan()
    .minDistance(0)
    // The section sits in a ScrollView; without this the list claims the drag
    // and the fader only moves when the finger starts perfectly still.
    .activeOffsetY([-4, 4])
    .onBegin((event) => {
      dragRatio.value = fromTop(event.y, height);
      runOnJS(commit)(dragRatio.value);
    })
    .onUpdate((event) => {
      dragRatio.value = fromTop(event.y, height);
      runOnJS(commit)(dragRatio.value);
    })
    .onFinalize(() => {
      dragRatio.value = -1;
    });

  const span = maxLevelMb - minLevelMb;
  const ratio = span === 0 ? 0.5 : clampJs((levelMb - minLevelMb) / span);
  // Where 0dB sits, which is the middle only when the range is symmetrical.
  const zero = span === 0 ? 0.5 : clampJs((0 - minLevelMb) / span);

  /** The bar between the zero mark and the current value, in either direction. */
  const fillStyle = useAnimatedStyle(() => {
    const at = dragRatio.value >= 0 ? dragRatio.value : ratio;
    const low = Math.min(at, zero);
    const high = Math.max(at, zero);
    return { bottom: `${low * 100}%`, height: `${Math.max(high - low, 0.015) * 100}%` };
  });

  const thumbStyle = useAnimatedStyle(() => {
    const at = dragRatio.value >= 0 ? dragRatio.value : ratio;
    return { bottom: `${at * 100}%` };
  });

  return (
    <View className="flex-1 items-center gap-2">
      <Text className="font-mono text-xs text-primary">{formatCompactGain(mbToDb(levelMb))}</Text>

      <GestureDetector gesture={pan}>
        {/* Padded so the touch target is a column, not a two-pixel line. */}
        <View
          onLayout={onLayout}
          accessibilityRole="adjustable"
          accessibilityLabel={accessibilityLabel}
          accessibilityValue={{ min: minLevelMb, max: maxLevelMb, now: levelMb }}
          style={{ height: TRACK_HEIGHT }}
          className="w-full items-center justify-center px-1"
        >
          <View className="h-full w-2 overflow-hidden rounded-full bg-surface-elevated">
            {/* The zero mark, so the middle is visible when nothing is set. A
                hairline rule rather than a spacing step, like every other one. */}
            <View
              style={{ bottom: `${zero * 100}%` }}
              className="absolute w-full border-t border-subtle"
            />
            <Animated.View className="absolute w-full bg-accent" style={fillStyle} />
          </View>
          {/* Outside the clipped track, so it reads as a handle on the bar.
              The offset centres a 12px dot on the value it is pointing at. */}
          <Animated.View
            className="absolute h-3 w-3 rounded-full border border-accent bg-surface"
            style={[thumbStyle, { marginBottom: -6 }]}
          />
        </View>
      </GestureDetector>

      <Text className="font-mono text-xs text-muted">{formatFrequency(centerHz)}</Text>
    </View>
  );
}

/** Pan reports from the top; a fader reads from the bottom. */
function fromTop(y: number, height: number): number {
  'worklet';
  if (height <= 0) return 0.5;
  return Math.min(1, Math.max(0, 1 - y / height));
}

function clampJs(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

/**
 * A gain, short enough to sit over a column two fingers wide.
 *
 * `formatGain` writes "+3 dB", which is right in a row and too wide here — the
 * unit is on every one of them and says nothing the header does not.
 */
function formatCompactGain(db: number): string {
  const rounded = Math.round(db * 10) / 10;
  if (Object.is(rounded, -0) || rounded === 0) return '0';
  const sign = rounded > 0 ? '+' : '−';
  const magnitude = Math.abs(rounded);
  return `${sign}${Number.isInteger(magnitude) ? magnitude : magnitude.toFixed(1)}`;
}
