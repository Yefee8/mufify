import { Easing, makeMutable, runOnJS, withTiming } from 'react-native-reanimated';

/**
 * The one drag in progress: which row is held, and where its floating copy is.
 *
 * Module level, like `playerExpansion` and for the same two reasons: there is
 * one playlist on screen at a time, and shared values written from a worklet
 * that a hook closed over are what the React Compiler's immutability rule
 * objects to. Worklet functions here, component-free, sidestep it.
 *
 * **How a drag works, and why this way.** The held row is drawn twice: once in
 * the list, where it is hidden, and once in a floating copy above the list
 * that follows the finger. Every time the finger crosses into a new slot the
 * list is reordered for real — React, a layout animation sliding the rows that
 * make room — so the list underneath is always in the order on screen. When the
 * finger lifts, the copy glides into the slot the hidden row already occupies,
 * and then the copy is hidden and the row shown in a single UI-thread step.
 *
 * Nothing at the end of a drag has to be put back. The design before this one
 * stood the rows in their new places with transforms and only reordered the
 * data on release, so the drop meant swapping transforms (UI thread) for a
 * layout (JS thread) — and no sequencing of two threads lands them in the same
 * frame. That left one frame of rows a slot out of place on every drop, which
 * is what "teleporting after the drop" was. Here the layout is right all along
 * and the swap at the end is two values on one thread. See ADR 031.
 */

/** The held row's entry id, or -1 when nothing is held. */
export const dragKey = makeMutable(-1);
/** 1 once the floating copy is drawn, which is when the row in the list hides. */
export const copyShown = makeMutable(0);
/** The floating copy's top, in the list's own coordinates (0 is the list's top edge). */
export const copyTop = makeMutable(0);
/** 0 at rest, 1 lifted: the copy's scale and shadow. */
export const lift = makeMutable(0);
/** The slot the held row occupies in the order on screen. */
export const liveIndex = makeMutable(-1);
/** The list's scroll offset, kept current by the screen. */
export const listScrollY = makeMutable(0);

/** Where the copy started, and where the finger was then, so it can follow by difference. */
const startTop = makeMutable(0);
const startAbsoluteY = makeMutable(0);
/** 1 while the finger is down, 2 while the copy is landing, 0 otherwise. */
const phase = makeMutable(0);

const LIFT_MS = 120;
/** The copy gliding the last fraction of a row into its slot. */
const LAND_MS = 140;

/** Kept current from the list's scroll events, so a pick-up knows where the row is. */
export function setListScroll(offset: number): void {
  listScrollY.value = offset;
}

/**
 * The copy is on screen: hide the row it copies.
 *
 * Called once React has drawn the copy, so the row never disappears before
 * the thing replacing it is there.
 */
export function showCopy(): void {
  'worklet';
  if (dragKey.value !== -1) copyShown.value = 1;
}

/**
 * The drop is in the list: show the row, hide the copy — one step, one thread.
 *
 * Called once React has committed the final order, so the row reappears in a
 * slot that is already its own.
 */
export function release(): void {
  'worklet';
  dragKey.value = -1;
  copyShown.value = 0;
  liveIndex.value = -1;
  phase.value = 0;
}

/** The finger has held the handle long enough: lift a copy of the row off the list. */
export function pickUp(entryId: number, index: number, absoluteY: number, rowHeight: number): void {
  'worklet';
  const top = index * rowHeight - listScrollY.value;
  dragKey.value = entryId;
  liveIndex.value = index;
  startTop.value = top;
  copyTop.value = top;
  startAbsoluteY.value = absoluteY;
  phase.value = 1;
  lift.value = withTiming(1, { duration: LIFT_MS });
}

/**
 * Follow the finger; when it crosses into another slot, say so.
 *
 * By the absolute position rather than the gesture's own translation: the row
 * the gesture started on moves through the list as the order changes, and a
 * translation measured against a view that has moved would jump by a row each
 * time it did.
 */
export function follow(
  absoluteY: number,
  rowHeight: number,
  count: number,
  onSlotChange: (from: number, to: number) => void,
): void {
  'worklet';
  if (phase.value !== 1) return;
  const top = startTop.value + (absoluteY - startAbsoluteY.value);
  copyTop.value = top;

  const slot = Math.min(count - 1, Math.max(0, Math.round((top + listScrollY.value) / rowHeight)));
  if (slot === liveIndex.value) return;

  const from = liveIndex.value;
  liveIndex.value = slot;
  runOnJS(onSlotChange)(from, slot);
}

/**
 * Let go: glide the copy into the slot the row is already in, then hand over.
 *
 * `onLanded` commits the move and, once the final order has been drawn, calls
 * `release`. Until then the copy stays where it landed, covering the slot — so
 * however long the JS thread takes, nothing on screen is ever out of place.
 */
export function putDown(rowHeight: number, onLanded: () => void): void {
  'worklet';
  if (phase.value !== 1) return;
  phase.value = 2;
  lift.value = withTiming(0, { duration: LAND_MS });
  copyTop.value = withTiming(
    liveIndex.value * rowHeight - listScrollY.value,
    { duration: LAND_MS, easing: Easing.out(Easing.cubic) },
    () => {
      runOnJS(onLanded)();
    },
  );
}
