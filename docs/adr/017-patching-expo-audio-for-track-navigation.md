# 017 — Patching expo-audio so a Bluetooth remote can change tracks

**Status:** accepted
**Date:** 2026-08-04

## Context

Play and pause worked from a Bluetooth remote. Next and previous did nothing.

The cause is in expo-audio, and it is deliberate. `AudioMediaSessionCallback`
removes four commands from everything that connects to the session:

```kotlin
// Remove track navigation commands
.remove(Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM)
.remove(Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM)
.remove(Player.COMMAND_SEEK_TO_PREVIOUS)
.remove(Player.COMMAND_SEEK_TO_NEXT)
```

That is reasonable for the library. Its player holds exactly one media item and
knows nothing about a queue, so there is no next track for it to seek to. Ours
is in JavaScript, in `AudioEngine`, where shuffle, repeat and the play/skip rule
all live — and `docs/adr/009` records why the queue is not going to move into
the engine library.

`AudioPlaylist`, expo-audio's own queue type, is not the way out. It has no
`setActiveForLockScreen`: adopting it would trade a working notification,
lock-screen controls and background playback past three minutes for track
navigation. That is a worse app.

Confirmed against the framework rather than assumed. With the session live,
`dumpsys media_session` reported `actions=7339979` — no `ACTION_SKIP_TO_NEXT`
(32) and no `ACTION_SKIP_TO_PREVIOUS` (16) — and `cmd media_session dispatch
next` left the track playing.

## Decision

Patch expo-audio, with `patch-package`, in three small places:

1. **`AudioMediaSessionCallback`** keeps the four commands instead of removing
   them, and overrides `onPlayerCommandRequest` to announce a skip as a
   broadcast and then refuse the command. Nothing is executed against the
   player: it is told the app will handle this.
2. **`MetadataInjectingPlayer`** reports the commands as available. Three
   overrides are needed rather than one — `getAvailableCommands`,
   `isCommandAvailable`, and `hasNextMediaItem`/`hasPreviousMediaItem` —
   because `ForwardingPlayer` answers `isCommandAvailable` from the player it
   wraps rather than from `getAvailableCommands`, and the legacy `PlaybackState`
   that Bluetooth reads takes its skip bits from the timeline as well as from
   the commands. Overriding only the first left the request never arriving.
3. **`AudioControlsService`** hands the callback a `Context` to broadcast with.

The broadcast is received by `modules/audio-focus`, which already turns
`ACTION_AUDIO_BECOMING_NOISY` into an event for the same reason, and becomes
`onMediaSkip`. `AudioEngine` treats it as an explicit press: `advance(true)` or
`previous()`, so the ten-second rule and the play/skip rule behave exactly as
they do for the buttons on screen.

`package.json` also gains an autolinking option:

```json
"expo": { "autolinking": { "android": { "buildFromSource": ["expo-audio"] } } }
```

Without it the patch is invisible. Expo ships expo-audio as a precompiled AAR
in `node_modules/expo-audio/local-maven-repo`, so its Kotlin is never handed to
the compiler and editing it changes nothing — the first build after patching
produced a byte-identical session and cost an hour to explain.

## Consequences

- **A third-party patch to maintain.** It is pinned to `expo-audio@57.0.3` by
  filename; a version bump makes `patch-package` fail loudly rather than
  silently drop the fix, which is the behaviour worth having.
- **expo-audio now compiles from source**, which costs about 40 seconds of
  build time and removes a prebuilt artifact from the dependency chain.
- **Two commands are advertised that the session player cannot perform.** They
  are always intercepted before reaching it, and a controller that sends one
  gets `RESULT_ERROR_NOT_SUPPORTED` — the same answer as before the patch —
  after the app has been told to move.
- Verified on the Pixel_7 AVD: `cmd media_session dispatch next` and
  `previous` both move through the queue, and `pause` still pauses. That is the
  same media-key path a Bluetooth remote's buttons take. The legacy action bits
  are worth re-checking on hardware; a car head unit that greys its buttons out
  from `PlaybackState.actions` is the case this cannot prove on an emulator.
