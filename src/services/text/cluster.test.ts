import { clusterBySimilarName } from './cluster';

/**
 * Grouping names that are one name written differently.
 *
 * The properties that matter to both callers: order is preserved, so a ranked
 * list stays ranked; an empty name is never grouped, because two untitled
 * tracks are not one track; and a wrong merge is worse than a missed one,
 * since a merge hides something the user owns.
 */

const OPTIONS = { threshold: 0.9, window: Number.POSITIVE_INFINITY };

function names(groups: string[][]): string[][] {
  return groups;
}

function cluster(input: readonly string[], options = OPTIONS): string[][] {
  return clusterBySimilarName(input, (name) => name, options);
}

describe('clusterBySimilarName', () => {
  it('groups the spellings this exists for', () => {
    expect(cluster(['Linkin Park', 'LINKIN PARK', 'Muse'])).toEqual(
      names([['Linkin Park', 'LINKIN PARK'], ['Muse']]),
    );
  });

  it('groups on an exact normalised match without needing the threshold', () => {
    expect(cluster(['Beyoncé', 'BEYONCE', 'beyonce '])).toHaveLength(1);
  });

  it('keeps genuinely different names apart', () => {
    expect(cluster(['Song Pt. 1', 'Song Pt. 2'])).toHaveLength(2);
    expect(cluster(['Numb', 'Numb (Live)'])).toHaveLength(2);
  });

  it('returns groups in the order their first member arrived', () => {
    // A ranked list has to stay ranked: the caller's first row is still first.
    const grouped = cluster(['Muse', 'Linkin Park', 'MUSE', 'Radiohead']);

    expect(grouped.map((group) => group[0])).toEqual(['Muse', 'Linkin Park', 'Radiohead']);
  });

  it('keeps members in input order inside a group', () => {
    // "The first one" has to keep meaning what the caller meant by it.
    expect(cluster(['LINKIN PARK', 'Linkin Park'])[0]).toEqual(['LINKIN PARK', 'Linkin Park']);
  });

  it('never groups a name that normalises to nothing', () => {
    const grouped = cluster(['', '', '...', 'Muse']);

    expect(grouped).toHaveLength(4);
  });

  it('is transitive through a chain rather than leaving a pair behind', () => {
    /*
     * "linkin park", "Linkin Park" and "LINKIN  PARK" all normalise the same,
     * so they are one group however they are ordered — a union rather than a
     * first-match-wins scan, which would have left the third with whichever it
     * happened to be compared against first.
     */
    expect(cluster(['linkin park', 'LINKIN  PARK', 'Linkin Park.'])).toHaveLength(1);
  });

  it('does not depend on the order the names arrive in', () => {
    const forwards = cluster(['Linkin Park', 'LINKIN PARK', 'Muse', 'MUSE']);
    const backwards = cluster(['MUSE', 'Muse', 'LINKIN PARK', 'Linkin Park']);

    expect(forwards.map((group) => group.length).sort()).toEqual(
      backwards.map((group) => group.length).sort(),
    );
  });

  it('returns every item exactly once', () => {
    const input = ['a', 'A', 'b', '', 'B ', 'c', '...'];
    const flat = cluster(input).flat();

    expect(flat).toHaveLength(input.length);
    expect([...flat].sort()).toEqual([...input].sort());
  });

  it('handles an empty list', () => {
    expect(cluster([])).toEqual([]);
  });

  it('carries whatever the caller put in, not just strings', () => {
    const rows = [
      { name: 'Linkin Park', plays: 4 },
      { name: 'LINKIN PARK', plays: 7 },
    ];
    const grouped = clusterBySimilarName(rows, (row) => row.name, OPTIONS);

    expect(grouped).toHaveLength(1);
    expect(grouped[0]?.map((row) => row.plays)).toEqual([4, 7]);
  });

  describe('the sliding window', () => {
    it('still groups neighbours when the window is small', () => {
      expect(cluster(['Linkin Park', 'LINKIN PARK'], { threshold: 0.9, window: 1 })).toHaveLength(1);
    });

    it('misses rather than mis-merges when a pair falls outside it', () => {
      /*
       * The honest cost of not comparing everything to everything. Sorted, the
       * two spellings here are far apart and a window of 1 cannot see across —
       * so they stay separate. A miss leaves a duplicate visible; a wrong merge
       * would hide a track somebody owns, which is the failure worth avoiding.
       */
      const grouped = cluster(['aaa Linkin Park', 'mmm', 'zzz Linkin Parl'], {
        threshold: 0.9,
        window: 1,
      });

      expect(grouped).toHaveLength(3);
    });
  });
});
