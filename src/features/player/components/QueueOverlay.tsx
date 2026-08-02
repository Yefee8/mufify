import Animated, { SlideInDown, SlideOutDown } from 'react-native-reanimated';

import { useReducedMotion } from '@/theme/useReducedMotion';

import { QueueScreen } from '../QueueScreen';

export interface QueueOverlayProps {
  visible: boolean;
  onClose: () => void;
}

/**
 * The queue, as a root-level sheet rather than a route.
 *
 * It used to be `app/queue.tsx`, pushed with `router.navigate('/queue')`, and
 * it opened without ever becoming visible. Nothing was wrong with the screen:
 * `PlayerLayer` mounts the Now Playing overlay *outside* the router, absolutely
 * positioned over the whole app, and an opaque full-screen surface at that
 * level covers anything the navigator puts underneath it. The queue was
 * rendering correctly, one layer down, behind the player that opened it.
 *
 * That is a property of the overlay rather than of this screen — **any** route
 * pushed while Now Playing is open would have disappeared the same way — so the
 * fix is to give the queue the same treatment as Now Playing itself: a sibling
 * at the root, one layer above it, outside the overlay's transformed and
 * clipped container.
 *
 * Mounted only while open. It carries a FlashList of the whole queue, and the
 * player has no reason to pay for that while nobody is looking at it.
 */
export function QueueOverlay({ visible, onClose }: QueueOverlayProps) {
  const reducedMotion = useReducedMotion();

  if (!visible) return null;

  return (
    <Animated.View
      entering={reducedMotion ? undefined : SlideInDown.springify().damping(22).stiffness(180)}
      exiting={reducedMotion ? undefined : SlideOutDown}
      className="absolute inset-0 z-40 bg-surface"
    >
      <QueueScreen onClose={onClose} />
    </Animated.View>
  );
}
