# Performance

Numbers, not adjectives. `AGENTS.md`: "Before claiming a performance fix,
measure it and report the numbers."

Everything here was measured with `src/services/perf`, which logs to `console.log`
and therefore to logcat in a debug build. A measurement run is:

```bash
adb -s <device> logcat -c && adb -s <device> shell am start -n dev.mufify.app/.MainActivity
adb -s <device> logcat -d -s ReactNativeJS:V | grep MUFIFY_PERF
```

The stress library comes from the Development group in Settings, which only
exists in a debug build. **It does not survive a restart**, deliberately: the
launch sweep marks tracks MediaStore cannot see as missing, and synthetic rows
have no files. Seed and measure in the same session.

---

## Devices

| | Mi 9T | Pixel_7 AVD |
|---|---|---|
| SoC | Snapdragon 730, Adreno 618 | host CPU, SwiftShader |
| API | 29 | 35 |
| Role | the real numbers | behaviour and automation |

The emulator's frame timing is worthless — SwiftShader, and the GPU percentiles
come back as the `4950ms` no-data sentinel. Its *JS* numbers are real, just
faster than any phone. The Mi 9T blocks `adb shell input` (MIUI:
`SecurityException: Injecting to another application requires INJECT_EVENTS`),
so anything needing a tap there needs a human; `am start` and `logcat` work
fine, which is enough for cold-start measurement.

---

## The library query

Time from the live query subscribing to its first rows arriving, cold start:

| Library | Mi 9T | Pixel_7 |
|---|---|---|
| 521 tracks | **1630 ms** | 210 ms |
| 10,528 tracks | — | 429 ms |

That looks like a slow query. It is not. The same query, awaited five times in
a row a few seconds after startup with nothing else running:

| Library | Mi 9T | Pixel_7 |
|---|---|---|
| 521 tracks | **74–87 ms** | 14–15 ms |

**So ~1550 ms of that 1630 ms is not the query.** It is cold-start contention —
Hermes initialising modules lazily, the first React render, NativeWind resolving
styles for the first time, fonts finishing, migrations, expo-sqlite opening the
database. The query is 5% of the number it appeared to own.

This is the single most useful thing measurement bought here, because the
obvious fix — indexes, narrower selects, pagination — would have been aimed at
5% of the problem and would have reported success.

Two consequences:

- **Scaling is sub-linear.** Twenty times the rows cost roughly twice the time
  (210 → 429 ms), which is the `title COLLATE NOCASE` index doing its job. The
  10,000-track library is not a query problem.
- **A search keystroke costs one warm query**, ~78 ms on the Mi 9T, because
  changing the term re-subscribes. That is the number to watch if search ever
  feels heavy; it is why the field is debounced and the debounce is not
  negotiable.

### What was tried and did not help

The launch sweep used to start on mount via `requestIdleCallback(…, { timeout:
1_000 })` — meaning it fired a second after mount whether or not the thread had
ever gone idle, potentially landing on top of the first library query. Gating it
on the list having painted moved the Mi 9T number from 1608 ms to 1517/1630 ms
across runs: **within noise, no measured improvement.**

It is kept anyway, and the honest reason is ordering rather than a measured win:
at 521 tracks the query is 78 ms, so there was very little overlap to remove. On
a 10,000-track library, or a slower device, a MediaStore enumeration landing
mid-query is a real hazard, and "don't start background work before the screen
has painted" costs nothing to guarantee. No claim of a speed-up attaches to it.

---

## Tab switching

The complaint that started this: "switching tabs takes too much time".

Measured on the Pixel_7 by tapping each tab twice round and counting renders:

| | Mounts | Renders |
|---|---|---|
| First visit to a tab | 1 | 2 |
| Every later visit | 0 | **0** |

Screens stay mounted, and a return visit does **no React work at all**. Verified
that the taps really landed by screenshotting and dumping the accessibility tree
after one — the screen had changed, and still nothing rendered.

So repeat tab switching is free on the JS side. The costs that remain are the
first visit to each tab (45–165 ms of React work, plus the library query for the
Library tab) and whatever the native side spends compositing. Attributing the
rest needs frame timing from the Mi 9T, which needs a human to scroll — see
"Still owed".

---

## The mini player

Permanently mounted, and it read the whole engine state. The engine reports
position every 500 ms, so the entire strip — an `expo-image`, three `Pressable`s,
two `Text` nodes — reconciled twice a second, forever, for text that had not
changed.

Ten seconds of playback on the Pixel_7, counting renders:

