import { useCallback, useState } from 'react';
import { useWindowDimensions, type LayoutChangeEvent } from 'react-native';

/**
 * How wide a card wants to be. Not a hard size — see below.
 *
 * Roughly the width at which a cover still reads as a cover with its two lines
 * of text underneath. The grid divides the window by it and rounds down, so the
 * cards are always a little wider than this rather than exactly it.
 */
const CARD_WIDTH = 300;

/**
 * A card is a square cover with two lines under it, so its width is also most
 * of its height — and a card wider than about this much of a short window is a
 * shelf you scroll one album at a time. The cap is what makes a landscape phone
 * get three small cards rather than two enormous ones.
 */
const MAX_CARD_HEIGHT_FRACTION = 0.45;

/** Two across a portrait phone, which is the layout the app was designed at. */
const MIN_COLUMNS = 2;
/** Past five the covers are thumbnails and the shelf stops being a shelf. */
const MAX_COLUMNS = 5;

/**
 * Cards per row for the artist and album grids, from the space the grid has.
 *
 * It was the constant `2` for as long as the app was locked to portrait. Two
 * across a landscape phone or a tablet makes each card half the *long* edge: a
 * cover taller than the screen showing it, and a grid that scrolls one album at
 * a time.
 *
 * Measured rather than taken from the window, because the two are not the same
 * number: in a short window the grid sits in `ShortWindowSplit`'s right-hand
 * column with three fifths of the width, and a count derived from the window
 * would pack that column with cards sized for a screen it does not have.
 *
 * Shared because the grid and its skeleton have to agree. They are two separate
 * components rendering the same layout — a count held in each would be a shelf
 * that reflows the moment real data lands, which is the one thing a skeleton
 * exists to prevent. They measure the same box, so they reach the same answer.
 *
 * Before the first measurement it answers `MIN_COLUMNS`, which is what a phone
 * held upright gets anyway, so the usual case never reflows.
 */
export function useCardColumns(): {
  columns: number;
  onLayout: (event: LayoutChangeEvent) => void;
} {
  const [width, setWidth] = useState(0);
  const { height } = useWindowDimensions();

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const measured = event.nativeEvent.layout.width;
    setWidth((current) => (current === measured ? current : measured));
  }, []);

  const target = Math.min(CARD_WIDTH, height * MAX_CARD_HEIGHT_FRACTION);

  // Rounded rather than floored: flooring picks the count whose cards are the
  // *largest* that still fit, which is how a column three cards wide ended up
  // showing two covers taller than the captions under them.
  const columns =
    width === 0
      ? MIN_COLUMNS
      : Math.max(MIN_COLUMNS, Math.min(MAX_COLUMNS, Math.round(width / target)));

  return { columns, onLayout };
}
