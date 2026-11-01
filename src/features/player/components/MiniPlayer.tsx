import { Image } from 'expo-image';
import { Music } from 'lucide-react-native';
import { useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { tapFeedback } from '@/services/haptics';
import * as perf from '@/services/perf';
import { useLifecycleTrace } from '@/services/perf/useLifecycleTrace';
import { useThemeColors } from '@/theme/useTheme';

import { useCurrentTrack, usePlaybackControls, usePlaybackPhase } from '../hooks/usePlayback';
import { playerExpansion, setPlayerExpansion } from '../playerExpansion';
import { MiniProgress } from './MiniProgress';
import { MiniTransport } from './MiniTransport';

/** px/s upward that opens it regardless of distance. */
const OPEN_VELOCITY = 600;
/** Sideways travel that changes track. Shorter than the player's — less room. */
const SKIP_DISTANCE = 56;
/** px/s sideways that changes track however short the drag was. */
const SKIP_VELOCITY = 450;
/** Below this the pan never claims the touch, so the buttons still work. */
const ACTIVATION_SLOP = 10;
/**
 * Movement needed before the gesture commits to an axis. Not cosmetic:
 * deciding on the first `onUpdate` compares two translations that are both
 * still zero, and `Math.abs(0) >= Math.abs(0)` is true — so every gesture
 * locked to horizontal and the vertical ones were silently discarded.
 */
const AXIS_LOCK_SLOP = 6;

/*
 * The skip transition: out, swap, in.
 *
 * What this replaces read as three contradictory signals. The strip followed
 * the finger at 0.4, so it lagged behind the thing dragging it; it then sprang
 * back to the centre, overshooting, while the new title appeared at some
 * unrelated point during the spring. A drag that went left ended with the
 * content arriving from the left — the opposite of changing track.
 *
 * Now the content keeps going the way it was thrown and its replacement comes
 * from the other side, with one shared value driving both the travel and the
 * fade: the exit is fully faded exactly where it stops, and an entry that
 * starts partway in starts partway faded. Ratios are of the screen's width, so
 * the motion matches everything else the width governs.
 */
/** Where the outgoing content is by the time it has faded out. */
const EXIT_RATIO = 0.5;
/** Where the incoming content starts. Short, because the fade carries it. */
const ENTER_RATIO = 0.28;
const EXIT_MS = 140;
const ENTER_MS = 200;

/** A drag that did not commit returns home without a wobble. */
const SETTLE = { damping: 26, stiffness: 340, mass: 0.7 } as const;

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
  const { height, width } = useWindowDimensions();

  /*
   * Phase and track, never position. Measured on the Pixel_7 AVD over ten
   * seconds of playback: the whole engine state re-rendered this 20 times —
   * the engine's 2 Hz status interval — and 0 times after the split. Position
   * belongs to `MiniProgress`, one animated view that re-renders never.
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
  /** Set when the release started a skip, so the release does not also undo it. */
  const skipping = useSharedValue(false);

  /*
   * The gesture is built here rather than in a shared wrapper, and that is the
   * fix for "swiping the mini player up does not open the player". A generic
   * pan with both `activeOffsetX` and `activeOffsetY` on a container made
   * entirely of Pressables lost the race to a child's press responder, so the
   * swipe worked sometimes; a small minimum distance claims both axes and
   * still leaves taps alone. `activeOffsetY` alone meant a purely horizontal
   * drag could never activate, so track swipes did not exist in practice.
   *
   * Built inline rather than memoized, like `Scrubber`: there is one mini
   * player, so a rebuild per render costs nothing, and keeping the shared
   * values out of a hook's closure avoids the React Compiler's immutability
   * rule — right about ordinary values, and no model of Reanimated.
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
        // One to one. The content is the thing being dragged, so it goes where
        // the finger goes — a damped follow reads as lag, not as resistance.
        offsetX.value = event.translationX;
        return;
      }
      setPlayerExpansion(Math.min(1, Math.max(0, -event.translationY / height)));
    })
    .onEnd((event) => {
      if (axis.value === 1) {
        // Left is next, as it is everywhere else: the next thing comes from
        // the right. Velocity commits a short flick, distance a slow drag.
        const direction =
          event.translationX <= -SKIP_DISTANCE || event.velocityX <= -SKIP_VELOCITY
            ? -1
            : event.translationX >= SKIP_DISTANCE || event.velocityX >= SKIP_VELOCITY
              ? 1
              : 0;

        if (direction === 0) return;

        skipping.value = true;
        // Asked for at the release rather than at the end of the exit, so the
        // engine loads the track during the 140ms the old one spends leaving.
        if (direction === -1) runOnJS(next)();
        else runOnJS(previous)();

        offsetX.value = withTiming(
          direction * width * EXIT_RATIO,
          { duration: EXIT_MS, easing: Easing.out(Easing.quad) },
          (finished) => {
            if (!finished) return;
            // Placed on the far side and brought in: by now the strip is
            // showing the track that was asked for.
            offsetX.value = -direction * width * ENTER_RATIO;
            offsetX.value = withTiming(0, {
              duration: ENTER_MS,
              easing: Easing.out(Easing.cubic),
            });
          },
        );
        return;
      }

      const far = playerExpansion.value >= 0.18;
      const fast = event.velocityY <= -OPEN_VELOCITY;
      // Upwards is negative in gesture space and positive in expansion space.
      runOnJS(onExpandedChange)(far || fast, -event.velocityY / height);
    })
    .onFinalize(() => {
      axis.value = 0;
      // A committed skip owns the shared value until its own animation ends.
      if (skipping.value) {
        skipping.value = false;
        return;
      }
      offsetX.value = withSpring(0, SETTLE);
    });

  /*
   * The sideways follow and its fade, from one value, so the two cannot
   * drift. Travel is clamped so a drag past the exit point does not go
   * negative. The strip's *own* fade — for an opening Now Playing — is in
   * `PlayerLayer`; this one is only the content that changes with the track.
   */
  const contentStyle = useAnimatedStyle(() => {
    const travelled = Math.min(1, Math.abs(offsetX.value) / (width * EXIT_RATIO));
    return {
      transform: [{ translateX: offsetX.value }],
      opacity: 1 - travelled,
    };
  });

  if (phase === 'idle' || track === null) return null;

  const isPlaying = phase === 'playing';
  const artworkUri = track.artworkPath ? `file://${track.artworkPath}` : null;

  return (
    <View className="border-t border-subtle bg-surface-elevated">
      {/*
        A hairline of progress rather than a scrub bar: seeking is the full
        player's job and a 2px target is not a control anyone can hit. Outside
        the gesture wrapper, because position does not change with the track.
      */}
      <MiniProgress />

      {/*
        The gesture takes the whole strip; only the content moves under it.
        Sliding the transport out with the title was the other half of why the
        old swipe read badly — the controls are furniture, and watching them
        fly off said something had happened to *them*. See `MiniTransport`.
      */}
      <GestureDetector gesture={pan}>
        <View className="flex-row items-center gap-1 px-4 py-2">
          <Animated.View style={contentStyle} className="flex-1 flex-row">
            <Pressable
              onPress={openPlayer}
              /*
               * Mount Now Playing when the finger lands, not when it lifts:
               * the whole player screen used to mount on the frame the spring
               * started, so the opening spent its first frames waiting for a
               * render it had itself triggered.
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
          </Animated.View>

          <MiniTransport
            isPlaying={isPlaying}
            onPrevious={previous}
            onToggle={toggle}
            onNext={next}
          />
        </View>
      </GestureDetector>
    </View>
  );
}
