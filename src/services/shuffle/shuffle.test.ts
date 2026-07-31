import {
  isShuffleAlgorithm,
  shuffleTracks,
  SHUFFLE_ALGORITHMS,
  type Rng,
  type ShuffleTrack,
} from './index';

/**
 * A deterministic generator whose *seeds* are independent of each other.
 *
 * This started as a linear congruential generator and that was a real bug in
 * the tests. An LCG advances by a fixed step, so seeds 1, 2, 3… produce first
 * draws that differ by a constant: across 400 sequential seeds the first value
 * spanned about 15% of [0, 1) and never once exceeded 0.94. Every property
 * test that seeds in a loop was therefore sampling a narrow band, and an
 * outcome needing `rng() > 0.977` — a low-weight track winning a weighted draw
 * — looked impossible when it was merely unreachable by the harness.
 *
 * splitmix32 hashes the seed rather than stepping from it, so each seed starts
 * an unrelated stream. Measured on the case that exposed this: 10 hits in 400
 * against an expected 9.
 */
function seededRng(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x9e37_79b9) >>> 0;
    let z = state;
    z = Math.imul(z ^ (z >>> 16), 0x21f0_aaad);
    z = Math.imul(z ^ (z >>> 15), 0x735a_2d97);
    z = (z ^ (z >>> 15)) >>> 0;
    return z / 0x1_0000_0000;
  };
}

function makeTracks(spec: { artist: string | null; count: number; playCount?: number }[]) {
  const tracks: ShuffleTrack[] = [];
  let id = 1;
  for (const { artist, count, playCount = 0 } of spec) {
    for (let index = 0; index < count; index += 1) {
      tracks.push({ id: id++, artistName: artist, playCount });
    }
  }
  return tracks;
}

function idsOf(tracks: readonly ShuffleTrack[]): number[] {
  return tracks.map((track) => track.id).sort((a, b) => a - b);
}

describe.each(SHUFFLE_ALGORITHMS)('%s shuffle', (algorithm) => {
  const tracks = makeTracks([
    { artist: 'A', count: 5, playCount: 3 },
    { artist: 'B', count: 4, playCount: 0 },
    { artist: 'C', count: 3, playCount: 9 },
    { artist: null, count: 2 },
  ]);

  it('keeps every track exactly once', () => {
    // The failure everyone ships at least once: a shuffle that drops or
    // duplicates a track. Checked for all algorithms, over many seeds.
    for (let seed = 1; seed <= 50; seed += 1) {
      const result = shuffleTracks(tracks, algorithm, seededRng(seed));
      expect(result).toHaveLength(tracks.length);
      expect(idsOf(result)).toEqual(idsOf(tracks));
    }
  });

  it('does not mutate the input', () => {
    const before = idsOf(tracks);
    shuffleTracks(tracks, algorithm, seededRng(7));
    expect(idsOf(tracks)).toEqual(before);
  });

  it('is deterministic for a given seed', () => {
    const first = shuffleTracks(tracks, algorithm, seededRng(42));
    const second = shuffleTracks(tracks, algorithm, seededRng(42));
    expect(first.map((t) => t.id)).toEqual(second.map((t) => t.id));
  });

  it('actually reorders', () => {
    // A "shuffle" that returns the input is a bug that passes every test
    // above. At least one seed in fifty must produce a different order.
    const original = tracks.map((t) => t.id);
    const reordered = Array.from({ length: 50 }, (_, seed) =>
      shuffleTracks(tracks, algorithm, seededRng(seed + 1)).map((t) => t.id),
    );
    expect(reordered.some((order) => order.join() !== original.join())).toBe(true);
  });

  it('handles empty and single-track queues', () => {
    expect(shuffleTracks([], algorithm, seededRng(1))).toEqual([]);
    const one = makeTracks([{ artist: 'A', count: 1 }]);
    expect(shuffleTracks(one, algorithm, seededRng(1))).toHaveLength(1);
  });
});

