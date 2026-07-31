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
  experiences.
