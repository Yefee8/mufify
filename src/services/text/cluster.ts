import { isSimilar, normalizeName } from './similarity';

/**
 * Grouping things whose names are the same name written differently.
 *
 * Two features want this and they want it for the same reason: a library built
 * from files tagged by a dozen tools holds one band under three spellings and
 * one song in two folders. What they do with the groups differs — statistics
 * adds them up, the library hides all but one — so the grouping is here and
 * the reducing is theirs.
 *
 * **Exact matches first, and that is not an optimisation.** After normalising,
 * "LINKIN PARK" and "Linkin Park" are the same string: no threshold, no
 * distance, no judgement. A hash groups those in one pass, and the fuzzy
 * comparison is then left with the genuinely uncertain cases — a typo, a
 * missing apostrophe — of which there are far fewer.
 *
 * The fuzzy pass walks the distinct names **in sorted order and compares each
 * to a window of its neighbours**, rather than every name against every other.
 * Ten thousand tracks compared pairwise is fifty million string distances, and
 * this list is rebuilt whenever the library query re-runs. Sorting puts names
 * that differ near their end side by side, which is where the differences this
 * catches almost always are; the cost is that a pair differing at the *start* —
 * "The Beatles" and "Beatles" — can fall outside the window and stay apart.
 * That is a miss rather than a wrong merge, and a miss is the safe direction.
 */

export interface ClusterOptions {
  /** How alike two names must be, 0 to 1. */
  threshold: number;
  /**
   * How many sorted neighbours each name is compared against.
   *
   * `Infinity` compares everything to everything, which is exact and only
   * affordable on a short list — the statistics screens pass it because they
   * rank a few dozen rows.
   */
  window?: number;
}

/** Enough neighbours to catch the usual spelling drift without going quadratic. */
const DEFAULT_WINDOW = 16;

/**
 * The input, partitioned into groups of same-name things.
 *
 * Groups come back in the order their first member appeared, and members keep
 * their input order inside a group — so a caller that handed in a ranked list
 * gets a ranked list back, and "the first one" still means what it meant.
 *
 * A name that normalises to nothing — an untitled track, a tag of only
 * punctuation — is always alone. Two untitled tracks are not one track, and a
 * library has plenty of both.
 */
export function clusterBySimilarName<T>(
  items: readonly T[],
  nameOf: (item: T) => string,
  options: ClusterOptions,
): T[][] {
  const window = options.window ?? DEFAULT_WINDOW;

  const keys = items.map((item) => normalizeName(nameOf(item)));

  /* Exact matches, in one pass. Index into `roots`, or -1 for a lone item. */
  const groupOfKey = new Map<string, number>();
  const memberOf = new Array<number>(items.length);
  const distinct: string[] = [];

  for (const [index, key] of keys.entries()) {
    if (key.length === 0) {
      memberOf[index] = -1;
      continue;
    }
    let group = groupOfKey.get(key);
    if (group === undefined) {
      group = distinct.length;
      groupOfKey.set(key, group);
      distinct.push(key);
    }
    memberOf[index] = group;
  }

  const parent = distinct.map((_, index) => index);

  function find(node: number): number {
    let root = node;
    while (parent[root] !== root) root = parent[root] as number;
    // Path compression, so repeated lookups over a long chain stay flat.
    let walk = node;
    while (parent[walk] !== root) {
      const next = parent[walk] as number;
      parent[walk] = root;
      walk = next;
    }
    return root;
  }

  /*
   * The fuzzy pass, over distinct names only. Sorted so that near-identical
   * names are neighbours; `order` keeps the mapping back to group ids.
   */
  const order = distinct.map((_, index) => index);
  order.sort((left, right) =>
    (distinct[left] as string) < (distinct[right] as string)
      ? -1
      : (distinct[left] as string) > (distinct[right] as string)
        ? 1
        : 0,
  );

  for (let i = 0; i < order.length; i += 1) {
    const limit = Math.min(order.length, window === Number.POSITIVE_INFINITY ? order.length : i + window + 1);
    for (let j = i + 1; j < limit; j += 1) {
      const a = distinct[order[i] as number] as string;
      const b = distinct[order[j] as number] as string;
      if (!isSimilar(a, b, options.threshold)) continue;

      const rootA = find(order[i] as number);
      const rootB = find(order[j] as number);
      if (rootA !== rootB) parent[Math.max(rootA, rootB)] = Math.min(rootA, rootB);
    }
  }

  /* Collect, preserving the input order of both groups and members. */
  const byRoot = new Map<number, T[]>();
  const result: T[][] = [];

  for (const [index, item] of items.entries()) {
    const group = memberOf[index] as number;
    if (group === -1) {
      result.push([item]);
      continue;
    }

    const root = find(group);
    const existing = byRoot.get(root);
    if (existing) {
      existing.push(item);
      continue;
    }

    const fresh = [item];
    byRoot.set(root, fresh);
    result.push(fresh);
  }

  return result;
}
