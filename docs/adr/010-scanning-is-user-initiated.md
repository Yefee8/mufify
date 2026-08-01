# 010 — Scanning is user-initiated

## Context

Until now the library scan started itself. `useScan` fired a MediaStore sweep
from an effect shortly after the Library screen mounted, gated only on the audio
permission being granted. The user never asked for it and was never told it was
happening.

That produced the report this ADR follows from: *"automatic detection freezes
the whole app."* Two separate problems were hiding behind each other.

The first was a real performance defect and is fixed independently: stage one
wrote rows with five awaited queries per track inside a loop over a 500-row page,
holding the JS thread for 859ms at a time. That is fixed in `saveEnumerated`,
measured at 20–31ms per block afterwards, and would have been worth fixing
whether or not the scan was automatic.

The second is not a performance problem at all. Even at 20ms blocks, an
unannounced scan is the app deciding on the user's behalf to read every audio
file on the device, immediately, on launch. This app's entire proposition is that
it does not do things behind your back. Reading the whole filesystem quietly is a
strange thing for it to make an exception for.

There is also no good moment for it to be automatic. A scan is cheap when the
library has not changed and expensive when it has, and the app cannot tell which
it is facing without doing the expensive part first.

## Decision

**Nothing scans unless the user presses something.**

- The automatic launch sweep is removed. There is no code path that begins a
  MediaStore enumeration without a press.
- A **Scan** button lives permanently in the Library header — not only in the
  empty state, because a user who copies an album across next month needs to
  reach it without emptying their library first.
- Pressing it opens a confirmation that says what will happen: every indexed
  audio file will be read, a large library takes a while, it can be stopped, and
  whatever was found is kept. No progress estimate is promised, because
  MediaStore does not report a count until it has been asked.
- The scan banner's **Stop** is wired to the scanner's existing cancellation, and
  cancellation is checked at the top of every batch in both stages.
- The two manual routes are untouched and remain independent: the folder picker
  and pull-to-refresh both go through the same pipeline and neither depends on
  the sweep.

The empty state now offers **Scan** as its action rather than the folder picker,
because scanning is the answer for most people and picking a folder is the answer
for the ones MediaStore fails.

## Consequences

A first-run user sees an empty library with an explicit invitation instead of a
library that fills itself. That is one extra tap, and it buys an app that never
reads the user's files without being asked.

Launch is cheaper, but not because of anything clever: an already-scanned library
is already in SQLite, and the list paints from the database with no MediaStore
involvement at all. The sweep was never needed to show the library — only to
notice changes to it.

The cost is that new files are not discovered on their own. A user who adds music
and does not scan will not see it. Pull-to-refresh and the always-present button
are the mitigation, and the empty state and the folder picker both remain as
routes in. This is a deliberate trade: silent staleness is a smaller failure than
silent work.

One thing this does not change: `retireUnseen` still only runs after a
*complete* enumeration, so a cancelled scan never retires anything. Stopping a
scan halfway cannot make tracks disappear.

## References

- `docs/performance.md` — the before/after numbers for the freeze itself.
- ADR 007 — why picked folders go through MediaStore rather than a tree walk.
- ADR 008 — why the permission is asked for rather than assumed.
