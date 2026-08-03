import { useSegments } from 'expo-router';
import type { ReactNode } from 'react';
import { useCallback, useEffect } from 'react';
import { BackHandler, View, type LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useSheet } from '@/components/ui/useSheet';

import { MiniPlayer } from './components/MiniPlayer';
import { NowPlayingOverlay } from './components/NowPlayingOverlay';
import { QueueOverlay } from './components/QueueOverlay';
import { playerExpansion, queueExpansion } from './playerExpansion';
import { setMiniPlayerHeight, usePlayerTabBarHeight } from './playerLayerLayout';

export interface PlayerLayerProps {
  children: ReactNode;
}

/**
 * The root stacking order, and the only place that decides it.
 *
 * Children, then the transport strip, then Now Playing, then the queue. All
 * three of the last are outside the router, which is why the queue is a sheet
 * here rather than a route — see `docs/adr/014`.
 *
 * Both sheets are driven by `useSheet` against their own progress value, so
 * they open with the same tuned spring, the same fade and the same velocity
 * handoff. The queue used to have its own layout animations and read badly
 * next to a player that had been tuned by hand; that difference was never
 * taste, and it is now impossible to reintroduce in one surface without the
 * other.
 */
export function PlayerLayer({ children }: PlayerLayerProps) {
  const segments = useSegments();
  const tabBarHeight = usePlayerTabBarHeight();
  const isTabRoute = segments[0] === '(tabs)';

  const player = useSheet(playerExpansion);
  const queue = useSheet(queueExpansion);

  const openQueue = useCallback(() => queue.setOpen(true), [queue]);
  const closeQueue = useCallback(() => queue.setOpen(false), [queue]);

  /*
   * Publish how much of every screen the strip covers, so lists can pad for it
   * from one number instead of each guessing. Measured on the wrapper, which
   * includes the route-dependent safe-area padding below the strip.
   */
  const onStripLayout = useCallback((event: LayoutChangeEvent) => {
    setMiniPlayerHeight(event.nativeEvent.layout.height);
  }, []);

  useEffect(() => () => setMiniPlayerHeight(0), []);

  /*
   * Back closes the topmost sheet.
   *
   * The queue used to be a route, so the navigator gave it this for free. Now
   * that neither surface is one, nothing else can: they are mounted outside the
   * router, so back would pop the screen *underneath* an open player and leave
   * it open over a screen the user never chose. Innermost first, which is the
   * order they are stacked in.
   */
  useEffect(() => {
    if (!queue.expanded && !player.expanded) return;

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (queue.expanded) {
        queue.setOpen(false);
        return true;
      }
      player.setOpen(false);
      return true;
    });

    return () => subscription.remove();
  }, [queue, player]);

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
        pointerEvents={player.expanded ? 'none' : 'box-none'}
        className="absolute inset-x-0 z-20"
        style={[{ bottom: isTabRoute ? tabBarHeight : 0 }, strip]}
      >
        <SafeAreaView edges={isTabRoute ? [] : ['bottom']} className="bg-surface-elevated">
          <MiniPlayer onPrepareOpen={player.prepare} onExpandedChange={player.setOpen} />
        </SafeAreaView>
      </Animated.View>

      <NowPlayingOverlay
        visible={player.visible}
        expanded={player.expanded}
        onExpandedChange={player.setOpen}
        onOpenQueue={openQueue}
        onPrepareQueue={queue.prepare}
      />

      {/* Above Now Playing, and outside its transformed container. */}
      <QueueOverlay visible={queue.visible} expanded={queue.expanded} onClose={closeQueue} />
    </View>
  );
}
