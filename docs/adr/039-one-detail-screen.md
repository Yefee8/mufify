# 039 — One detail screen, and a tablet that splits

**Status:** accepted
**Date:** 2026-11-16

## Context

An album, an artist and a playlist are the same screen to the person using
them — a cover, a name, how much there is, Play and Shuffle, then the tracks —
and they had been built three times. Two header components with nearly the
same rows, a Play/Shuffle pair that existed once as `PlayShuffleBar` and once
again, styled almost the same, inside the playlist header, two copies of the
back chevron. Each change to one had to be remembered for the others, and was
not always.

On a tablet the same headers stacked above the list scaled with the window
width: the cover was a third of 800 points or more, the size of a hand, and
the tracks it belonged to were a strip underneath it. The layout only split
for short windows (ADR 029), never for wide ones.

## Decision

**`DetailChrome` is the top of every detail screen.** It owns the back button,
the cover block, name, subtitle, count and Play/Shuffle; a screen supplies its
own actions (an album's heart; a playlist's heart, add, rename, delete), what
the artwork is and whether it can be pressed, and anything that follows (the
playlist's search box). `CollectionHeader` and `PlaylistDetailHeader` are
gone; `PlaylistDetailActions` is what remained of the second.

**`WindowSplit` splits wide windows too.** From 720 points across the controls
get a phone's width, 320 to 440 points, and stop growing; the list takes the
rest. `useSplitMode` tells what sits in that column which layout it is in, and
`DetailChrome` puts the cover on top, column-wide, with the name under it.
Short windows keep the 2:3 split and the cover beside the name, because there
height is what is scarce. A tablet in split-screen is phone-shaped and gets
the phone layout. The library and Playlists tabs go through the same
component, so on a tablet their controls sit in the side column as well.

## Consequences

On the emulator at 1600×2560 (portrait tablet) and 2560×1600 (landscape): the
cover is the column's width (about 280 and 300 points), the tracks get the
other two thirds, and an album and a playlist are visibly the same screen.
Upright phones render exactly as before. The one thing a screen can no longer
do is arrange its header differently from the others — which is the point.
