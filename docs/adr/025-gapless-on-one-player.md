# 025 — Gapless playback, on the one player there is

**Status:** accepted · supersedes the "gapless" half of [ADR 023](023-no-crossfade.md)
**Date:** 2026-09-15

## Context

The gap between two tracks was about 290ms of silence, measured on a Mi 9T.
ADR 023 recorded why, and why neither a crossfade nor gapless playback shipped
then: both appeared to need a second player, and the one player the app has
also carries the media session, the statistics cycle and the equaliser's audio
session. Moving those between two players at every track boundary is the change
that once left the notification drawing a released session.

The gap itself was never about *finding* the next file. It was `replace`:
expo-audio's `setMediaSource` tears the player's timeline down and rebuilds it,
and the silence is the new source being opened and its first buffer filled —
on the main thread, at the exact moment the previous track ended. Preloading
bytes was tried in an earlier round and changed nothing, because the cost was
not the bytes.

ADR 023 named the one-player alternative and set it aside: ExoPlayer's own
playlist, where the next item is prepared while the current one plays. The
objection was that ExoPlayer would then advance on its own, and the queue,
shuffle, statistics and lock-screen metadata are all driven by the engine
deciding when a track changes.

## Decision

**Use ExoPlayer's playlist, one item ahead, on the existing player.** No second
player, and therefore none of what a second player would have moved.

The patch to expo-audio grows two things:

- `setNextSource(source | null)` on the player, which keeps the timeline to
  exactly `[current, next]` — everything before the current item is a track
  that has finished, everything after the next is a guess about a queue that
  JavaScript owns — and adds the next media source so ExoPlayer decodes it
  ahead of time.
- A `trackTransition` field on the status update, sent when ExoPlayer moves to
  the next item **by itself** (`MEDIA_ITEM_TRANSITION_REASON_AUTO`). It is its
  own field and not `didJustFinish`, because they mean different things:
  `didJustFinish` is the player having stopped, answered by a load; a transition
  is the player having already started what comes next, answered by
  bookkeeping.

The engine arms the next track from `emitQueue`, which every queue change
already passes through — set, enqueue, play-next, reshuffle, remove, stop — and
from `setRepeat`, which changes what comes next without touching the queue.
Arming is keyed by **URI**, not by index: play-next inserts at `index + 1`, so
the index the player was armed for stays the same while the track at it does
not.

On a transition the engine does what the `didJustFinish` path did minus the
load: closes the finished listen as completed, moves the index to what was
armed, updates the notification's metadata in place, and arms the track after.
It runs **before** the rewind detector, which would otherwise read the jump
from the end of one file to the start of the next as the same track restarting
and count a listen that never happened. If the queue no longer agrees with what
the player was given — which arming keeps from happening — the engine falls
back to a plain load: one gap, once, and never a track the queue does not hold.

The objection in ADR 023 turned out to be about *degree*. ExoPlayer advances by
itself, but only ever to the one item the engine handed it, and the engine
learns of it on the next status update — so every decision about what plays
stays in JavaScript, and the player is doing what it was told, slightly early.

### What deliberately does not use the armed item

- **A manual skip still reloads.** The armed item is whatever the queue said
  *before* the press, and a press is allowed to mean something else. The user
  asked for exactly this: the seam is for the natural end of a track, not for
  skipping.
- **Repeat-one arms nothing.** That path restarts by seeking, and a second copy
  of the same file in the timeline would double-count the listen.
- **The end of the queue arms nothing**, so the player reaches `STATE_ENDED`
  and `didJustFinish` fires as it always has.

### What stays exactly where it was

The media session is bound once and updated in place, as before. The
statistics cycle reads one stream of status events from one player. The
equaliser is attached to one audio session that never changes. Bluetooth next
and previous still arrive through the session callback, which intercepts the
command before the player sees it and hands it to JavaScript — a second item in
the timeline does not change that, because the callback refuses the command
rather than letting the player execute it.

Audio quality is untouched: the same decoder, the same renderer, the same
output path. For formats that carry gapless metadata (MP3 with LAME headers,
AAC), ExoPlayer trims the encoder padding at the seam; for FLAC and WAV there
is no padding to trim.

## Consequences

- The seam between two tracks that end naturally is handled by ExoPlayer, which
  joins the audio streams itself. No `replace`, no source open, no first buffer
  at the moment of the seam.
- Crossfade is still not offered. It needs two audio streams playing at once,
  which a single ExoPlayer timeline cannot do, and ADR 023's analysis of a
  second player stands.
- The patch is larger. `patches/expo-audio+57.0.3.patch` is regenerated against
  the pristine 57.0.3 tarball and dry-run-verified against a fresh copy; the
  procedure is in this ADR's commit.
- `FakeAudioPlayer` grows `setNextSource` and `transitionToNext`, so the whole
  arming-and-transition path is exercised through the real engine in
  `gapless.test.ts` — including the two ways it could go wrong: a listen
  double-counted at the seam, and a track played that the queue did not hold.
