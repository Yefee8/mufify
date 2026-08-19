import { baseScale, cropRectFor, panLimit } from './cropGeometry';

/**
 * Mapping a drag back onto the file.
 *
 * Worth testing because getting it wrong is invisible in the way that matters:
 * a crop off by a factor is not a glitch on screen, it is a cover showing the
 * wrong corner of somebody's photograph — which reads as the user having missed
 * rather than as a bug to report.
 */

const WINDOW = 300;

describe('baseScale', () => {
  it('covers the window from the shorter edge', () => {
    // A landscape photo has to be scaled until its *height* fills the square,
    // which is the larger of the two ratios.
    expect(baseScale(1000, 500, WINDOW)).toBeCloseTo(0.6);
    expect(baseScale(500, 1000, WINDOW)).toBeCloseTo(0.6);
  });

  it('is exact for an image already square', () => {
    expect(baseScale(600, 600, WINDOW)).toBeCloseTo(0.5);
  });

  it('scales a small image up rather than leaving a gap', () => {
    expect(baseScale(100, 150, WINDOW)).toBeCloseTo(3);
  });

  it('refuses to divide by a dimension it has not been given', () => {
    expect(baseScale(0, 100, WINDOW)).toBe(1);
    expect(baseScale(100, 0, WINDOW)).toBe(1);
    expect(baseScale(100, 100, 0)).toBe(1);
  });
});

describe('panLimit', () => {
  it('allows half the overhang in each direction', () => {
    expect(panLimit(500, 300)).toBe(100);
  });

  it('is zero on an axis the image only just covers', () => {
    // A square photo in a square window has nowhere to go, and letting it move
    // would show background where the picture should be.
    expect(panLimit(300, 300)).toBe(0);
    expect(panLimit(280, 300)).toBe(0);
  });
});

describe('cropRectFor', () => {
  const square = { window: WINDOW, imageWidth: 600, imageHeight: 600 };

  it('takes the whole of a square image at rest', () => {
    expect(cropRectFor({ ...square, scale: 1, tx: 0, ty: 0 })).toEqual({
      originX: 0,
      originY: 0,
      size: 600,
    });
  });

  it('takes the centre band of a landscape image at rest', () => {
    const rect = cropRectFor({
      window: WINDOW,
      imageWidth: 1000,
      imageHeight: 500,
      scale: 1,
      tx: 0,
      ty: 0,
    });

    expect(rect.size).toBeCloseTo(500);
    expect(rect.originX).toBeCloseTo(250);
    expect(rect.originY).toBeCloseTo(0);
  });

  it('zooming in takes less of the image, about the same centre', () => {
    const rect = cropRectFor({ ...square, scale: 2, tx: 0, ty: 0 });

    expect(rect.size).toBeCloseTo(300);
    expect(rect.originX).toBeCloseTo(150);
    expect(rect.originY).toBeCloseTo(150);
  });

  it('dragging right moves the crop left, by the scaled amount', () => {
    /*
     * The sign is the thing. Pulling the image to the right shows more of its
     * left-hand side, so the origin decreases — and it decreases in *source*
     * pixels, which at this zoom is twice the screen pixels dragged.
     */
    const rect = cropRectFor({
      window: WINDOW,
      imageWidth: 1000,
      imageHeight: 500,
      scale: 1,
      tx: 30,
      ty: 0,
    });

    expect(rect.originX).toBeCloseTo(250 - 30 / 0.6);
  });

  it('never runs past an edge, however far the drag went', () => {
    // The sheet clamps too, but in floats against a measured layout. A rect one
    // pixel over is not a rounding curiosity to the native cropper — it throws.
    for (const tx of [-10_000, 10_000]) {
      for (const ty of [-10_000, 10_000]) {
        const rect = cropRectFor({ ...square, scale: 1.5, tx, ty });

        expect(rect.originX).toBeGreaterThanOrEqual(0);
        expect(rect.originY).toBeGreaterThanOrEqual(0);
        expect(rect.originX + rect.size).toBeLessThanOrEqual(600);
        expect(rect.originY + rect.size).toBeLessThanOrEqual(600);
      }
    }
  });

  it('never asks for more pixels than the image has', () => {
    // A zoom below 1 should not be reachable, but a rect larger than the source
    // is the one failure the cropper cannot recover from.
    const rect = cropRectFor({ ...square, scale: 0.2, tx: 0, ty: 0 });

    expect(rect.size).toBeLessThanOrEqual(600);
  });

  it('survives being asked before the window has been measured', () => {
    // One render happens between mount and layout, and it must not throw or
    // hand back a rectangle full of NaN.
    const rect = cropRectFor({ window: 0, imageWidth: 600, imageHeight: 400, scale: 1, tx: 0, ty: 0 });

    expect(Number.isFinite(rect.originX)).toBe(true);
    expect(Number.isFinite(rect.size)).toBe(true);
    expect(rect.size).toBeGreaterThan(0);
  });

  it('is symmetric: the same drag either way lands the same distance out', () => {
    const left = cropRectFor({ ...square, scale: 2, tx: -40, ty: 0 });
    const right = cropRectFor({ ...square, scale: 2, tx: 40, ty: 0 });
    const centre = cropRectFor({ ...square, scale: 2, tx: 0, ty: 0 });

    expect(left.originX - centre.originX).toBeCloseTo(centre.originX - right.originX);
  });
});
