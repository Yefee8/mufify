import {
  mergeSimilarAlbums,
  mergeSimilarArtists,
  type RankedAlbum,
  type RankedArtist,
} from './mergeArtists';

/**
 * One band under several spellings, counted once.
 *
 * The arithmetic is the easy half. What is worth pinning is which row survives
 * a merge — it carries the id a tap navigates to and the name the user has to
 * recognise — and that merging re-ranks, because a band split three ways can
 * outrank everything above it once it is put back together.
 */

function artist(partial: Partial<RankedArtist> & { title: string | null }): RankedArtist {
  return {
    id: 1,
    playCount: 0,
    msPlayed: 0,
    artworkPath: null,
    ...partial,
  };
}

describe('mergeSimilarArtists', () => {
  it('adds up the spellings of one band', () => {
    const merged = mergeSimilarArtists(
      [
        artist({ id: 1, title: 'Linkin Park', playCount: 10, msPlayed: 1000 }),
        artist({ id: 2, title: 'LINKIN PARK', playCount: 4, msPlayed: 400 }),
      ],
      10,
    );

    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ playCount: 14, msPlayed: 1400 });
  });

  it('keeps the most-played spelling, and its id', () => {
    /*
     * The id is what a tap navigates to, so it has to be the one with the
     * listening behind it — and the name is the one on the files the user
     * actually plays, which is the one they will recognise.
     */
    const merged = mergeSimilarArtists(
      [
        artist({ id: 7, title: 'linkin park', playCount: 2 }),
        artist({ id: 9, title: 'Linkin Park', playCount: 30 }),
      ],
      10,
    );

    expect(merged[0]).toMatchObject({ id: 9, title: 'Linkin Park' });
  });

  it('takes a cover from whichever spelling has one', () => {
    // The most-played spelling may sit on the only files nobody tagged.
    const merged = mergeSimilarArtists(
      [
        artist({ title: 'Muse', playCount: 30, artworkPath: null }),
        artist({ title: 'MUSE', playCount: 2, artworkPath: '/covers/muse.jpg' }),
      ],
      10,
    );

    expect(merged[0]?.artworkPath).toBe('/covers/muse.jpg');
  });

  it('re-ranks, because a merge can lift a band past the rows above it', () => {
    const merged = mergeSimilarArtists(
      [
        artist({ title: 'Radiohead', playCount: 12 }),
        artist({ title: 'Muse', playCount: 7 }),
        artist({ title: 'MUSE', playCount: 8 }),
      ],
      10,
    );

    expect(merged.map((entry) => entry.title)).toEqual(['MUSE', 'Radiohead']);
  });

  it('trims to the limit only after merging', () => {
    /*
     * The reason the caller over-fetches. Merging three rows into one leaves a
     * gap at the bottom of a top-ten, and the row that should fill it was never
     * selected if the query had already cut at ten.
     */
    const entries = [
      artist({ title: 'A', playCount: 9 }),
      artist({ title: 'a', playCount: 9 }),
      artist({ title: 'B', playCount: 5 }),
      artist({ title: 'C', playCount: 4 }),
    ];

    expect(mergeSimilarArtists(entries, 2).map((entry) => entry.title)).toEqual(['A', 'B']);
  });

  it('leaves genuinely different artists alone', () => {
    const merged = mergeSimilarArtists(
      [artist({ title: 'The Cure', playCount: 5 }), artist({ title: 'The Cult', playCount: 4 })],
      10,
    );

    expect(merged).toHaveLength(2);
  });

  it('never merges the unnamed rows together', () => {
    // Two untagged artists are not one artist, and a scanned library has them.
    const merged = mergeSimilarArtists(
      [artist({ id: 1, title: null, playCount: 3 }), artist({ id: 2, title: null, playCount: 2 })],
      10,
    );

    expect(merged).toHaveLength(2);
  });

  it('breaks a tie on listening time rather than arbitrarily', () => {
    const merged = mergeSimilarArtists(
      [
        artist({ id: 1, title: 'Muse', playCount: 5, msPlayed: 100 }),
        artist({ id: 2, title: 'MUSE', playCount: 5, msPlayed: 900 }),
      ],
      10,
    );

    expect(merged[0]?.id).toBe(2);
  });

  it('does not disturb a list with nothing to merge', () => {
    const entries = [
      artist({ id: 1, title: 'A', playCount: 3 }),
      artist({ id: 2, title: 'B', playCount: 2 }),
    ];

    expect(mergeSimilarArtists(entries, 10)).toEqual(entries);
  });

  it('handles an empty list', () => {
    expect(mergeSimilarArtists([], 10)).toEqual([]);
  });
});

