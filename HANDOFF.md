# Mufify — continue and finish

Offline-only Android music player. React Native + Expo SDK 57, TypeScript strict.
Repo: `/Users/yefee/Desktop/projeler/mufify`, branch **`fix/performance-ux-stats`**.

## Read first

`AGENTS.md` (binding house style), then `README.md`, `CONTRIBUTING.md`,
`docs/performance.md` (every measurement taken so far), `docs/components.md`,
and all of `docs/adr/`.

## Before anything else

```bash
git status && git log --oneline -15
npm run lint && npm run typecheck && npm test
cd android && ./gradlew :audio-tags:testDebugUnitTest
```

All four must be green — currently **292 tests / 20 suites**, working tree clean.
Do not build on red.

## Do NOT branch from `main`

`main` contains **3 files** (AGENTS.md and two docs). It is not the project. All
225 files live on `fix/performance-ux-stats`, and `main` is an ancestor of it.
Two previous sessions were told "the user merged to main, branch from there" —
it was not true either time, and branching from `main` would discard everything.
Stay on `fix/performance-ux-stats` unless `git ls-tree -r --name-only main | wc -l`
says otherwise.

## State

Everything in the last brief is done: performance (1a/1b/1c), all seven UI/UX
items, all four statistics items, the regression pass, and the release docs.
**68+ commits, unpushed.** No PR has been opened — nobody has asked for one.

Read the commit messages rather than re-deriving. Several are the only place a
decision is written down.

## Devices

**Mi 9T `7a6f8791`** — the user's real phone, API 29, MIUI. Connected and
running the app right now (dark theme, Turkish, 521 tracks).

- `adb install`, `am start`, `logcat` all work.
- **`adb shell input` and `pm grant` are blocked** (`SecurityException:
  Injecting to another application requires INJECT_EVENTS`). Every tap needs a
  human. **Batch them and ask once.**
- **MIUI's logcat rate limiter ("chatty") silently discards lines** under load.
  If a measurement is missing, that is usually why — not a bug. Two per-render
  counters were removed for exactly this reason; do not add more.
- Cold start is ~40 s here because it is a debug build pulling JS from Metro.
  `adb -s 7a6f8791 reverse tcp:8081 tcp:8081` after every reconnect.

**Pixel_7 AVD** — full automation, `input` works. Frame timing is worthless
(SwiftShader). Degrades badly after several hours up; restart it rather than
fighting flaky taps.

## What is actually left

### 1. Frame timing on the Mi 9T — still never obtained

**The only item on this list that no amount of automation can close.** The AVD
renders through SwiftShader, so its frame numbers are worthless; MIUI blocks
`adb shell input`, so the phone cannot be scrolled without a human hand. It
needs both halves at once and there is no substitute.

The user uninstalled the app from the phone on 2026-08-01, so this now needs a
reinstall first. Then, with the app on the Library tab:

```bash
adb -s 7a6f8791 shell dumpsys gfxinfo dev.mufify.app reset
# human scrolls hard for ~10 seconds
adb -s 7a6f8791 shell dumpsys gfxinfo dev.mufify.app framestats
```

Note the package is `dev.mufify.app`, not `com.mufify` — querying the wrong one
returns "No process found", which reads exactly like the app having died.

This is the only valid source for a 60 fps claim, and `docs/performance.md`
deliberately makes no frame-rate claim until it exists. Record it there.

### 2. ~~Playlist chain, end to end~~ — DONE 2026-08-01

Verified on the Pixel_7 AVD in one pass, `stats_rollups` playlist rows included.
Full record in `docs/performance.md` under "Device verification".

Two things worth carrying forward:

- Every control has an `accessibilityLabel`, so drive the UI from
  `uiautomator dump` by label rather than guessing coordinates. That is what
  made this reproducible where the previous attempt was not.
- The reorder handle is `Gesture.Pan().activateAfterLongPress(120)`. A plain
  `adb shell input swipe` **never activates it**; you need
  `input motionevent DOWN` → hold → `MOVE`s → `UP`.

Reading the database — **copy the `-wal` too.** WAL means recent writes are not
in the main file, and copying only `mufify.db` shows an empty `play_events`,
which looks exactly like the bug you would then go hunting:

```bash
adb -s <dev> shell "run-as dev.mufify.app cat files/SQLite/mufify.db"     > /tmp/m.db
adb -s <dev> shell "run-as dev.mufify.app cat files/SQLite/mufify.db-wal" > /tmp/m.db-wal
sqlite3 /tmp/m.db "SELECT entity_type, COUNT(*) FROM stats_rollups GROUP BY 1;"
```

### 3. ~~Repeat-listen seek-back~~ — DONE 2026-08-01

Two distinct `outcome=play` rows for one track from two seek-backs, rollups
agreeing. Recorded in `docs/performance.md`.

### 4. ~~Release build~~ — DONE 2026-08-01

Installed and run for the first time, on the AVD rather than the phone, with
`adb reverse --remove-all` so it could not fall back to Metro. Boots clean, all
four tabs render, no `INTERNET` permission in the manifest. Details in
`docs/performance.md`.

Still **not measured** — functional smoke test only. Every number in this repo
is from a debug build, which overstates JS cost.

### 4b. A UX gap found while doing the above

`MiniPlayer` is rendered only in `app/(tabs)/_layout.tsx`. Pushed stack screens
therefore have no transport control: start playback from a playlist detail
screen and there is no visible player, and no way to reach Now Playing without
going back to a tab. It follows from the routing structure rather than being a
defect, so it is a design call rather than a bug fix — but it is a real gap and
nobody has decided about it.

