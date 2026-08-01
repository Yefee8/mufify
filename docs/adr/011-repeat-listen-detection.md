# 011 — A repeated track is a second listen

## Context

ADR 005 settled what counts as a play: `min(30s, duration × 0.5)` of actual
playback, with `skip` below `duration × 0.2` and `partial` in between. **That
rule is not reopened here and none of its numbers change.**

It answers a different question from the one this ADR is about. ADR 005 decides
whether *a* listen counted. It says nothing about where one listen ends and the
next begins, because until now that was never in doubt: the engine closed a
listen when the loaded track changed, and a track only changed when playback
moved on.

Repeat-one breaks that assumption completely. A song looped all afternoon never
changes the loaded track, so it produced exactly one `play_event`. The same is
true of dragging the scrubber back to the start and listening again. The
statistics were not wrong about what counted — they were wrong about how many
times it happened, which for anyone who loops their favourites is the more
visible error.

## Decision

**A track that starts over, having already earned a play, ends its listen and
begins a new one.**

Two conditions, checked on every status tick against the previous one:

1. The current listen has already accumulated at least the ADR 005 play
   threshold. A listen that has not counted yet has nothing worth banking.
2. The position jumped backwards to at or below **25% of the track**.

Both a loop to zero and a manual drag to the beginning satisfy the second
condition. A nudge back over the last chorus does not.

The rule lives in `src/services/stats/repeatListen.ts` as a pure function, and
its thresholds are pinned by tests — this decides whether a listen is counted
once or twice, so a quiet change to either condition silently rewrites the
user's history.

### Why the first condition

Without it, scrubbing around inside the first thirty seconds of a track would
shatter one listen into a dozen fragments, each too short to count as anything.
A real play would be recorded as a pile of skips. Requiring the listen to have
already counted means the only thing a rewind can do is *add* a listen, never
subtract one.

### Why 25%

The number has to separate two things that look identical from the outside —
"start it again" and "go back a bit" — and the only signal available is how far
back the position went.

A tighter bound would count a scrub back over the final chorus as a replay. A
looser one would miss a genuine restart on a track someone had nearly finished.
A quarter means the listener has given up at least three quarters of their
progress, which is a decision rather than an adjustment.

### What is deliberately not required

The new listen does **not** have to pass the play threshold for the boundary to
fire. The boundary fires on the rewind; the new listen is then classified by the
ordinary ADR 005 rule when *it* ends.

This falls out better than the alternative. Someone who rewinds and then leaves
gets a `play` for what they heard and a `skip` for what they abandoned — both
true — rather than having the abandoned fragment silently merged into the
completed play.

## Consequences

A track looped three times produces three `play_events` and three increments of
`play_count`, which is what a listener means when they say they played something
three times.

`startedAt` is reset to the moment the new listen begins, not left at the
original. Period keys derive from when a listen started, so a loop that runs
across midnight puts its two halves in the right days.

Existing history is unaffected. This changes how future listens are segmented
and rewrites nothing already recorded, so the counts for a track someone looped
last week stay as they were.

One cost worth naming: the engine now keeps `lastPositionMs` between status
ticks, which is playback state existing solely for a statistics feature. It is
one integer and the alternative — having the recorder subscribe to position at
2 Hz and reconstruct the sequence itself — would be worse in every way.

## References

- ADR 005 — the play/skip/partial thresholds, unchanged by this.
- `docs/stats.md` — the recording pipeline, with a section on this.
- `src/services/stats/repeatListen.test.ts` — the pinned thresholds.
