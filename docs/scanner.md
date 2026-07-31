# Scanner

How music gets into the library. Two ways in, one pipeline.

> Phase status: the module, the pipeline, the queries and the UI are written
> and unit tested. `MediaMetadataRetriever` and the MediaStore cursor need a
> real device — see [What is not yet proven](#what-is-not-yet-proven).

---

## Two entry points, deliberately

**Automatic.** A MediaStore sweep runs in the background. It costs nothing and
covers the common case: music the system already indexed.

**Manual — `Add music`.** Opens the system folder picker (SAF) and scans what
was chosen. This is **not** a fallback for when the automatic scan
disappoints. MediaStore does not index:

- files the media scanner has not seen yet — a fresh `adb push`, a just-copied
  album
- anything inside a folder containing `.nomedia`
- some SD card layouts, depending on the vendor

Which is precisely where somebody with a 400 GB FLAC library keeps their music.
So the button is on the header of the library screen at all times, not only in
the empty state.

Both paths run the same two stages and write through the same queries.

---

## Why a Kotlin module

`docs/adr/004-kotlin-metadata-module.md` has the full reasoning. In short, the
two JS options do not work:

- `@missingcore/audio-metadata` calls `getInfoAsync` on `expo-file-system`,
  which moved to `/legacy` in SDK 57 — a runtime failure. It also skips the
  FLAC STREAMINFO block entirely, so it returns no sample rate, bit depth,
  channel count or bitrate, and its Vorbis comment support omits `GENRE` and
  `DISCNUMBER`.
- `expo-media-library`'s current API exposes one async getter per field. For
  10,000 tracks that is 30,000+ bridge calls, and neither its old nor its new
  API returns file size at all.

File size is not optional here: it is on the spec strip *and* it is half of the
`(size, modificationTime)` incremental rescan key.

`modules/audio-tags` does the enumeration in one cursor and the tag reading in
batches.

### Artwork never crosses the bridge

`ArtworkExtractor` decodes with `inSampleSize` so a multi-megapixel cover is
never fully expanded, writes a 512px and a 128px JPEG into the cache directory,
and returns two paths. Files are content-addressed by a hash of the picture
bytes, so an album's twelve tracks sharing one cover produce one pair of files
and a rescan rewrites nothing.

This is what makes the `AGENTS.md` rule — never store artwork bytes, never
decode at render time — free rather than a discipline.

---

## The two stages

### Stage one — enumerate

`enumerateLibrary()`. Pages the MediaStore cursor and writes rows straight
down. Everything comes from the cursor; no file is opened. The library is
usable within a second or two of a cold scan.

- page size 500, so paging is never the bottleneck
- `IS_MUSIC != 0` keeps ringtones, alarms and notifications out
- a duration floor drops stray one-second files (the "ignore short files"
  setting)
- ordered by `_ID` so paging stays stable while the scan is in flight
- a short final page ends the loop — asking again would cost a query to learn
  nothing
- yields to the UI between pages

### Stage two — enrich

`enrichLibrary()`. Opens files in batches of 25 and fills in tags, the spec
strip and artwork.

The queue is not a table: it is `tracks` where `last_scanned_at IS NULL`. Each
batch is written before the next starts, so a scan that is cancelled, crashes
or is killed by the OS keeps everything it already did and resumes exactly
where it stopped.

A file that will not open is **skipped, not retried forever**. It still counts
towards progress, so the bar always reaches the end.

---

## Incremental rescan

`needsRescan(existing, incoming)` compares `(fileSize, dateModified)`. Both are
checked, not just the timestamp — editing tags in place can leave mtime
untouched on some filesystems.

A file that has gone is marked `is_missing = 1`, never deleted. Deleting would
take playlist entries and play history with it, and an unmounted SD card would
look like a library wipe.

---

## Progress and cancellation

`ScanProgress` is `{ phase, total, processed, error? }` where phase is one of
`idle | enumerating | enriching | done | cancelled | failed`. The library
screen renders all of them.

Cancellation is checked between pages and between batches, so it is prompt
without being able to tear a write in half.

---

## Testing

Every dependency of the pipeline is an injected port. That is not ceremony —
it is what lets paging, batching, cancellation, the empty library, an
unreadable file and a thrown native call all be tested on a laptop.

```bash
npm test -- scanner                              # 39 pipeline + mapping tests
cd android && ./gradlew :audio-tags:testDebugUnitTest   # 12 Kotlin tests, no device
```

`SpecMath` on the Kotlin side has no Android imports specifically so it runs as
a plain JVM test: the FLAC bitrate fallback, MediaStore's `disc * 1000 + track`
packing, subsampling, and the lossless split.

### Verified on device

Emulator, API 35, with three generated files pushed to `/sdcard/Music/` — a
real FLAC and two WAVs, one of them deliberately under the duration floor.

| Check | Result |
|---|---|
| MediaStore cursor returns rows | 2 of 3 — the 4-second file was filtered by the duration floor, as intended |
| `IS_MUSIC` selection | ringtones and alarms excluded |
| Paging via the Bundle API | works on API 30+ after the `Invalid token LIMIT` fix |
| Stage two opens files | both rows reached `last_scanned_at` |
| Container and codec mapping | `audio/flac` → `FLAC`, `audio/x-wav` → `WAV` |
| Sample rate and bit depth | 44,100 Hz / 16-bit on both — the API 31+ path |
| Bitrate | WAV computed as **1,411 kbps**, which is exactly CD-quality PCM; FLAC as 143 kbps from its real compressed size |
| Permission gate | with the permission revoked the sweep stays silent and the empty state shows |
| Error state | a thrown native call surfaces as one plain sentence plus the raw detail, with a retry |
| SAF picker | `ACTION_OPEN_DOCUMENT_TREE` fires and DocumentsUI opens |

### Still waiting on a real device

- **artwork extraction** — the generated test files carry no embedded picture,
  so `ArtworkExtractor` has never actually written a JPEG. The path returns
  null correctly, which is not the same as proving the happy path.
- **a sweep over 500+ real files without dropping frames** — three files prove
  correctness, not performance.
- **incremental rescan speed** on a library large enough for it to matter.
- **completing a SAF pick** — the picker opens, but nothing has been selected
  and walked. See `docs/adr/006-manual-add-is-first-class.md`, which records
  that tree-walking is not designed yet.
- **files with real tags** — the test files have no artist, album or genre, so
  the tag-reading path is exercised but never sees populated values.

---

## The bitrate number

FLAC is variable bitrate and the container usually reports nothing, so the
honest figure is `fileSize * 8 / duration` — the average. A reported value is
preferred when present and plausible; anything absurd is discarded rather than
displayed, because a wrong number on the spec strip is worse than a missing
one.
