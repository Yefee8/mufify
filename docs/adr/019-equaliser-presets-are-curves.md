# 019 — The equaliser's presets are curves, and it needs the session id

**Status:** accepted
**Date:** 2026-08-09

## Context

Android's equaliser is `android.media.audiofx.Equalizer`, an effect attached to
one **audio session**. Two things follow, and both shape the design.

**The session id is not reachable.** expo-audio creates the ExoPlayer inside
its own module and never hands it out. Session 0 — the global output mix — is
not a substitute: it has been restricted since Android 9, and an effect
attached to it is accepted and then silently ignored.

**The bands belong to the device.** How many there are, where they sit and how
far they move are all read from the hardware. Five bands at 60Hz, 230Hz, 910Hz,
3.6kHz and 14kHz is what a Pixel reports; it is a convention, not a guarantee.
A preset written as five numbers would land on the wrong frequencies the moment
a device reported three bands or ten.

## Decision

**The session id comes from a patch.** `patches/expo-audio` adds an
`audioSessionId` property, alongside the track-navigation patch from
`docs/adr/017`. Two details are load-bearing and both were found by the app
failing:

- It is read **on the main thread**. ExoPlayer is built with `setLooper(mainLooper)`
  and throws on access from any other, and a module property is read on the JS
  thread. Reading it directly turned every track into a playback error with no
  sound at all.
- It is read **on demand, not captured at construction**. ExoPlayer leaves the
  id unset until its audio renderer is initialised, so a value captured when
  the player is built is always zero.

So `AudioEngine` binds the equaliser from `onStatus`, once something is
actually playing, rather than during `loadIndex` — which also keeps the
main-thread read off the track-transition path that `docs/adr/017`'s sibling
commit spent so long shortening.

**A preset is a curve.** Gains in decibels at named frequencies, sampled onto
whatever bands the device reports, interpolated on a **logarithmic** frequency
axis because hearing is logarithmic — 60Hz to 120Hz is an octave and so is 6kHz
to 12kHz, and interpolating linearly would put almost the whole curve in the
top two bands. Outside a curve's ends the nearest value holds, so a device with
a 31Hz band does not fall off the bottom of a preset that starts at 60.

`custom` is the exception and cannot be a curve: it is what the user dragged,
held per band index. `fitLevels` pads or truncates it when the band count
changes rather than discarding it.

Everything crossing into the platform is millibels, because that is what the
platform takes; everything the screen shows is decibels. One conversion, at one
edge.

## Consequences

- **Off by default.** The first thing a careful listener wants from a lossless
  player is the file as it was mastered.
- **No bands until something has played.** There is no session to attach to
  before then, so the screen says so rather than rendering a dead row of
  sliders. The switch and preset are still stored and are applied the moment a
  session appears.
- **A rebuilt player is a new session**, so the effect is re-attached and the
  settings re-applied on every session change. An effect left on the old
  session is not an error — it is simply no longer in the signal path, which is
  the shape of "the equaliser stopped doing anything after a while".
- The presets are gentle by design, ±6dB at most. A preset that clips the
  output on the first bass note is one people switch off rather than adjust.
- **Failure is silent and total**: no native module, no effect on the device,
  or a throw of any kind, and the app plays music without an equaliser. The
  binding is wrapped in its own guard inside `loadIndex`'s, because an optional
  effect must never be able to stop playback — which it did, once, before that
  guard existed.
- Verified on the Pixel_7 AVD against a live session: five bands, ±15dB, and
  the bass preset landing at +6.0, +2.7, +0.1, 0, 0 dB across them — which is
  the curve, sampled. The arithmetic has its own tests in
  `services/equalizer/curve.test.ts`.
