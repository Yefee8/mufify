import {
  isShuffleAlgorithm,
  shuffleTracks,
  SHUFFLE_ALGORITHMS,
  type Rng,
  type ShuffleTrack,
} from './index';

/**
 * A small deterministic generator. Not cryptographic and not trying to be —
 * it exists so a failing property test fails the same way twice.
 */
function seededRng(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
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
