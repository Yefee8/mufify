# 014 — The queue is a root-level sheet, not a route

## Context

The queue was `app/queue.tsx`, declared in the root `Stack` with
`presentation: 'modal'` and opened with `router.navigate('/queue')`. Pressing
the queue button did open it. Nothing was ever visible.

The cause is not in `QueueScreen`. `PlayerLayer` mounts Now Playing **outside
the navigator** — an absolutely positioned, full-screen, opaque surface over
every route, which is what lets the mini player and the expanded player share
one gesture progress value and what keeps playback controls above every screen.
An overlay at that level covers whatever the navigator puts underneath it. The
queue was rendering correctly, one layer down, behind the player that opened
it.

That is worth stating in its general form, because it is not a fact about the
queue: **any route pushed while Now Playing is open disappears the same way.**
The overlay is a second, higher stacking context that expo-router does not know
about.

There is a second, independent reason a route cannot work here. The overlay
carries a `translateY` transform and clips its contents, and a transformed
ancestor creates a containing block — so even a surface that won the z-order
would be positioned and clipped relative to the overlay rather than the window.

## Decision

**The queue is a sibling of Now Playing at the root, owned by `PlayerLayer`,
one layer above it.** `QueueOverlay` renders it; `PlayerLayer` holds the open
state; `PlayerScreen` receives `onOpenQueue` as a prop. The route and its
`Stack.Screen` entry are deleted.

This is the same treatment Now Playing itself already gets, and for the same
reason: it is a surface belonging to the player, not a destination in the app's
navigation. It also matches how it behaves — the queue is opened from Now
Playing and dismissed back to it, never navigated *through*.

The alternative considered was collapsing Now Playing before navigating, so the
modal had nothing above it. It works, and it is wrong: dismissing the queue
would then return to the tab the user came from rather than to the player they
opened it from, and the queue would visibly close the player to open itself.

## Consequences

`QueueScreen` takes an `onClose` prop instead of calling `router.back()`. It is
mounted only while open — it carries a FlashList over the whole queue, and the
player should not pay for that while nobody is looking at it.

The sheet animates with Reanimated's `SlideInDown`/`SlideOutDown` layout
animations rather than a shared value, which keeps it clear of the React
Compiler's immutability rule about shared values captured by hooks — the reason
`playerExpansion` is a module-level `makeMutable` and the reason gestures in
this feature are built inline.

Deep-linking to the queue is gone. Nothing linked to it, `mufify://queue` was
never documented, and a queue is transient state rather than an addressable
place.

**Anything else that needs to appear over Now Playing has to go here too.** A
future "add to playlist" sheet opened from the player cannot be a route. That
is the standing cost of a root-mounted player overlay, and it is a cost this
project already accepted deliberately — see `docs/player.md` on why playback
outlives every screen.

## References

- `src/features/player/PlayerLayer.tsx` — the root layer and its stacking order.
- `src/features/player/components/QueueOverlay.tsx` — the sheet.
- `docs/components.md` — the component tree.
