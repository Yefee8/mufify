# 006 — Manual adding is a first-class entry point

## Context

The original Phase 2 plan had automatic MediaStore scanning as the way music
enters the library, with a SAF folder picker as an "optional" escape hatch —
`docs/01-TECH-STACK.md` §1 calls it exactly that.

MediaStore only knows about files the system media scanner has indexed. It does
not see files just copied onto the device until a scan runs, anything under a
folder containing `.nomedia`, or some vendor SD card layouts. This app's
audience keeps large FLAC libraries, often on removable storage, often
copied over by hand — which is the population most likely to fall into those
gaps.

An escape hatch that a substantial share of the target users need on day one is
not an escape hatch.

## Decision

Two equal entry points into one pipeline.

`Add music` sits in the library screen header at all times, and again as the
action inside the empty state. It opens the system folder picker, records the
chosen tree URI in `scan_folders`, and runs the same scan.

The automatic MediaStore sweep still runs in the background without the user
asking, because for the common case it costs nothing and needs no interaction.

Both go through `enumerateLibrary` then `enrichLibrary`, write through the same
queries, and report the same `ScanProgress`. There is no second code path to
keep in step.

## Consequences

The library header carries a permanent action, which is the first piece of
persistent chrome on that screen. Phase 4 has to fit the list, search and
fast-scroll around it rather than assuming a bare header.

`scan_folders` is now written in Phase 2 rather than Phase 8. Its `enabled`
column is unused so far — a folder can be added but not yet disabled or
removed. That belongs with the Library settings group and is deferred, not
forgotten.

**Open, decided provisionally:** a picked folder is scanned once, when it is
added. Whether folders are also re-walked on every launch, and how a SAF tree
URI is enumerated (the current pipeline enumerates MediaStore, not an arbitrary
tree), is not settled. The tree-walk path needs a device to design against —
the picker returns a `content://.../tree/...` URI whose behaviour under
`MediaMetadataRetriever` is exactly the thing that cannot be checked on a
laptop. Marked as awaiting device verification in `docs/scanner.md`.
