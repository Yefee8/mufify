import { makeMutable, withTiming } from 'react-native-reanimated';

import { panLimit } from '@/services/playlists/cropGeometry';

/**
 * Where the picture sits under the crop window, and every write to it.
 *
 * Module level rather than `useSharedValue`, for the same reason
 * `playerExpansion` is: the React Compiler's immutability rule rejects a write
 * to a value that a component closed over, and it rejects it wherever the
 * closure lives — a `useCallback`, a plain function in the body, or a gesture
 * worklet. The pattern that works, and the one `setPlayerExpansion` already
 * uses, is to keep the values *and the functions that move them* out here, and
 * have the component call them.
 *
 * One set for the app rather than one per mount is not a compromise: there is
 * exactly one crop sheet, it is a modal, and it cannot be open twice.
 *
 * Everything below is a worklet except the reset, which runs on the JS thread
 * as the sheet opens.
 */

/** User zoom on top of "just covers the window". 1 is fully zoomed out. */
const scale = makeMutable(1);

/** Screen-pixel offset from centred, after scaling. */
const tx = makeMutable(0);
const ty = makeMutable(0);

/** Where the current gesture started, so a drag is relative, not absolute. */
const savedScale = makeMutable(1);
const savedTx = makeMutable(0);
const savedTy = makeMutable(0);

/** Read by the animated style and, on confirm, by the crop arithmetic. */
export const cropScale = scale;
export const cropTx = tx;
export const cropTy = ty;

/** How the settle animation is timed. Short: it is a correction, not a move. */
const SETTLE_MS = 160;

export function beginPan(): void {
  'worklet';
  savedTx.value = tx.value;
  savedTy.value = ty.value;
}

export function dragBy(deltaX: number, deltaY: number): void {
  'worklet';
  tx.value = savedTx.value + deltaX;
  ty.value = savedTy.value + deltaY;
}

export function beginPinch(): void {
  'worklet';
  savedScale.value = scale.value;
}

export function zoomBy(factor: number): void {
  'worklet';
  scale.value = savedScale.value * factor;
}

/**
 * Put the picture back inside the window.
 *
 * Clamping happens here, on gesture end, rather than during the drag: a finger
 * stopped dead at a boundary feels like the app has frozen, and letting it
 * overshoot and spring back is how every other list in the app behaves.
 */
export function settleCrop(
  displayedWidth: number,
  displayedHeight: number,
  window: number,
  maxZoom: number,
): void {
  'worklet';
  const next = Math.min(maxZoom, Math.max(1, scale.value));

  // The limits are computed against the size the picture will settle *to*, not
  // the size it is at mid-pinch — otherwise a zoom-out that overshoots settles
  // with the pan still allowed to sit outside the window.
  const settledWidth = (displayedWidth / Math.max(scale.value, 0.0001)) * next;
  const settledHeight = (displayedHeight / Math.max(scale.value, 0.0001)) * next;
  const limitX = panLimit(settledWidth, window);
  const limitY = panLimit(settledHeight, window);

  scale.value = withTiming(next, { duration: SETTLE_MS });
  tx.value = withTiming(Math.min(limitX, Math.max(-limitX, tx.value)), { duration: SETTLE_MS });
  ty.value = withTiming(Math.min(limitY, Math.max(-limitY, ty.value)), { duration: SETTLE_MS });
  savedScale.value = next;
}

/**
 * Back to the whole picture, centred.
 *
 * Called as the sheet opens, so a second pick never inherits the first one's
 * framing — a picture arriving already half out of the window, with nothing on
 * screen to explain why.
 */
export function resetCropTransform(): void {
  scale.value = 1;
  savedScale.value = 1;
  tx.value = 0;
  ty.value = 0;
  savedTx.value = 0;
  savedTy.value = 0;
}

/** What the user framed, for the crop arithmetic. JS thread, on confirm. */
export function readCropTransform(): { scale: number; tx: number; ty: number } {
  return { scale: scale.value, tx: tx.value, ty: ty.value };
}
