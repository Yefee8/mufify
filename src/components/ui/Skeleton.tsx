import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { useReducedMotion } from '@/theme/useReducedMotion';

/** The pulse's quietest and loudest points. Deliberately a narrow range. */
const DIM = 0.45;
const BRIGHT = 1;
/** One breath. Slow enough to read as waiting, not as a spinner. */
const PULSE_MS = 900;

export interface SkeletonProps {
  /**
   * Tailwind classes for the block's size and shape.
   *
   * Passed rather than derived, because a skeleton's whole job is to be the
   * exact shape of the thing that will replace it — only the caller knows that.
   */
  className: string;
}

/**
 * One placeholder block.
 *
 * `bg-surface-elevated` and nothing else. The tokens have no dedicated skeleton
 * colour and do not need one: a skeleton is an empty panel, and the panel value
 * is already the one step up from the surface that says "something goes here".
 *
 * The pulse is opacity in a Reanimated worklet, so it never touches the JS
 * thread — a loading indicator that competes with the work it is indicating is
 * worse than no indicator. It also stops entirely under reduce-motion, where a
 * looping animation is exactly what the setting is there to prevent.
 */
export function Skeleton({ className }: SkeletonProps) {
  const opacity = useSharedValue(BRIGHT);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion) {
      opacity.value = DIM;
      return;
    }
    opacity.value = withRepeat(withTiming(DIM, { duration: PULSE_MS }), -1, true);
  }, [reducedMotion, opacity]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return <Animated.View style={style} className={`bg-surface-elevated ${className}`} />;
}

export interface SkeletonRowsProps {
  /** Enough to fill a screen. More would only animate off-frame. */
  rows?: number;
  /** Matches the real row's height class, so nothing jumps when data lands. */
  rowClassName?: string;
  /** Drawn on the left: artwork, a checkbox, a rank. */
  leading?: 'square' | 'none';
}

/**
 * A list's worth of placeholder rows.
 *
 * The States rule asks for skeletons shaped like the content rather than a
 * centred spinner, specifically so the layout does not jump when data lands.
 * Hidden from accessibility entirely — a screen reader announcing eight
 * identical empty rows is worse than silence, and the screen it is standing in
 * for will announce itself when it arrives.
 */
export function SkeletonRows({
  rows = 8,
  rowClassName = 'h-16',
  leading = 'square',
}: SkeletonRowsProps) {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {Array.from({ length: rows }, (_, index) => (
        <View key={index} className={`${rowClassName} flex-row items-center gap-3 px-6`}>
          {leading === 'square' ? <Skeleton className="h-10 w-10 rounded-xs" /> : null}

          <View className="flex-1 gap-2">
            {/* Two widths, alternating, so it reads as a list rather than a grid. */}
            <Skeleton
              className={index % 2 === 0 ? 'h-4 w-3/5 rounded-xs' : 'h-4 w-4/5 rounded-xs'}
            />
            <Skeleton className="h-3 w-2/5 rounded-xs" />
          </View>

          <Skeleton className="h-3 w-8 rounded-xs" />
        </View>
      ))}
    </View>
  );
}

/**
 * A card grid's worth of placeholders, for the album and artist shelves.
 *
 * Two per row, matching `AlbumCard`'s layout, so the shelf does not reflow when
 * the real cards arrive.
 */
export function SkeletonCards({ count = 4 }: { count?: number }) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className="flex-row flex-wrap px-4"
    >
      {Array.from({ length: count }, (_, index) => (
        // Half-width cells with padding, matching `CollectionGrid` exactly, so
        // the real cards land where the placeholders were.
        <View key={index} className="w-1/2 gap-2 p-2">
          <Skeleton className="aspect-square w-full rounded-xs" />
          <Skeleton className="h-4 w-4/5 rounded-xs" />
          <Skeleton className="h-3 w-2/5 rounded-xs" />
        </View>
      ))}
    </View>
  );
}
