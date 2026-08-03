# Statistics

Everything is computed on-device from the user's own history. No network, no
account, no export unless the user asks for one.

> Phase status: counting, event recording, incremental rollups and the stats
> screen are implemented. The repeat-listen behaviour is pinned by
> `src/services/audio/listenRecording.test.ts` against the real engine, and
> partly confirmed on hardware — see "The repeat-listen device check,
> corrected" below for what a device session can and cannot settle.

---

## The counting rule

`src/services/stats/playCounting.ts`. Pure, so the recorder and the screens
cannot disagree about what a play is.

A listen has **three** outcomes, not two. Evaluated in order, play first:

| Outcome | Condition | `play_count` | `skip_count` | `ms_played` |
|---|---|:--:|:--:|:--:|
| `play` | `ms_played >= min(30_000, duration * 0.5)` | +1 | — | added |
| `skip` | otherwise, `ms_played < duration * 0.2` | — | +1 | added |
| `partial` | everything else | — | — | added |

Milliseconds accrue in all three cases. Total listening time is the honest
number regardless of whether a listen was decisive.

### Why three

The two thresholds cross at **150,000 ms — 2.5 minutes** — and go wrong in
opposite directions either side of it.

```
duration = 240s (4:00)          duration = 20s (0:20)
skip < 48s ─────────┐           skip < 4s ──┐
play ≥ 30s ─────┐   │           play ≥ 10s ─────┐
                │   │                       │   │
   0s ─── 30s ──┴───┴── 48s        0s ── 4s ┴───┴ 10s
        skip │ BOTH │ play           skip │NEITHER│ play
```

- **Over 2.5 minutes → overlap.** A 4-minute track heard for 40 seconds is over
  the play mark *and* under the skip mark. Ordered evaluation settles it: it is
  a play.
- **Under 2.5 minutes → gap.** A 20-second track heard for 5 seconds is under
  the play mark *and* over the skip mark. That is `partial` — recorded, counted
  as neither, not lost.

Boundary values, all pinned by tests:

| Duration | skip below | partial band | play at or above |
|---|---|---|---|
| 20s | 4,000 ms | 4,000 – 9,999 ms | 10,000 ms |
| 2:00 | 24,000 ms | 24,000 – 29,999 ms | 30,000 ms |
| 2:30 | 30,000 ms | *(none — thresholds meet)* | 30,000 ms |
| 4:00 | 30,000 ms | *(none — bands overlap)* | 30,000 ms |

The play threshold is **inclusive**, the skip threshold **exclusive**.
Non-positive duration or `ms_played` is `partial`.

Settled in `docs/adr/005-play-skip-partial.md`. Not reopening it: every rollup
will depend on it.

---

## Repeated listens

`src/services/stats/repeatListen.ts`, decided in
`docs/adr/011-repeat-listen-detection.md`. A layer **on top of** the counting
rule above, which is unchanged.

The rule above answers whether *a* listen counted. It says nothing about where
one listen ends and the next begins, because until playback existed that was
never in doubt: the engine closed a listen when the loaded track changed.

Repeat-one breaks that completely. A song looped all afternoon never changes the
loaded track, so it produced exactly one `play_event`. So did dragging the
scrubber back and listening again. The counts were not wrong about what
qualified — they were wrong about how many times it happened, which for anyone
who loops their favourites is the more visible error.

### The rule

A listen ends and a new one begins when **both** hold, checked on each status
tick against the previous one:

1. The current listen has already earned a play — at least `min(30s, duration ×
   0.5)` of playback.
2. The position jumped **backwards to at or below 25% of the track**.

A loop to zero and a manual drag to the start both satisfy the second. A nudge
back over the last chorus does not.

### Why each condition

**The earned-a-play requirement** is what stops seeking from shredding history.
Without it, scrubbing around inside the first thirty seconds would split one
listen into a dozen fragments, each too short to count as anything — turning a
real play into a pile of skips. With it, a rewind can only ever *add* a listen.

**25%** has to separate two things that look identical from outside: "start it
again" and "go back a bit". The only available signal is how far back the
position went. Tighter would count a scrub over the final chorus as a replay;
looser would miss a genuine restart on a nearly-finished track. A quarter means
at least three quarters of the progress was given up, which is a decision rather
than an adjustment.

