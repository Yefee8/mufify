import { ARTWORK_GUTTER, artworkSize } from './artworkSize';

/**
 * The cover has to stay square and has to fit. It was doing neither: sized from
 * the width alone it overflowed the column, and `justify-center` then pushed
 * the header off the top and the transport under the navigation bar.
 */
describe('artworkSize', () => {
  it('is the width minus both gutters when there is height to spare', () => {
    expect(artworkSize(393, 600)).toBe(393 - ARTWORK_GUTTER * 2);
  });

  it('is the available height when height is the tighter bound', () => {
    expect(artworkSize(393, 266)).toBe(266);
  });

  it('never exceeds the space it was given', () => {
    for (const width of [320, 360, 393, 412, 480]) {
      for (const height of [0, 120, 266, 345, 700]) {
        const size = artworkSize(width, height);
        expect(size).toBeLessThanOrEqual(width - ARTWORK_GUTTER * 2);
        if (height > 0) expect(size).toBeLessThanOrEqual(height);
      }
    }
  });

  it('falls back to the width bound before the first layout', () => {
    // Zero would draw nothing for a frame and then pop to full size.
    expect(artworkSize(393, 0)).toBe(345);
  });

  it('never goes negative on an implausibly narrow screen', () => {
    expect(artworkSize(20, 100)).toBe(0);
    expect(artworkSize(20, 0)).toBe(0);
  });
});
