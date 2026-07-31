# Scanner

How music gets into the library. Two ways in, one pipeline.

> Phase status: the module, the pipeline, the queries and the UI are written
> and unit tested, and the end-to-end add-music flow now works on hardware.
> Performance over a large library is still unmeasured — see
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

- **a sweep over 500+ real files without dropping frames** — still the last
  open item for Phase 2. The earlier emulator number was worthless: headless
  swiftshader has no relationship to a real compositor. 520 FLAC files are
  staged at `/sdcard/Music/bulk` on the Mi 9T; the measurement needs
  `dumpsys gfxinfo dev.mufify.app framestats` taken across a scan of them. The
  recipe is below — the last device window closed before the gesture happened,
  not before the setup did.
- **whether `MediaScannerConnection.scanFile()` recurses into a directory** —
  the rescan path hands it `/storage/emulated/0/Music`, so everything depends
  on this and it is inferred rather than measured. See the status section of
  ADR 007.
- **artwork extraction** — the generated test files carry no embedded picture,
  so `ArtworkExtractor` has never actually written a JPEG. The path returns
  null correctly, which is not the same as proving the happy path.
- **incremental rescan speed** on a library large enough for it to matter.
- **files with real tags** — the test files have no artist, album or genre, so
  the tag-reading path is exercised but never sees populated values.

### Resolved: the unindexed-file scenario is real

This was listed as unproven on the assumption that `adb push` indexes as it
copies, so the case had to be simulated over MTP. It does not, at least not
here. 520 files pushed to `/sdcard/Music/bulk` sat on disk — 56 MB, confirmed
by `ls` — with **zero** matching rows in MediaStore. The scenario reproduces on
demand simply by pushing files, and it is exactly what `Add music` and pull-to-
refresh exist to fix.

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
