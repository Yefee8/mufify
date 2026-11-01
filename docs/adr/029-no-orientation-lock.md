# 029 — No orientation lock

**Status:** accepted
**Date:** 2026-11-01

## Context

`app.json` carried `"orientation": "portrait"` from the first commit, which
prebuild writes into the manifest as:

```xml
<activity android:name="dev.mufify.app.MainActivity" android:screenOrientation="portrait" …>
```

Google Play now reports that back as a large-screen problem, and from Android 16
the platform **ignores** it on large screens anyway: the window is resized
regardless and an app that assumed otherwise is simply wrong on screen rather
than portrait. So the lock stops being a guarantee and becomes only a signal
that the layouts were never checked.

Some of it had been checked by accident. The app is built out of flex rows and
FlashLists, `artworkSize.ts` already bounds the Now Playing cover by both axes,
and `Sheet` takes its travel from `useWindowDimensions`, which re-renders on
rotation. Four things were genuinely pinned to a portrait window:

- **The card grid.** `const COLUMNS = 2` meant each album cover was half the
  *long* edge in landscape — taller than the screen it was on, one album per
  scroll.
- **The cover cropper.** `aspect-square w-full` put a square the width of a
  landscape window on screen, which ran off the bottom and took the Cancel and
  Use buttons with it.
- **Every horizontal inset in the app, because there were none.** With
  three-button navigation the bar is at the bottom in portrait and a *column
  down one side* in landscape. `Screen` reserved `['top']`, sheets reserved
  `insets.bottom`, and nothing reserved left or right — so titles, list rows and
  the last action in every sheet went under the navigation bar the moment the
  lock came off.
- **Every screen's header, which is the one that mattered.** Each screen stacks
  controls above a list: title, count, scan buttons, the view switch, the search
  box, play and shuffle. That is 400 to 500 points of header, and a landscape
  phone is about 411 points tall. Turned sideways, the library showed its
  controls and roughly thirty points of list — a screen where nothing was broken
  and nothing could be done. Measured on a Pixel 7 emulator before this change,
  not assumed.

## Decision

**Drop the lock and support being resized, without a second layout.**

`"orientation": "default"` rather than deleting the key: the Expo Android
template bakes `portrait` into the manifest, and an absent key leaves the
template's value in place.

- `useCardColumns` derives the grid's column count from the window — two on a
  portrait phone, up to five on a tablet. The grid *and its skeleton* read the
  same hook, because two components rendering the same layout from two counts is
  a shelf that reflows the instant real data lands.
- `panelInset` returns bottom *and* horizontal padding together, so a sheet
  cannot reserve one edge and forget the other.
- Every full-screen frame reserves `left` and `right` as well. They are zero in
  portrait, which is exactly why they were easy to miss.

**A short window puts the header beside the list instead of above it.**
`ShortWindowSplit` wraps the four screens that stack a header on a list; under
520 points of height, and only when there is 600 points of width to spend, the
header becomes a scrollable column two fifths wide and the list takes the full
height. Above that threshold it renders its children exactly as before, so the
layout the app was designed in is byte-for-byte untouched. The test is the
window rather than the orientation, because a phone in split-screen is short for
the same reason and wants the same answer. `Screen` shrinks its title under the
same rule.

**No tablet layout.** No master-detail, no two-pane Now Playing. A tablet is not
short, so it stacks exactly like a phone and gets more grid columns instead.
That is the whole adaptation. A second full layout is a second set of empty,
loading and error states to keep honest, and this is a phone app that must not
break when someone turns their phone.

The activity still declares `orientation|screenSize|screenLayout` in
`configChanges` — from the template, unchanged — so rotation resizes the window
instead of recreating the activity. Playback, scroll position and the open sheet
all survive a rotation; losing the queue sheet on every turn would have been a
worse bug than the one this fixes.

## Consequences

Rotation is now a supported state, which means it is a state every new screen
has to be checked in — the same standing cost as empty, loading and error. The
check is cheap: `adb shell settings put system user_rotation 1` on an emulator
with accelerometer rotation off.

Verified on an Android 15 emulator, portrait and landscape, with three-button
navigation forced on: library, album and artist grids, a collection, playlists
and a playlist, the add-tracks sheet, the cover cropper, stats, settings, the
preset picker, Now Playing, and the queue. Nothing clipped, nothing under the
navigation bar, and no reflow between skeleton and content.

What this does **not** fix is the deprecated edge-to-edge warning Play reports
alongside it: `Window.setStatusBarColor` and friends are called from inside
React Native's own `StatusBarModule` and `WindowUtilKt.enableEdgeToEdge`, and
from Material's `BottomSheetDialog`. No app code reaches them, so no app change
removes them — they go when React Native 0.87+ and a newer Material land, which
on Expo SDK 57 is not a choice this project gets to make. Same for Play's "AGP
9.0 or later": SDK 57 pins 8.12.0.