| | Before | After |
|---|---|---|
| `MiniPlayer` renders | **20** | **0** |
| `BottomTabBar` renders | 0 | 0 |

Twenty is exactly the 2 Hz status interval. Fixed by two narrow subscriptions
(`usePlaybackPhase`, `useCurrentTrack`) whose snapshots keep their identity when
nothing changed, plus moving position into `MiniProgress` — one animated view
whose width lives in a Reanimated shared value and which React renders once.

### Row press

The library row previously mapped every track to a playable queue and searched
that same array inside its press handler. `MUFIFY_PERF` measured one press on
the same 10,000-track synthetic library and the same first row on the Pixel_7
AVD debug build:

| | Before | After |
|---|---:|---:|
| Press handler | **16.6 ms** | **0.8 ms** |
| Press to mini-player state | **168.5 ms** | **37.4 ms** |

The queue and id-to-index map now update when the query result changes, not
when a row is pressed. The second number ends when the mini-player observes the
new current track; it is UI feedback latency, not time to audible audio.

**Worth recording what this was not.** The first diagnosis was that the tab bar
next door was re-rendering with it. The counter said 0, both before and after:
React re-renders the component whose store changed and its children, not its
siblings. The fix was right and the reasoning was wrong, which is the argument
for counting rather than reasoning.

---

## Seeding

10,000 synthetic tracks in **2928 ms** on the Pixel_7, in transactions of 400
rows. Included because it is the only way to reproduce any of the above.

---

## Transitions, modals and lists

The complaint was that screen transitions, the drawer and modal openings feel
slow. Taken as a checklist, with a measurement or a source-level fact for each.

### Is anything animating on the JS thread?

No. Every animation in the app goes through Reanimated worklets: `Scrubber`,
`MiniPlayer`, `MiniProgress`, `ArtworkCarousel`, `SwipeableRow`,
`ReorderableEntry`, `Skeleton` and `Toaster`. There is no `Animated` import from
`react-native`, no `LayoutAnimation`, and no `setInterval` or
`requestAnimationFrame` driving a visual anywhere in `src` or `app`.

Screen transitions themselves are react-navigation's, which run natively through
`react-native-screens`.

### Are list rows memoized with stable callbacks?

Yes, and it is measured rather than asserted. Counting `LibraryRow` body
executions on the Pixel_7 AVD:

| | Before | After |
|---|---|---|
| Rows reconciled per checkbox tap | **47** | **1** |

The fix is in `46d07a3`; the short version is that four separate things were
handing the list a new identity on every render — the selection object, the
screen's callbacks, `selection.has` per row, and an unmemoized `Gesture.Pan()`.

### Does opening a modal re-render what is underneath?

No. Long-pressing a row to open the action sheet reconciles **1** of the 47
visible rows — the one that was pressed. The sheet's state lives in
`LibraryTracks`, and `TrackList`'s `renderItem` does not depend on it, so
FlashList never calls it again.

### Is there an over-broad context?

There is no React context in the app at all. Everything shared between screens —
playback state, the queue, toasts — is a module-level store read through
`useSyncExternalStore`, so a change notifies only the components that subscribed
to it. The toast store is the clearest case: a toast confirming a swipe
re-renders `Toaster` and nothing else, which is why it can appear over a list
without touching it.

### expo-image

All nine call sites pass both `cachePolicy` and `recyclingKey`.

### A silent layout bug found on the way

`tailwind.config.js` overrides the spacing scale, so a class built from a value
outside it compiles to nothing — no warning, no size. Five had already shipped
invisible, including the swipe-to-queue reveal strip, whose icon had therefore
never been seen by anyone. `src/theme/scale.test.ts` now fails on any such class.

---

## Still owed

- **Frame timing on the Mi 9T.** `adb shell dumpsys gfxinfo dev.mufify.app
  framestats` after a scroll, which needs a human hand because MIUI blocks
  input injection. This is the only source of a valid 60fps claim, and it has
  not been obtained. No frame-rate claim is made anywhere in this repo until it
  is.
- **Release-build numbers.** Everything above is a debug build: unoptimised JS,
  dev-mode React, no precompiled bytecode for lazily loaded modules. Debug
  overstates JS cost substantially, so the cold-start figure in particular
  should be re-taken against a release build before it is treated as what a user
  experiences. The release build now *runs* (see above) but has not been
  measured — functional smoke test only.
- **Artwork and artists at scale.** Both emulator and phone libraries are
  synthetic files with no artist and, apart from two, no artwork. The artist
  shelf and the artwork cache have never met a real library.

