# 031 — A drop that stays put

**Status:** accepted
**Date:** 2026-11-07

## Context

Reordering a playlist was smooth while the finger was down and jumped about
after it lifted. Recorded on an emulator and read frame by frame, "after it
lifted" was four separate faults:

1. **The list rebuilt the moved rows.** Rows were keyed by track id and
   position. A reorder rewrites the position of every row between the two
   slots, so when the write landed those rows came back from the query as
   rows FlashList had never seen: it discarded their cells, built new ones,
   reloaded their covers, and the list visibly shuffled a beat after the drop.
2. **The list scrolled.** FlashList 2 keeps the first visible row in place when
   its data changes. After a reorder that row can be the one just moved, and
   keeping it in place scrolled the whole list by the distance it travelled.
3. **The order went backwards before it went forwards.** The drag's transforms
   were reset on the UI thread the moment the finger lifted; the reordered
   data arrived from the JS thread whenever it rendered. In between the screen
   showed the old order. On a busy mid-range phone that was a teleport.
4. **Putting a row back where it was crashed the app.** The worklets plugin
   captures what a worklet calls when the worklet is *defined*. `cancelDrag`
   was defined above `endDrag`, captured it as undefined, and threw the first
   time a drag ended on its own slot. 1.6.1 shipped with this.

## Decision

- Entries are keyed by the `playlist_tracks` row's own `rowid`, which a
  reorder — an `UPDATE` of positions — never changes. Liked songs use the
  track id.
- The playlist and library lists turn FlashList's content anchoring off.
- A drop glides the held row the last fraction of a row into the gap, *then*
  commits the move; the transforms are reset only after React has committed
  the new order, from a layout effect, sent straight to the UI thread.
- `endDrag` is declared above every worklet that calls it, with a comment
  saying why that is load-bearing, and every worklet module was scanned for
  the same trap.

## Consequences

What is left is one frame. React commits the new layout and Reanimated's
reset lands on the following frame, so for a single frame the moved rows are
drawn one slot further than they belong. Three things were tried to close it
and measured: resetting in an insertion effect (no change), resetting from the
UI thread (no change), and rendering the commit with the animated style
detached — which was worse, because a detached Reanimated style leaves its
last transform on the native view and the rows stayed displaced for several
frames. Neither library offers a way to land a React layout and a Reanimated
transform in the same frame.

Closing it for good means a drag that never needs the two to agree: the list
reordered live while the finger moves, the held row drawn above the list. That
is a different design rather than a fix to this one.