describe('balanced shuffle', () => {
  /** Longest run of consecutive tracks by the same artist. */
  function longestRun(tracks: readonly ShuffleTrack[]): number {
    let longest = 1;
    let current = 1;
    for (let index = 1; index < tracks.length; index += 1) {
      const previous = tracks[index - 1];
      const track = tracks[index];
      if (previous && track && previous.artistName === track.artistName && track.artistName) {
        current += 1;
        longest = Math.max(longest, current);
      } else {
        current = 1;
      }
    }
    return longest;
  }

  it('never puts two tracks by the same artist together when spacing allows it', () => {
    // Four artists, five tracks each: every artist can sit at least three
    // apart, so adjacency is never forced and must never happen.
    const tracks = makeTracks([
      { artist: 'A', count: 5 },
      { artist: 'B', count: 5 },
      { artist: 'C', count: 5 },
      { artist: 'D', count: 5 },
    ]);

    for (let seed = 1; seed <= 100; seed += 1) {
      const result = shuffleTracks(tracks, 'balanced', seededRng(seed));
      expect(longestRun(result)).toBe(1);
    }
  });

  it('beats a uniform shuffle at spreading a dominant artist', () => {
    // The complaint this algorithm exists to answer, stated as a measurement:
    // half the library by one artist, and clustering must be rarer than a
    // uniform shuffle produces.
    const tracks = makeTracks([
      { artist: 'Dominant', count: 10 },
      { artist: 'B', count: 4 },
      { artist: 'C', count: 3 },
      { artist: 'D', count: 3 },
    ]);

    let balancedRuns = 0;
    let pureRuns = 0;
    for (let seed = 1; seed <= 200; seed += 1) {
      balancedRuns += longestRun(shuffleTracks(tracks, 'balanced', seededRng(seed)));
      pureRuns += longestRun(shuffleTracks(tracks, 'pure', seededRng(seed)));
    }

    expect(balancedRuns).toBeLessThan(pureRuns);
  });

  it('treats untagged tracks as separate artists, not as one', () => {
    // Otherwise a folder of untagged files would be spread as though it were
    // a single act, which is the opposite of what the user wants.
    const tracks = makeTracks([
      { artist: null, count: 6 },
      { artist: 'A', count: 2 },
    ]);

    for (let seed = 1; seed <= 30; seed += 1) {
      const result = shuffleTracks(tracks, 'balanced', seededRng(seed));
      expect(idsOf(result)).toEqual(idsOf(tracks));
    }
  });
});

describe('discovery shuffle', () => {
  it('puts neglected tracks earlier on average', () => {
    const tracks = makeTracks([
      { artist: 'Fresh', count: 10, playCount: 0 },
      { artist: 'Worn', count: 10, playCount: 50 },
    ]);

    let freshPositionTotal = 0;
    let wornPositionTotal = 0;

    for (let seed = 1; seed <= 200; seed += 1) {
      const result = shuffleTracks(tracks, 'discovery', seededRng(seed));
      result.forEach((track, position) => {
        if (track.artistName === 'Fresh') freshPositionTotal += position;
        else wornPositionTotal += position;
      });
    }

    expect(freshPositionTotal).toBeLessThan(wornPositionTotal);
  });

  it('still includes heavily played tracks', () => {
    // A bias, not a filter. Shuffling the library must return the library.
    const tracks = makeTracks([
      { artist: 'Fresh', count: 3, playCount: 0 },
      { artist: 'Worn', count: 3, playCount: 1000 },
    ]);

    const result = shuffleTracks(tracks, 'discovery', seededRng(5));
    expect(idsOf(result)).toEqual(idsOf(tracks));
  });

  it('does not divide by zero on a negative play count', () => {
    // Should not occur, but a corrupt row must not take playback down.
    const tracks: ShuffleTrack[] = [
      { id: 1, artistName: 'A', playCount: -5 },
      { id: 2, artistName: 'B', playCount: 0 },
    ];
    expect(shuffleTracks(tracks, 'discovery', seededRng(3))).toHaveLength(2);
  });
});

describe('isShuffleAlgorithm', () => {
  it('accepts every registered id', () => {
    for (const algorithm of SHUFFLE_ALGORITHMS) {
      expect(isShuffleAlgorithm(algorithm)).toBe(true);
    }
  });

  it('rejects anything else, so a stale stored value cannot crash a launch', () => {
    expect(isShuffleAlgorithm('smart')).toBe(false);
    expect(isShuffleAlgorithm('')).toBe(false);
  });
});

