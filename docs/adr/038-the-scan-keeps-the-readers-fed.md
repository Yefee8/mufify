# 038 — The scan keeps the readers fed

**Status:** accepted
**Date:** 2026-11-16

## Context

"Make the scan use the cores." It already did, below decks: stage two's tag
reading runs in the native module across one worker per CPU core
(`readerCount()` in `AudioTagsModule`). Profiled on the emulator with 3,441
files, the reading itself cost 123 s — and the scan took about 320 s. The
readers were starved, not slow: the loop was strictly
*list → read → write → yield*, so every database write, every yield and every
re-render the writes caused left all the cores idle. Worse, the yield was
`requestIdleCallback`, and during a scan the JS thread rarely reports idle —
the 140 yields added 171 s of waiting by themselves, more than the reading.
Two JS costs fed that busyness: duplicate hiding re-normalised every title on
every pass (1.7 s a pass), and each pass ran whenever a batch landed.

## Decision

**Prefetch: the next batch is listed and handed to the readers the moment the
current batch's tags arrive, before the current batch is written.** The
readers never wait for JavaScript again — whatever the JS thread is doing, the
cores are parsing files. The prefetched list excludes the batch still in the
readers' hands (`listUnenrichedUris(limit, excluding)`), because both are
unenriched at that moment.

**The yield is a macrotask**, the same measured choice `scanning.ts` already
made for the write-side yields, for the same reason.

**`normalizeName` caches**, keyed by the string, with an ASCII fast path —
the same few thousand titles were being re-normalised on every pass of
duplicate hiding, sixteen window comparisons each.

Making the write drain the whole batch also fixed a latent hang: a file the
reader cannot open produced no row, so it never got `lastScannedAt`, stayed in
the queue, and would be listed, read and failed again on every lap — forever,
once only unreadable files remained. It is now written with null fields,
stamped, and healed by the next rescan if the file changes.

## Consequences

Same emulator, same 3,441 files: **320 s → 132 s**, and the wall clock now
equals the native reading time (123 s), which is the floor this architecture
has — further gains mean making the per-file read cheaper, not scheduling.
JS CPU over the scan fell from ~310 s to 94 s. The scan is still cancellable
at every batch, still resumes where it stopped, and the library still fills
in while it runs.
