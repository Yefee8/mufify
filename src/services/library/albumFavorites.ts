/**
 * Folding "which albums are liked" into the album grid.
 *
 * Two live queries rather than one, and this is what joins them. The grid is
 * built `from(tracks)` — it groups by `coalesce(album_id, 0)` so that tracks
 * with no album still get a card, which cannot be expressed from the album
 * table. But `useLiveQuery` watches only the table in `FROM`, and liking an
 * album writes to `albums`, so a flag joined into that query would show
 * whatever was liked when the screen mounted and never notice a heart being
 * tapped. The Playlists tab merges two queries for the same reason.
 *
 * Pure, so the ordering can be tested without a device — and the ordering is
 * the part that is wrong at least once before it is right.
 */

/** One liked album, as the query returns it. */
export interface AlbumFavorite {
  id: number;
  /** When it was liked. Null on a row written before the column existed. */
  favoriteAt: number | null;
}

/** The fields this needs from a card. Kept structural to avoid a db import. */
export interface FavouritableCard {
  id: number;
  isFavorite: boolean;
}

/**
 * Mark the liked cards and pin them to the front.
 *
 * Liked first, most recently liked among those, then everything else in the
 * order it arrived — which for albums is alphabetical. Ordering by when it was
 * liked rather than by name is deliberate: liking something and watching it
 * appear at the top is the feedback that says the tap landed. Sorting the
 * pinned group alphabetically would drop a freshly liked album into the middle
 * of the pins, where nothing appears to have happened.
 *
 * A liked album with no timestamp — possible only for a row written by a build
 * between the column being added and being populated — sorts to the end of the
 * pinned group rather than the start, so it cannot displace a real one.
 */
export function withAlbumFavorites<T extends FavouritableCard>(
  cards: readonly T[],
  favorites: readonly AlbumFavorite[],
): T[] {
  if (favorites.length === 0) return [...cards];

  const likedAt = new Map(favorites.map((entry) => [entry.id, entry.favoriteAt]));

  const marked = cards.map((card) =>
    likedAt.has(card.id) ? { ...card, isFavorite: true } : card,
  );

  // A stable sort, which every JS engine has guaranteed since ES2019 — so the
  // unliked tail keeps the order the query gave it rather than being reshuffled.
  return marked.sort((left, right) => {
    const leftLiked = likedAt.has(left.id);
    const rightLiked = likedAt.has(right.id);
    if (leftLiked !== rightLiked) return leftLiked ? -1 : 1;
    if (!leftLiked) return 0;
    return (likedAt.get(right.id) ?? 0) - (likedAt.get(left.id) ?? 0);
  });
}

/** Only the liked ones, for the filter. Order is whatever it was given. */
export function onlyFavorites<T extends FavouritableCard>(cards: readonly T[]): T[] {
  return cards.filter((card) => card.isFavorite);
}