### What the boundary deliberately does not check

That the *new* listen also passes the play threshold. The boundary fires on the
rewind; the new listen is then classified by the ordinary rule when it ends.

This falls out better than the alternative. Rewind and then leave, and you get a
`play` for what you heard plus a `skip` for what you abandoned — both true —
rather than the abandoned fragment silently merging into the completed play.

`startedAt` resets to the moment the new listen begins. Period keys come from
when a listen started, so a loop running across midnight puts its halves in the
right days.

The thresholds are pinned by `repeatListen.test.ts`. This decides whether a
listen is counted once or twice, so a quiet change to either condition silently
rewrites the user's history.

### Where the rule meets the engine

`repeatListen.ts` and `listenCycle.ts` are both pure and both have had good
tests for some time. Every miscount actually reported has lived in neither:
it lived in `AudioEngine.onStatus`, where a listen is opened, banked and
reopened against a stream of status ticks, and which nothing covered.

`src/services/audio/listenRecording.test.ts` now replays scripted tick streams
through the real engine with `expo-audio` behind a fake player. It is the only
place the wiring is checked, and it is where the duration defect below was
found. A device session cannot be re-run; that suite can.

---

## Period keys

`src/services/stats/periodKeys.ts`. Written **at insert time, in the user's
local timezone**, and never derived at read time — deriving them later gives
wrong answers across DST and travel, and forces a table scan.

| Key | Shape |
|---|---|
| `week_key` | `2026-W31` |
| `month_key` | `2026-07` |
| `year_key` | `2026` |

### DST cannot move a key

The keys come from the local *calendar day* — year, month, day — which is then
carried as a UTC midnight for all arithmetic. UTC has no days that gain or lose
an hour. Tested across both European transitions: two instants on 29 March at
01:30 and 03:30 produce identical keys, and 23:59 versus 00:01 the next day
still separate correctly.

### Week numbering

The fourth day of a week decides which year owns it, so a week straddling New
Year belongs to whichever year holds most of it. With the Monday setting that
fourth day is Thursday, which is exactly ISO 8601.

Consequences, all tested:

- 31 December 2025 → `2026-W01`
- 1 January 2027 → `2026-W53`
- the week key and the month key can disagree about the year, legitimately

The Sunday setting applies the same majority rule shifted by a day, and can put
the same instant in a different year: 3 January 2026 is `2026-W01` under Monday
and `2025-W53` under Sunday.

**Changing the week-start setting invalidates every week rollup.** It has to
trigger a rebuild, not a renumber.

---

## Which duration the rule is applied to

Every threshold in this document is a fraction of the track's duration, so the
counting rule is only as good as the number it divides. There are two of them
and they disagree.

The **scanner's** duration comes from MediaStore. It is null more often than
anyone expects: a file copied onto the device and indexed before its metadata
was read has a row with no duration at all, and it stays that way until stage
two of a scan reaches it. The **engine's** duration comes from the open file
and is authoritative.

`classifyListen(msPlayed, 0)` returns `partial` — the first line is
`if (durationMs <= 0 || msPlayed <= 0) return 'partial'`. So a track with no
stored duration recorded a `play_event` for every listen, moved neither
counter, and disappeared from the play counts entirely. Listening to it ten
times produced ten honest-looking rows and a play count of zero.

`PlaybackState.durationMs` already preferred the engine's figure. The listen
handed to the recorder did not — it carried `track.durationMs` straight off the
row. **`FinishedListen.durationMs` is now the engine's, falling back to the
scanner's only when the file never opened**, and the same preference decides
`isRewindToRestart`, so a repeat is detected on the same number the outcome is
judged against.

This is the third report of "the loop count is wrong" and the first one with a
mechanism that explains a partial failure rather than a total one: tracks with
a good stored duration counted correctly all along, which is why the defect
survived two rounds of device verification that happened to use them.

Pinned by `src/services/audio/listenRecording.test.ts` — three cases that fail
against the old behaviour.

---

## The current period is often legitimately empty

Reported as "this week is empty while this month and this year are full", which
is exactly what a broken week key would look like. It was not one.

Every event on that device had been recorded on the Saturday and Sunday of ISO
week `2026-W31`; the report was written on the Monday morning that began
`2026-W32`. The week cell was empty because the week was twenty minutes old. The
month and year cells still contained those same two days, which is why they
looked fine.

