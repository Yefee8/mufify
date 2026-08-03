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

The ten-second rule — previous restarts the track rather than going back,
at or beyond 10 seconds — lives in the engine instead, because it needs the
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

### Claim the session once, then update it

`setActiveForLockScreen` is called on the **first** track only. Every track
after it goes through `updateLockScreenMetadata`.

The difference is not cosmetic. Inside expo-audio, calling
`setActiveForLockScreen` on a player that is already active does not refresh
anything — it releases the MediaSession and builds a new one on the main queue.
Between those two there is a window with no live session, and the notification's
play/pause icon is drawn from `session.player.isPlaying` at the moment it is
posted. A state change landing in that window is drawn against a released
session and never corrected, which is how the notification came to show
"playing" for audio that had stopped.

It also explains the entry below about `dumpsys media_session` reporting
`state=NONE` with a stale title: the dump was catching the swap, and the swap
happened on every single track change.

`updateLockScreenMetadata` changes metadata on the live session and re-posts the
notification, with no release and no window.

### What the notification shows

Title, artist, album, and artwork. A track with no cover gets the app's own
music-note placeholder — `src/services/audio/notificationArtwork.ts` unpacks it
from the bundle to a `file://` path, because the service loads artwork through
`java.net.URL(...).openConnection()`, which knows nothing about `asset://` or a
Metro URL.

A track with no artist or album shows the same words the app shows —
"Bilinmeyen sanatçı", not a blank line. The engine cannot call `t()`, so the
strings are handed to it at startup by `app/_layout` and re-handed on a language
change; `AudioEngine.setMetadataFallbacks` is the whole mechanism.

**There is no favourite button, and there cannot be one through this engine.**
`AudioLockScreenOptions` has three fields and none of them is a custom action;
the MediaSession is a private field of expo-audio's own service. The options
and the reasoning are in `docs/adr/015`.

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
| Track plays from the library list | verified, Pixel_7 AVD, API 35 |
| Mini player and Now Playing transport | verified on the AVD |
| Auto-advance at end of track | verified — 12 consecutive tracks, indexes 5→16 of a 528-track queue |
| Background playback past the 3-minute cliff | verified — app backgrounded, still playing at 3:30, `isForeground=true` with `types=0x2` |
| Media-button controls driving the engine | verified — `KEYCODE_MEDIA_PAUSE`/`PLAY` moved the session PLAYING→PAUSED→PLAYING |
| Listen recording | verified — 27 `play_events`, 15 `track_stats` rows, correctly classified |
| Becoming-noisy receiver registered | verified — `dumpsys activity broadcasts` lists the filter under this package |
| Notification metadata | verified on the AVD through `dumpsys notification` — title, artist, album and a `largeIcon` bitmap |
| Notification play/pause staying in step | **verified by hand on the Mi 9T**, 2026-08-03, including the interruptions below |
| Actual headphone unplug pausing playback | **verified by hand on the Mi 9T** — it cannot be automated, the broadcast is protected |
| Pause on an incoming call | **verified by hand on the Mi 9T** — needs a real call, so it needs a person |
| Lock screen surface itself | verified by hand on the Mi 9T — the controls are drawn and respond |

The background-playback result is the important one: the tech stack doc warns
that Android stops background audio after roughly three minutes without
`setActiveForLockScreen`, and sampling every 30 seconds showed playback
continuing straight through that mark.

The last three sat unverified for a long time for a good reason: they cannot be
faked. `adb` cannot send `ACTION_AUDIO_BECOMING_NOISY` because it is a protected
broadcast, there is no call to receive, and nothing can look at a locked screen
on your behalf. The receiver being registered proves the wiring, not the
behaviour.

They were closed on 2026-08-03 the only way they could be — a person with the
phone in their hand. Worth remembering the next time something here looks
unverifiable: some of it is, and the answer is to ask rather than to keep
building automation around it.

## A note on diagnosing playback

`dumpsys media_session` lies about this app. It reported `state=NONE` with a
stale track title while playback was in fact advancing correctly, because
`setActiveForLockScreen` rebuilds the session on every track change and the
dump catches it mid-swap. It cost an hour of chasing a bug that was not there.

The engine's own status stream is the reliable evidence. `dumpsys` is good for
answering "is a foreground service running" and "did a media button arrive",
and bad for "what is playing right now".
