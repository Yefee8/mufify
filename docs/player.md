# Player

How audio gets from a file to a speaker, and what stays true while it does.

---

## The boundary

`src/services/audio/AudioEngine.ts` is the only file in the app that imports
`expo-audio`. ESLint enforces it — `AUDIO_BOUNDARY` in `eslint.config.js`
forbids the import everywhere else, and the rule is relaxed for exactly one
directory.

This is not tidiness. The engine may have to be replaced: `docs/adr/009` and
`docs/01-TECH-STACK.md` §2.1 record why expo-audio was chosen over both RNTP
versions, and name the fallbacks if it cannot do gapless or Android Auto.
Everything above the boundary speaks `PlayableTrack` and `PlaybackState`, which
are ours. A swap rewrites one file.

## Why a singleton, not a hook

Playback outlives every screen — that is what background audio *means*. A hook
owning the player would tear it down when the user opens Settings.

So `AudioEngine` is a module-level instance with a `subscribe` method, and
React reads it through `useSyncExternalStore` in
`src/features/player/hooks/usePlayback.ts`. That hook is the supported way for
UI to learn about playback; it also gets tearing right during concurrent
renders, which a hand-rolled `useState` + `useEffect` subscription does not.

## The queue is ours

expo-audio ships an `AudioPlaylist`. We do not use it. `src/services/audio/queue.ts`
holds order, index and repeat as pure functions over a plain array.

The reason is shuffle: this app promises several shuffle algorithms, one of
which spaces artists across the queue. That is an operation on queue order, so
the queue must be a data structure we can reorder and test on a laptop, not
state inside a native object.

Everything easy to get wrong lives there and is unit tested:

- the last track under each repeat mode
- previous at the start of the queue
- **repeat-one meeting an explicit skip** — a track that *ends* under repeat-one
  repeats, a track the user *skips* advances. Same mode, different input.
  Treating them the same makes the skip button look broken.

The three-second rule — previous restarts the track rather than going back,
once you are far enough in — lives in the engine instead, because it needs the
playback position and the queue does not have one.

## Two Android requirements that are not optional

**`setActiveForLockScreen`.** Called on every track load. It is what promotes
the audio session to a foreground media service; without it Android stops
background playback after roughly three minutes. It is easy to read as "draws
the lock screen controls" and skip. It is not.

**`interruptionMode: 'doNotMix'`.** Set once in `configure()`. The lock-screen
controls do not bind correctly without exclusive audio focus. It is also the
right behaviour: a music player that keeps playing under a podcast is not what
anyone wants.

`stop()` clears the lock screen controls. A notification with dead transport
buttons is worse than no notification, and Android will happily keep showing
one for a player that has gone away.

## States

`PlaybackState.phase` is `idle | loading | playing | paused | error`.

`loading` is separate from `playing` on purpose: a FLAC on a slow card takes
long enough to open that the UI has to say something, and showing a pause
button for audio that has not started is a lie. The play/pause control is
disabled while loading.

`durationMs` prefers what the engine reports over what the scanner stored. The
scanner's figure comes from MediaStore and is occasionally wrong; the engine's
is authoritative once the file is open. Before that, the scanner's is the
better guess than zero.

## Permissions the player must not add

`expo-audio`'s config plugin declares `RECORD_AUDIO` and Expo's template
declares `INTERNET`. Both contradict the app's core promise, and a Play Store
listing shows permissions whatever the code does.

- `RECORD_AUDIO` — removed with the plugin's own `recordAudioAndroid: false`.
- `INTERNET` — blocked in the main manifest, added back to the *debug* manifest
  by `plugins/withOfflineOnly.js`, because a debug build reaches Metro over
  HTTP. Release builds ship with no network permission.

If a future dependency reintroduces either, that is a bug, not a detail.

## What is verified, and what is not

See the table in `docs/scanner.md` for the scanner's equivalent. For playback:

| Check | Status |
|---|---|
| Queue arithmetic | unit tested, no device |
| Duration formatting | unit tested, including non-ASCII digits |
| Track plays from the library list | verified on the Pixel_7 AVD, API 35 |
| Mini player and Now Playing transport | verified on the AVD |
| **Background playback surviving screen-off for 10+ minutes** | **not verified — needs a physical device** |
| **Lock screen controls driving the engine** | **not verified — needs a physical device** |
| **Audio focus: pause on call, duck on notification, pause on unplug** | **not verified — needs a physical device** |

The last three are the ones that matter most and the ones an emulator cannot
answer. `AGENTS.md` is explicit that anything about audio must be verified on
real hardware, and emulator audio says nothing true about a foreground service
surviving a screen-off.
