/**
 * How big the Now Playing cover may be.
 *
 * The cover used to be sized from the screen width alone — a square of
 * `width - 2 × gutter`, whatever that came to. On a 393 × 851 dp phone that is
 * 345 dp of artwork above roughly 440 dp of title, spec strip, scrubber and
 * transport, inside about 780 dp of usable height. The column overflowed by a
 * good 50 dp, and `justify-center` split the overflow between both ends: the
 * header was clipped off the top and the transport row was pushed under the
 * navigation bar. Two bug reports, one cause — the artwork was never asked
 * whether it fit.
 *
 * So the cover is bounded by both axes. The height comes from a real
 * measurement of the space flex left over rather than from a constant, because
 * the chrome below it is not a fixed height: the title wraps to two lines, and
 * Turkish runs 10–20% longer than English.
 */

/** `px-6` either side of the cover, matching the rest of the screen. */
export const ARTWORK_GUTTER = 24;

/**
 * The side of the cover square.
 *
 * `availableHeight` of zero means layout has not run yet, where the width bound
 * is the better guess — starting at zero would draw an invisible cover for a
 * frame and then pop.
 */
export function artworkSize(screenWidth: number, availableHeight: number): number {
  const byWidth = Math.max(0, screenWidth - ARTWORK_GUTTER * 2);
  if (availableHeight <= 0) return byWidth;
  return Math.max(0, Math.min(byWidth, availableHeight));
}
