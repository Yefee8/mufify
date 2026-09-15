# 024 — One name written two ways is one thing

**Status:** accepted · albums added 2026-09-15
**Date:** 2026-09-12

## Context

A library assembled from files tagged by a dozen different tools holds "Linkin
Park", "LINKIN PARK" and "linkin park" as three artists, and the same song in
two folders as two tracks. The statistics ranked the three separately, splitting
a year of listening three ways and showing the user two strangers beside a band
they know. The library listed the duplicates twice.

## Decision

**Fold them together, with one of the two behind a switch and the other not.**

### Artist spellings in statistics: always merged, no setting

There is no reading of the data under which three spellings of one band are
three bands, so a switch would only ever be turned on. Adding one would be
offering a choice that has a wrong answer.

The rollups are keyed by artist id and SQL has no notion of "almost the same
name", so the folding happens above the query. The query **over-fetches** — four
times the limit — because merging shrinks the list and shrinks it from rows the
query had already selected: cutting at ten in SQL would leave a top-ten with
eight rows and the two that should have filled it never fetched.

The surviving row keeps the identity of its most-played member: its id, because
that is what a tap navigates to and it has to be one with something behind it;
its spelling, because that is the one on the files the user actually plays and
therefore the one they will recognise.

### Album spellings in statistics: merged the same way, with the band agreeing

*Added 2026-09-15.* Albums have the same problem twice over. The scanner keys
them by `(name, artist)`, so one record under two spellings of the band is two
albums, and so is the record under two spellings of its own name — and the
statistics ranked each half separately.

Folded like the artists, above the query, with the same over-fetch and the same
most-played identity — plus one condition the artists do not need: **the
artist has to agree**. "Greatest Hits" is on every third band's shelf and those
are not one record. The artist is compared *separately* from the name, for the
reason given under duplicates below: joined into one string, a long album title
followed by a short band name scores alike for two different bands. Two albums
with no artist on either side are compared on the name alone — an absent artist
is not a disagreement about the artist.

Within one name the split is first-match-wins, as for duplicates, so "close to
A" and "close to B" cannot chain across a pair that are not close to each other.

### Duplicate songs in the library: a setting, on by default

This one hides a file the user owns, and there is a legitimate reading where it
is wrong — two copies can be a CD rip and a vinyl rip somebody wants side by
side. So it is a switch, defaulted on because a library listing the same song
three times is the complaint.

*Since 2026-09-15* there are two answers to "what is the same song", and the
user picks in the same group:

- **Title only** — the names are alike and nothing else is asked. This is the
  default, and it was asked for by name: the same file copied into two folders
  is the same song whatever its tags say, and the tags are exactly what differ
  between two copies once one of them has been through a re-tagger. The cost is
  stated on the option itself — two different songs sharing a name, every
  album's "Intro", become one row.
- **Title, artist and length** — the original rule, three conditions, all
  required, each stopping a specific wrong merge. `dedupeTracks` defaults to
  this one when called without a mode, because the safe answer for code that
  has not been told is the one that hides less.

The strict rule's conditions:

- **Titles alike.** The obvious one.
- **Artists alike, compared separately.** Joining the two into one string is the
  tempting shortcut and it is wrong: "Red Hot Chili Peppers — Song Pt. 1"
  against "…Pt. 2" is one character in thirty-one, which scores 0.97 and merges
  two different songs. Compared on its own the title is one character in ten,
  which does not.
- **Durations close.** A live take shares its title and its artist with the
  studio version, and length is all that separates them. Hiding one behind the
  other is exactly the complaint this feature would otherwise create.

Within one title the split is first-match-wins rather than a union: a 180s and a
184s copy are each close to a 182s one and not to each other, and unioning would
put all three together and quietly bypass the duration guard.

### The threshold is 0.9, and it is pinned from both sides

High enough to merge "LINKIN PARK" with "Linkin Park"; low enough to refuse
"Song Pt. 1" and "Song Pt. 2", which differ by one character in nine and score
0.889. Those two requirements pull in opposite directions and both are tested.

Normalising does most of the work before any threshold is involved: after
folding case, accents and punctuation, "LINKIN PARK" and "Linkin Park" are the
same string. Marks are stripped **before** lowercasing, because `'İ'.toLowerCase()`
is "i" plus a combining dot and Turkish tags make that a real case. The folding
is locale-**in**variant — `toLocaleLowerCase` maps "I" to "ı" under a Turkish
locale, which would group a library differently depending on the phone's
language.

### Comparison is windowed, not pairwise

Ten thousand tracks compared pairwise is fifty million string distances, on a
list rebuilt whenever the library query re-runs. Distinct names are sorted and
each is compared to a window of its neighbours. The cost is that a pair
differing at the *start* — "The Beatles" and "Beatles" — can fall outside the
window and stay apart. That is a miss rather than a wrong merge, and a miss is
the safe direction: a visible duplicate is a cosmetic complaint, a hidden track
is one the user cannot find and has no way to attribute.

Statistics pass an infinite window, because they rank a few dozen rows and can
afford to be exact.

## Consequences

- A band under several spellings is one row in statistics, and so is a record
  under several spellings of its name or its band's; tapping either opens the
  spelling with the listening behind it. The other ids still exist; nothing is
  rewritten.
- Hidden duplicates are hidden from the library list, which is also what the
  header counts and what Play and Shuffle enqueue — so the number, the rows and
  the queue cannot disagree. Which rows those are depends on the matching mode,
  and both the switch and the mode live in one store (`duplicateSetting`) so the
  library re-lists the moment either changes on the Settings tab.
- `Math.floor(10 * (1 - 0.9))` is **0**, because `1 - 0.9` is
  0.09999999999999998. The early-exit budget in `isSimilar` uses `ceil` and the
  decision reuses `similarity`'s own expression, so a pair exactly 0.9 similar
  cannot be refused by the helper whose job is to answer "at least 0.9".
