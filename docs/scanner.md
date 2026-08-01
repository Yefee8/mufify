# Scanner

How music gets into the library. Two ways in, one pipeline.

> **Phase 2 is closed.** The module, pipeline, queries and UI are written and
> unit tested; the automatic sweep, manual add, incremental rescan, artwork
> extraction, tag reading and directory recursion are all verified on hardware.
>
> One item is carried forward rather than closed: frame timing over a large
> library needs a real GPU and cannot be answered on an emulator. It is
> recorded, with the recipe, under
> [Still waiting on a real device](#still-waiting-on-a-real-device).

---

## Two entry points, deliberately

**Automatic.** A MediaStore sweep runs in the background. It costs nothing and
covers the common case: music the system already indexed.

Both paths need the audio permission first, and the app **asks** for it rather
than assuming it — see `docs/adr/008-permission-is-asked-not-assumed.md`.
Without the grant a MediaStore query does not fail, it returns nothing, so a
scan without permission looks exactly like a device with no music on it. That
distinction is the whole reason the request exists.

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
strip and artwork. `ARTIST` resolves `tracks.artist_id`; `ALBUMARTIST` (or
`ARTIST` when absent) resolves the album's `artist_id`; and `ALBUM` resolves
`tracks.album_id`. This keeps the normalised tables and the track metadata in
step after a tag edit.

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
npm test -- scanner                              # pipeline, mapping, tree URI, permission
cd android && ./gradlew :audio-tags:testDebugUnitTest   # 12 Kotlin tests, no device
```

`permissionErrorFor` is a pure function in `src/services/scanner/permission.ts`
rather than a branch inside `useScan`, so the granted / denied / permanently-
denied split is unit tested. It is a three-line function and it still earns a
module: it encodes the distinction whose absence caused the add-music bug.

`SpecMath` on the Kotlin side has no Android imports specifically so it runs as
a plain JVM test: the FLAC bitrate fallback, MediaStore's `disc * 1000 + track`
packing, subsampling, and the lossless split.

### Verified on a physical device

Mi 9T (`davinci`), **API 29**, debug build over Metro. API 29 matters: it takes
the pre-API-30 branch in `pagedCursor`, so this run exercised the legacy
`LIMIT … OFFSET` sort-order paging rather than the Bundle form, and scoped
storage is in effect.

| Check | Result |
|---|---|
| Permission is requested, not assumed | `dumpsys package` went from `granted=false` to `granted=true` after the in-app prompt |
| Add music end to end | library went from **0 parça** to **14 parça** — the flow that previously returned to the empty state |
| Empty result is now unambiguous | with the permission absent the same build scanned clean and found nothing, matching `content query` returning rows for the shell |
| Legacy paging path (API 29) | enumerated without an `Invalid token LIMIT` throw |
| Turkish UI at real density | header, count and empty state all render without clipping |

**The bug this closes.** Picking a folder appeared to do nothing: the picker
closed, the screen changed briefly, and the library returned to empty. Nothing
was broken in the picker or the pipeline — the app had simply never asked for
the permission, and an unpermitted MediaStore query returns zero rows without
raising. Full write-up in ADR 008.

### Previously verified on the emulator

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

- **a sweep over 500+ real files without dropping frames** — the last open item
  for Phase 2, and it needs real silicon.

  It has now been *run* on the Pixel_7 AVD over 523 tracks and the numbers are
  bad: 42% janky on a 12-swipe scroll, 46 ms median frame. They are also
  meaningless. `dumpsys SurfaceFlinger` reports the renderer as ANGLE over
  **SwiftShader** — a software rasterizer on the host CPU — and the GPU
  percentiles come back as `4950ms`, the sentinel for no data at all. A
  software rasterizer missing a 16 ms budget says nothing about whether a
  Snapdragon does.

  Recording the number so nobody re-runs it expecting insight. The verdict
  needs hardware; the recipe is below.
- **incremental rescan speed** on a library large enough for it to matter.

### Verified on the Pixel_7 AVD, API 35

The emulator answers the questions the Mi 9T could not, because `adb shell
input` and `pm grant` both work here — the whole loop can be driven without a
hand on the device.

| Check | Result |
|---|---|
| `READ_MEDIA_AUDIO` request path (API 33+) | the system dialog appears and grants; this path had never run on a device before, since the Mi 9T is API 29 and takes the `READ_EXTERNAL_STORAGE` branch |
| Automatic full-library sweep | from a cleared install with the permission pre-granted and **no folder picked**, 523 tracks appeared on their own |
| Sweep after a first grant with the picker cancelled | 523 tracks anyway — see the fix in `useScan` |
| `scanFile()` recursion into directories | resolved, twice, three levels deep — ADR 007 |
| Artwork extraction | a real embedded cover produced the content-addressed `<hash>-512.jpg` / `-128.jpg` pair in the cache and rendered in the row |
| Populated tags | the tagged files on the emulator list with artist and album, so the tag path has now been seen returning values rather than nulls |
| Track list over 523 rows | scrolls end to end without error |

Two of those — artwork and populated tags — were open since Phase 2 began and
are closed by observation rather than by argument.

### Resolved: the unindexed-file scenario is real

This was listed as unproven on the assumption that `adb push` indexes as it
copies, so the case had to be simulated over MTP. It does not, at least not
here. 520 files pushed to `/sdcard/Music/bulk` sat on disk — 56 MB, confirmed
by `ls` — with **zero** matching rows in MediaStore. The scenario reproduces on
demand simply by pushing files, and it is exactly what `Add music` and pull-to-
refresh exist to fix.

**This is an API-level difference, not a device quirk.** The same push on the
API 35 emulator indexes immediately: from Android 11 the FUSE layer indexes a
file when it is closed, so `adb push`, an in-device `cp` and an app write are
all visible to MediaStore at once, and the unindexed window effectively does
not exist. On the API 29 phone it very much does.

So the feature is not obsolete — it is invisible on new Android and load-
bearing on old. minSdk is 26, and the users most likely to keep a 400 GB FLAC
library on a phone are not the ones with the newest phone.

### Measured throughput, 528 files

Pixel_7 AVD, API 35, headless, from a cleared install. Frame timing is not
measurable here — see above — but throughput and responsiveness are.

| Moment | Elapsed |
|---|---|
| First page of 500 rows written, library usable | ~10 s |
| Stage one complete, all 528 enumerated | ~20 s |
| Stage two complete, all 528 enriched | ~70 s |

Stage two is roughly 95 ms per file, and that now includes two opens — the
retriever for tags and artwork, plus `MediaExtractor` for the audio format.
The second open bought sample rate, bit depth and channel count at every API
level, which is a good trade for a cost paid once per file per rescan.

**The library is usable a minute before the scan finishes**, which is the
entire point of splitting the stages. Verified rather than assumed: scrolling
during active enrichment reached track 70 with the progress banner still
reading "Reading tags…", so the promise in `AGENTS.md` that the user can always
scroll during a scan holds.

A blank band used to appear above the first row during "Reading tags…", and
the cause was worth writing down because two plausible theories were both
wrong. It was not FlashList's `maintainVisibleContentPosition`, and it was not
the churn of the live query re-firing per batch — disabling one and throttling
the other changed nothing.

**A virtualized list needs a bounded parent.** The `FlashList` was a bare child
of `Screen`'s flex column, so it kept the height it measured on first layout;
mounting the scan banner above it shrank the space available without shrinking
the list, and the difference showed as empty space. One `flex-1` wrapper fixes
it. The queue and playlist-detail screens had the same shape and were fixed
with it.

Two changes went in alongside, both genuine and both small. The library query
is throttled to 500 ms, because stage two writes twenty times a minute and
nobody reads titles that fast. And `TrackRow` compares by value rather than by
reference: a live query hands back fresh objects on every run, so the default
memo check failed for every visible row on every batch even when nothing it
draws had changed.

### The large-library measurement, next time the device is here

Setup is automatable; only the gesture is not. Roughly five minutes:

```bash
adb push <520-file-set>/. /sdcard/Music/bulk/     # ~1.7s, 56 MB
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
adb reverse tcp:8081 tcp:8081 && npx expo start --dev-client
adb shell dumpsys gfxinfo dev.mufify.app reset
# --- by hand on the phone: pull down to refresh on Kitaplık ---
adb shell dumpsys gfxinfo dev.mufify.app framestats
```

Read `Total frames rendered`, `Janky frames` and the 90/95/99th percentiles.
The claim to support or refute is the `AGENTS.md` performance rule: the scan
chunks its work and yields, so the user can scroll throughout. Jank during the
scan is the thing being measured, so scroll the list while it runs rather than
watching it politely.

One trap worth knowing: **a USB disconnect triggers a full-volume media scan on
this phone.** In the last session `MediaScannerInjector` walked `Music`,
`Music/bulk` *and* `Ringtones` seconds before the cable dropped. Nothing in the
app asked for that, and it would be easy to read as proof that
`requestMediaScan` works. Attribute a scan to our code only when the paths
match what we passed.

### Automating verification on Xiaomi hardware — don't

MIUI refuses both `adb shell pm grant` (`grantRuntimePermission: … does not
have android.permission.GRANT_RUNTIME_PERMISSIONS`) and `adb shell input`
(`Injecting to another application requires INJECT_EVENTS permission`) for this
package. Permission grants and every tap have to be performed by hand on the
phone. `adb install`, `am start`, `screencap`, `logcat` and `dumpsys` all work
normally, so capture can be automated even though input cannot — reset the
counters, ask for the gesture, then read the result.

---

## The bitrate number

FLAC is variable bitrate and the container usually reports nothing, so the
honest figure is `fileSize * 8 / duration` — the average. A reported value is
preferred when present and plausible; anything absurd is discarded rather than
displayed, because a wrong number on the spec strip is worse than a missing
one.
