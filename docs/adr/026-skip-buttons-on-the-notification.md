# 026 — Previous and next on the notification, and a session that declares no custom buttons

**Status:** accepted · extends [ADR 017](017-patching-expo-audio-for-track-navigation.md) · custom layout added for 1.4.6
**Date:** 2026-09-15

## Context

Three reports, one cause and two neighbours:

- The notification has no track buttons. It shows seek back and seek forward
  — ten seconds each way — around play/pause, on every Android version.
- Pause from that notification "does not work" on the user's phone (a Mi 9T,
  Android 10, MIUI). It works on a stock Android 10 emulator, foreground and
  background.
- Next, previous and pause from a Bluetooth remote or a wired headset do
  nothing on that phone. Media key events reach the app on stock Android 10
  and 15, and do what they should.

### The cause

ADR 017 restored the skip commands and had `MetadataInjectingPlayer`
advertise them, so the session's legacy `PlaybackState` — what Bluetooth, the
lock screen and Android's own media controls read — would carry
`ACTION_SKIP_TO_NEXT` and `ACTION_SKIP_TO_PREVIOUS`. On 1.4.4 it did not:
`dumpsys media_session` showed `actions=7339979`, the value ADR 017 recorded
as the *broken* state.

expo-audio 57 calls `setMediaButtonPreferences` with its seek buttons, and
media3 1.9 does this when building the legacy state:

```java
if (!mediaButtonPreferences.isEmpty()
    && !legacyExtras.getBoolean(EXTRAS_KEY_SLOT_RESERVATION_SEEK_TO_NEXT)) {
  actions &= ~PlaybackStateCompat.ACTION_SKIP_TO_NEXT;
}
```

Any custom button at all, and the skip actions are stripped unless a slot
reservation says otherwise. The commands were advertised; the state was
edited afterwards. That is why Android 13+ drew ten-second seek buttons on the
system media controls instead of previous and next, and it is the most likely
reason a vendor Bluetooth stack that consults the actions drops the skips.

### The neighbours

The notification's buttons on Android 12 and below are `PendingIntent`s that
start the service. expo-audio uses `getService`. On stock Android a button on
a notification earns the app a moment of background allowance and the start
goes through; MIUI is known not to grant it, and a plain `startService` from a
backgrounded app is then refused with no visible effect — which is the shape
of "pause does nothing".

And expo-audio asks for `AUDIOFOCUS_GAIN_TRANSIENT` for `doNotMix`. Transient
focus is for a clip: whoever was playing before pauses and *resumes the moment
it is released*. So pausing this app handed the sound back to whatever was
playing before it, on its own.

## Decision

**The engine asks for skip controls; the service then declares no custom
buttons, and the notification on old Android carries previous and next.**

`AudioLockScreenOptions` grows `showSkipControls`. With it set:

- `updateSessionCustomLayout` sets an **empty** custom layout and empty media
  button preferences. Nothing is stripped, the skip actions come straight from
  the player's commands (`actions=7340027`, verified on Android 10 and 15), and
  Android 13+ draws previous, play/pause and next by itself.
- On Android 12 and below the notification's actions are **previous,
  play/pause, next**, all three in the compact view. Previous and next send
  the same `MEDIA_SKIP` broadcast the session callback sends for a remote's
  buttons, so both roads end at `onMediaSkip` in the engine and the ten-second
  rule for "previous" applies to either.
- Every notification button is a **`getForegroundService`** intent. The
  service promotes itself first thing in `onStartCommand`, so the contract
  holds, and a foreground start is allowed where a background `startService`
  is not.
- `doNotMix` requests **`AUDIOFOCUS_GAIN`**. A music player that starts means
  the last one has stopped.

The engine passes `showSeekForward: false, showSeekBackward: false,
showSkipControls: true`. The seek buttons are gone from the notification, as
asked; seeking is on the screen.

### The custom layout, where Android still honours one

Asked for again, as a requirement with a fallback: *if it is not supported,
the standard one is fine*. So it is done exactly that way. With
`customNotification` set, on **Android 12 and below** the notification is the
app's own `RemoteViews` — a rounded cover, title, artist, album, and three
buttons: previous and next in the app's accent, play/pause on a disc of it —
inside `DecoratedMediaCustomViewStyle`, which keeps the system's header and
its recolouring of the compat text styles for a dark or a light notification.
The accent for the skip buttons is chosen from the night mode at build time.
The collapsed view is 48dp, which is what Android 12 gives a collapsed custom
view; taller is clipped there. **Android 13 and later** render media
notifications from the session alone and ignore custom views, so there nothing
changes: the standard controls, with previous and next. That is the fallback,
and it costs nothing to declare, so both are always declared.

Three things had to give way for the layout to be *seen*:

- **No `setLargeIcon` in custom mode.** Android 10's decorated media frame
  reserves its whole right half for the large icon, under a gradient, and laid
  the custom view in what was left — the text at a third of the width and two
  of the three buttons under the gradient. The layout draws the cover itself.
- **No notification actions in custom mode.** The decorated style shows them
  in its frame, so the three buttons appeared twice.
- **No theme attributes in the layouts.** `?android:attr/…` in a `RemoteViews`
  resolves on the far side, against whatever theme SystemUI inflates with, and
  an attribute that does not resolve is a notification that never appears.

The placeholder cover turned out never to have worked in a release build, on
any version: `Asset.fromModule(...).downloadAsync()` has no URL for an
embedded image without expo-updates and resolves to an empty string. The PNG
is three kilobytes and now lives in the source as base64, written to the cache
directory at startup and handed over as a `file://` URL, which is what the
service can load. `notificationArtwork.test.ts` pins the decoder, because a
decoder one bit off is a file `BitmapFactory` refuses without a word.

`RemoteViews` bitmaps travel in the notification's parcel, once per view, and
the parcel has a hard limit of about a megabyte; the cover is rounded and
scaled to 256 pixels square before it goes in.

MIUI draws its own media template on Android 10 and may or may not honour an
app's `RemoteViews`. If it does not, the user sees MIUI's — which is the
fallback they accepted.

## Consequences

- Verified on emulators: the notification shows ⏮ ⏸ ⏭ on Android 10 and each
  button does its job with the app in front and behind the launcher; Android
  15's system controls show previous and next; media key events (what a
  headset or remote produces) pause, resume, skip and go back on both.
- Not verified: MIUI itself. The two changes aimed at it — foreground-service
  intents and the advertised skip actions — are each correct on their own
  terms, and the report on the Mi 9T is the check that remains.
- The patch is regenerated against the pristine 57.0.3 tarball and dry-run
  verified; `scratchpad/mkpatch.sh` is the procedure, and it lives outside the
  repository on purpose — it is a build note, not a build step.
- A statement in ADR 025 is now literally true again: "Bluetooth next and
  previous still arrive through the session callback".
