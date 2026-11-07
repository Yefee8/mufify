# 033 — What a liked artist is

**Status:** accepted
**Date:** 2026-11-07

## Context

The library's heart filter lived in two different places: beside the sort
button on the tracks view, and on a row of its own under the toolbar on the
album shelf. The artist shelf had none, because an artist has no flag of its
own to filter on — the comment in the code said a heart there "would filter to
nothing every time". The request was for the heart to sit beside the sort
button on both shelves, which means the artist shelf needs a meaning for it.

There were two ways to give it one. Add a third thing to like — an
`is_favorite` column on `artists`, a heart on the artist screen, a migration —
or define a liked artist from what the user has already liked.

## Decision

**A liked artist is an artist you have liked something by: a track, or an
album.** `useLikedArtistIds` is the union of two small sets — the artists of
liked tracks, and the artists of the tracks on liked albums — each an index
walk from the few liked rows, using the same id the artist shelf groups by
(the track's own artist, 0 for none). It watches `track_stats`, `albums` and
`tracks`, so a heart tapped anywhere, or a file going missing, changes the
shelf without a reload. It only runs while the filter is on.

The heart sits in `LibraryToolbar` for every view, between the search box and
the sort button, and each view keeps its own heart the way it keeps its own
order: narrowing albums to the liked ones does not narrow the track list.

## Consequences

Nothing new to learn and nothing to like twice: someone who has liked half an
album by an artist finds that artist under the heart without having been told
artists can be liked. The cost is that an artist cannot be liked *without*
liking any of their music, and an artist whose only liked track is unliked
leaves the filter. Both read as correct for a filter whose job is "show me the
music I like"; if a separate artist heart is ever wanted it can be added to the
union as a third set without changing what the filter means today.
