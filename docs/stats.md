# Statistics

Everything is computed on-device from the user's own history. No network, no
account, no export unless the user asks for one.

> Phase status: the counting rule and period keys are implemented and tested
> (Phase 1). Event recording is wired; rollups and the screens land in Phase 7.

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

### Not yet implemented

Seeking backwards must not create a second event. That is a recorder concern
and lands with playback in Phase 3.

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

## Rollups — Phase 7

`stats_rollups` is keyed `(period_type, period_key, entity_type, entity_id)`
with a unique index, which is the upsert target. Every play event will
increment week/month/year × track/artist/album/playlist incrementally.

**Stats screens read rollups only.** Never aggregate `play_events` in a screen
query.

Correctness is tested by comparing incremental rollups against a brute-force
recount over `play_events` — that test is the point of the whole design and
lands with the rollups.
