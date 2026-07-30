/**
 * Typed access to the same tokens defined in `global.css`.
 *
 * Only for the places a NativeWind class cannot reach: the Android status and
 * navigation bars, the splash screen, Reanimated worklets, and native module
 * options. Everything that renders JSX uses the semantic classes instead.
 *
 * These values must stay in sync with `global.css` by hand — there is no build
 * step tying them together, so changing a colour means changing both.
 */

export const COLORS = {
  dark: {
    chassis: '#0A0C11',
    panel: '#151922',
    etch: '#2A2F3C',
    label: '#ECEEF3',
    legend: '#98A0B3',
    signal: '#7C8CFF',
    onSignal: '#0A0C11',
  },
  light: {
    chassis: '#F6F4F1',
    panel: '#FFFFFF',
    etch: '#DFDAD2',
    label: '#15171C',
    legend: '#5C616E',
    signal: '#4B45CE',
    onSignal: '#FFFFFF',
  },
} as const;

export type ThemeName = keyof typeof COLORS;
export type ColorToken = keyof (typeof COLORS)['dark'];

/** 4px base. Mirrors the `spacing` scale in tailwind.config.js. */
export const SPACING = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  /** Minimum accessible touch target, not a layout step. */
  11: 44,
  12: 48,
  16: 64,
} as const;

/** Mirrors the `borderRadius` scale in tailwind.config.js. */
export const RADIUS = {
  none: 0,
  /** Album art in a list row. */
  xs: 2,
  /** Large album art, buttons, inputs. */
  sm: 4,
  /** Sheets and cards. */
  md: 8,
  /** Transport controls only. */
  full: 9999,
} as const;

/** Minimum touch target, per the accessibility requirement. */
export const MIN_TOUCH_TARGET = 44;