---

## Regression pass

Run after the three critical sections closed, on the Pixel_7 AVD, with both
gates green — `lint`, `typecheck`, 302 JS tests across 21 suites, and
`:audio-tags:testDebugUnitTest` forced with `--rerun-tasks`.

| Area | Result |
|---|---|
| Theme, light ↔ dark | Both render correctly on every screen. Dark uses its own lighter indigo and dark-on-accent text, as the tokens require. |
| Language, en ↔ tr | Every string translated, tabs included. No raw keys, no English left in the Turkish build. |
| Library, Playlists, Stats, Settings | All four render clean. No JS error or warning in logcat across the sweep. |
| Scanning | Button, confirmation, skeleton, cancel wiring. An unchanged rescan measures 20 ms and 1 ms for its two pages. |
| Playback | Play, carousel, mini player, swipe up and down, queue attribution. |
| Shuffle | Selection persists and `play_events.shuffle_algorithm` records it. |
| Statistics | Wrapped, tiles and all four ranked lists, with covers and durations. |

~~**Not exercised end to end:** the playlist create → add tracks → play flow.~~
Closed on 2026-08-01 — see below.

---

## Device verification, 2026-08-01

Pixel_7 AVD, API 35, rebooted first because the previous session's flaky taps
were an emulator that had been up nine hours rather than a real fault. Every
control in this app carries an `accessibilityLabel`, so the whole pass was
driven from `uiautomator dump` by label instead of guessed pixel coordinates —
which is what made it reproducible where the earlier attempt was not.

**The playlist chain, end to end.** Create → name → add 3 tracks → drag-reorder
→ play, in one pass. The reorder needed a real `motionevent` DOWN / hold /
MOVE / UP sequence, because `ReorderableEntry` uses
`Gesture.Pan().activateAfterLongPress(120)` and a plain `input swipe` never
activates it. Moving perf-001 from position 2 to 0 renumbered all three rows
correctly in `playlist_tracks`.

`QueueSource` reaches the database: `play_events` recorded `source_type=playlist,
source_id=1, ms_played=6089, completed=1`, and `stats_rollups` gained three
matching rows — `week 2026-W31`, `month 2026-08`, `year 2026`, each
`playlist/1, play_count=1, ms_played=6089`. That path was unit-covered but had
never been seen on a device.

**Repeat-listen seek-back.** MUSE - Cryogen, 5:10, threshold 30 s. Played to
3:00, dragged the scrubber to the start, played again, dragged back a second
time. Two distinct qualifying rows for the same track — `ms_played=211171` and
`ms_played=144145`, both `outcome=play` — which is exactly what
`isRewindToRestart` exists to produce. `track_stats` and all three rollup
periods agree at 4 plays / 464455 ms.

**Background audio**, incidentally: playback continued through the app being
backgrounded to the launcher and was still at `state=PLAYING` on return. The
engine outliving every screen is the reason, and this is the first time it has
been watched.

**The spec strip on a real MP3** reads `MP3 · 44.1 kHz · 138 kbps · Stereo ·
5.1 MB`. Two things confirmed there: no codec field, because `codecOf` returns
null when the subtype is already the container name; and 138 kbps, which is
`SpecMath.bitrateKbps` computing from size and duration rather than trusting
the retriever's reported 32 — the exact file its doc comment describes.

**One UX gap found.** `MiniPlayer` is rendered only in `app/(tabs)/_layout.tsx`,
so pushed stack screens have no transport control. Start playback from a
playlist detail screen and there is no visible player and no route to Now
Playing without going back to a tab. It follows from the routing structure
rather than being a defect, but it is a real gap.

---

## Release build, first run ever

`app-release.apk`, 133 MB universal, installed on the Pixel_7 AVD with
`adb reverse --remove-all` first, so nothing could quietly fall back to Metro.

- **No `INTERNET` permission**, confirmed with `aapt2 dump permissions` before
  installing. `ACCESS_NETWORK_STATE` is present and grants no network access
  without it, as ADR 009 records.
- Boots standalone, no crash, no red box, no `Unable to load script`.
- All four tabs render under Hermes and minification: Library's empty state,
  Playlists, Stats with its Week/Month/Year segments, and Settings with theme,
  language including `Türkçe`, and all five shuffle algorithms with their
  descriptions. Lucide SVG icons and all three fonts load.

This was the last thing in the project never to have been run. Note it is still
a *functional* smoke test — no release-build numbers were taken, so the
cold-start caveat below stands unchanged.
