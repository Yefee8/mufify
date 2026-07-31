import '@/theme/global.css';

import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { useDatabase } from '@/db/useDatabase';
import { startListenRecording } from '@/features/player/listenRecorder';
import { initI18n } from '@/i18n';
import { APP_FONTS } from '@/theme/fonts';
import { registerComponentInterop } from '@/theme/interop';
import { applyStoredTheme, useTheme } from '@/theme/useTheme';

// Both read synchronously from MMKV, before the first frame, so the app never
// paints the wrong theme or language and then corrects itself.
applyStoredTheme();
initI18n();
// Must run before any screen renders: a component whose interop is registered
// late has already painted itself unstyled.
registerComponentInterop();

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(APP_FONTS);
  const { ready: databaseReady, error: databaseError } = useDatabase();
  const { resolved, colors } = useTheme();

  // Paints behind the React tree, so rotation and keyboard insets do not
  // reveal a white gap in the dark theme.
  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(colors.chassis);
  }, [colors.chassis]);

  // Listens are recorded for as long as the app is alive, not for as long as
  // a particular screen is mounted — playback outlives every screen.
  useEffect(() => startListenRecording(), []);

  const fontsSettled = fontsLoaded || fontError !== null;
  const databaseSettled = databaseReady || databaseError !== undefined;

  useEffect(() => {
    if (fontsSettled && databaseSettled) void SplashScreen.hideAsync();
  }, [fontsSettled, databaseSettled]);

  // Hold the splash rather than render a frame in the fallback font, or let a
  // screen query a schema that has not been migrated yet.
  if (!fontsSettled || !databaseSettled) return null;

  return (
    // Required by every GestureDetector in the app — the scrubber is the first
    // one, and gesture-handler throws rather than silently ignoring gestures.
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style={resolved === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        {/* Now Playing is somewhere you go from a track and dismiss, not a
            destination you switch to — so it presents rather than pushes. */}
        <Stack.Screen name="player" options={{ presentation: 'modal' }} />
        <Stack.Screen name="queue" options={{ presentation: 'modal' }} />
      </Stack>
    </GestureHandlerRootView>
  );
}
