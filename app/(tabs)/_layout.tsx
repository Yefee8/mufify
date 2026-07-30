import { Tabs } from 'expo-router';
import { BarChart3, Disc3, ListMusic, SlidersHorizontal } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { useTheme } from '@/theme/useTheme';

export default function TabsLayout() {
  const { t } = useTranslation();
  const { colors } = useTheme();

  return (
    <Tabs
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
