import { dedupeTracks, type DedupableTrack } from './dedupeTracks';

/**
 * Hiding the second copy of a song.
 *
 * This feature hides something the user owns, so the tests lean hard on what it
 * must *not* merge. A duplicate left visible is a cosmetic complaint; a live
 * version hidden behind the studio take is a track somebody cannot find, and
 * they have no way to tell it was the app's doing.
 */

let nextId = 1;

function track(partial: Partial<DedupableTrack> & { title: string }): DedupableTrack {
  return {
    id: nextId++,
    artistName: 'Linkin Park',
    durationMs: 180_000,
    playCount: 0,
    ...partial,
  };
}

beforeEach(() => {
  nextId = 1;
});

describe('dedupeTracks', () => {
  it('keeps one row for a song that is in the library twice', () => {
    const kept = dedupeTracks([track({ title: 'Numb' }), track({ title: 'NUMB' })]);

    expect(kept).toHaveLength(1);
  });

  it('keeps the most played copy, which is the file being pointed at', () => {
    const kept = dedupeTracks([
      track({ id: 1, title: 'Numb', playCount: 0 }),
      track({ id: 2, title: 'numb ', playCount: 12 }),
    ]);

    expect(kept[0]?.id).toBe(2);
  });

  it('leaves the list alone when nothing is duplicated', () => {
    const tracks = [track({ title: 'Numb' }), track({ title: 'Faint' })];

    expect(dedupeTracks(tracks)).toEqual(tracks);
  });

  it('keeps the order the list was already in', () => {
    // The library is alphabetical, and it has to stay that way.
    const kept = dedupeTracks([
      track({ title: 'Aaa' }),
      track({ title: 'Bbb' }),
      track({ title: 'BBB' }),
      track({ title: 'Ccc' }),
    ]);

    expect(kept.map((entry) => entry.title)).toEqual(['Aaa', 'Bbb', 'Ccc']);
  });

  describe('what it refuses to merge', () => {
    it('two songs whose titles differ by a single digit', () => {
      const kept = dedupeTracks([track({ title: 'Song Pt. 1' }), track({ title: 'Song Pt. 2' })]);

      expect(kept).toHaveLength(2);
    });

    it('the same title by two different artists', () => {
      const kept = dedupeTracks([
        track({ title: 'Intro', artistName: 'Muse' }),
        track({ title: 'Intro', artistName: 'Radiohead' }),
      ]);

      expect(kept).toHaveLength(2);
    });

    it('a long artist name swamping a one-character title difference', () => {
      /*
       * The reason artist and title are compared separately. Joined into one
       * string, "Red Hot Chili Peppers Song Pt. 1" against "…Pt. 2" is one edit
       * in thirty-one characters — 0.97, a merge, and two different songs gone.
       */
      const kept = dedupeTracks([
        track({ title: 'Song Pt. 1', artistName: 'Red Hot Chili Peppers' }),
        track({ title: 'Song Pt. 2', artistName: 'Red Hot Chili Peppers' }),
      ]);

      expect(kept).toHaveLength(2);
    });

    it('a live take that shares its title with the studio version', () => {
      // Same title, same artist, four minutes longer. Length is what separates
      // them, and hiding one behind the other is the complaint this would make.
      const kept = dedupeTracks([
        track({ title: 'Numb', durationMs: 185_000 }),
        track({ title: 'Numb', durationMs: 425_000 }),
      ]);

      expect(kept).toHaveLength(2);
    });

    it('two untagged tracks that happen to share a title', () => {
      const kept = dedupeTracks([
        track({ title: 'Track 1', artistName: null }),
        track({ title: 'Track 1', artistName: null }),
      ]);

      expect(kept).toHaveLength(2);
    });

    it('a tagged copy against an untagged one', () => {
      const kept = dedupeTracks([
        track({ title: 'Numb', artistName: 'Linkin Park' }),
        track({ title: 'Numb', artistName: null }),
      ]);

      expect(kept).toHaveLength(2);
    });
  });

  describe('duration tolerance', () => {
    it('allows the padding a re-encode adds', () => {
      const kept = dedupeTracks([
        track({ title: 'Numb', durationMs: 185_000 }),
        track({ title: 'Numb', durationMs: 186_400 }),
      ]);

      expect(kept).toHaveLength(1);
    });

    it('scales with length, so a long track is not held to two seconds', () => {
      // 2% of twenty minutes is twenty-four seconds.
      const kept = dedupeTracks([
        track({ title: 'Echoes', durationMs: 1_400_000 }),
        track({ title: 'ECHOES', durationMs: 1_420_000 }),
      ]);

      expect(kept).toHaveLength(1);
    });
  });

  it('does not chain two copies through a third they do not match', () => {
    /*
     * A first-match-wins split inside a title group, not a union. A 180s and a
     * 184s copy are each close to a 182s one and not to each other; unioning
     * would put all three together and quietly bypass the duration guard.
     */
    const kept = dedupeTracks([
      track({ title: 'Numb', durationMs: 180_000 }),
      track({ title: 'Numb', durationMs: 184_000 }),
      track({ title: 'Numb', durationMs: 182_000 }),
    ]);

    expect(kept).toHaveLength(2);
  });

  it('collapses three copies of one song to one row', () => {
    const kept = dedupeTracks([
      track({ title: 'Numb' }),
      track({ title: 'NUMB' }),
      track({ title: 'numb.' }),
    ]);

    expect(kept).toHaveLength(1);
  });

  it('handles a list too short to hold a duplicate', () => {
    expect(dedupeTracks([])).toEqual([]);
    expect(dedupeTracks([track({ title: 'Numb' })])).toHaveLength(1);
  });

  it('does not mutate the list it was given', () => {
    const tracks = [track({ title: 'Numb' }), track({ title: 'NUMB' })];
    dedupeTracks(tracks);

    expect(tracks).toHaveLength(2);
  });
});

