# Phase 3 — Audio engine (scope proposal)

> **Status: awaiting approval. No Phase 3 code has been written.**
> This document exists to be argued with. The engine choice in particular is
> not made yet, and making it wrong is expensive to undo.

---

## Where Phase 2 leaves us

`src/services/audio/` does not exist. No playback dependency is installed.
`docs/player.md`, which `AGENTS.md` already cites for the licensing situation,
has not been written. Phase 3 is greenfield, which is the good news: the
`AudioEngine` boundary in `AGENTS.md` rule 2 can be designed rather than
retrofitted.

The project is MIT, so a source-available or commercially-licensed playback
library is disqualified outright — not a preference, a hard constraint from
`AGENTS.md`.

## The decision that gates everything else

**Which engine backs `AudioEngine`.** Three candidates, and I do not think this
should be settled from memory — `AGENTS.md` explicitly warns that the audio
library licensing changed in 2025–2026, and that is exactly the kind of fact
that goes stale. The first task of Phase 3 should be a short written comparison
against current sources, not a choice announced here.

The shape of the trade-off as it stands:

| Option | Why it might win | What worries me |
|---|---|---|
| **`react-native-track-player`** | Purpose-built for this: queue, lock screen, notification, audio focus all included | Licence needs re-checking against the current release; New Architecture status on RN 0.86 needs confirming; a large surface we do not control |
| **`expo-audio`** | First-party, matches the rest of the stack, no native module to maintain | Background playback and lock-screen transport controls are the weak spot — needs proving before adoption, not after |
| **Own Kotlin module over Media3/ExoPlayer** | Apache-2.0, exactly the FLAC / 24-96 / gapless behaviour this app is about, and `modules/audio-tags` is a working precedent | Most work by a distance: `MediaSessionService`, notification, audio focus, becoming-noisy, and the foreground-service lifecycle are all ours to get right |

The audience for this app is people with lossless libraries, which pushes
toward the option with the most control over the output path. That is an
argument, not a conclusion.

## Proposed scope

1. **Engine comparison and choice**, written up as an ADR with the licence
   position checked against current sources. Includes `docs/player.md`.
2. **The `AudioEngine` interface** — the seam everything else codes against:
   load, play, pause, seek, next/previous, queue, position, state. Pure types
   plus an in-memory fake, so hooks and UI are testable without audio.
3. **Playback of a local file end to end**, verified on the Mi 9T with a real
   FLAC — not the emulator, per `AGENTS.md`.
4. **Background playback and the foreground service** — survives screen-off and
   app-backgrounded. This is the item most likely to cost more than expected.
5. **Lock screen and notification transport** — metadata, artwork, and controls
   that actually drive the engine.
6. **Audio focus behaviour** — pause on a call, duck or pause on a notification,
   pause on headphone unplug. Cheap to skip and immediately noticed.
7. **Now-playing UI** with its empty, loading and error states, per the States
   rule.
8. **Play/skip event recording** wired to the existing
   `src/services/stats/playCounting.ts`, which already encodes the counting rule
   and is already tested.

## Explicitly not in Phase 3

Shuffle algorithms, playlists, the statistics screens, gapless playback, and
crossfade. Gapless in particular deserves its own phase — it is an engine-level
concern that will expose whatever the choice above gets wrong, and bundling it
here would hide which decision caused which problem.

## Why this needs a device, continuously

Items 3–6 cannot be verified without hardware, and not incidentally:
`AGENTS.md` states outright that emulator audio proves nothing about 24/96
output, gapless, or a foreground service surviving screen-off. Phase 2 was
mostly provable on a laptop. Phase 3 is not.

There is a second constraint this session established. MIUI blocks
`adb shell input` for this package, so **every** interaction — pressing play,
locking the screen, tapping a notification control — has to be performed by
hand on the phone. Capture (`screencap`, `logcat`, `dumpsys`) is automatable;
input is not. Phase 3 should be scheduled against a block of time when the
device is connected *and* somebody can tap, rather than a window of connection
alone.

## Open questions for you

1. **Engine preference?** If you already lean one way — particularly toward
   owning a Media3 module, given `modules/audio-tags` proved the pattern — say
   so and it saves the comparison a lot of hedging.
2. **Is gapless a v1 promise?** It changes the engine choice materially. If it
   is a must, that argues for Media3 directly.
3. **Scope down to items 1–4 for a first pass?** That would put real playback
   on the device sooner and leave lock screen and focus behaviour to a follow-up
   — at the cost of a phase that is not shippable on its own.
