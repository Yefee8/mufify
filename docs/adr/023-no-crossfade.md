# 023 — No crossfade, and no fade either

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
- **Gapless** needs ExoPlayer's own playlist, so the next item is prepared while
  the current one plays. `expo-audio` does not expose it. It could be added to
  the existing patch — but then ExoPlayer advances by itself, and the queue,
  shuffle, statistics and lock-screen metadata are all currently driven by the
  engine deciding when a track changes.

The blocking issue for both is what else that one player carries:

- the **media session**, and `setActiveForLockScreen` on an already-active
  player *releases* the session and rebuilds it on the main queue. A state
  change landing in that window is drawn against a released session and never
  corrected — the notification bug that shipped once already, and the reason
  `bindLockScreen` is called once and then updated in place.
- the **statistics cycle**, which opens and closes against one stream of status
  events.
- the **equaliser's audio session**, which is per player.

## Decision

**Neither ships. There is no crossfade, and there is no fade at the seam.**

A ramp *was* built and released in 1.4.0: the end of one track faded down, the
start of the next faded up, on the single player, with a duration in Settings.
It was honest about not being a crossfade, and it addressed the half of the
complaint that is audible as a *fault* — a track stopping dead and the next
starting at full level.

It was removed in 1.3.1 at the user's request: *if that is all it can be, do not
have it*. The reasoning is theirs to make and it is a reasonable one. A setting
that offers something adjacent to what somebody asked for is a setting they have
to read the fine print on every time they see it, and the gap it was dressing up
is still there either way.

So the seam is what it was: about 290ms, unfaded. That is the honest state of
the feature, and there is no control implying otherwise.

## Consequences

- Tracks do not overlap and do not fade. `AudioEngine` has no volume ramp, no
  fade timer and no setting behind it — the transition path is exactly what it
  was before 1.4.0.
- `src/services/audio/fade.ts` and its tests are gone rather than left dormant.
  Dead code behind a removed setting is the kind that gets re-enabled by
  accident two rounds later.

## What a real crossfade would take

Recorded so the next person does not re-derive it:

1. A second `AudioPlayer`, with the engine tracking which is primary.
2. The media session following the primary — one `setActiveForLockScreen` per
   track, the exact call whose release/rebuild window caused the notification
   bug. It needs a way to *move* a session without releasing it, which
   expo-audio does not expose.
3. Statistics reading from whichever player owns the current track, with the
   overlap attributed to the outgoing one.
4. The equaliser attached to both sessions, or the overlap is unequalised.
5. Device verification of playback, the notification, Bluetooth transport and
   statistics — none of which can be driven from `adb` on MIUI, where
   `adb shell input` is blocked.

That is a change to the engine's shape, not an addition to it.
