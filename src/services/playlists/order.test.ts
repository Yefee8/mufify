import { matchesHaystack } from '@/services/text/search';

import { foldPlaylistRows, moveItem, placeAfter, type PlaylistRow } from './order';

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
    trackTitle: null,
    artistName: null,
    albumName: null,
    ...partial,
  };
}

describe('moveItem', () => {
  it('moves the row itself, not a copy of it', () => {
    const rows = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const moved = moveItem(rows, 0, 2);

    expect(moved?.map((entry) => entry.id)).toEqual([2, 3, 1]);
    // The list the screen renders after a drop holds the same objects it held
    // before it, so the rows keep their React keys and their state.
    expect(moved?.[2]).toBe(rows[0]);
  });

  it('leaves the list it was given alone', () => {
    const rows = ['a', 'b', 'c'];

    expect(moveItem(rows, 2, 0)).toEqual(['c', 'a', 'b']);
    expect(rows).toEqual(['a', 'b', 'c']);
  });

  it('refuses an index outside the list', () => {
    expect(moveItem(['a', 'b'], 0, 5)).toBeNull();
    expect(moveItem(['a', 'b'], -1, 1)).toBeNull();
    expect(moveItem([], 0, 0)).toBeNull();
  });
});

describe('placeAfter', () => {
  const ids = [10, 20, 30, 40, 50];

  it('moves a row down to sit after another', () => {
    expect(placeAfter(ids, 20, 40)).toEqual([10, 30, 40, 20, 50]);
  });

  it('moves a row up to sit after another', () => {
    expect(placeAfter(ids, 50, 10)).toEqual([10, 50, 20, 30, 40]);
  });

  it('puts a row first when there is nothing to sit after', () => {
    expect(placeAfter(ids, 40, null)).toEqual([40, 10, 20, 30, 50]);
  });

  it('keeps every id exactly once', () => {
    for (const moved of ids) {
      for (const after of [null, ...ids]) {
        const result = placeAfter(ids, moved, after);
        if (result === null) continue;
        expect([...result].sort((a, b) => a - b)).toEqual(ids);
      }
    }
  });

  it('refuses ids that are not in the list, and a row placed after itself', () => {
    expect(placeAfter(ids, 99, 10)).toBeNull();
    expect(placeAfter(ids, 10, 99)).toBeNull();
    expect(placeAfter(ids, 30, 30)).toBeNull();
  });

  it('agrees with moveItem for every drag the screen can make', () => {
    // The screen computes `after` as the row in front of the drop slot in the
    // reordered list, so the two must describe the same move.
    for (let from = 0; from < ids.length; from += 1) {
      for (let to = 0; to < ids.length; to += 1) {
        const moved = moveItem(ids, from, to);
        if (moved === null) continue;
        const after = to === 0 ? null : (moved[to - 1] ?? null);
        expect(placeAfter(ids, ids[from] ?? -1, after) ?? ids).toEqual(moved);
      }
    }
  });
});

describe('moveItem over positions', () => {
  const positions = [0, 1, 2, 3, 4];

  it('moves an entry down', () => {
    expect(moveItem(positions, 1, 3)).toEqual([0, 2, 3, 1, 4]);
  });

  it('moves an entry up', () => {
    expect(moveItem(positions, 3, 1)).toEqual([0, 3, 1, 2, 4]);
  });

  it('moves to the very start and the very end', () => {
    expect(moveItem(positions, 4, 0)).toEqual([4, 0, 1, 2, 3]);
    expect(moveItem(positions, 0, 4)).toEqual([1, 2, 3, 4, 0]);
  });

  it('keeps every entry exactly once, wherever it moves', () => {
    // The property that matters. A reorder that loses a track is the failure
    // every drag-and-drop list ships at least once.
    for (let from = 0; from < positions.length; from += 1) {
      for (let to = 0; to < positions.length; to += 1) {
        const result = moveItem(positions, from, to);
        expect(result).not.toBeNull();
        expect([...(result ?? [])].sort()).toEqual(positions);
      }
    }
  });

  it('refuses an index outside the list rather than writing something wrong', () => {
    // A drag against a playlist that changed underneath must be a no-op, not a
    // write that shuffles rows the user never touched.
    expect(moveItem(positions, -1, 2)).toBeNull();
    expect(moveItem(positions, 2, 5)).toBeNull();
    expect(moveItem([], 0, 0)).toBeNull();
  });

  it('is identity when nothing moves', () => {
    expect(moveItem(positions, 2, 2)).toEqual(positions);
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
        search: 'list1',
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

describe('foldPlaylistRows, the search haystack', () => {
  it('matches a playlist by its own name', () => {
    const [summary] = foldPlaylistRows([row({ id: 1, name: 'Late nights' })]);

    expect(matchesHaystack('late', summary?.search ?? '')).toBe(true);
  });

  it('matches a playlist by a track inside it', () => {
    // The point of building this at all: typing an artist in the Playlists
    // tab should show which lists have them, not an empty screen.
    const [summary] = foldPlaylistRows([
      row({
        id: 1,
        name: 'Late nights',
        position: 0,
        trackTitle: 'Numb',
        artistName: 'Linkin Park',
        albumName: 'Meteora',
      }),
    ]);

    expect(matchesHaystack('linkin', summary?.search ?? '')).toBe(true);
    expect(matchesHaystack('meteora', summary?.search ?? '')).toBe(true);
    expect(matchesHaystack('numb', summary?.search ?? '')).toBe(true);
  });

  it('does not match a track that is in a different playlist', () => {
    const [first, second] = foldPlaylistRows([
      row({ id: 1, name: 'One', position: 0, trackTitle: 'Numb' }),
      row({ id: 2, name: 'Two', position: 0, trackTitle: 'Faint' }),
    ]);

    expect(matchesHaystack('numb', first?.search ?? '')).toBe(true);
    expect(matchesHaystack('numb', second?.search ?? '')).toBe(false);
  });

  it('ignores the empty row a playlist with no tracks produces', () => {
    // A left join on an empty playlist yields one row with null everything.
    const [summary] = foldPlaylistRows([row({ id: 1, name: 'Empty' })]);

    expect(summary?.search.trim()).toBe('empty');
  });
});
