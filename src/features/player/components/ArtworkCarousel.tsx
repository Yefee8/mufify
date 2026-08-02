import { Image } from 'expo-image';
import { Music } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useWindowDimensions, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import type { PlayableTrack } from '@/services/audio/types';
import { useReducedMotion } from '@/theme/useReducedMotion';
import { useThemeColors } from '@/theme/useTheme';

import { artworkSize } from '../artworkSize';
import type { QueueNeighbours } from '../hooks/useQueueNeighbours';
import { setPlayerExpansion } from '../playerExpansion';

/** Fraction of a page the finger must cover to commit without a flick. */
const DISTANCE_THRESHOLD = 0.28;
/** px/s past which a flick commits regardless of how far it travelled. */
const VELOCITY_THRESHOLD = 500;
/**
 * How far down dismisses, and how fast.
 *
 * Deliberately much easier than a track change. Throwing the screen away is a
 * coarse gesture and a wrong guess costs one tap to reopen; picking a different
 * track is a precise one and a wrong guess interrupts the music.
 *
 * The numbers are measured rather than chosen. A firm downward drag reported
 * translationY 285 and velocityY 762 — against the track-change thresholds of
 * 302px and 800px/s it missed both, by a hair, and the screen just sprang back.
 * Anything that reads as "definitely downwards" has to commit.
 */
const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 450;

/** Resistance at the ends of the queue, where there is nothing to reveal. */
const RUBBER_BAND = 0.25;
/**
 * Movement needed before the gesture commits to an axis.
 *
 * Not cosmetic. Deciding on the first `onUpdate` compares two translations that
 * are both still zero, and `Math.abs(0) >= Math.abs(0)` is true — so every
 * gesture locked to horizontal and vertical ones were silently discarded. A
 * downward drag simply sprang back. Waiting for real movement is the fix.
 */
const AXIS_LOCK_SLOP = 6;
/** One spring for every snap, so a flick and a drag settle identically. */
const SPRING = { damping: 22, stiffness: 190, mass: 0.6 } as const;

export interface ArtworkCarouselProps {
  neighbours: QueueNeighbours;
  onNext: () => void;
  onPrevious: () => void;
  /**
   * Releases the shared overlay at either end of a vertical drag. `velocity` is
   * in expansion units per second, so a thrown screen keeps its speed.
   */
  onExpandedChange: (expanded: boolean, velocity?: number) => void;
}

/**
 * The Now Playing artwork, as a carousel of three.
 *
 * Previous, current and next are all mounted side by side and the whole strip
 * translates under the finger, so the neighbour is a real decoded image sliding
 * in rather than a blank square that fills in after the transition. That is the
 * difference between this and the version it replaces, which moved one image
 * and swapped its source on release.
 *
 * Release is decided by distance **or** velocity: a lazy drag past 28% of the
 * screen commits, and so does a flick over 500px/s however short. Committing on
 * distance alone is what makes a carousel feel unresponsive to people who flick;
 * committing on velocity alone strands people who drag slowly.
 *
 * At the ends of the queue the strip still moves, but at a quarter rate and it
 * always springs back. Refusing to move at all reads as a dropped gesture; a
 * rubber band says "there is nothing here" in the language the gesture is
 * already speaking.
 *
 * The commit is optimistic in exactly one respect: `translateX` snaps to the
 * neighbour's slot and is reset to centre by the engine's queue update that
 * follows. Both are driven from the same spring, so the seam is not visible.
 */
