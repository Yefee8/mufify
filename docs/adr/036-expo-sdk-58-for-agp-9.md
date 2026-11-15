# 036 — Expo SDK 58, because Play asked for AGP 9

**Status:** accepted
**Date:** 2026-11-15

## Context

Play reported two things against 1.7.1, both left over from ADR 032.

**"Upgrade your Android Gradle plugin to 9.0 or later."** ADR 032 turned on
optimised resource shrinking by hand, which is what the note asked for in
1.6.1; Play now asks for the plugin itself. Expo SDK 57 pins AGP 8.12 through
React Native 0.86, and that pin is not a preference: React Native's Gradle
plugin is built against one AGP, and 0.87 is the first release built against
9. Forcing 9 under 0.86 would have been a build that works until it does not.

**The cutout modes `SHORT_EDGES` and `DEFAULT`**, from two methods of a
synthetic class. Resolved through the 1.7.1 mapping, those are R8's API-level
outlines of the two writes in React Native's `statusBarHide` and
`statusBarShow` — the ones ADR 032 said could not be removed because field
writes are not calls.

## Decision

**Move to Expo SDK 58**: React Native 0.88.1, AGP 9.2.1, Gradle 9.4, Kotlin
2.2. It is the supported way onto AGP 9 and a major version is the release to
do it in. The template opts out of AGP 9's built-in Kotlin and new DSL
(`android.builtInKotlin=false`, `android.newDsl=false`); those are Expo's
lines in the generated `gradle.properties`, not ours, and they go when Expo
removes them.

What the move cost: three type errors (the tab bar has a public entry point
now, `expo-router/js-tabs`, and no `navigation` prop; `ScrollView` refs are
typed by instance under the strict API; a footer that was `null`), and the
expo-audio patch, re-made against 58.0.12 at 642 lines instead of 918 —
upstream grew a persistent focus mode and track-button options, so two of the
things the patch did are now configuration. The notification half of the
patch was rewritten rather than ported; see ADR 037.

**The two cutout writes are removed by telling R8 the truth.** Both sit in the
branch for a window that is not edge-to-edge, behind
`isEdgeToEdgeFeatureFlagOn`. The entry point React Native generates sets that
flag in `Application.onCreate` whenever `edgeToEdgeEnabled` is true, and Expo
does not offer it false. `-assumevalues` says so, and R8 deletes the dead
branch everywhere React Native tests the flag.

## Consequences

Counted in the release dex: writes of `layoutInDisplayCutoutMode` went from
four to one. The one left is `enableEdgeToEdge` choosing between `ALWAYS` and
`SHORT_EDGES` by API level, which Play did not list against 1.7.1 and which is
the call that makes the app edge-to-edge on Android 9 and 10. The three
window-colour calls ADR 032 removed are still at zero. The bundle's metadata
now says AGP 9.2.1.

Upgrading in place from 1.7.1 keeps the library, playlists and statistics —
checked on the Android 15 emulator with the 3,441-track library, and on the
Android 10 one. `optimizedResourceShrinking` is still set by
`withR8Optimization`; it is the default from AGP 9 and the line is now only a
statement of intent.
