# 042 — Home-screen widgets

**Status:** accepted
**Date:** 2026-11-16

## Context

2.0.0 asks for widgets: the library or a playlist on the home screen, and what
is playing with the queue behind it. Android widgets are `RemoteViews` drawn
by the launcher, in the launcher's process, often while the app is not running
— after a reboot, a resize, or MIUI reclaiming the app. The app's player is
JavaScript (`AudioEngine`), so every button has to reach a JavaScript runtime
that may not exist yet. There are libraries for writing widgets in React or
Compose (`react-native-android-widget`, Glance); both add a renderer and a
dependency for two small, fixed layouts.

## Decision

**A local Expo module, `modules/widgets`, with plain `RemoteViews` XML.** No
dependency. The app writes what the widgets show — the track and up to four
queued tracks, the collections a widget can be set to, the theme preference
and every word in the app's language — as JSON into one SharedPreferences
file, and the providers draw from it whenever the launcher asks. Colours are
copies of the theme tokens as Android resources, with a `values-night` set, so
a widget on the system theme follows night mode without the app running;
`src/theme/widgetColors.test.ts` fails if the copies drift. A theme picked in
the app is applied in code instead.

**Every button opens `WidgetActionActivity`**, a `Theme.NoDisplay` activity in
a task of its own that finishes before it would draw. With the app listening,
it hands the press to JavaScript as an event and the music answers without the
app coming forward. Without it, the press is written down (for a minute) and
the app is started; the app runs the press once its saved session is back
(ADR 040), so play on the widget of a closed app still plays. An activity, not
a broadcast: a widget press is a foreground start, which may always start the
app, where a broadcast to a stopped app is what MIUI's autostart blocking and
Android's background-start rules refuse. Covers travel as small pre-rounded
bitmaps; the launcher cannot read the app's files directory.

## Consequences

The widget's own tasks forced one change elsewhere: Android tells the audio
service about *every* removed task, and ADR 020 ends the app when its task is
removed — so the first build quit whenever a widget button's task closed. The
patched service now sends the removed task's root activity, and the app ends
only when that is the launcher activity. The library widget shows no count:
the library tab's number is after hiding duplicates, and a cheaper count of
the table is a different number. Below Android 12 the launcher shows the app
icon as the widget preview (previews from layouts are API 31+), and the
tallest layout is chosen from the widget's minimum height. Widget presses on
MIUI and a launcher other than Pixel's are verified on the emulators only.
