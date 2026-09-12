/**
 * Deciding whether two names are the same name written differently.
 *
 * "Linkin Park" and "LINKIN PARK" are one band with two spellings, and a
 * library assembled from files tagged by a dozen different tools is full of
 * that: trailing spaces, a stray full stop, an accent present in one copy and
 * missing in another. Treating them as separate entities splits a year of
 * listening in half and shows somebody two artists they know are one.
 *
 * Two steps, and the first does most of the work. **Normalising** folds away
 * everything that is punctuation, accent or case, which catches the overhelming
 * majority of real cases exactly — after it, "LINKIN PARK" and "Linkin Park"
 * are the same string, no threshold involved. **Similarity** is for what is
 * left: a typo, a missing apostrophe, one spelling of a name with a number in
 * it.
 */

/**
 * A name reduced to what it is actually saying.
 *
 * Decomposed first, then stripped of combining marks, *then* lowercased, and
 * that order is deliberate. `'İ'.toLowerCase()` is "i" followed by a combining
 * dot — lowercasing last would leave the mark behind for the strip to have
 * already passed. Turkish tags make this a real case rather than a theoretical
 * one, and the project's primary locale is Turkish.
 *
 * `toLowerCase` rather than `toLocaleLowerCase`: locale-aware folding maps
 * "I" to "ı" under a Turkish locale, so the same library would group
 * differently depending on the phone's language. A comparison key has to mean
 * one thing.
 */
export function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/gu, ' ');
}

/**
 * How alike two names are, from 0 to 1.
 *
 * Levenshtein distance over the normalised forms, scaled by the longer of the
 * two. Edit distance rather than anything cleverer because the differences
 * being caught are *typographic* — a character missing, a character wrong —
 * and a phonetic or token-based measure would happily call "Song Pt. 1" and
 * "Song Pt. 2" the same thing, which they are not.
 *
 * Two empty names are 1: they are equally nothing, and the callers all refuse
 * to group on an empty key anyway.
 */
export function similarity(left: string, right: string): number {
  const a = normalizeName(left);
  const b = normalizeName(right);
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  const longest = Math.max(a.length, b.length);
  return 1 - editDistance(a, b) / longest;
}

/**
 * Whether two names are alike enough to be treated as one.
 *
 * The length check is not only an optimisation, though it is that too: strings
 * whose lengths differ by more than the allowed error cannot possibly score
 * above the threshold, because every missing character is an edit. Doing it
 * first keeps the quadratic part of any caller off the pairs that cannot match.
 */
export function isSimilar(left: string, right: string, threshold: number): boolean {
  const a = normalizeName(left);
  const b = normalizeName(right);
  if (a === b) return a.length > 0;
  if (a.length === 0 || b.length === 0) return false;

  const longest = Math.max(a.length, b.length);
  const shortest = Math.min(a.length, b.length);
  if (shortest / longest < threshold) return false;

  /*
   * The budget only stops the measurement early; the decision below is the same
   * expression `similarity` uses, so the two can never disagree.
   *
   * `ceil`, and that is the whole point. `1 - 0.9` is 0.09999999999999998, so
   * flooring `10 * (1 - 0.9)` gives **0** — and a pair one edit apart in ten
   * characters, which is exactly 0.9 similar, was being refused by the helper
   * that is supposed to answer "is it at least 0.9". A budget that is too
   * generous costs a few cells; one that is too tight is a wrong answer.
   */
  const budget = Math.ceil(longest * (1 - threshold));
  return 1 - editDistance(a, b, budget) / longest >= threshold;
}

/**
 * Levenshtein distance, one row at a time.
 *
 * Two rows rather than a full matrix: the library can hold ten thousand tracks
 * and this is called across a sliding window of them, so the allocation is
 * worth avoiding even though the strings are short.
 *
 * `budget` lets a caller stop as soon as the answer cannot matter. It returns
 * `budget + 1` in that case, which is enough for every comparison here — nobody
 * needs the true distance once it is known to be too far.
 */
export function editDistance(a: string, b: string, budget = Number.POSITIVE_INFINITY): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  let current = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    let best = current[0];

    for (let j = 1; j <= b.length; j += 1) {
      const substitution = (previous[j - 1] as number) + (a[i - 1] === b[j - 1] ? 0 : 1);
      const deletion = (previous[j] as number) + 1;
      const insertion = (current[j - 1] as number) + 1;

      const cell = Math.min(substitution, deletion, insertion);
      current[j] = cell;
      if (cell < best) best = cell;
    }

    // Every remaining row can only add to the best cell in this one, so once
    // the whole row is out of budget the final answer is too.
    if (best > budget) return budget + 1;

    const swap = previous;
    previous = current;
    current = swap;
  }

  return previous[b.length] as number;
}