### 5. One finding from the phone's database (the other is closed)

Read on 2026-08-01 from the Mi 9T (`stats_rollups`, `tracks`). The codec finding
below was chased and closed the same day — it was never a defect. The remaining
one needs a human to press Scan.

**Stage two is 446 of 521 short.** `last_scanned_at IS NULL` for 446 rows and
set for 75. That is consistent with a scan that was cancelled or a process that
was killed, and the design says it resumes from exactly there — the null column
*is* the queue. Worth confirming that pressing Scan resumes rather than
restarts, because it is a designed behaviour nobody has watched happen.

**~~`codec` is null for all 521 rows~~ — RESOLVED, not a defect. Do not
reinvestigate.** It is `codecOf` in `src/services/scanner/trackMapping.ts`
working as designed: it returns null whenever the MIME subtype is already a
container name, because `audio/mpeg` otherwise renders the strip `MP3 · mpeg`
— the same fact spelled worse. `flac`, `mp4`, `mpeg` and `wav` are all in
`CONTAINER_NAMES`, so **a library of mainstream formats has a null codec on
every row, always.**

The premise behind the alarm was wrong twice over: `codec` never comes from the
native reader, so "the reader returned one field and not the other" described a
path that does not exist; and the emulator's `FLAC · 44.1 kHz · 16-bit` is the
*container* column, which was being compared against the phone's *codec*
column. Pulled from the device to confirm — the 75 enriched rows read
`container=FLAC|M4A, codec=NULL, bitrate=143, sample_rate=44100, bit_depth=16,
channels=2`. The phone renders exactly what the emulator does. There is no API
29 versus 35 difference and nothing to fix. (`bit_depth` is null on the one M4A
row, also correct — AAC is lossy and has no bit depth.)

`trackMapping.test.ts` now pins this with the device case named, so the next
reading of a null codec column resolves in one test file instead of a device
session.

Note the library on that phone is **synthetic test files** (`perf-NNN`, album
`bulk`, no artist, no artwork), not the user's music. Scanning their real
library is the only way to tell these apart from a tagging artefact — and it is
also the only way `artists` and artwork get exercised at all, since 0 of 521
current rows have either.

### 6. Phase 10 leftovers

Play Store listing copy (EN + TR), Data Safety answers, release AAB build
instructions, screenshots for the README.

`docs/architecture.md` is **written** — startup ordering, the three places state
lives, the scan and listen flows, and the native boundary. Screenshots are the
one Phase 10 item that needs a device.

## Traps already paid for — do not rediscover these

- **`tailwind.config.js` overrides the spacing scale.** A class built from a
  value outside it compiles to *nothing* — no warning, no size. Five shipped
  invisible, including the swipe-to-queue reveal strip, whose icon had never
  been seen. `src/theme/scale.test.ts` now fails on any such class. The same is
  true of colours: there is no `danger` token, and `text-danger` silently does
  nothing.
- **Axis-locking a pan gesture on the first `onUpdate` is wrong.** Both
  translations are still `0`, and `Math.abs(0) >= Math.abs(0)` is true, so every
  gesture classifies as horizontal and vertical ones are silently discarded.
  Wait for ~6 px of real movement.
- **`router.push` on a control that is also reachable by gesture stacks two
  screens.** The drag fires the handler while the underlying `Pressable` still
  registers a press. Use `router.navigate`. Symptom: dismiss *and* the close
  button both appear broken, because each correctly pops one of two.
- **The React Compiler's `react-hooks/immutability` rule rejects mutating a
  Reanimated shared value captured by a hook.** Build gestures inline (as
  `Scrubber` does) unless the component has many instances; `SwipeableRow`
  memoizes because it has ~40 in a list and needs an eslint-disable for it.
- **NativeWind `className` only works on components it knows.** Register in
  `src/theme/interop.ts` with `cssInterop`.
- **A virtualized list needs a bounded flex parent** — wrap in `<View className="flex-1">`.
- **FlashList's default `drawDistance` is 250 px.** With 64 px rows that is under
  four rows of buffer; a fling outruns it and leaves blank rows. It is 1200 now.
- **expo-router + React Compiler:** pass `(props) => <C {...props} />` to
  `tabBar`, never the component.
- **`dumpsys media_session` lies about this app.** Use the engine's own stream.
- **Jest's `testMatch` treats any `*spec.ts` as a test.** Do not name a module that.
- **Property tests: seed with splitmix32, not an LCG.** Sequential LCG seeds give
  correlated first draws.
- **MIUI marks call recordings `is_music=1`** — `MusicFilter` excludes recorder
  folders by path.
- **`MediaMetadataRetriever` has no sample rate or bit depth below API 31.**
  `AudioFormatReader` reads them from `MediaExtractor`.
- **New routes need Metro running** to regenerate `.expo/types/router.d.ts`.
- **Release builds ship no `INTERNET` permission** — `plugins/withOfflineOnly.js`.
  Never undo this.
- **`android/` is generated by CNG and git-ignored.** Native config goes in
  `app.json` or a config plugin.
- **The stress-library seeder does not survive a restart** — the launch sweep
  retires tracks MediaStore cannot see, and synthetic rows have no files. Seed
  and measure in the same session.

## Working style

Small verified increments, one logical change per commit, and a commit message
that explains what and why — the user reads those as the report. Measure before
claiming a performance fix, and put before/after numbers in. Verify UI on a
device and say what you actually saw. When you were wrong about a cause before
finding the real one, write that down; the next person will have the same wrong
idea. Do not stop at decision points — pick the most defensible option, record
it in an ADR, keep going. Say plainly what is verified and what is still owed.
