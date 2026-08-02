# 015 — No favourite button in the media notification, for now

## Context

The brief asks for a working favourite button in Android's system media
notification: pressing it should write `track_stats.is_favorite` and the icon
should reflect the real state. On Android this is a MediaSession custom action —
`PlaybackStateCompat.CustomAction` on the old API, a `CommandButton` with a
`SessionCommand` in the custom layout on Media3.

The app cannot reach either. `expo-audio` owns the MediaSession, and it does not
expose one.

What it does expose, in full: `setActiveForLockScreen(active, metadata,
options)`, `updateLockScreenMetadata(metadata)`, and
`clearLockScreenControls()`. `AudioMetadata` is `{ title, artist, albumTitle,
artworkUrl }`. `AudioLockScreenOptions` is `{ showSeekForward, showSeekBackward,
isLiveStream }`. There is no custom-action field, no command callback, and no
event a JS listener could receive a button press on.

Inside the library, `AudioControlsService` builds the notification and calls
`session.setCustomLayout(...)` with a fixed list — seek back, play/pause, seek
forward. `mediaSession` is a private field of that service. On API 29, which is
the device this was reported on, the notification is assembled from explicit
`NotificationCompat.Action`s in the same private method.

Four routes were considered.

**A local Expo module, as `modules/audio-focus` already does.** This is the
project's established way to add a native capability without breaking the audio
boundary, and it does not work here. A second module can bind to
`AudioControlsService` — it exports a binder — but a custom action has to be
added by the session's *owner*. A `MediaController` connected from outside can
send commands, not publish buttons. Reaching `mediaSession` through the binder
means reflection into a private Kotlin field in the notification path of a music
player, which is not something to ship.

**A second MediaSession of our own.** Two sessions means Android picks one for
the notification and the media buttons, and the loser's controls silently do
nothing. Strictly worse than no button.

**Patching `expo-audio`.** Roughly a hundred lines of Kotlin across
`AudioControlsService` and `AudioMediaSessionCallback`, plus a new event to JS,
re-applied on every install and silently broken by the next SDK bump. In a
project whose `docs/adr/009` records that the engine may have to be replaced
outright, a private fork of it is the wrong direction.

**Replacing the engine.** `react-native-audio-pro` and RNTP v5 are already named
in `docs/01-TECH-STACK.md` §2.1 as the fallbacks, and both support custom
actions. This is a real answer to a much larger question than one button.

## Decision

**Ship the notification without a favourite button, and say so.**

The rest of the metadata is delivered: title, artist, album, and artwork — with
the app's own music-note placeholder unpacked to a file and handed over when a
track has no cover, so the notification and the app show one mark rather than
two that nearly match.

The button is deferred to whenever the engine question is reopened. It is
recorded here rather than in a backlog because the next person to try it will
otherwise spend the same afternoon discovering that `AudioLockScreenOptions` has
three fields.

## Consequences

Favouriting stays a thing you do in the app. Every other transport control the
notification offers works, and the seek buttons that were already configured are
untouched.

If `expo-audio` grows a custom-action API this becomes a small change on our
side, because the metadata push already goes through one place —
`AudioEngine.bindLockScreen`.

This is the second capability the engine choice has cost, after the ones ADR 009
already weighed. A third should probably force the swap rather than another ADR.

## References

- `docs/adr/009-expo-audio-and-our-own-queue.md` — why this engine, and the
  named fallbacks.
- `src/services/audio/AudioEngine.ts` — `bindLockScreen`, the one place
  metadata is pushed.
- `src/services/audio/notificationArtwork.ts` — the placeholder.