/**
 * The title-only mode asks one question and ignores the rest. What it must
 * still do is keep the survivor the user is pointing at, and what it must not
 * do is leak into the strict mode — the two hide different rows on purpose.
 */
describe('dedupeTracks by title alone', () => {
  it('hides a copy whatever its tags say', () => {
    // The same file copied twice never differs in its name; it does in
    // everything a re-tag can touch.
    const kept = dedupeTracks(
      [
        track({ title: 'Numb', artistName: 'Linkin Park', durationMs: 180_000 }),
        track({ title: 'Numb', artistName: 'LP (2003)', durationMs: 186_000 }),
      ],
      'title',
    );

    expect(kept).toHaveLength(1);
  });

  it('still keeps the most played copy', () => {
    const kept = dedupeTracks(
      [
        track({ id: 1, title: 'Numb', artistName: 'Linkin Park', playCount: 1 }),
        track({ id: 2, title: 'numb', artistName: 'Unknown', playCount: 9 }),
      ],
      'title',
    );

    expect(kept[0]?.id).toBe(2);
  });

  it('folds two different songs that share a name — the documented cost', () => {
    const kept = dedupeTracks(
      [
        track({ title: 'Intro', artistName: 'Muse', durationMs: 40_000 }),
        track({ title: 'Intro', artistName: 'The xx', durationMs: 130_000 }),
      ],
      'title',
    );

    expect(kept).toHaveLength(1);
  });

  it('still refuses two titles a digit apart', () => {
    // The threshold is the one guard this mode keeps, and it has to hold.
    const kept = dedupeTracks([track({ title: 'Song Pt. 1' }), track({ title: 'Song Pt. 2' })], 'title');

    expect(kept).toHaveLength(2);
  });

  it('still keeps untitled rows apart', () => {
    const kept = dedupeTracks([track({ title: '' }), track({ title: '' })], 'title');

    expect(kept).toHaveLength(2);
  });

  it('is the strict mode by default, so a live take stays visible', () => {
    const kept = dedupeTracks([
      track({ title: 'Numb', durationMs: 180_000 }),
      track({ title: 'Numb', durationMs: 260_000 }),
    ]);

    expect(kept).toHaveLength(2);
  });
});
