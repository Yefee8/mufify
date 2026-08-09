# 018 — Lyrics are read per track, not stored

**Status:** accepted
**Date:** 2026-08-09

## Context

Files carry their own lyrics. FLAC keeps them in a Vorbis comment — `LYRICS`,
`UNSYNCEDLYRICS`, or `SYNCEDLYRICS` holding an LRC with a timestamp per line —
and MP3 keeps them in an ID3 `USLT` frame. `MediaMetadataRetriever`, which
`TagReader` uses for everything else, exposes a fixed set of keys and none of
them is lyrics, so a file with a full LRC in it reads as having none.

The obvious place to put them is the database, beside the other tags the
scanner writes. That is the wrong place:

- A lyric is kilobytes of text. Ten thousand tracks is tens of megabytes of
  SQLite to answer a question the player asks about **one** track at a time.
- The scanner already opens every file once, and the point of `docs/adr/004` is
  that this pass is the expensive one. Parsing a second container format inside
  it makes the slowest thing in the app slower for a screen most people open
  rarely.
- Lyrics change when someone re-tags a file. Stored, they would need a
  reconciliation path of their own; read on demand, a re-tagged file is simply
  correct the next time it plays.

## Decision

`LyricsReader` parses the container directly, and `AudioTagsModule.readLyrics`
answers for one URI at a time. Only the metadata at the head of the file is
read — a few kilobytes, before the audio — so the cost is a file open, and the
cost is paid when a track becomes current rather than when a library is
scanned. The FLAC picture block, usually the largest thing in the file, is
skipped rather than read.

Nothing is written to the database. `useLyrics` keeps a bounded in-memory cache
so that flipping between the artwork and the words, or coming back to a track
later in the queue, does not open the file again.

Parsing the LRC is JavaScript, in `services/lyrics/parseLyrics`, and is the
only thing that decides whether a lyric is timed. A file counts as timed when
*most* of its lines carry a stamp, so a stray credit line does not turn a synced
lyric into a wall of text and a single `[00:00]` at the top of a plain one does
not promise a sync that never arrives.

## Consequences

- **One file open per track**, on the thread pool, when the track becomes
  current. Not measurable next to opening the audio itself.
- **FLAC and MP3 only.** Ogg, Opus and M4A carry lyrics too and answer null
  here; the reader dispatches on the container's first bytes, so adding one is
  a function rather than a redesign.
- **The button exists only when the file has words.** A lyrics affordance that
  opens an empty screen for most of a library is worse than no affordance, and
  read-on-demand is what makes the button's presence an honest signal.
- Timed lyrics follow a clock rather than the engine's 500ms status interval —
  see `useSmoothPosition`. A line landing up to half a second late, and by a
  different amount each time, is the difference between a lyric that reads as
  synced and one that reads as broken.
- **Android Auto shows none of this.** Its media template renders title, artist
  and artwork from the `MediaSession` and has no surface for lyrics, so this is
  an in-app feature. CarPlay does not apply at all: this app is Android-only.
