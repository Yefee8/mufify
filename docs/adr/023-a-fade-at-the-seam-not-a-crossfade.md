# 023 — A fade at the seam, not a crossfade

**Status:** accepted
**Date:** 2026-08-19

## Context

Two requests, one cause: "add a crossfade with a selectable duration", and
"transitions stutter — preload the next track so they are seamless".

Measured on a Mi 9T, the gap between two tracks is about 290ms. Roughly 100ms of
that is expo-audio's own `replace` path, which hops to the main thread and
blocks; the rest is ExoPlayer preparing the new source. Preloading was tried in
an earlier round and changed nothing, because the cost is not in *finding* the
next file.

Both features need something the app does not have: **a second player**.

- A **crossfade** overlaps two tracks. Whichever player starts the incoming
  track must be the one that goes on playing it — there is no way to hand a
  playing track between two decoders without a seek, and two decoders playing
  the same file a few milliseconds apart produce comb filtering, which is worse
  than the gap.
- **Gapless** needs ExoPlayer's own playlist, so that the next item is prepared
  while the current one plays. `expo-audio` does not expose it. It could be
  added to the existing patch — but then ExoPlayer advances by itself, and the
  queue, shuffle, statistics and lock-screen metadata are all currently driven
  by the engine deciding when a track changes.

The blocking issue for both is what else that one player carries:

- the **media session**, and `setActiveForLockScreen` on an already-active
  player *releases* the session and rebuilds it on the main queue. A state
  change landing in that window is drawn against a released session and never
  corrected — this is the notification bug that shipped once already, and the
  reason `bindLockScreen` is called once and then updated in place.
- the **statistics cycle**, which opens and closes against one stream of status
  events.
- the **equaliser's audio session**, which is per player.

## Decision

**Ship a ramp at the seam. Do not ship a dual-player crossfade in this
release, and do not call the ramp a crossfade.**

The ramp fades the end of one track down and the start of the next up, on the
single player, with a duration chosen in Settings (off, 0.5s, 1s, 2s; off by
default). It does not shorten the gap. It addresses the other half of the
complaint, and the half that is actually audible as a *fault*: a track that
stops dead and a track that starts at full level are what make 290ms of silence
read as a stutter rather than as a pause.

The copy in Settings says plainly that the two tracks do not overlap. A feature
labelled as something it is not is worse than an absent one, because the user
stops trusting the labels.

Off is the default. A fade changes what somebody's music sounds like, and this
app's habit is to leave that alone until asked.

Implementation notes that are decisions rather than detail:

- The ramp is **equal-power**, not linear. Loudness goes as the square of
  amplitude, so a linear ramp sounds like it rushes at one end.
- Cancelling a ramp **settles at its target**, never where it stopped. A
  fade-out interrupted by a skip would otherwise leave the *next* track playing
  at a third of its level for its whole length, and the symptom — one quiet song
  after a skip — points nowhere near a fade.
- The fade-out is scheduled from the status tick, not from a timer set at load,
  because a seek moves the end without the track being reloaded.
- It is scheduled a status update **early**. Updates arrive every 500ms; waiting
  for the position to be exactly `duration - fade` misses the window on every
  track whose updates happen to straddle it.
- A manual skip does not fade out. Somebody who pressed next wants it now. The
  fade *in* still applies, which is what removes the click at the start.
- With the setting off, `run` applies the target and returns without a timer, so
  "off" is the code path that shipped before any of this existed.

## Consequences

- Tracks still do not overlap. Anyone who wants a true crossfade does not have
  one.
- The gap is unchanged at ~290ms; it sounds deliberate rather than broken.
- Nothing about the media session, the statistics cycle or the equaliser moved,
  so none of the four features confirmed working in earlier rounds is at risk
  from this change.

## What a real crossfade would take

Recorded so the next person does not re-derive it:

1. A second `AudioPlayer`, with the engine tracking which is primary.
2. The media session following the primary — which means one
   `setActiveForLockScreen` per track, the exact call whose release/rebuild
   window caused the notification bug. It needs a way to *move* a session
   without releasing it, which expo-audio does not currently expose.
3. Statistics reading from whichever player owns the current track, with the
   overlap attributed to the outgoing one.
4. The equaliser attached to both sessions, or the overlap is unequalised.
5. Device verification of playback, the notification, Bluetooth transport and
   statistics — none of which can be driven from `adb` on MIUI, where
   `adb shell input` is blocked.

That is a change to the engine's shape, not an addition to it, and it deserves
its own round rather than the end of one.
