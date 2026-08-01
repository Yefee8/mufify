import { Tabs } from 'expo-router';
// expo-router vendors react-navigation rather than depending on it, so the tab
// bar is only reachable through its build path. Needed because the mini player
// has to sit *above* the bar, which only the `tabBar` slot can express.
import { BottomTabBar } from 'expo-router/build/react-navigation/bottom-tabs';
import type { BottomTabBarProps } from 'expo-router/build/react-navigation/bottom-tabs';
import { BarChart3, Disc3, ListMusic, SlidersHorizontal } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Toaster } from '@/components/ui/Toaster';
import { MiniPlayer } from '@/features/player/components/MiniPlayer';
import { useLifecycleTrace } from '@/services/perf/useLifecycleTrace';
import { useTheme } from '@/theme/useTheme';

/**
 * The transport strip rides directly above the tab bar, on every tab.
 *
 * Mounting it here rather than inside each screen means it survives tab
 * switches without remounting — restarting the artwork fetch and dropping the
 * progress animation every time the user looks at Settings.
 */
function TabBarWithPlayer(props: BottomTabBarProps) {
  useLifecycleTrace('TabBar');
  return (
    <View>
      {/*
        Toasts stack directly on top of the transport, which is why they live
        here rather than at the root. Positioning them from the root would mean
        an offset large enough to clear both the mini player and the tab bar —
        and those heights are not design-system spacing values, so expressing
        them would have meant either an arbitrary class (which the Tailwind
        config correctly compiles to nothing) or a magic number in a style prop.
        Stacking solves it with neither.
      */}
      <Toaster />
      <MiniPlayer />
      <BottomTabBar {...props} />
    </View>
  );
}

/*
 * Rendered as an element, never handed over as the `tabBar` function itself.
 * react-navigation *calls* `tabBar(props)` rather than mounting it, and the
 * React Compiler — enabled in app.json — rewrites anything shaped like a
 * component to call `useMemoCache`. A plain call then runs that hook outside
 * any component render, which fails as "Invalid hook call" with a stack that
 * points at the tab bar rather than at the cause.
 */
const renderTabBar = (props: BottomTabBarProps) => <TabBarWithPlayer {...props} />;

export default function TabsLayout() {
  const { t } = useTranslation();
  const { colors } = useTheme();

  return (
    <Tabs
      tabBar={renderTabBar}
      screenOptions={{
        headerShown: false,
        // Indigo marks the active tab and nothing else in this bar.
        tabBarActiveTintColor: colors.signal,
        tabBarInactiveTintColor: colors.legend,
        tabBarStyle: {
          backgroundColor: colors.chassis,
          borderTopColor: colors.etch,
        },
        tabBarLabelStyle: { fontFamily: 'Inter_500Medium' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabs.library'),
          tabBarIcon: ({ color, size }) => <Disc3 color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="playlists"
        options={{
          title: t('tabs.playlists'),
          tabBarIcon: ({ color, size }) => <ListMusic color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="stats"
        options={{
          title: t('tabs.stats'),
          tabBarIcon: ({ color, size }) => <BarChart3 color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t('tabs.settings'),
          // Faders, not a gear — the app is a piece of equipment.
          tabBarIcon: ({ color, size }) => <SlidersHorizontal color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
