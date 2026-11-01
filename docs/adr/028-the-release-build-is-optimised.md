# 028 — The release build is optimised

**Status:** accepted
**Date:** 2026-11-01

## Context

Google Play granted production access and then said, of the uploaded bundle:

> Code obfuscation: **1%** · Dex code optimisation: **Low**

Both numbers were right, and they had one cause. The React Native template
leaves `android.enableMinifyInReleaseBuilds` unset, which means **false**, and
nothing in this project had ever set it. Every release since 1.0 shipped
unminified: no shrinking, no obfuscation, no optimisation pass. The 1.4.7 APK
carried **49.1 MB of dex across five files** — all of it React Native, Expo
and AndroidX, none of it ever walked by R8.

"Dex code optimisation: Low" is Play's reading of the same thing. R8 is what
raises it, and R8 was not running.

## Decision

**Turn R8 on, with the smallest set of keep rules that is actually needed.**

`expo-build-properties` gets `enableMinifyInReleaseBuilds` and
`enableShrinkResourcesInReleaseBuilds`. Both go in `app.json` rather than in
`android/`, which is generated and git-ignored — an edit there survives until
the next `prebuild` and no longer.

R8 runs in **full mode**, which is the Android Gradle Plugin 8 default and
needs nothing set.

### The keep rules are four, and that is the point

The temptation with a React Native app is `-keep class dev.mufify.** { *; }`
and move on. That would have kept the whole of our own Kotlin unobfuscated to
solve a problem that does not exist, because **Expo and React Native already
ship consumer rules that cover their own reflection**:

- `-keep class * implements expo.modules.kotlin.records.Record { *; }` — every
  `@Field` record, including `AudioLockScreenOptions` in the patch.
- `-keep,allowoptimization,allowobfuscation class * extends …modules.Module` —
  module classes keep their constructor and `definition()` and may still be
  *renamed*, because the generated package list constructs them directly.
- `-keep enum * implements …types.Enumerable { *; }`.
- React Native's own `@DoNotStrip` rules, for everything across JNI.

So `AppLifecycleModule` is now `E8.b` in the shipped dex and works. What the
four rules in `app.json` cover is only what those miss:

- **Nitro.** `react-native-mmkv` is a Nitro module and neither it nor
  `react-native-nitro-modules` ships consumer rules; the C++ side finds its
  Kotlin across JNI by name. MMKV holds every setting and the theme is read
  from it before the first frame, so getting this wrong is a blank app rather
  than a lost preference.
- **`androidx.annotation.Keep`** and **Fresco's `DoNotStrip`**, which
  react-native-mmkv uses instead of the annotation React Native's rules name.
  The default `proguard-android.txt` this build uses covers neither.
- **Throwable names.** `TagReader` falls back to an exception's simple name
  when it has no message, and a user cannot report "a".

## Consequences

Measured on the same machine, 1.4.7 against 1.5.0:

| | 1.4.7 | 1.5.0 | |
|---|---|---|---|
| dex, uncompressed | 49.1 MB | 18.1 MB | **−63%** |
| dex files | 5 | 3 | |
| universal APK | 133.8 MB | 123.1 MB | −10.7 MB |

The APK falls by less than the dex does because 101 MB of it is native
libraries for four ABIs, which R8 does not touch — and which Play splits per
device out of the bundle anyway, so what a phone downloads is far less than
either number.

**Nothing was given up for it.** Every native path was exercised against the
minified build on an Android 10 emulator before this was accepted: launch and
theme (MMKV through Nitro), the library and its scan (`audio-tags`), playback
and the media session, the custom notification and its resources, media
buttons, the ten-band equaliser (`audio-eq`), statistics recording, the backup
written into a granted SAF folder, playlists, and the shutdown on task removal
(`app-lifecycle`). Cold start measured 528 ms.

Resource shrinking is the half worth watching: the notification layouts the
patch adds live in a *library* module and are reached only through
`R.layout.…` from Kotlin. They survive — checked with `aapt2 dump resources`
against the built APK, not assumed — and that check belongs in any future
release that changes them.

`mapping.txt` is 65 MB and is **not** committed. It is written to
`android/app/build/outputs/mapping/release/`, which is generated and
git-ignored; a crash report from a shipped build can only be read with the
mapping file from that exact build, so it has to be kept with the artefact —
Play Console takes it on upload, and that is where this one lives.
