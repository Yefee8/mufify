# 030 — Sorting the library

**Status:** accepted
**Date:** 2026-11-07

## Context

Every view of the library had one order: tracks by title, albums by name,
artists by name. The request was for tracks by release year, date added,
artist and album as well; albums by year and artist; artists by the date their
newest track arrived — and every one of those reversible.

Three things had to be decided that are not obvious from the feature list:
where the sorting happens, what each order does with the rows that are equal
under it, and where an unknown artist or an untagged year goes.

## Decision

**In SQL, in the queries that already feed each view.** `trackOrderBy` and
`albumOrderBy` in `src/db/queries/tracks.ts` turn an order into `ORDER BY`, and
`useLiveQuery` re-runs when it changes. Sorting the fetched array in JavaScript
instead would put a locale collator over every row on the JS thread each time
the list changed — tens of milliseconds at 10,000 tracks, the size this app is
held to. The database is already running the query; the order costs it nothing
it was not spending.

**Every key carries tiebreakers.** By artist, the tracks read album by album in
running order (disc, then track number); by year, the same within each year;
and every order ends on the title, so rows that are equal under the chosen key
never trade places between renders. An album shelf sorted by artist runs each
artist's albums oldest first, the way a discography is read. An album's year is
its own tag, or its newest track's when the album has none.

**Missing values last, in both directions.** SQLite puts NULL first ascending
and last descending, which would open A → Z on "Unknown artist" and
oldest-first on every untagged file. Each order leads with `x IS NULL`
ascending, so the gaps stay at the end whichever way the list runs. This also
moves the unknown artist and album cards from the top of the shelves, where
coalescing them to an empty string used to put them, to the bottom.

**Each key opens on the direction people mean by choosing it** — names A → Z,
dates newest first — and Reverse is a labelled button in the sheet, not a
second tap on the selected row.

**Remembered per view**, in MMKV, as `key:direction`. One shared order would be
wrong for two views out of three; a stored value a later build no longer
recognises falls back to the default rather than throwing.

## Consequences

FlashList 2 anchors the first visible row whenever its data changes. That is
right for a chat and was wrong here: changing the order kept the old top row on
screen and opened the newly sorted list in its middle. The library's lists turn
anchoring off and remount on a new order, so a new order always opens at its
beginning — and a list that changes for any other reason (a heart, a scan)
keeps its scroll offset rather than its first row, which is how FlashList 1
behaved.

Text compares with `COLLATE NOCASE`, as the title order always did. It is
ASCII-only case folding, so `İ` and `i` are not folded together; correct
Turkish collation would need a collation SQLite does not ship, and it has not
been asked for.
