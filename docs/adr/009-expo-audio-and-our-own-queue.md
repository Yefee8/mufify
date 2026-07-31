# 009 — expo-audio, behind our own queue

## Context

`docs/01-TECH-STACK.md` §2.1 already chose the engine and the reasoning has not
changed: RNTP v4 is frozen and predates the New Architecture that SDK 55+
requires; RNTP v5 is commercially licensed and this app ships MIT. `expo-audio`
is MIT, first-party, and sits on Media3/ExoPlayer, which is where native FLAC,
ALAC, Opus and WAV support comes from.

Two things still had to be decided when writing the engine.

**Whether to use `AudioPlaylist`.** expo-audio ships a playlist object that
manages a queue itself. Handing it the queue would be less code today.

**How much of expo-audio may leak.** `AGENTS.md` rule 2 says only
`src/services/audio/*` may import the playback library, and the tech stack doc
calls that non-negotiable, naming `react-native-audio-pro` and RNTP v5 as
fallbacks if expo-audio cannot do gapless or Android Auto.

## Decision

**Use `expo-audio`, but keep the queue.**

A single `AudioPlayer` plays one track at a time and `replace()` swaps the
source when the track changes. The queue — order, index, repeat — is ours, in
`src/services/audio/queue.ts`, as pure functions.

The reason is the shuffle requirement. This app promises *multiple* shuffle
algorithms, including one that balances artists across the queue. Those operate
on queue order, so the queue has to be a data structure we can reorder,
inspect and unit test, not state inside a native object. Writing those
algorithms against `AudioPlaylist` would mean either fighting its ordering or
rebuilding it on every shuffle change.

It also keeps the surface we depend on small. Swapping the engine now means
reimplementing play, pause, seek, replace and lock-screen metadata — roughly a
dozen calls — rather than also reproducing another library's queue semantics.

`queue.ts` has no imports at all beyond a type. Every case that is easy to get
wrong — the last track under each repeat mode, previous at the start,
repeat-one meeting an explicit skip — is a unit test that runs on a laptop.

**Repeat-one does not defeat the skip button.** A track that ends under
repeat-one repeats; a track the user skips advances. Same mode, different
input, and treating them identically makes the button look broken.

**The three-second rule lives in the engine, not the queue.** Pressing previous
more than three seconds in restarts the current track. That needs the playback
position, which the queue does not have and should not.

## Consequences

**Gapless is out of scope for v1**, confirmed rather than discovered: it was
already removed from Settings because expo-audio has no equivalent, and a
setting that does nothing is a lie. Two tracks played back to back will have a
gap. If that becomes unacceptable it is an engine swap, which is what this
boundary exists to make survivable.

`setActiveForLockScreen` is mandatory, not decorative. It is what promotes the
session to a foreground media service; without it Android stops background
audio after roughly three minutes. The tech stack doc flags this as the single
Android gotcha of the library and the engine calls it on every track load.

`interruptionMode: 'doNotMix'` is likewise required for the lock-screen
controls to bind, and is the behaviour we want anyway — a music player that
keeps going underneath a podcast is nobody's idea of correct.

**The library brought two permissions the app must not ship.** `expo-audio`'s
plugin declares `RECORD_AUDIO`, and Expo's base template declares `INTERNET`.
Both contradict "No network. No accounts. No telemetry.", which `AGENTS.md`
calls the reason the app exists, and a Play Store listing shows the permission
list whatever the code does. `RECORD_AUDIO` is removed with the plugin's own
`recordAudioAndroid: false`. `INTERNET` cannot simply be blocked, because a
debug build reaches Metro over HTTP, so `plugins/withOfflineOnly.js` blocks it
in the main manifest and adds it back to the debug one. Release builds ship
with no network permission at all; development still works.

Verified by generating both merged manifests: the debug one carries `INTERNET`
and no `RECORD_AUDIO`, the release one carries neither.

`ACCESS_NETWORK_STATE` survives, from a transitive dependency. It is left
alone deliberately: it grants no network access — without `INTERNET` nothing
can open a socket regardless — it is a normal rather than a dangerous
permission so it does not surface in the Play Store's permission list, and
removing it risks a `SecurityException` inside whichever library queries
`ConnectivityManager`. Blocking a harmless permission is not worth crashing on.
