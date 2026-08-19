/**
 * Turning what the user dragged into a rectangle of source pixels.
 *
 * The crop sheet shows the image behind a square window: laid out at the size
 * that just covers the window, then scaled about its centre and translated in
 * screen pixels. That is three numbers — `scale`, `tx`, `ty` — and this is the
 * arithmetic that maps them back onto the file.
 *
 * Pure and away from the component, because it is the part that is wrong at
 * least once before it is right, and because a crop that is off by a factor is
 * not a visible glitch — it is a cover showing the wrong corner of a
 * photograph, which looks like the user missed rather than like a bug.
 */

/** The image is laid out at the size that just covers the window. */
export function baseScale(imageWidth: number, imageHeight: number, window: number): number {
  if (imageWidth <= 0 || imageHeight <= 0 || window <= 0) return 1;
  return Math.max(window / imageWidth, window / imageHeight);
}

/**
 * How far the image may be dragged before a corner of the window is uncovered.
 *
 * Symmetric about the centre, and zero on an axis the image only just covers —
 * a square photograph in a square window has nowhere to go sideways, and
 * allowing it to move would show background where the picture should be.
 */
export function panLimit(displayedSize: number, window: number): number {
  return Math.max(0, (displayedSize - window) / 2);
}

export interface CropView {
  /** Side of the square window, in screen pixels. */
  window: number;
  imageWidth: number;
  imageHeight: number;
  /** User zoom on top of the base scale. 1 is "just covers". */
  scale: number;
  /** Screen-pixel offset from centred, after scaling. */
  tx: number;
  ty: number;
}

export interface CropRect {
  originX: number;
  originY: number;
  size: number;
}

/**
 * The square of source pixels the window is showing.
 *
 * Derived rather than tracked: the window is fixed and the image moves under
 * it, so the crop is entirely a function of where the image ended up. Keeping
 * a rectangle in state alongside the transform would be two representations of
 * one fact, and they would disagree the first time a gesture was interrupted.
 */
export function cropRectFor(view: CropView): CropRect {
  const { window, imageWidth, imageHeight, scale, tx, ty } = view;
  if (window <= 0 || imageWidth <= 0 || imageHeight <= 0) {
    return { originX: 0, originY: 0, size: Math.max(1, Math.min(imageWidth, imageHeight)) };
  }

  // Screen pixels per source pixel, all in.
  const k = baseScale(imageWidth, imageHeight, window) * Math.max(scale, 0.0001);

  const displayedWidth = imageWidth * k;
  const displayedHeight = imageHeight * k;

  // Where the window's top-left sits over the displayed image, then back into
  // source pixels.
  const originX = ((displayedWidth - window) / 2 - tx) / k;
  const originY = ((displayedHeight - window) / 2 - ty) / k;
  const size = window / k;

  return clamp({ originX, originY, size }, imageWidth, imageHeight);
}

/**
 * Keep a rectangle inside the image.
 *
 * The sheet clamps the gesture too, but it does so against a measured layout in
 * floats. A rectangle one pixel past an edge is not a rounding curiosity to the
 * native cropper — it throws — so the last word belongs here.
 */
function clamp(rect: CropRect, imageWidth: number, imageHeight: number): CropRect {
  const size = Math.max(1, Math.min(rect.size, imageWidth, imageHeight));
  return {
    size,
    originX: Math.max(0, Math.min(rect.originX, imageWidth - size)),
    originY: Math.max(0, Math.min(rect.originY, imageHeight - size)),
  };
}
