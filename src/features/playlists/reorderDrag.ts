import { Easing, makeMutable, runOnJS, withTiming } from 'react-native-reanimated';

/**
 * The one drag in progress, shared by every row that has to move out of its way.
 *
 * Module level, like `playerExpansion` and for the same two reasons: there is
 * one playlist on screen at a time, and shared values written from a worklet
 * that a hook closed over are what the React Compiler's immutability rule
 * objects to — it is right about ordinary values and models nothing about
 * Reanimated. Worklet functions here, component-free, sidestep it.
 *
 * Beside the hooks rather than under `components/`: the row writes it while the
 * finger is down, and `useReorderableEntries` writes it once the new order is
 * on screen. Both sides own a piece of the drop.
 *
 * **What moves during a drag is pixels, not rows.** The rows between where the
 * held one came from and where it would land slide one slot towards the gap,
 * which is the list showing the order about to be committed. The data is only
 * reordered once the finger lifts — and the pixels are only put back once the
 * reordered data is on screen. The order of those two is the whole of the drop.
 */

/** Index being dragged, or -1 when nothing is. */
export const dragFrom = makeMutable(-1);
/** Index it would land on if released now. */
export const dragTo = makeMutable(-1);
/** The held row's own travel, in pixels. */
export const dragOffset = makeMutable(0);
/** 1 while a finger is on the handle. */
export const dragHeld = makeMutable(0);
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

/**
 * Nothing is being dragged any more.
 *
 * `settled` says whether the list has taken the move over — see `dragSettled`.
 *
 * **Defined before every worklet that calls it, and that is load-bearing.** The
 * worklets plugin captures what a worklet refers to when the worklet is
 * *defined*, not when it runs. A worklet above this declaration captured
 * `endDrag` as undefined and threw the first time it reached the call — which
 * is how the first version of `finishDrop` took the app down on every drop.
 */
export function endDrag(settled: boolean): void {
  'worklet';
  dragSettled.value = settled ? 1 : 0;
  dragHeld.value = 0;
  dragFrom.value = -1;
  dragTo.value = -1;
  dragOffset.value = 0;
}

export function beginDrag(index: number): void {
  'worklet';
  dragSettled.value = 0;
  dragHeld.value = 1;
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

/** The held row gliding into the gap the list has been holding open. */
const LAND_MS = 140;
/** A drag let go without having gone anywhere, travelling back. */
const RETURN_MS = 170;

/**
 * Let go over a new slot: glide into it, *then* hand the move over.
 *
 * The finger rarely lifts exactly on a slot, so the row first travels the last
 * fraction of a row into the gap the others have opened — that is the "smooth"
 * in a smooth drop. Only when it has arrived is the move committed, and the
 * drag state stays exactly as it is until `finishDrop` says the new order has
 * been drawn.
 *
 * The version before this one reset the transforms the moment the finger
 * lifted and reordered the data afterwards. Those happen on different threads:
 * the reset on the UI thread at once, the reorder whenever the JS thread got
 * round to rendering it. In between the list showed the *old* order — the row
 * jumped back to where it was picked up, then forward to where it was put. On
 * a fast emulator that was a frame; on a mid-range phone with a busy JS thread
 * it was a visible teleport.
 *
 * The move is committed even if the glide is interrupted: the finger has
 * already said where the row goes, and losing that because another touch
 * landed would be worse than a drop that skips its last few pixels.
 */
export function dropDrag(
  index: number,
  target: number,
  rowHeight: number,
  onLanded: (from: number, to: number) => void,
): void {
  'worklet';
  dragHeld.value = 0;
  dragOffset.value = withTiming(
    (target - index) * rowHeight,
    { duration: LAND_MS, easing: Easing.out(Easing.cubic) },
    () => {
      runOnJS(onLanded)(index, target);
    },
  );
}

/**
 * Let go without a move: ease the row home, then release the drag.
 *
 * For a drag that chose its own slot, or one the system cancelled. Nothing is
 * committed, so nothing else will put the pixels back — the easing does.
 */
export function cancelDrag(): void {
  'worklet';
  dragHeld.value = 0;
  dragOffset.value = withTiming(
    0,
    { duration: RETURN_MS, easing: Easing.out(Easing.cubic) },
    (finished) => {
      if (finished) endDrag(false);
    },
  );
}

/**
 * The reordered list is on screen; put the pixels back.
 *
 * Called by `useReorderableEntries` from a layout effect — after React has
 * committed the new order, in the same tick, so the rows' new positions and
 * their transforms returning to zero reach the screen together rather than a
 * thread-hop apart. A no-op when a new drag has already begun: its state is
 * not this drop's to clear.
 */
export function finishDrop(): void {
  'worklet';
  if (dragHeld.value === 1 || dragFrom.value === -1) return;
  endDrag(true);
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