export function ArtworkCarousel({
  neighbours,
  onNext,
  onPrevious,
  onExpandedChange,
}: ArtworkCarouselProps) {
  const { width, height } = useWindowDimensions();
  const reducedMotion = useReducedMotion();

  /*
   * The cover is bounded by the height flex left over, not by the screen width
   * alone. See `artworkSize.ts`: the width-only square overflowed the column,
   * which is what clipped the header and pushed the transport row under the
   * navigation bar. Measured rather than computed from a constant because the
   * chrome below it changes height when the title wraps.
   */
  const [boxHeight, setBoxHeight] = useState(0);
  const onLayout = useCallback((event: LayoutChangeEvent) => {
    setBoxHeight(event.nativeEvent.layout.height);
  }, []);
  const size = artworkSize(width, boxHeight);

  const offsetX = useSharedValue(0);
  /** 0 undecided, 1 horizontal, 2 vertical. Fixed once per gesture. */
  const axis = useSharedValue(0);

  const { previous, current, next } = neighbours;
  const hasPrevious = previous !== null;
  const hasNext = next !== null;

  /*
   * Built inline rather than memoized, matching `Scrubber`.
   *
   * Memoizing it is what `SwipeableRow` does, and there it is worth it — that
   * one has forty live instances in a list. This has exactly one, so rebuilding
   * the gesture on the rare render costs nothing measurable, and doing it inline
   * keeps the shared values out of a hook's closure. The React Compiler's
   * immutability rule rejects mutating a value captured by a hook, which is
   * correct for ordinary values and unavoidable friction for Reanimated.
   */
  const pan = Gesture.Pan()
    .onBegin(() => {
      axis.value = 0;
    })
    .onUpdate((event) => {
      if (axis.value === 0) {
        const dx = Math.abs(event.translationX);
        const dy = Math.abs(event.translationY);
        // Undecided until the finger has actually gone somewhere.
        if (Math.max(dx, dy) < AXIS_LOCK_SLOP) return;
        axis.value = dx >= dy ? 1 : 2;
      }

      if (axis.value === 2) {
        setPlayerExpansion(Math.min(1, Math.max(0, 1 - Math.max(0, event.translationY) / height)));
        return;
      }

      const wanted = event.translationX;
      // Resist where there is nothing to reveal: dragging right at the start of
      // the queue, or left at the end.
      const blocked = (wanted > 0 && !hasPrevious) || (wanted < 0 && !hasNext);
      offsetX.value = blocked ? wanted * RUBBER_BAND : wanted;
    })
    .onEnd((event) => {
      if (axis.value === 2) {
        const dismiss = event.translationY > DISMISS_DISTANCE || event.velocityY > DISMISS_VELOCITY;
        // Downwards is positive in gesture space and negative in expansion
        // space, so the throw carries into the spring rather than stopping dead.
        runOnJS(onExpandedChange)(!dismiss, -event.velocityY / height);
        return;
      }

      const far = Math.abs(event.translationX) > width * DISTANCE_THRESHOLD;
      const fast = Math.abs(event.velocityX) > VELOCITY_THRESHOLD;

      if (far || fast) {
        // Left reveals the next track; right reveals the previous one.
        if (event.translationX < 0 && hasNext) {
          offsetX.value = withSpring(-width, SPRING, (finished) => {
            if (!finished) return;
            /*
             * Snap back to centre in the same frame the engine is told to
             * advance. The queue update re-fills the slots a moment later, so
             * leaving the strip parked one slot over would show the right track
             * in the wrong position.
             */
            offsetX.value = 0;
            runOnJS(onNext)();
          });
          return;
        }
        if (event.translationX > 0 && hasPrevious) {
          offsetX.value = withSpring(width, SPRING, (finished) => {
            if (!finished) return;
            offsetX.value = 0;
            runOnJS(onPrevious)();
          });
          return;
        }
      }

      // Did not commit, or committed against the end of the queue: spring home.
      offsetX.value = withSpring(0, SPRING);
    })
    .onFinalize(() => {
      axis.value = 0;
    });

  const stripStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: offsetX.value }],
  }));

  return (
    <GestureDetector gesture={pan}>
      {/* Takes the height flex leaves it, and clips the neighbours. */}
      <View onLayout={onLayout} className="min-h-0 w-full flex-1 overflow-hidden">
        <Animated.View
          style={reducedMotion ? undefined : stripStyle}
          className="flex-1 flex-row items-center"
        >
          <Slot track={previous} width={width} size={size} offset={-width} />
          <Slot track={current} width={width} size={size} offset={0} />
          <Slot track={next} width={width} size={size} offset={width} />
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

interface SlotProps {
  track: PlayableTrack | null;
  width: number;
  /** The side of the cover square, already bounded by both axes. */
  size: number;
  /** Where this slot sits relative to the centre one. */
  offset: number;
}

/**
 * One square in the strip.
 *
 * Absolutely positioned rather than laid out in the row, so the strip is exactly
 * one screen wide and the neighbours hang off either edge — a three-wide flex row
 * would make the container three screens wide and push the layout around.
 *
 * The square takes its side from `size` rather than from `aspect-square w-full`.
 * A width-derived square is only square while the width is the tighter of the
 * two bounds, and on this screen it was not.
 */
function Slot({ track, width, size, offset }: SlotProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();

  const artworkUri = track?.artworkPath ? `file://${track.artworkPath}` : null;
  const isCentre = offset === 0;

  const slotStyle = useMemo(
    () => ({ width, left: offset, position: 'absolute' as const, top: 0, bottom: 0 }),
    [width, offset],
  );
  const squareStyle = useMemo(() => ({ width: size, height: size }), [size]);

  const content = (
    <View
      style={squareStyle}
      className="items-center justify-center overflow-hidden rounded-md bg-surface-elevated"
    >
      {artworkUri ? (
        <Image
          source={{ uri: artworkUri }}
          recyclingKey={String(track?.id ?? offset)}
          cachePolicy="memory-disk"
          contentFit="cover"
          // No fade. A neighbour sliding into view has already been decoded, and
          // a transition here would make it appear to arrive late.
          transition={0}
          className="h-full w-full rounded-md"
        />
      ) : (
        <Music color={colors.legend} size={64} strokeWidth={1} />
      )}
    </View>
  );

  if (isCentre) {
    return (
      <View
        style={{ width }}
        accessibilityLabel={track?.title ?? t('player.empty')}
        /* `h-full`, not `flex-1`: this is a row, so `flex-1` would put a
           flex-basis of 0 against the explicit width and leave which one wins
           to the shrink factor. */
        className="h-full items-center justify-center"
      >
        {content}
      </View>
    );
  }

  return (
    <View style={slotStyle} pointerEvents="none" className="items-center justify-center">
      {content}
    </View>
  );
}
