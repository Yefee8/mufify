# 016 — One sheet primitive, not one per sheet

## Context

Now Playing's opening transition was tuned by hand and the user confirmed it
reads right. The queue, moved to the root by ADR 014, opened badly — and the
difference was never taste.

Now Playing drove a module-level shared value that both drag gestures write to,
settled it with `withSpring` at `damping: 22, stiffness: 180, mass: 0.9`
(ζ ≈ 0.86), handed the gesture's velocity to that spring, and ramped opacity to
full at 40% of the travel. The queue used Reanimated's layout animations:
`SlideInDown.springify().damping(22).stiffness(180)` in, `SlideOutDown` out.

Every one of those numbers looks the same and behaves differently. No `mass`
means Reanimated's default of 1, so ζ ≈ 0.82 rather than the 0.86 that was
tuned. `SlideOutDown` has no spring at all — the way out was a plain timing.
There was no velocity handoff, so a flick and a slow press opened identically.
And no fade, so the sheet crossed the screen at full opacity from the first
frame.

ADR 014 fixed *whether* the queue appeared and left *how* alone. The second
problem was invisible until the first was solved.

## Decision

**One primitive, used by both, with the motion defined once.**

- `src/services/motion/sheetMotion.ts` — the spring, the fade fraction, and the
  speed multipliers. Pure, so the scaling is unit tested rather than eyeballed.
- `src/components/ui/Sheet.tsx` — the surface. Takes a progress value, draws
  `translateY` and the opacity ramp against it, gates touches on `expanded`.
- `src/components/ui/useSheet.ts` — opening and closing. `visible` is mounted,
  `expanded` is interactive, and the gap between them is the animation.

The progress value is passed **in** rather than created by the hook. It is a
module-level `makeMutable` per sheet, which is what lets a gesture write to it
from a worklet — a value a hook created and captured is exactly what the React
Compiler's immutability rule rejects, correctly, for ordinary values. The same
reasoning already put `playerExpansion` at module level; the queue now has
`queueExpansion` beside it.

Two values rather than one shared: the queue opens *over* an already-open
player, so they travel independently, and one value would drag the player closed
as the queue arrived.

## Consequences

A third sheet — add-to-playlist, a Wrapped view — inherits the tuned motion by
construction. That is the point: the queue's problem was that copying a
transition is easy to do almost right, and "almost right" is invisible in review
and obvious on a phone.

The animation-speed setting (`docs`, Settings → Motion) has exactly one place to
apply, and reduced motion takes the same path as choosing Instant rather than a
second nearly-identical one.

`Sheet` deliberately imposes no safe area. Now Playing insets top and bottom;
the queue's own screen does its own. A primitive that decided for them would be
wrong for one of them.

The cost is one more indirection between `PlayerLayer` and what draws. Worth it
at two callers; it would not have been at one.

## References

- `docs/adr/014-queue-is-a-root-sheet-not-a-route.md` — why the queue is here.
- `src/services/motion/sheetMotion.test.ts` — the scaling, including that the
  damping ratio survives it.
