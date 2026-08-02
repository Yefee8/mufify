import { Image } from 'expo-image';
import { Music, Pause, Play, SkipBack, SkipForward } from 'lucide-react-native';
import { useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { tapFeedback } from '@/services/haptics';
import * as perf from '@/services/perf';
import { useLifecycleTrace } from '@/services/perf/useLifecycleTrace';
import { useThemeColors } from '@/theme/useTheme';

import { useCurrentTrack, usePlaybackControls, usePlaybackPhase } from '../hooks/usePlayback';
import { playerExpansion, setPlayerExpansion } from '../playerExpansion';
import { MiniProgress } from './MiniProgress';

/** px/s upward that opens it regardless of distance. */
const OPEN_VELOCITY = 600;
/** Sideways travel that changes track. Shorter than the player's — less room. */
const SKIP_DISTANCE = 56;
/** Below this the pan never claims the touch, so the buttons still work. */
const ACTIVATION_SLOP = 10;
/**
 * Movement needed before the gesture commits to an axis.
 *
 * Not cosmetic. Deciding on the first `onUpdate` compares two translations that
 * are both still zero, and `Math.abs(0) >= Math.abs(0)` is true — so every
 * gesture locked to horizontal and vertical ones were silently discarded. A
 * downward drag simply sprang back. Waiting for real movement is the fix.
 */
const AXIS_LOCK_SLOP = 6;
/** How far the strip follows the finger. Damped, so it reads as resistance. */
const FOLLOW_RATIO = 0.4;

const SPRING = { damping: 20, stiffness: 220 } as const;

export interface MiniPlayerProps {
  /** Mounts Now Playing as soon as a vertical drag begins, or a finger lands. */
  onPrepareOpen: () => void;
  /**
   * Settles the root overlay after a tap or released drag.
   *
   * `velocity` is in expansion units per second — the gesture's px/s over the
   * screen height — so a flick hands its speed to the spring instead of the
   * spring always starting from rest.
   */
  onExpandedChange: (expanded: boolean, velocity?: number) => void;
}

/**
 * The persistent transport strip above the tab bar.
 *
 * Renders nothing at all when idle rather than sitting there empty — a dead
 * strip on a fresh install is clutter, and the tab bar should meet the list
 * until there is something playing.
 *
 * Three ways to open the player, because the strip is 64px tall and precision is
 * not always available: tap the artwork and title, drag the strip upwards, or
 * flick it. The gesture is deliberately additive — every one of its actions has
 * a button beside it, so nothing here is reachable only by knowing a secret.
 */
export function MiniPlayer({ onPrepareOpen, onExpandedChange }: MiniPlayerProps) {
  useLifecycleTrace('MiniPlayer');
  const { t } = useTranslation();
  const colors = useThemeColors();
  const { height } = useWindowDimensions();

  /*
   * Phase and track, never position.
   *
   * Measured on the Pixel_7 AVD over ten seconds of playback: subscribing to
   * the whole engine state re-rendered this component 20 times — exactly the
   * engine's 2 Hz status interval — and 0 times after the split. Twenty
   * reconciliations of an `expo-image` and four Pressables per ten seconds, for
   * a strip whose text has not changed. Position belongs to `MiniProgress`,
   * which is one animated view and re-renders never.
   */
  const phase = usePlaybackPhase();
  const track = useCurrentTrack();
  const { toggle, next, previous } = usePlaybackControls();

  useEffect(() => {
    if (track !== null) perf.measure('library.play.toMiniPlayer', track.id);
  }, [track]);

  const openPlayer = useCallback(() => {
    tapFeedback();
    onExpandedChange(true);
  }, [onExpandedChange]);

  const offsetX = useSharedValue(0);
  const axis = useSharedValue(0);

  /*
   * The gesture is built here rather than in a shared wrapper, and that is the
   * fix for "swiping the mini player up does not open the player".
   *
   * The previous version put a generic pan on a container whose children are all
   * Pressables, with `activeOffsetX` and `activeOffsetY` both set. Two axes of
   * activation on a surface made entirely of touch targets meant the pan
   * routinely lost the race to a child's press responder, so the swipe worked
   * sometimes and looked broken the rest of the time.
   *
   * A small minimum distance lets the pan claim both axes while leaving taps
   * to the child Pressables. `activeOffsetY` looked safer but meant a purely
   * horizontal drag could never activate, so mini-player track swipes did not
   * exist in practice.
   *
   * Built inline rather than memoized, like `Scrubber` and unlike
   * `SwipeableRow`: there is exactly one mini player, so a rebuild per render
   * costs nothing, and keeping the shared values out of a hook's closure avoids
   * the React Compiler's immutability rule — which is right about ordinary
   * values and simply does not model Reanimated.
   */
  const pan = Gesture.Pan()
    .minDistance(ACTIVATION_SLOP)
    .onBegin(() => {
      axis.value = 0;
    })
    .onUpdate((event) => {
      if (axis.value === 0) {
        const dx = Math.abs(event.translationX);
        const dy = Math.abs(event.translationY);
        // Undecided until the finger has actually gone somewhere.
        if (Math.max(dx, dy) < AXIS_LOCK_SLOP) return;
        axis.value = dx > dy ? 1 : 2;
        if (axis.value === 2) runOnJS(onPrepareOpen)();
      }

      if (axis.value === 1) {
        offsetX.value = event.translationX * FOLLOW_RATIO;
        return;
      }
      setPlayerExpansion(Math.min(1, Math.max(0, -event.translationY / height)));
    })
    .onEnd((event) => {
      if (axis.value === 1) {
        if (event.translationX <= -SKIP_DISTANCE) runOnJS(next)();
        else if (event.translationX >= SKIP_DISTANCE) runOnJS(previous)();
        return;
      }

      const far = playerExpansion.value >= 0.18;
      const fast = event.velocityY <= -OPEN_VELOCITY;
      // Upwards is negative in gesture space and positive in expansion space.
      runOnJS(onExpandedChange)(far || fast, -event.velocityY / height);
    })
    .onFinalize(() => {
      axis.value = 0;
      offsetX.value = withSpring(0, SPRING);
    });

  /*
   * Only the sideways follow. The fade moved up to `PlayerLayer`, which wraps
   * the whole strip — this style covered the row but not the strip's panel
   * background, its top hairline or `MiniProgress`, and those three carried on
   * drawing over an open Now Playing.
   */
  const followStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: offsetX.value }],
  }));

  if (phase === 'idle' || track === null) return null;

  const isPlaying = phase === 'playing';
  const artworkUri = track.artworkPath ? `file://${track.artworkPath}` : null;

  return (
    <View className="border-t border-subtle bg-surface-elevated">
      {/*
        A hairline of progress rather than a scrub bar. The mini player says
        where you are; seeking is the full player's job, and a 2px target is not
        a control anyone can hit.

        Outside the gesture wrapper: the bar reports position and should not
        slide around with the strip that reports the track.
      */}
      <MiniProgress />

      <GestureDetector gesture={pan}>
        <Animated.View style={followStyle}>
          <View className="flex-row items-center gap-1 px-4 py-2">
            <Pressable
              onPress={openPlayer}
              /*
               * Mount Now Playing when the finger lands, not when it lifts.
               * The tap path used to mount the whole player screen — a carousel
               * of three images, the scrubber, the spec strip — on the very
               * frame the spring started, so the opening animation spent its
               * first frames waiting for a render it had itself triggered.
               */
              onPressIn={onPrepareOpen}
              android_ripple={{ color: colors.etch }}
              accessibilityRole="button"
              accessibilityLabel={t('player.open')}
              className="min-h-11 flex-1 flex-row items-center gap-3"
            >
              {artworkUri ? (
                <Image
                  source={{ uri: artworkUri }}
                  recyclingKey={String(track.id)}
                  cachePolicy="memory-disk"
                  contentFit="cover"
                  transition={0}
                  className="h-10 w-10 rounded-xs"
                />
              ) : (
                <View className="h-10 w-10 items-center justify-center rounded-xs bg-surface">
                  <Music color={colors.legend} size={18} strokeWidth={2} />
                </View>
              )}

              <View className="flex-1">
                <Text numberOfLines={1} className="font-body-medium text-sm text-primary">
                  {track.title}
                </Text>
                <Text numberOfLines={1} className="font-body text-sm text-muted">
                  {track.artistName ?? t('common.unknownArtist')}
                </Text>
              </View>
            </Pressable>

            {/*
              Previous belongs here as much as next does. Skipping back is the
              commonest correction there is — you skip one too many and want it
              back — and having only "next" made the strip a one-way control.
            */}
            <Pressable
              onPress={previous}
              android_ripple={{ color: colors.etch, borderless: true }}
              accessibilityRole="button"
              accessibilityLabel={t('player.previous')}
              className="min-h-11 min-w-11 items-center justify-center"
            >
              <SkipBack color={colors.label} size={20} strokeWidth={2} fill={colors.label} />
            </Pressable>

            <Pressable
              onPress={toggle}
              android_ripple={{ color: colors.etch, borderless: true }}
              accessibilityRole="button"
              accessibilityLabel={isPlaying ? t('player.pause') : t('player.play')}
              className="min-h-11 min-w-11 items-center justify-center"
            >
              {isPlaying ? (
                <Pause color={colors.label} size={22} strokeWidth={2} fill={colors.label} />
              ) : (
                <Play color={colors.label} size={22} strokeWidth={2} fill={colors.label} />
              )}
            </Pressable>

            <Pressable
              onPress={next}
              android_ripple={{ color: colors.etch, borderless: true }}
              accessibilityRole="button"
              accessibilityLabel={t('player.next')}
              className="min-h-11 min-w-11 items-center justify-center"
            >
              <SkipForward color={colors.label} size={20} strokeWidth={2} fill={colors.label} />
            </Pressable>
          </View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}
