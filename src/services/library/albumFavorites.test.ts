import { onlyFavorites, withAlbumFavorites, type AlbumFavorite } from './albumFavorites';

/**
 * Merging "which albums are liked" into the album grid.
 *
 * The grid and the liked set come from two separate live queries — the grid
 * must be `from(tracks)` to give tracks with no album a card, and the liked set
 * must be `from(albums)` or tapping a heart would never refresh anything. This
 * is the seam between them, and the ordering is what is worth pinning: liking
 * something and watching it move to the top is the feedback that says the tap
 * landed.
 */

function card(id: number, isFavorite = false) {
  return { id, name: `album-${id}`, isFavorite };
}

function liked(id: number, favoriteAt: number | null = id * 1000): AlbumFavorite {
  return { id, favoriteAt };
}

describe('withAlbumFavorites', () => {
  it('leaves the grid alone when nothing is liked', () => {
    const cards = [card(1), card(2), card(3)];

    expect(withAlbumFavorites(cards, [])).toEqual(cards);
  });

  it('marks the liked cards', () => {
    const result = withAlbumFavorites([card(1), card(2)], [liked(2)]);

    expect(result.map((entry) => [entry.id, entry.isFavorite])).toEqual([
      [2, true],
      [1, false],
    ]);
  });

  it('pins the liked ones, most recently liked first', () => {
    const result = withAlbumFavorites(
      [card(1), card(2), card(3), card(4)],
      [liked(1, 100), liked(3, 900)],
    );

    expect(result.map((entry) => entry.id)).toEqual([3, 1, 2, 4]);
  });

  it('keeps the unliked tail in the order the query gave it', () => {
    // Albums arrive alphabetical. Pinning must not reshuffle the rest.
    const result = withAlbumFavorites([card(5), card(9), card(2), card(7)], [liked(2)]);

    expect(result.map((entry) => entry.id)).toEqual([2, 5, 9, 7]);
  });

  it('does not mutate the array it was given', () => {
    const cards = [card(1), card(2)];
    withAlbumFavorites(cards, [liked(2)]);

    expect(cards.map((entry) => entry.id)).toEqual([1, 2]);
    expect(cards[1]?.isFavorite).toBe(false);
  });

  it('ignores a liked album that has no card', () => {
    // Liked, then every one of its files deleted. The row survives; the card
    // does not, and inventing one would put an empty album in the grid.
    const result = withAlbumFavorites([card(1)], [liked(99)]);

    expect(result.map((entry) => entry.id)).toEqual([1]);
  });

  it('sorts a liked album with no timestamp behind the ones that have one', () => {
    // Only reachable for a row written between the column arriving and being
    // populated. It must not displace a real one.
    const result = withAlbumFavorites([card(1), card(2)], [liked(1, null), liked(2, 500)]);

    expect(result.map((entry) => entry.id)).toEqual([2, 1]);
  });

  it('never marks the reserved no-album card, which has no row to like', () => {
    const result = withAlbumFavorites([card(0), card(1)], [liked(1)]);

    expect(result.find((entry) => entry.id === 0)?.isFavorite).toBe(false);
  });
});

describe('onlyFavorites', () => {
  it('keeps just the liked ones, in the order given', () => {
    const marked = withAlbumFavorites([card(1), card(2), card(3)], [liked(3, 10), liked(1, 20)]);

    expect(onlyFavorites(marked).map((entry) => entry.id)).toEqual([1, 3]);
  });

  it('is empty when nothing is liked, so the empty state fires', () => {
    expect(onlyFavorites([card(1), card(2)])).toEqual([]);
  });
});
