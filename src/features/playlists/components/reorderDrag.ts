import { Easing, makeMutable, withTiming } from 'react-native-reanimated';

/**
 * The one drag in progress, shared by every row that has to move out of its way.
 *
 * Module level, like `playerExpansion` and for the same two reasons: there is
 * one playlist on screen at a time, and shared values written from a worklet
 * that a hook closed over are what the React Compiler's immutability rule
 * objects to — it is right about ordinary values and models nothing about
 * Reanimated. Worklet functions here, component-free, sidestep it.
 *
 * Why it exists at all: the drag used to move only the row being held. Nothing
 * else shifted, so there was no gap to drop into and no way to tell where the
 * row would land — you let go and found out. The list is not reordered until
 * release, which is still right (positions are half of a unique index, so each
 * write is a three-statement transaction, and rows shuffling under the finger
 * holding one is its own problem), but *displaying* the new order costs
 * nothing and is the entire point of dragging.
 */

/** Index being dragged, or -1 when nothing is. */
export const dragFrom = makeMutable(-1);
/** Index it would land on if released now. */
export const dragTo = makeMutable(-1);
/** The held row's own travel, in pixels. */
export const dragOffset = makeMutable(0);
/**
 * 1 once a drop has been committed, until the next drag begins.
 *
 * The rows read it to decide whether returning to zero is an animation or a
 * fact. After a committed drop the list has re-rendered in the new order, so
 * every row's slot is already its final one and easing it back to zero would
 * slide a row that has nowhere to go. After a cancelled drag the order has not
 * changed and the easing is the point.
 */
export const dragSettled = makeMutable(0);

export function beginDrag(index: number): void {
  'worklet';
  dragSettled.value = 0;
  dragFrom.value = index;
  dragTo.value = index;
  dragOffset.value = 0;
}

/** Follow the finger, and work out which slot that lands in. */
export function updateDrag(
  index: number,
  translationY: number,
  rowHeight: number,
  count: number,
): void {
  'worklet';
  dragOffset.value = translationY;
  const moved = Math.round(translationY / rowHeight);
  dragTo.value = Math.min(count - 1, Math.max(0, index + moved));
}

/** A drag let go without having gone anywhere, travelling back. */
const RETURN_MS = 170;

/**
 * Let go without a move: ease the row home, then release the drag.
 *
 * Only for a drag that chose its own slot, or one the system cancelled — a
 * committed drop does not come through here, because by the time it lands the
 * list has already re-rendered with the row in its new place and there is
 * nothing left to animate. Easing it anyway was the old bug: the row slid from
 * its new slot back towards the old one, then corrected, which read as the drop
 * being rejected.
 *
 * Here rather than in the component because the write is to a shared value from
 * a gesture callback, which is what the React Compiler's immutability rule
 * objects to. A worklet beside the values it owns is the shape the rest of this
 * app already uses for the same reason.
 */
export function cancelDrag(): void {
  'worklet';
  dragOffset.value = withTiming(
    0,
    { duration: RETURN_MS, easing: Easing.out(Easing.cubic) },
    (finished) => {
      if (finished) endDrag(false);
    },
  );
}

/**
 * Nothing is being dragged any more.
 *
 * `settled` says whether the list has taken the move over — see `dragSettled`.
 */
export function endDrag(settled: boolean): void {
  'worklet';
  dragSettled.value = settled ? 1 : 0;
  dragFrom.value = -1;
  dragTo.value = -1;
  dragOffset.value = 0;
}

/**
 * How far a row that is *not* being dragged has to move to make room.
 *
 * Everything between where the held row came from and where it is going slides
 * one slot towards the gap it left. Rows outside that span do not move at all,
 * which is what makes the gap read as a gap.
 */
export function shiftFor(index: number, from: number, to: number, rowHeight: number): number {
  'worklet';
  if (from === -1 || index === from) return 0;
  if (from < index && index <= to) return -rowHeight;
  if (from > index && index >= to) return rowHeight;
  return 0;
}
