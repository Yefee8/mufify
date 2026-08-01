import { useSegments } from 'expo-router';
import type { ReactNode } from 'react';
import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { runOnJS, withSpring } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MiniPlayer } from './components/MiniPlayer';
import { NowPlayingOverlay } from './components/NowPlayingOverlay';
import { playerExpansion } from './playerExpansion';
import { usePlayerTabBarHeight } from './playerLayerLayout';

const SPRING = { damping: 24, stiffness: 260 } as const;

export interface PlayerLayerProps {
  children: ReactNode;
}

/** Keeps transport visible above every route and owns the one player expansion value. */
export function PlayerLayer({ children }: PlayerLayerProps) {
  const segments = useSegments();
  const tabBarHeight = usePlayerTabBarHeight();
  const [visible, setVisible] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const isTabRoute = segments[0] === '(tabs)';

  const prepareOpen = useCallback(() => setVisible(true), []);

  const onExpandedChange = useCallback((nextExpanded: boolean) => {
    if (nextExpanded) {
      setVisible(true);
      setExpanded(true);
      playerExpansion.value = withSpring(1, SPRING);
      return;
    }

    setExpanded(false);
    playerExpansion.value = withSpring(0, SPRING, (finished) => {
      if (finished) runOnJS(setVisible)(false);
    });
  }, []);

  return (
    <View className="flex-1">
      {children}
      <NowPlayingOverlay
        visible={visible}
        expanded={expanded}
        onExpandedChange={onExpandedChange}
      />
      <View
        pointerEvents={expanded ? 'none' : 'box-none'}
        className="absolute inset-x-0 z-20"
        style={{ bottom: isTabRoute ? tabBarHeight : 0 }}
      >
        <SafeAreaView edges={isTabRoute ? [] : ['bottom']} className="bg-surface-elevated">
          <MiniPlayer onPrepareOpen={prepareOpen} onExpandedChange={onExpandedChange} />
        </SafeAreaView>
      </View>
    </View>
  );
}
