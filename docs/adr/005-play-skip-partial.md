# 005 — Three listen outcomes: play, skip, partial

## Context

The brief gives two rules:

- a **play** is `ms_played >= min(30_000, duration_ms * 0.5)`
- a **skip** is `ms_played < duration_ms * 0.2`

They are not complementary. The two thresholds cross at a duration of
**150,000 ms — 2.5 minutes** — and misbehave in opposite directions either side
of it.

**Over 2.5 minutes the thresholds overlap.** `duration * 0.2` moves past the
30-second play cap, so a band of listens satisfies both rules at once. A
4-minute track heard for 40 seconds is over the 30s play mark *and* under the
48s skip mark. Most songs are longer than 2.5 minutes, so this is the ordinary
case.

**Under 2.5 minutes the thresholds leave a gap.** The skip mark falls below the
play mark, so a band of listens satisfies neither. A 20-second track heard for
5 seconds is under the 10s play mark and over the 4s skip mark. Under a
two-outcome model those listens have nowhere to go and disappear.

## Decision

Three outcomes, evaluated in order, with **play checked first**.

| Outcome | Condition | Counters |
|---|---|---|
| `play` | `ms_played >= min(30_000, duration * 0.5)` | `play_count += 1`, `ms_played` added |
| `skip` | otherwise, `ms_played < duration * 0.2` | `skip_count += 1`, `ms_played` added |
| `partial` | everything else | neither counter, `ms_played` added |

Ordering resolves the overlap: the band that satisfies both counts as a play.
`partial` absorbs the gap, so nothing is silently lost. `ms_played` accrues in
all three cases, so total listening time stays honest even when the listen was
not decisive.

The outcome is **stored on `play_events`**, not re-derived at read time. The
thresholds are duration-dependent, so recomputing later would silently
reclassify existing history if the rule ever moved, and a rollup rebuild has to
agree with the counters that were written at the time.

Degenerate input — non-positive duration or non-positive `ms_played` — is
`partial`. It is recorded and counted as nothing rather than guessed at.

## Consequences

Skip counts under-report relative to a reading where the skip test wins the
overlap. That is the intended trade: a play the user actually completed thirty
seconds of should not also be a skip.

`stats_rollups` counts plays only. Phase 7 may want a partial count per period;
the column can be added then without touching history, because the outcome is
already on every event.

`hasOverlappingThresholds()` and `hasThresholdGap()` report which regime a
duration is in. They exist so the boundary behaviour is testable and visible
rather than folded into one opaque branch.

**This is settled and will not be reopened in Phase 7.** By then every rollup
depends on it, and changing it means rebuilding all history.
