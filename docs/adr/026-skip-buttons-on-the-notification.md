# 026 — Previous and next on the notification, and a session that declares no custom buttons

**Status:** accepted · extends [ADR 017](017-patching-expo-audio-for-track-navigation.md)
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

### Why not a custom notification layout

Asked for, and not done. Android 13 and later render media notifications from
the session alone — a custom `RemoteViews` is ignored. On Android 12 and below
a custom layout is possible and every vendor draws the media template its own
way, MIUI included, so a bespoke layout is the version most likely to look
wrong on exactly the phone that reported this. What the app controls is what
it now controls: which buttons, in which order, the icons on old Android, the
text and the artwork.

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
