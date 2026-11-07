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

A first pass fixed the four faults in place — stable `rowid` keys, anchoring
off, the transforms reset only after React committed the new order, `endDrag`
declared above its callers — and left one frame. During a drag the rows stood
in their new places by Reanimated transforms; the drop swapped those for a
React layout, and a UI-thread value and a JS-thread layout do not land in the
same frame. Three ways of closing that frame were tried and measured, and none
did: resetting in an insertion effect, resetting from the UI thread, and
rendering the commit with the animated style detached — which was worse, since
a detached Reanimated style leaves its last transform on the native view.

So the drag was rebuilt so that nothing needs swapping at the end:

- **The list is reordered for real while the finger moves.** Each time the
  held row crosses into another slot the order is committed to React, with a
  layout animation sliding the rows that make room. The rows never carry
  transforms; their layout is always the order on screen.
- **The held row is drawn as a floating copy above the list**, moved by the
  finger's absolute position on the UI thread. The row itself stays in the
  list, hidden, travelling with the live order.
- **The drop is a glide and a swap.** The copy glides into the slot the hidden
  row already occupies; once React has committed the final order, the copy is
  hidden and the row shown — two shared values written in one worklet, one
  frame, no layout involved.
- **The database is written once, by row identity**: "this row after that
  one", via `placeAfter` over rowids. Two positions were only true of the table
  as the screen last saw it, and two drops in quick succession could each be
  computed against a table the other had already rewritten. Removing and
  playing a row are addressed the same way.

## Consequences

Measured on an Android 15 emulator with screen recordings read frame by frame:
drags of three to five rows in both directions show no frame out of place, and
the last frames of every drop converge to stillness. After two back-to-back
drops, the order on screen and the order read fresh from the database are
pixel-identical.

The drag no longer auto-scrolls the list, and never did; a row can be moved as
far as the screen shows in one drag. Under a search the rows are not draggable,
because a filtered list is not the whole list.