Settled by doing it rather than reasoning about it: a track played during the
session was written with `week_key = 2026-W32` and appeared in the week tab
immediately, matching the rollup exactly. Both sides derive the key from
`periodKeys`, so they cannot disagree — which is the only property that
actually needed checking.

Worth knowing because the two are indistinguishable on screen, and because it
will happen again every Monday to anyone whose listening is bursty. The
`the current period` block in `rollups.test.ts` pins the difference: a listen
recorded now files under the key the screen asks for, a listen from eight days
ago does not, and the boundary is the Monday rather than an arbitrary offset.

---

## Recording

`recordListen()` in `src/db/queries/playEvents.ts` does one insert into
`play_events` and one upsert into `track_stats`. The outcome and all three
period keys are written at that moment, from the time the listen *started* —
not from "now", which would misfile anything that crosses midnight.

The outcome is stored on the event rather than recomputed. The thresholds are
duration-dependent, so a later recomputation would silently reclassify history
if the rule ever changed, and a rollup rebuild has to agree with what was
counted at the time.

---

## Rollups

`stats_rollups` is keyed `(period_type, period_key, entity_type, entity_id)`
with a unique index, which is the upsert target. Every play event increments
week/month/year × track/artist/album/playlist incrementally, from
`applyRollups` inside `recordListen`.

One listen writes up to twelve cells — three periods times four entities,
minus a missing playlist. `rollupDeltas` builds that as a product rather than
by hand, so adding a period or an entity type cannot be done to one and
forgotten in the others. A null artist or album uses the reserved rollup id
`0`: it cannot collide with SQLite's positive row ids, is left-joined at read
time, and is rendered as the active locale's “Unknown Artist” or “Unknown
Album”. The content tables still retain null — no translated phantom row is
stored in user data.

The artist and album come from the `tracks` row, not from the caller. The
player knows what it is playing, not how the library has it classified, and a
rollup keyed on the wrong artist stays invisible until a year-end summary looks
wrong.

**Stats screens read rollups only.** Never aggregate `play_events` in a screen
query — that is a scan over the entire listening history on every tab switch,
and it grows forever.

Period totals sum the `track` rows only. Adding artist and album rows would
count every listen three times; they are the same listening seen from
different angles, not additional listening.

### Correctness

The design's whole risk is drift: a rollup that disagrees with the events it
summarises produces numbers that are wrong but plausible, and nothing on screen
looks broken.

So `rollups.test.ts` applies events one at a time into a running table — the
way `recordListen` does — and compares against a brute-force recount that
rebuilds every cell from scratch. 300 events across a year, five seeds, all
cells must match exactly. It also asserts order-independence, because a restore
or a backfill replays history in a different order and must reach the same
totals.

Verified on device as well as in tests: after playing ten tracks, the rollups
reproduced exactly the ten most recent `play_events` — 10 plays and 365,560 ms,
consistent across all three period types.

### The repeat-listen device check, corrected

An earlier version of this file said the repeat-listen behaviour had been
"verified on device". It had — twice — and both reports were true about what
they measured and wrong about what they implied, which is that the feature was
correct. Every track used in those sessions had a good stored duration, and
those counted correctly the whole time. The failure needs a track whose
MediaStore duration is missing, which is the state a freshly copied file is in.

Re-run 2026-08-02 against the real engine, with the matrix written down before
it was run rather than after: a, b and c pass on hardware — a loop produces one
event per pass, 27–30 s apart, with no duplicates — and d and e could not be
driven on device at all, because seeking forward needs the scrubber's pan and
no `adb input` sequence activates it. Full record in `docs/performance.md`.

**Prefer the harness over another device session.** A device session cannot be
re-run and so cannot catch the next regression; that is how this defect survived
two of them.

### Events recorded before rollups existed are not backfilled

Rollups began being written partway through development, so events older than
that are absent from them. This is visible only in this repository's test
data and is left alone deliberately: a backfill is a one-line recount over
`play_events`, and writing it now would be code that exists solely to fix a
situation no user will ever be in.

If history import or a schema migration later needs one, `foldDeltas` over
`rollupDeltas` for every event is the whole implementation.
