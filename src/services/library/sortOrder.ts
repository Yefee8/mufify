/**
 * How each library view can be ordered, and how an order is stored.
 *
 * Pure: the screens choose an order, MMKV keeps it as a short string, and the
 * queries in `src/db/queries/tracks.ts` turn it into `ORDER BY`. Only that last
 * step knows about SQL, so everything about *which* orders exist and what a
 * stored value means is testable without a database.
 */

/** What a list of tracks can be ordered by. */
export const TRACK_SORT_KEYS = ['title', 'artist', 'album', 'year', 'dateAdded'] as const;
export type TrackSortKey = (typeof TRACK_SORT_KEYS)[number];

/**
 * What the album shelf can be ordered by.
 *
 * `dateAdded` is when the newest of the album's tracks arrived — the same rule
 * the artist shelf uses, so "recently added" means one thing on both shelves.
 */
export const ALBUM_SORT_KEYS = ['name', 'artist', 'year', 'dateAdded'] as const;
export type AlbumSortKey = (typeof ALBUM_SORT_KEYS)[number];

/** What the artist shelf can be ordered by: name, or their newest arrival. */
export const ARTIST_SORT_KEYS = ['name', 'dateAdded'] as const;
export type ArtistSortKey = (typeof ARTIST_SORT_KEYS)[number];

export type SortDirection = 'asc' | 'desc';

export interface SortOrder<K extends string> {
  key: K;
  direction: SortDirection;
}

export type TrackSort = SortOrder<TrackSortKey>;
export type AlbumSort = SortOrder<AlbumSortKey>;
export type ArtistSort = SortOrder<ArtistSortKey>;

/**
 * Keys whose useful first look is the newest end.
 *
 * Picking "date added" and getting the oldest file on the phone first answers
 * a question nobody asked; picking "title" and getting Z first is the same
 * mistake the other way round. Each key opens on the direction people mean by
 * choosing it, and Reverse is one tap away from the other.
 */
const NEWEST_FIRST: ReadonlySet<string> = new Set(['year', 'dateAdded']);

/** The direction a key opens in when it is first chosen. */
export function defaultDirection(key: string): SortDirection {
  return NEWEST_FIRST.has(key) ? 'desc' : 'asc';
}

/** True for keys ordered by time rather than by text, which changes how the direction reads. */
export function isChronological(key: string): boolean {
  return NEWEST_FIRST.has(key);
}

export const DEFAULT_TRACK_SORT: TrackSort = { key: 'title', direction: 'asc' };
export const DEFAULT_ALBUM_SORT: AlbumSort = { key: 'name', direction: 'asc' };
export const DEFAULT_ARTIST_SORT: ArtistSort = { key: 'name', direction: 'asc' };

/**
 * Switch to `key`.
 *
 * Choosing the key that is already active keeps its direction — the sheet's
 * Reverse control is the way to flip it, and a list that reverses because a
 * row was tapped twice reads as a glitch. A new key opens in its own default.
 */
export function chooseSort<K extends string>(current: SortOrder<K>, key: K): SortOrder<K> {
  if (current.key === key) return current;
  return { key, direction: defaultDirection(key) };
}

/** The same key, the other way round. */
export function reverseSort<K extends string>(order: SortOrder<K>): SortOrder<K> {
  return { key: order.key, direction: order.direction === 'asc' ? 'desc' : 'asc' };
}

/** `title:asc` — short, readable in a settings dump, and trivially versioned. */
export function encodeSort<K extends string>(order: SortOrder<K>): string {
  return `${order.key}:${order.direction}`;
}

/**
 * Read a stored order, or `fallback` when there is none or it no longer makes
 * sense.
 *
 * A key a later build removes, a direction that is not one of the two, or a
 * value from some other setting entirely all land on the fallback. A sort
 * preference written by one build must never be able to crash another.
 */
export function decodeSort<K extends string>(
  raw: string | undefined,
  keys: readonly K[],
  fallback: SortOrder<K>,
): SortOrder<K> {
  if (!raw) return fallback;
  const [key, direction] = raw.split(':');
  if (!keys.includes(key as K)) return fallback;
  if (direction !== 'asc' && direction !== 'desc') return fallback;
  return { key: key as K, direction };
}
