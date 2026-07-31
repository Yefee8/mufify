import type { ReactNode } from 'react';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { tapFeedback } from '@/services/haptics';
import { useReducedMotion } from '@/theme/useReducedMotion';

/** How far a finger must travel before the gesture counts as a swipe. */
const COMMIT_DISTANCE = 60;
/** Below this the pan never activates, so taps and scrolls are unaffected. */
const ACTIVATION_SLOP = 12;
/** How far the content follows the finger. Damped, so it reads as resistance. */
const FOLLOW_RATIO = 0.35;

export interface TransportSwipeProps {
  children: ReactNode;
  /** Swipe right — the direction that goes back, as it does in a book. */
  onSwipeRight?: () => void;
  onSwipeLeft?: () => void;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
}

/**
 * Swipes for the transport, with the content following the finger.
 *
 * Wraps the mini player and the Now Playing artwork. Horizontal changes track,
 * vertical opens or dismisses — the gestures everyone already has in their
 * hands from every other player, which is the entire argument for them.
 *
 * The axis is decided once, at the point the pan activates, and held for the
 * rest of the gesture. Deciding per frame lets a diagonal drag flip between
 * "change track" and "dismiss" mid-swipe, so the user gets whichever one their
 * finger happened to be favouring when they let go.
 *
 * Distance decides, not velocity. A flick and a slow drag of the same length
 * mean the same thing, and velocity thresholds are the reason swipe controls
 * feel unreliable to people who do not flick.
 */
export function TransportSwipe({
  children,
  onSwipeRight,
  onSwipeLeft,
  onSwipeUp,
  onSwipeDown,
}: TransportSwipeProps) {
  const offsetX = useSharedValue(0);
  const offsetY = useSharedValue(0);
  /** 0 undecided, 1 horizontal, 2 vertical. Set once per gesture. */
  const axis = useSharedValue(0);
  const reducedMotion = useReducedMotion();

  const pan = Gesture.Pan()
    .activeOffsetX([-ACTIVATION_SLOP, ACTIVATION_SLOP])
    .activeOffsetY([-ACTIVATION_SLOP, ACTIVATION_SLOP])
    .onBegin(() => {
      axis.value = 0;
    })
    .onUpdate((event) => {
      if (axis.value === 0) {
        axis.value = Math.abs(event.translationX) >= Math.abs(event.translationY) ? 1 : 2;
      }

      if (reducedMotion) return;

      if (axis.value === 1) offsetX.value = event.translationX * FOLLOW_RATIO;
      else offsetY.value = event.translationY * FOLLOW_RATIO;
    })
    .onEnd((event) => {
      const horizontal = axis.value === 1;
      const travelled = horizontal ? event.translationX : event.translationY;

      if (Math.abs(travelled) >= COMMIT_DISTANCE) {
        if (horizontal) runOnJS(fire)(travelled > 0 ? onSwipeRight : onSwipeLeft);
        else runOnJS(fire)(travelled > 0 ? onSwipeDown : onSwipeUp);
      }
    })
    .onFinalize(() => {
      // Always springs home. The committed action replaces the content or the
      // screen; leaving the view displaced would show the next track offset.
      offsetX.value = withSpring(0, { damping: 20, stiffness: 200 });
      offsetY.value = withSpring(0, { damping: 20, stiffness: 200 });
      axis.value = 0;
    });

  const followStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: offsetX.value }, { translateY: offsetY.value }],
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={followStyle}>{children}</Animated.View>
    </GestureDetector>
  );
}

/**
 * Run a handler if there is one, with feedback.
 *
 * A swipe in a direction nothing is bound to stays silent rather than buzzing:
 * confirming an action that did not happen is worse than no confirmation.
 */
function fire(handler: (() => void) | undefined): void {
  if (!handler) return;
  tapFeedback();
  handler();
}
