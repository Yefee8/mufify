import '@/theme/global.css';

import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect } from 'react';

import { initI18n } from '@/i18n';
import { APP_FONTS } from '@/theme/fonts';
import { applyStoredTheme, useTheme } from '@/theme/useTheme';

// Both read synchronously from MMKV, before the first frame, so the app never
// paints the wrong theme or language and then corrects itself.
applyStoredTheme();
initI18n();

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(APP_FONTS);
  const { resolved, colors } = useTheme();

  // Paints behind the React tree, so rotation and keyboard insets do not
  // reveal a white gap in the dark theme.
  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(colors.chassis);
  }, [colors.chassis]);

  useEffect(() => {
    if (fontsLoaded || fontError) void SplashScreen.hideAsync();
  }, [fontsLoaded, fontError]);

  // Hold the splash rather than render a frame in the fallback font.
  if (!fontsLoaded && !fontError) return null;

  return (
    <>
      <StatusBar style={resolved === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}
