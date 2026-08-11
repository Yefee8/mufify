# 020 — Swiping the app away ends the process

**Status:** accepted
**Date:** 2026-08-11

## Context

Closed testers reported that Mufify would not stop. Swiping it out of recents
left the media notification playing, the process alive with no activity behind
it, and the next launch staring at a blank screen. Only **force stop**, from
system settings, cleared it.

Every part of that is the documented behaviour of the pieces involved. A
`MediaSessionService` is *designed* to outlive its task — that is how a music
app keeps playing while you use another one — and Android's default for a
started service is `stopWithTask="false"`. React Native then keeps threads of
its own, so the process stays up after the activity is gone, and the next
launch attaches a new activity to a runtime whose host has been torn down.

The distinction that matters, and the one the feedback was explicit about:

- **Backgrounding must not change.** Another app in front, or the screen off,
  keeps the task. Playback continues. This is the whole point of the service.
- **Removing the task must end everything.** The user has thrown the app away.

Statistics are the other constraint. A listen is written when it *ends* — a
track change, or a stop. Killing the process at the moment of a swipe would
lose whatever was playing, which is the one case where the old, broken
behaviour did better: the app stayed up, the track finished, the row got
written.

## Decision

`AudioControlsService.onTaskRemoved` — added in `patches/expo-audio`, three
lines — broadcasts to the app. `modules/app-lifecycle` receives it, raises an
event, and can end the process.

The shutdown itself is in JavaScript, in `services/lifecycle/shutdown`, and the
order is the reason it lives there rather than in Kotlin:

1. `AudioEngine.stop()`, which ends the listen in progress and hands it to the
   recorder exactly as finishing a track would.
2. `pendingListenWrites()`, awaited. Recording is fire-and-forget everywhere
   else — a statistics row must never sit between one track and the next — and
   this is the one moment where the write is the last thing that will ever
   happen, so it is worth waiting for.
3. `quit()`, which kills the process. Stopping the service is not enough; it is
   React Native's own threads that were still up on the next launch.

Two details were found by measurement rather than reasoning, and both are why
an obvious implementation of this does nothing:

- **The receiver is registered for the module's life, not for as long as
  JavaScript is listening.** `OnStartObserving` looks correct and is wrong:
  removing the task destroys the activity, React unmounts its tree, and the
  subscription's cleanup pulls the receiver down a moment before the broadcast
  arrives. The service logged `onTaskRemoved` and nothing received it.
- **The JavaScript handler is installed at module scope**, not from an effect,
  for the same reason. The process outlives the tree — that is the bug — so the
  handler has to outlive it too.

A native fallback ends the process ~2.5s after the broadcast regardless, so a
runtime too wedged to reach step three still shuts down. It simply may not have
written that last row.

## Consequences

- **Background playback is untouched**, and so is everything that writes
  statistics. Verified on the emulator: pressing home keeps the session
  `PLAYING`; swiping the task away leaves no process, no media session and no
  notification; relaunching opens a normal library screen.
- **The last listen is now written**, which the previous behaviour only managed
  if the track happened to finish. Verified end to end: a track swiped away
  mid-play took the year's count from 116 to 117.
- **Killing the process is blunt**, and deliberately so. Anything gentler
  leaves the runtime that produced the blank screen alive.
- One more hunk in the `expo-audio` patch, which is a maintenance cost already
  accepted in `docs/adr/017` and `019`.
