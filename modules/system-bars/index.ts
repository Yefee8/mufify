import { requireOptionalNativeModule } from 'expo-modules-core';

interface SystemBarsNativeModule {
  /** True draws dark buttons, for a light background. */
  setLightNavigationBar(light: boolean): void;
}

/**
 * Optional, like the other local modules: a dev client built before this
 * existed is a normal thing to have on a phone. A missing module means the
 * platform's default navigation bar, not a crash.
 */
const SystemBars = requireOptionalNativeModule<SystemBarsNativeModule>('MufifySystemBars');

/**
 * Match the navigation bar's buttons to the theme behind them.
 *
 * `light` here means *the background is light*, so the buttons are drawn dark
 * — the same sense as `StatusBar`'s `style="dark"`, and the opposite of what
 * the platform constant is called.
 */
export function setLightNavigationBar(lightBackground: boolean): void {
  try {
    SystemBars?.setLightNavigationBar(lightBackground);
  } catch {
    // A navigation bar that keeps its colours is not worth a crash.
  }
}

export const hasSystemBars = SystemBars !== null;
