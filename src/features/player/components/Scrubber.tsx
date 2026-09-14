import { useCallback, useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

export interface ScrubberProps {
  positionMs: number;
  durationMs: number;
  onSeek: (positionMs: number) => void;
  /** Already translated. */
  accessibilityLabel: string;
}

/** The thumb at rest and under a finger. Grows so the hand knows it has it. */
const THUMB = 12;
const THUMB_HELD = 20;

/**
 * The seek bar.
 *
 * The drag runs entirely in a Reanimated worklet — the performance rule says
 * playback progress must not set React state sixty times a second, and a
 * scrub is the same problem with a finger attached. React only hears about it
 * once, on release, when the seek actually happens.
 *
 * **Activated by hand on touch-down, and this is the fix for the bug.** A
 * `Pan` decides it is a pan when the finger *moves*; `minDistance(0)` lowers
 * the bar but does not remove it, and a finger that lands, holds, and lifts
 * without travelling never activates the gesture at all. `onBegin` had moved
 * the fill to the finger, `onFinalize` moved it back, and `onEnd` — where the
 * seek lived — was never reached. Pressing the bar looked like it worked and
 * then undid itself. Manual activation makes touch-down the moment the gesture
 * is live, so a hold is a scrub and a lift is a seek, whether or not the finger
 * went anywhere in between.
 *
 * The thumb is the other half of the same complaint. A hairline with no handle
 * gives nothing to hold, and a scrub you cannot see yourself doing is one you
 * do not trust. It sits on the played edge, grows while held, and the touch
 * target is the full 44dp band under it rather than the dot itself — nobody
 * can land a fingertip on twelve points.
 */
export function Scrubber({ positionMs, durationMs, onSeek, accessibilityLabel }: ScrubberProps) {
  const [width, setWidth] = useState(0);
  const dragRatio = useSharedValue(-1);
  const held = useSharedValue(0);

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
    .manualActivation(true)
    .onTouchesDown((event, state) => {
      // Live from the first contact, movement or not — see the note above.
      const touch = event.allTouches[0];
      if (touch && width > 0) dragRatio.value = clamp(touch.x / width);
      held.value = withTiming(1, { duration: 120 });
      state.activate();
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
      held.value = withTiming(0, { duration: 160 });
    });

  const played = durationMs > 0 ? clampJs(positionMs / durationMs) : 0;

  const fillStyle = useAnimatedStyle(() => ({
    width: `${(dragRatio.value >= 0 ? dragRatio.value : played) * 100}%`,
  }));

  const thumbStyle = useAnimatedStyle(() => {
    const at = dragRatio.value >= 0 ? dragRatio.value : played;
    const size = THUMB + (THUMB_HELD - THUMB) * held.value;
    return {
      width: size,
      height: size,
      borderRadius: size / 2,
      // Centred on the played edge, clamped so it never leaves the bar.
      left: `${at * 100}%`,
      marginLeft: -size / 2,
    };
  });

  return (
    <GestureDetector gesture={pan}>
      {/* The band is the target, not the dot. 44dp tall, the bar a hairline
          through the middle of it. */}
      <View
        onLayout={onLayout}
        accessibilityRole="adjustable"
        accessibilityLabel={accessibilityLabel}
        accessibilityValue={{ min: 0, max: durationMs, now: positionMs }}
        className="min-h-11 justify-center"
      >
        <View className="h-1 w-full rounded-full bg-surface-elevated">
          <Animated.View className="h-1 rounded-full bg-accent" style={fillStyle} />
        </View>
        <Animated.View className="absolute bg-accent" style={thumbStyle} />
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
