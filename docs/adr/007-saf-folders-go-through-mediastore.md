# 007 — A picked folder is indexed, not walked

## Context

`docs/adr/006` left one thing open: what actually happens when the user picks a
folder. The picker returns a `content://…/tree/…` URI, and there were two ways
to use it.

**Walk the tree ourselves.** Recurse through the SAF tree in JavaScript,
collect audio files, and feed them into stage two directly. This bypasses
MediaStore entirely, which sounds appealing until the details land: SAF
document URIs are not the `content://media/external/audio/media/<id>` URIs the
rest of the app stores, so `tracks.file_uri` would hold two incompatible kinds
of identity. Playback, the incremental rescan key, and the `is_missing` sweep
would each need to know which kind they were holding. A tree walk over SAF is
also slow — one IPC round trip per directory listing — and the permission has
to be persisted across restarts or the library breaks on the next launch.

**Ask the platform to index it.** `MediaScannerConnection.scanFile()` points
the system scanner at the paths and returns the MediaStore URIs it produced.
Afterwards the folder is ordinary MediaStore content and the existing pipeline
handles it with no second code path.

The second also fixes a separate problem the tree walk would not have touched:
a file copied over USB is frequently not in MediaStore for minutes, because
nothing has told the scanner it exists. That is not a "manual add" case at all
— it is the ordinary library scan appearing to lose files.

## Decision

**Trigger a media scan; do not walk the tree.**

`requestMediaScan(paths)` wraps `MediaScannerConnection.scanFile()` and
resolves once the scanner has visited every path. `importFolder` calls it for
the picked folder, then runs the normal two-stage scan. `tracks.file_uri` stays
a single kind of URI throughout the app. The library first shows a clear
confirmation, then a full-screen cancellable progress state until both stages
finish.

The same call also backs the manual **rescan** affordance, so a user who has
just copied files in can pull to refresh and see them without restarting the
app or waiting for the system to notice on its own.

## Consequences

A folder containing `.nomedia` still will not appear. The system scanner honours
that marker and so, transitively, do we. This is a real gap against ADR 006's
stated motivation, and it is accepted for v1: the far more common case is
"copied files not indexed yet", which this does fix. If `.nomedia` libraries
turn out to matter, the tree walk becomes a second, explicitly-scoped source
with its own URI handling — not a quiet extension of this one.

`scan_folders` now records what the user picked, but the rows are advisory: the
scan reads MediaStore, not the folder list. They exist so a future rescan can
re-index the same folders, and so Library settings can show what was added.

Converting a SAF tree URI to filesystem paths is not always possible on modern
Android. Where it fails, `importFolder` still runs the normal sweep — the user
gets whatever MediaStore already knows, rather than an error for something they
cannot act on.

`requestMediaScan` no longer resolves strictly on the last callback. The
callback is not guaranteed to fire once per path — a path that does not exist,
or a directory the provider declines to walk, can be dropped — and a dropped
one left the promise unsettled forever. Since `importFolder` awaits it *before*
starting the scan, that was a frozen screen with no error state to show. It now
settles on whatever has arrived after ten seconds.

## Status — what the device has since shown

**The premise that `adb push` auto-indexes is wrong**, at least on this phone.
520 FLAC files pushed to `/sdcard/Music/bulk` on a Mi 9T (API 29) were present
on disk (56 MB, confirmed by `ls`) and had **zero** rows in MediaStore. That is
the "copied files not indexed yet" case this ADR was written to fix, occurring
naturally rather than needing to be simulated — which also means the scenario
docs/scanner.md listed as unproven no longer needs a contrived MTP setup to
reproduce.

**Resolved: `scanFile()` does recurse into a directory.** Measured on the
Pixel_7 AVD, API 35, twice.

Constructing the test took more effort than running it, because on API 35 a
file written anywhere under `/sdcard` is indexed the moment it is closed — the
FUSE layer does it, so there is no unindexed window to observe and `adb push`,
`cp` and app writes are all indexed immediately. Deleting the MediaStore row
instead is not a workaround: `content delete` unlinks the file with it. What
does work is `.nomedia`, which suppresses indexing at write time; removing it
afterwards leaves files on disk with no rows and nothing blocking a scan.

| Trial | Setup | Before | After rescan |
|---|---|---|---|
| 1 | 3 files in `Music/deeptest/` | 523 rows, none matching | 526 rows, all 3 indexed |
| 2 | 2 files in `Music/deep2/level2/level3/` | 526 rows, none matching | 528 rows, both indexed |

Both times `requestMediaScan` was handed only `/storage/emulated/0/Music`, and
both times the scanner walked down to the files — three levels down in trial 2.
The library then listed them, so the whole chain holds: unindexed nested file →
pull to refresh → `scanFile` on the parent → MediaStore → two-stage scan → row
on screen.

Measured on API 35. The same code path applies from API 29 up, where
`MediaScannerConnection.scanFile` delegates to `MediaStore.scanFile`; below 29
it used the old `MediaScannerService` and is not covered by this result.
minSdk is 26, so API 26–28 remains inferred rather than measured — a narrow
gap, and one that shrinks on its own.

The scoped-storage fallback contemplated above is therefore not needed. Good,
because it would not have worked: `File.listFiles()` over shared storage is
restricted without a legacy-storage opt-out this app does not take.
