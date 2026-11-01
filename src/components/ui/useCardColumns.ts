import { useWindowDimensions } from 'react-native';

/**
 * How wide a card wants to be. Not a hard size — see below.
 *
 * Roughly the width at which a cover still reads as a cover with its two lines
 * of text underneath. The grid divides the window by it and rounds down, so the
 * cards are always a little wider than this rather than exactly it.
 */
const CARD_WIDTH = 300;

/** Two across a portrait phone, which is the layout the app was designed at. */
const MIN_COLUMNS = 2;
/** Past five the covers are thumbnails and the shelf stops being a shelf. */
const MAX_COLUMNS = 5;

/**
 * Cards per row for the artist and album grids, from the window width.
 *
 * It was the constant `2` for as long as the app was locked to portrait. Two
 * across a landscape phone or a tablet makes each card half the *long* edge: a
 * cover taller than the screen showing it, and a grid that scrolls one album at
 * a time.
 *
 * Shared because the grid and its skeleton have to agree. They are two separate
 * components rendering the same layout — a count held in each would be a shelf
 * that reflows the moment real data lands, which is the one thing a skeleton
 * exists to prevent.
 */
export function useCardColumns(): number {
  const { width } = useWindowDimensions();
  return Math.max(MIN_COLUMNS, Math.min(MAX_COLUMNS, Math.floor(width / CARD_WIDTH)));
}
