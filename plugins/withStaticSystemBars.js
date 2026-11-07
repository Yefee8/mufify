const fs = require('fs');
const path = require('path');

const {
  AndroidConfig,
  withAndroidColors,
  withAndroidColorsNight,
  withAndroidStyles,
  withDangerousMod,
} = require('expo/config-plugins');

const COLOR = 'navigation_bar_scrim';

/*
 * The scrims React Native paints behind the navigation bar below Android 10,
 * copied from `WindowUtil.kt` so the theme draws exactly what it drew.
 *
 * From Android 10 the platform protects the buttons itself and the bar is
 * transparent; before that a transparent bar over a cover image could swallow
 * the buttons, so React Native laid a 90% white or 50% dark wash under them,
 * by the system's light or dark mode.
 */
const LIGHT_SCRIM = '#E6FFFFFF';
const DARK_SCRIM = '#801B1B1B';
const TRANSPARENT = '#00000000';

/**
 * Give the system bars their colours from the theme instead of at runtime.
 *
 * Google Play reports `Window.setStatusBarColor`, `setNavigationBarColor` and
 * `getStatusBarColor` as deprecated in Android 15, and every call it found is
 * inside a library — React Native's `StatusBarModule` and `enableEdgeToEdge`,
 * react-native-screens' form sheet, Material's date picker, Compose. None of
 * them can be edited here. What can be done is to make them unnecessary and
 * let R8 delete them: `extraProguardRules` in app.json tells R8 the calls have
 * no effect, and it removes every one in the release dex.
 *
 * That is only true if the theme already says what those calls said, which is
 * what this plugin is for:
 *
 * - The status bar is transparent in `AppTheme` already (Expo's edge-to-edge
 *   template), which is all `enableEdgeToEdge` ever set it to.
 * - The navigation bar points at a colour resource that is transparent from
 *   API 29 and React Native's own scrim below it, light or dark with the
 *   system's mode — so on an Android 8 phone the bar looks as it did when the
 *   call set it, and on 10 and later nothing changes at all.
 *
 * `night` outranks the platform version when Android picks a resource, so the
 * transparent v29 value has to be written for night as well, or night mode on
 * Android 10+ would fall back to the dark scrim. Hence four files, not two.
 */
module.exports = function withStaticSystemBars(config) {
  config = withAndroidColors(config, (modConfig) => {
    modConfig.modResults = AndroidConfig.Colors.assignColorValue(modConfig.modResults, {
      name: COLOR,
      value: LIGHT_SCRIM,
    });
    return modConfig;
  });

  config = withAndroidColorsNight(config, (modConfig) => {
    modConfig.modResults = AndroidConfig.Colors.assignColorValue(modConfig.modResults, {
      name: COLOR,
      value: DARK_SCRIM,
    });
    return modConfig;
  });

  config = withAndroidStyles(config, (modConfig) => {
    modConfig.modResults = AndroidConfig.Styles.assignStylesValue(modConfig.modResults, {
      add: true,
      parent: AndroidConfig.Styles.getAppThemeGroup(),
      name: 'android:navigationBarColor',
      value: `@color/${COLOR}`,
    });
    return modConfig;
  });

  return withDangerousMod(config, [
    'android',
    (modConfig) => {
      const res = path.join(modConfig.modRequest.platformProjectRoot, 'app/src/main/res');
      for (const folder of ['values-v29', 'values-night-v29']) {
        const dir = path.join(res, folder);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(
          path.join(dir, 'system_bars.xml'),
          '<?xml version="1.0" encoding="utf-8"?>\n' +
            '<!-- withStaticSystemBars: the platform protects the buttons from API 29. -->\n' +
            `<resources>\n  <color name="${COLOR}">${TRANSPARENT}</color>\n</resources>\n`,
        );
      }
      return modConfig;
    },
  ]);
};