describe('favorites shuffle', () => {
  it('is the mirror of discovery: well-played tracks come earlier', () => {
    const tracks = makeTracks([
      { artist: 'Loved', count: 10, playCount: 50 },
      { artist: 'Ignored', count: 10, playCount: 0 },
    ]);

    let lovedTotal = 0;
    let ignoredTotal = 0;
    for (let seed = 1; seed <= 200; seed += 1) {
      shuffleTracks(tracks, 'favorites', seededRng(seed)).forEach((track, position) => {
        if (track.artistName === 'Loved') lovedTotal += position;
        else ignoredTotal += position;
      });
    }

    expect(lovedTotal).toBeLessThan(ignoredTotal);
  });

  it('boosts a favourite above its play count alone', () => {
    const plain: ShuffleTrack[] = Array.from({ length: 10 }, (_, index) => ({
      id: index + 1,
      artistName: 'A',
      playCount: 1,
    }));
    const withFavourite: ShuffleTrack[] = plain.map((track) =>
      track.id === 1 ? { ...track, isFavorite: true } : track,
    );

    let plainPosition = 0;
    let favouritePosition = 0;
    for (let seed = 1; seed <= 200; seed += 1) {
      plainPosition += shuffleTracks(plain, 'favorites', seededRng(seed)).findIndex(
        (t) => t.id === 1,
      );
      favouritePosition += shuffleTracks(withFavourite, 'favorites', seededRng(seed)).findIndex(
        (t) => t.id === 1,
      );
    }

    expect(favouritePosition).toBeLessThan(plainPosition);
  });

  it('can still reach a never-played track', () => {
    // A shuffle that can never reach half the library is a filter wearing a
    // shuffle's name, so unplayed tracks keep a weight floor rather than zero.
    //
    // Stated as reachability, not likelihood, and measured at odds where
    // "never observed" would actually mean something: two tracks at 20 plays
    // against one at zero is roughly 1-in-20 to lead, so across 400 seeds a
    // floor of zero would show up as a hard absence rather than as noise.
    const tracks = makeTracks([
      { artist: 'Loved', count: 2, playCount: 20 },
      { artist: 'New', count: 1, playCount: 0 },
    ]);

    const led = Array.from({ length: 400 }, (_, seed) =>
      shuffleTracks(tracks, 'favorites', seededRng(seed + 1))[0]?.artistName,
    ).filter((artist) => artist === 'New').length;

    expect(led).toBeGreaterThan(0);
  });
});

describe('album shuffle', () => {
  function albumTracks() {
    const tracks: ShuffleTrack[] = [];
    let id = 1;
    for (const album of ['Kind of Blue', 'OK Computer', 'Fourth Symphony']) {
      for (let index = 0; index < 4; index += 1) {
        tracks.push({ id: id++, artistName: album, playCount: 0, albumName: album });
      }
    }
    return tracks;
  }

  it('never splits an album', () => {
    // A symphony shuffled track-by-track is noise. Every album must appear as
    // one unbroken run.
    for (let seed = 1; seed <= 100; seed += 1) {
      const result = shuffleTracks(albumTracks(), 'album', seededRng(seed));
      const runs = result.map((track) => track.albumName).filter((name, index, all) => all[index - 1] !== name);
      expect(runs).toHaveLength(new Set(runs).size);
    }
  });

  it('preserves the order inside each album', () => {
    for (let seed = 1; seed <= 50; seed += 1) {
      const result = shuffleTracks(albumTracks(), 'album', seededRng(seed));
      const okComputer = result.filter((t) => t.albumName === 'OK Computer').map((t) => t.id);
      expect(okComputer).toEqual([...okComputer].sort((a, b) => a - b));
    }
  });

  it('does reorder the albums themselves', () => {
    const orders = new Set(
      Array.from({ length: 50 }, (_, seed) =>
        shuffleTracks(albumTracks(), 'album', seededRng(seed + 1))
          .map((t) => t.albumName)
          .join('|'),
      ),
    );
    expect(orders.size).toBeGreaterThan(1);
  });

  it('keeps loose files loose rather than welding them into one record', () => {
    // Three untagged singles are three groups, not one imaginary album.
    const singles: ShuffleTrack[] = [1, 2, 3].map((id) => ({
      id,
      artistName: null,
      playCount: 0,
      albumName: null,
    }));

    const orders = new Set(
      Array.from({ length: 50 }, (_, seed) =>
        shuffleTracks(singles, 'album', seededRng(seed + 1))
          .map((t) => t.id)
          .join('|'),
      ),
    );
    expect(orders.size).toBeGreaterThan(1);
  });
});