/**
 * Albums are the same idea with one more condition. What these pin is the
 * condition: the record's name being alike is not enough on its own, because
 * half the shelves in the world hold a "Greatest Hits".
 */

function album(partial: Partial<RankedAlbum> & { title: string | null }): RankedAlbum {
  return {
    id: 1,
    subtitle: null,
    playCount: 0,
    msPlayed: 0,
    artworkPath: null,
    ...partial,
  };
}

describe('mergeSimilarAlbums', () => {
  it('adds up one record filed under two spellings of its band', () => {
    // The scanner keys albums by (name, artist), so this is two rows.
    const merged = mergeSimilarAlbums(
      [
        album({ id: 1, title: 'Hybrid Theory', subtitle: 'Linkin Park', playCount: 10 }),
        album({ id: 2, title: 'Hybrid Theory', subtitle: 'LINKIN PARK', playCount: 4 }),
      ],
      10,
    );

    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ id: 1, playCount: 14 });
  });

  it('adds up one record filed under two spellings of its own name', () => {
    const merged = mergeSimilarAlbums(
      [
        album({ title: 'Hybrid Theory', subtitle: 'Linkin Park', playCount: 3 }),
        album({ title: 'Hybrid theory', subtitle: 'Linkin Park', playCount: 5 }),
      ],
      10,
    );

    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ title: 'Hybrid theory', playCount: 8 });
  });

  it("keeps two bands' records apart even when the names match", () => {
    const merged = mergeSimilarAlbums(
      [
        album({ id: 1, title: 'Greatest Hits', subtitle: 'Queen', playCount: 9 }),
        album({ id: 2, title: 'Greatest Hits', subtitle: 'ABBA', playCount: 8 }),
      ],
      10,
    );

    expect(merged).toHaveLength(2);
  });

  it('does not let a long name outweigh a different band', () => {
    /*
     * The reason the artist is compared on its own. Joined into one string
     * with the title, "…Deluxe Edition — Abba" and "…Deluxe Edition — Abbe"
     * differ by one character in forty and would pass the threshold.
     */
    const merged = mergeSimilarAlbums(
      [
        album({ title: 'The Very Best Of, Deluxe Edition', subtitle: 'Abba', playCount: 2 }),
        album({ title: 'The Very Best Of, Deluxe Edition', subtitle: 'Abbe', playCount: 2 }),
      ],
      10,
    );

    expect(merged).toHaveLength(2);
  });

  it('compares two untagged albums on the name alone', () => {
    // No artist on either side is not a disagreement about the artist.
    const merged = mergeSimilarAlbums(
      [
        album({ title: 'Live', subtitle: null, playCount: 2 }),
        album({ title: 'Live!', subtitle: null, playCount: 3 }),
      ],
      10,
    );

    expect(merged).toHaveLength(1);
    expect(merged[0]?.playCount).toBe(5);
  });

  it('does not fold a tagged album into an untagged one', () => {
    const merged = mergeSimilarAlbums(
      [
        album({ title: 'Live', subtitle: 'Muse', playCount: 2 }),
        album({ title: 'Live', subtitle: null, playCount: 3 }),
      ],
      10,
    );

    expect(merged).toHaveLength(2);
  });

  it('re-ranks and trims after merging, like the artists', () => {
    const merged = mergeSimilarAlbums(
      [
        album({ title: 'OK Computer', subtitle: 'Radiohead', playCount: 6 }),
        album({ title: 'Absolution', subtitle: 'Muse', playCount: 4 }),
        album({ title: 'Absolution', subtitle: 'MUSE', playCount: 3 }),
        album({ title: 'Showbiz', subtitle: 'Muse', playCount: 2 }),
      ],
      2,
    );

    expect(merged.map((entry) => [entry.title, entry.playCount])).toEqual([
      ['Absolution', 7],
      ['OK Computer', 6],
    ]);
  });

  it('never merges the unnamed rows together', () => {
    const merged = mergeSimilarAlbums(
      [album({ id: 1, title: null, playCount: 3 }), album({ id: 2, title: null, playCount: 2 })],
      10,
    );

    expect(merged).toHaveLength(2);
  });
});
