import { colorScheme, useColorScheme } from 'nativewind';
import { useCallback, useState } from 'react';

import { getThemePreference, setThemePreference, type ThemePreference } from '@/services/settings';

import { COLORS, type ThemeName } from './tokens';

/**
 * Push the stored preference into NativeWind. Called once at module scope in
 * the root layout, before the first render, so the app never paints the wrong
 * theme and then corrects itself.
 */
export function applyStoredTheme(): void {
  colorScheme.set(getThemePreference());
}

export interface UseThemeResult {
  /** What the user chose: may be 'system'. */
  preference: ThemePreference;
  /** What that resolves to right now. Never 'system'. */
  resolved: ThemeName;
  /** The token values for the active theme, for non-JSX surfaces. */
  colors: (typeof COLORS)[ThemeName];
  setPreference: (preference: ThemePreference) => void;
}

/** Read and change the theme. The only supported way to do either. */
export function useTheme(): UseThemeResult {
  const { colorScheme: active, setColorScheme } = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>(getThemePreference);

  const setPreference = useCallback(
    (next: ThemePreference) => {
      setPreferenceState(next);
      setThemePreference(next);
      setColorScheme(next);
    },
    [setColorScheme],
  );

  // `useColorScheme` reports undefined on the first frame. Defaulting to dark
  // there paints a light-icon status bar over the light theme, so fall through
  // to the observable, which always has a concrete value.
  const resolved: ThemeName = (active ?? colorScheme.get()) === 'light' ? 'light' : 'dark';

  return { preference, resolved, colors: COLORS[resolved], setPreference };
}

/**
 * Just the active theme's token values, for components that need a colour as
 * a prop rather than a class — Lucide icons and Reanimated styles, mostly.
 */
export function useThemeColors(): (typeof COLORS)[ThemeName] {
  const { colorScheme: active } = useColorScheme();
  const resolved: ThemeName = (active ?? colorScheme.get()) === 'light' ? 'light' : 'dark';
  return COLORS[resolved];
}
