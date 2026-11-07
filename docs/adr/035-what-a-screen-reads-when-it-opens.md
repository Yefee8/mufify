# 035 — What a screen reads when it opens

**Status:** accepted
**Date:** 2026-11-07

## Context

Page transitions on the Mi 9T were reported at half a second to two seconds,
with drawers and tab switches "a pinch slow". The router was not the cause:
expo-router's stack is the native stack, and its Android 10 animation is 200 ms.
What stood between a tap and the page was JavaScript the new screen ran before
it could draw, most of it for things nobody was looking at. Measured as JS-thread
CPU per action on the Pixel_7 AVD (3,441 tracks, a 180-track playlist), which
runs roughly five times faster than the Mi 9T:

| Action | 1.7.0 | Cause |
|---|---:|---|
| Open a playlist | 950 ms | the whole library read for the closed add-tracks sheet, every playlist's every entry read to find one name, liked songs read on an ordinary playlist |
| Back from a playlist | 730 ms | the same queries, run once more on the way out |
| Open an artist | 310 ms | both whole shelves grouped — every artist, every album — to find one header card |
| Open Now Playing | 40 ms JS, 250 ms UI | the whole screen built from nothing on every open |
| First visit to Settings | 80 ms | mounted on the press |

## Decision

**A screen reads what it shows, and a hidden thing reads nothing.** Concretely:
the collection header is one card for one collection (`useCollectionCard`), an
index lookup instead of two library-wide `GROUP BY`s; a playlist's screen reads
its own heading (`usePlaylistHeading`) and builds the mosaic from rows it
already has; the add-tracks and add-to-playlist sheets run their queries only
while open, and the latter reads one row per playlist instead of one per entry;
the liked-songs and playlist queries on the detail screen are one or the other,
never both; the info sheet's and heart's lookups do nothing without a track.

**Expensive surfaces are built once.** Now Playing stays mounted after its first
open, frozen while closed (`Freeze`, `Sheet keepMounted`), so opening it again
is one render of what changed. The tabs nobody has opened are preloaded one at
a time after launch has gone idle (`usePreloadTabs`), so the first press only
shows them. A track list's first frame builds the rows on screen only; the
fling buffer follows 350 ms later.

## Consequences

The same actions, same emulator, same library:

| Action | 1.7.0 | 1.7.1 |
|---|---:|---:|
| Open a playlist | 950 ms | 140 ms |
| Back from a playlist | 730 ms | 30 ms |
| Open an artist | 310 ms | 200 ms |
| Open an album | 150 ms | 100 ms |
| Open Now Playing | 40 ms | 10 ms |
| First visit to Settings | 80 ms | 20 ms |

No feature was removed to get there: every sheet still shows live data while it
is open, the header and mosaic still follow edits, and Now Playing still shows
the current track the moment it opens. The costs are memory — Now Playing and
every tab stay built for the life of the process — and one rule to keep: a new
always-mounted component must not run a live query while hidden. One cost was
left alone because it is the platform's: rows on a pushed screen are drawn
after Android has placed the screen, roughly the length of the transition, in
1.7.0 and 1.7.1 alike.
