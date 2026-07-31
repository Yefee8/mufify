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
— it is the ordinary automatic scan appearing to lose files.

## Decision

**Trigger a media scan; do not walk the tree.**

`requestMediaScan(paths)` wraps `MediaScannerConnection.scanFile()` and
resolves once the scanner has visited every path. `addFolder` calls it for the
picked folder, then runs the normal two-stage scan. `tracks.file_uri` stays a
single kind of URI throughout the app.

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
Android. Where it fails, `addFolder` still runs the normal sweep — the user
gets whatever MediaStore already knows, rather than an error for something they
cannot act on.
