# 040 — What was playing survives a restart

**Status:** accepted
**Date:** 2026-11-16

## Context

"Now Playing disappears when I open a playlist — it should always be there
once a song has been played or paused." On the emulators (Android 10 and 15)
the mini player stayed on every screen, including a playlist; in code it hides
for exactly one reason, an idle engine, and nothing on the way into a playlist
makes the engine idle. What does is the end of the process. The queue lived
only in memory, and MIUI reclaims backgrounded apps aggressively: come back
to the app — into a playlist, say — and the process is new, the queue empty,
the strip gone. A swipe out of recents (ADR 020) and a reboot did the same.

## Decision

**The session is data, so it lives in SQLite**: one row in
`playback_session` — the queue and the unshuffled order as track ids, the
current index, the position, shuffle, repeat and the queue's source. The queue
is written a second after it settles; the position on every pause, every ten
seconds while playing, and when the app goes to the background — the last
moment before the system may end it unannounced.

**On launch it comes back paused**, rebuilt from the tracks that still exist
(`rebuildSession`, tested: deleted tracks dropped, a vanished current track
replaced by the next survivor from its start). The engine shows it without
opening anything — opening the file would claim audio focus and interrupt
whatever the user is listening to elsewhere — and the first play opens it,
seeks to the saved position, then starts, so no half-second of the wrong place
is heard. A seek before that is remembered for it.

**Only clearing the queue forgets it.** Stopping does not: swiping the app
away ends playback, and the song should still be there to resume.

## Consequences

Verified on the Android 15 emulator: an album playing at 32 s, the process
killed with `am force-stop`, relaunched — the strip shows the same track,
paused, its progress where it was; play resumes at 33 s. The device-only case
(MIUI's own killing) is the same path. If the strip still vanishes on the
Mi 9T *without* the process ending, that is a different fault, and the
emulators do not show it.
