import {
  ALBUM_SORT_KEYS,
  ARTIST_SORT_KEYS,
  chooseSort,
  decodeSort,
  DEFAULT_TRACK_SORT,
  defaultDirection,
  encodeSort,
  isChronological,
  reverseSort,
  TRACK_SORT_KEYS,
  type TrackSort,
} from './sortOrder';

describe('defaultDirection', () => {
  it('opens text keys at A and time keys at the newest end', () => {
    expect(defaultDirection('title')).toBe('asc');
    expect(defaultDirection('artist')).toBe('asc');
    expect(defaultDirection('name')).toBe('asc');
    expect(defaultDirection('year')).toBe('desc');
    expect(defaultDirection('dateAdded')).toBe('desc');
  });

  it('agrees with isChronological for every key any view offers', () => {
    for (const key of [...TRACK_SORT_KEYS, ...ALBUM_SORT_KEYS, ...ARTIST_SORT_KEYS]) {
      expect(defaultDirection(key) === 'desc').toBe(isChronological(key));
    }
  });
});

describe('chooseSort', () => {
  const byTitle: TrackSort = { key: 'title', direction: 'desc' };

  it('keeps the direction when the active key is chosen again', () => {
    expect(chooseSort(byTitle, 'title')).toBe(byTitle);
  });

  it('opens a new key in that key’s own default', () => {
    expect(chooseSort(byTitle, 'dateAdded')).toEqual({ key: 'dateAdded', direction: 'desc' });
    expect(chooseSort({ key: 'year', direction: 'asc' }, 'album')).toEqual({
      key: 'album',
      direction: 'asc',
    });
  });
});

describe('reverseSort', () => {
  it('flips the direction and nothing else', () => {
    expect(reverseSort(DEFAULT_TRACK_SORT)).toEqual({ key: 'title', direction: 'desc' });
    expect(reverseSort(reverseSort(DEFAULT_TRACK_SORT))).toEqual(DEFAULT_TRACK_SORT);
  });
});

describe('encodeSort and decodeSort', () => {
  it('round-trips every key in both directions', () => {
    for (const key of TRACK_SORT_KEYS) {
      for (const direction of ['asc', 'desc'] as const) {
        const order = { key, direction };
        expect(decodeSort(encodeSort(order), TRACK_SORT_KEYS, DEFAULT_TRACK_SORT)).toEqual(order);
      }
    }
  });

  it('falls back when nothing has been stored', () => {
    expect(decodeSort(undefined, TRACK_SORT_KEYS, DEFAULT_TRACK_SORT)).toBe(DEFAULT_TRACK_SORT);
    expect(decodeSort('', TRACK_SORT_KEYS, DEFAULT_TRACK_SORT)).toBe(DEFAULT_TRACK_SORT);
  });

  it('falls back on a key this view does not offer', () => {
    // An album key stored against tracks, or a key a later build dropped.
    expect(decodeSort('name:asc', TRACK_SORT_KEYS, DEFAULT_TRACK_SORT)).toBe(DEFAULT_TRACK_SORT);
    expect(decodeSort('genre:asc', TRACK_SORT_KEYS, DEFAULT_TRACK_SORT)).toBe(DEFAULT_TRACK_SORT);
  });

  it('falls back on a direction that is neither', () => {
    expect(decodeSort('title:up', TRACK_SORT_KEYS, DEFAULT_TRACK_SORT)).toBe(DEFAULT_TRACK_SORT);
    expect(decodeSort('title', TRACK_SORT_KEYS, DEFAULT_TRACK_SORT)).toBe(DEFAULT_TRACK_SORT);
  });
});
