# 032 — What Play flags for Android 15

**Status:** accepted
**Date:** 2026-11-07

## Context

Play reported two things against 1.6.1.

**Deprecated edge-to-edge APIs**: `Window.getStatusBarColor`,
`setStatusBarColor`, `setNavigationBarColor`, and the cutout modes
`LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES` and `_DEFAULT`. Resolved through
the R8 mapping, every call site was in a library: React Native's
`StatusBarModule` and `WindowUtilKt`, react-native-screens' `FormSheetDialog`,
Material's `MaterialDatePicker`, and Compose. Counted in the 1.6.1 dex: six
calls to `setStatusBarColor`, four to `setNavigationBarColor`, two to
`getStatusBarColor`, four writes of `layoutInDisplayCutoutMode`.

**R8: "optimised removal of unused resources not enabled"**, with "upgrade to
AGP 9" as the remedy. ADR 028 read this as the shrinker's safe mode. It is not:
it is AGP's optimised resource shrinking, which runs inside R8 and drops
resources reachable only from code R8 removed. AGP 9 turns it on by default.

## Decision

**The three window-colour calls are deleted by R8.** `extraProguardRules`
declares them free of side effects (and `getStatusBarColor` as returning 0),
so R8 removes every call in every library. That is only honest if nothing was
relying on them, so `plugins/withStaticSystemBars.js` moves what they set into
the theme: the status bar is transparent there already, and the navigation bar
points at a colour that is transparent from API 29 and, below it, the exact
scrims React Native's `enableEdgeToEdge` painted at runtime — 90% white or 50%
dark, by the system's mode. `night` outranks the platform version in resource
selection, so the transparent value is written for `night-v29` too.

**Optimised resource shrinking is switched on** with
`android.r8.optimizedResourceShrinking=true`. Expo SDK 57 pins AGP 8.12, so
the upgrade Play suggests is not available; the option exists in 8.12 —
confirmed in the AGP jar — and turns on what the upgrade would have.

## Consequences

Measured against the 1.6.1 arm64 APK:

| | 1.6.1 | 1.7.0 |
|---|---|---|
| `Window.setStatusBarColor` calls in dex | 6 | **0** |
| `Window.setNavigationBarColor` calls | 4 | **0** |
| `Window.getStatusBarColor` calls | 2 | **0** |
| `layoutInDisplayCutoutMode` writes | 4 | 4 |
| `res/` files | 1,188 | **801** |
| `resources.arsc` | 1.68 MB | **1.07 MB** |

The fonts in `res/raw`, the custom notification's layouts and icons, and the
splash drawable Expo actually uses all survive, checked with `aapt2` and on an
Android 10 emulator: launch, playback and the notification.

**The cutout modes stay.** All four writes are in React Native's own
`WindowUtilKt`: `enableEdgeToEdge` (SHORT_EDGES on Android 9 and 10), and
`statusBarShow`/`statusBarHide`, which React Native calls on the window of
every Modal this app opens. They are field writes, which R8 cannot remove the
way it removes calls, and removing the functions that contain them would
remove edge-to-edge itself on every version before 15. They go when React
Native changes that file. The warning is Play's "user experience" note, not a
block on publishing.
