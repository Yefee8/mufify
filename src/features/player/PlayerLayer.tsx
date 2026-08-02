import { useSegments } from 'expo-router';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { BackHandler, View, type LayoutChangeEvent } from 'react-native';
import Animated, { runOnJS, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MiniPlayer } from './components/MiniPlayer';
import { NowPlayingOverlay } from './components/NowPlayingOverlay';
import { QueueOverlay } from './components/QueueOverlay';
import { playerExpansion } from './playerExpansion';
import { setMiniPlayerHeight, usePlayerTabBarHeight } from './playerLayerLayout';

/**
 * The settle after the finger leaves.
 *
 * Softer and heavier than the spring it replaces (`damping: 24,
 * stiffness: 260`, which is ζ ≈ 0.75 with no mass term and arrives with a
 * snap). At ζ ≈ 0.86 this overshoots by a hair and comes to rest, which is what
 * a sheet does. The number that matters more than either is `velocity`: the
 * spring used to start from rest however hard the strip was flicked, so a fast
 * throw and a slow drag opened at exactly the same speed and the gesture
 * appeared not to be connected to the animation at all.
 */
const SPRING = { damping: 22, stiffness: 180, mass: 0.9 } as const;

export interface PlayerLayerProps {
  children: ReactNode;
}

/** Keeps transport visible above every route and owns the one player expansion value. */
export function PlayerLayer({ children }: PlayerLayerProps) {
  const segments = useSegments();
  const tabBarHeight = usePlayerTabBarHeight();
  const [visible, setVisible] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const isTabRoute = segments[0] === '(tabs)';

  const prepareOpen = useCallback(() => setVisible(true), []);
  const openQueue = useCallback(() => setQueueOpen(true), []);
  const closeQueue = useCallback(() => setQueueOpen(false), []);

  /*
   * Publish how much of every screen the strip covers, so lists can pad for it
   * from one number instead of each guessing. Measured on the wrapper, which
   * includes the route-dependent safe-area padding below the strip.
   */
  const onStripLayout = useCallback((event: LayoutChangeEvent) => {
    setMiniPlayerHeight(event.nativeEvent.layout.height);
  }, []);

  useEffect(() => () => setMiniPlayerHeight(0), []);

  /**
   * `velocity` is in expansion units per second — the gesture's px/s divided by
   * the screen height — because that is what the shared value is measured in.
   */
  const onExpandedChange = useCallback((nextExpanded: boolean, velocity = 0) => {
    if (nextExpanded) {
      setVisible(true);
      setExpanded(true);
      playerExpansion.value = withSpring(1, { ...SPRING, velocity });
      return;
    }

    setExpanded(false);
    playerExpansion.value = withSpring(0, { ...SPRING, velocity }, (finished) => {
      if (finished) runOnJS(setVisible)(false);
    });
  }, []);

  /*
   * Back closes the topmost player surface.
   *
   * The queue used to be a route, so the navigator gave it this for free. Now
   * that neither surface is one, nothing else can: they are mounted outside the
   * router, so back would pop the screen *underneath* an open player and leave
   * it open over a screen the user never chose. Innermost first, which is the
   * order they are stacked in.
   *
   * Declared after `onExpandedChange` deliberately. A dependency array is built
   * during render, so referencing it above its own `const` is a temporal dead
   * zone error on every render, not a lint nit.
   */
  useEffect(() => {
    if (!queueOpen && !expanded) return;

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (queueOpen) {
        setQueueOpen(false);
        return true;
      }
      onExpandedChange(false);
      return true;
    });

    return () => subscription.remove();
  }, [queueOpen, expanded, onExpandedChange]);

  /*
   * The whole strip fades, not just its contents.
   *
   * This lived on the row inside `MiniPlayer` and left three things behind at
   * full opacity: the strip's own `bg-surface-elevated`, its top hairline, and
   * `MiniProgress`, which sits outside the gesture wrapper on purpose. All
   * three kept drawing over an open Now Playing — the panel and progress bar
   * across the bottom of the expanded player were the mini player, still there.
   */
  const strip = useAnimatedStyle(() => ({ opacity: 1 - playerExpansion.value }));

  return (
    <View className="flex-1">
      {children}

      <Animated.View
        onLayout={onStripLayout}
        pointerEvents={expanded ? 'none' : 'box-none'}
        className="absolute inset-x-0 z-20"
        style={[{ bottom: isTabRoute ? tabBarHeight : 0 }, strip]}
      >
        <SafeAreaView edges={isTabRoute ? [] : ['bottom']} className="bg-surface-elevated">
          <MiniPlayer onPrepareOpen={prepareOpen} onExpandedChange={onExpandedChange} />
        </SafeAreaView>
      </Animated.View>

      {/*
        Last, and at the highest layer. Paint order and `zIndex` now agree: the
        overlay used to be `z-10` under the strip's `z-20`, so the surface it is
        supposed to cover was drawn on top of it.
      */}
      <NowPlayingOverlay
        visible={visible}
        expanded={expanded}
        onExpandedChange={onExpandedChange}
        onOpenQueue={openQueue}
      />

      {/* Above Now Playing, and outside its transformed container. */}
      <QueueOverlay visible={queueOpen} onClose={closeQueue} />
    </View>
  );
}
