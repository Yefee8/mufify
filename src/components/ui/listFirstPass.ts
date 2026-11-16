/**
 * How many rows a FlashList draws in its first pass.
 *
 * FlashList 2 renders a list that has just mounted progressively: two rows,
 * measure, a few more, measure — each step a separate commit and layout round
 * trip. On a pushed screen that meant the header arrived with the transition
 * and the rows a fifth of a second after it, one small batch at a time, which
 * reads as the page being slow even when everything else is done. Twelve is a
 * phone screen of 64-point rows, or of cards, in one pass: the page lands
 * whole. Measured in `docs/performance.md`.
 *
 * Passed as `overrideProps`, the escape hatch FlashList documents for this
 * internal value.
 */
export const FIRST_PASS = { initialDrawBatchSize: 12 } as const;
