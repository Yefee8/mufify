import { foldPlaylistRows, reorder, type PlaylistRow } from './order';

/**
 * The two pure parts of the playlist queries.
 *
 * Neither touches the database, and both are the kind of arithmetic that is
 * wrong at least once before it is right — a reorder that drops a row and a
 * count that includes a row that isn't there are both invisible until a user
 * notices their playlist is a track short.
 */

function row(partial: Partial<PlaylistRow> & { id: number }): PlaylistRow {
  return {
    name: `list ${partial.id}`,
    position: null,
    artworkPath: null,
    isFavorite: false,
    coverPath: null,
    ...partial,
  };
}

describe('reorder', () => {
  const positions = [0, 1, 2, 3, 4];

  it('moves an entry down', () => {
    expect(reorder(positions, 1, 3)).toEqual([0, 2, 3, 1, 4]);
  });

  it('moves an entry up', () => {
    expect(reorder(positions, 3, 1)).toEqual([0, 3, 1, 2, 4]);
  });

  it('moves to the very start and the very end', () => {
    expect(reorder(positions, 4, 0)).toEqual([4, 0, 1, 2, 3]);
    expect(reorder(positions, 0, 4)).toEqual([1, 2, 3, 4, 0]);
  });

  it('keeps every entry exactly once, wherever it moves', () => {
    // The property that matters. A reorder that loses a track is the failure
    // every drag-and-drop list ships at least once.
    for (let from = 0; from < positions.length; from += 1) {
      for (let to = 0; to < positions.length; to += 1) {
        const result = reorder(positions, from, to);
        expect(result).not.toBeNull();
        expect([...(result ?? [])].sort()).toEqual(positions);
      }
    }
  });

  it('refuses an index outside the list rather than writing something wrong', () => {
    // A drag against a playlist that changed underneath must be a no-op, not a
    // write that shuffles rows the user never touched.
    expect(reorder(positions, -1, 2)).toBeNull();
    expect(reorder(positions, 2, 5)).toBeNull();
    expect(reorder([], 0, 0)).toBeNull();
  });

  it('is identity when nothing moves', () => {
    expect(reorder(positions, 2, 2)).toEqual(positions);
  });
});

describe('foldPlaylistRows', () => {
  it('counts an empty playlist as empty', () => {
    // A left join yields one row with a null position for a playlist with no
    // tracks. Counting that row is how "0 tracks" becomes "1 track".
    expect(foldPlaylistRows([row({ id: 1 })])).toEqual([
      {
        id: 1,
        name: 'list 1',
        trackCount: 0,
        isFavorite: false,
        artworkPath: null,
        coverPath: null,
        mosaic: [],
      },
    ]);
  });

  it('counts entries and keeps the first cover', () => {
    const folded = foldPlaylistRows([
      row({ id: 1, position: 0, artworkPath: '/a.jpg' }),
      row({ id: 1, position: 1, artworkPath: '/b.jpg' }),
      row({ id: 1, position: 2, artworkPath: null }),
    ]);

    expect(folded[0]?.trackCount).toBe(3);
    expect(folded[0]?.artworkPath).toBe('/a.jpg');
  });

  it('takes the first four distinct covers, in order', () => {
    const folded = foldPlaylistRows(
      ['/a.jpg', '/b.jpg', '/c.jpg', '/d.jpg', '/e.jpg'].map((artworkPath, position) =>
        row({ id: 1, position, artworkPath }),
      ),
    );

    expect(folded[0]?.mosaic).toEqual(['/a.jpg', '/b.jpg', '/c.jpg', '/d.jpg']);
  });

  it('does not repeat one album four times in the mosaic', () => {
    // A playlist that is one album has one cover. Drawing it in all four cells
    // reads as a rendering bug rather than as a design.
    const folded = foldPlaylistRows(
      [0, 1, 2, 3, 4, 5].map((position) => row({ id: 1, position, artworkPath: '/same.jpg' })),
    );

    expect(folded[0]?.mosaic).toEqual(['/same.jpg']);
    expect(folded[0]?.trackCount).toBe(6);
  });

  it('skips tracks with no cover without skipping them in the count', () => {
    const folded = foldPlaylistRows([
      row({ id: 1, position: 0, artworkPath: null }),
      row({ id: 1, position: 1, artworkPath: '/b.jpg' }),
    ]);

    expect(folded[0]?.trackCount).toBe(2);
    expect(folded[0]?.mosaic).toEqual(['/b.jpg']);
  });

  it('keeps playlists in the order the query returned them', () => {
    // The query orders by updatedAt DESC. Folding through a Map must not
    // reshuffle that into insertion-by-id order.
    const folded = foldPlaylistRows([
      row({ id: 7, position: 0 }),
      row({ id: 3, position: 0 }),
      row({ id: 5, position: 0 }),
    ]);

    expect(folded.map((entry) => entry.id)).toEqual([7, 3, 5]);
  });
});

describe('foldPlaylistRows, liked and chosen covers', () => {
  it('carries the liked flag through', () => {
    const folded = foldPlaylistRows([
      row({ id: 1, position: 0, isFavorite: true }),
      row({ id: 2, position: 0 }),
    ]);

    expect(folded.map((summary) => summary.isFavorite)).toEqual([true, false]);
  });

  it('prefers the chosen cover to the first track, and keeps the mosaic', () => {
    // The chosen cover wins the single thumbnail; the mosaic is still collected
    // so that clearing the cover falls straight back to it without a re-query.
    const folded = foldPlaylistRows([
      row({ id: 1, position: 0, artworkPath: '/a.jpg', coverPath: '/chosen.jpg' }),
      row({ id: 1, position: 1, artworkPath: '/b.jpg', coverPath: '/chosen.jpg' }),
    ]);

    expect(folded[0]?.artworkPath).toBe('/chosen.jpg');
    expect(folded[0]?.coverPath).toBe('/chosen.jpg');
    expect(folded[0]?.mosaic).toEqual(['/a.jpg', '/b.jpg']);
  });

  it('leaves coverPath null when the user has chosen nothing', () => {
    const folded = foldPlaylistRows([row({ id: 1, position: 0, artworkPath: '/a.jpg' })]);

    expect(folded[0]?.coverPath).toBeNull();
    expect(folded[0]?.artworkPath).toBe('/a.jpg');
  });
});
