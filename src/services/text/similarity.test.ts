import { editDistance, isSimilar, normalizeName, similarity } from './similarity';

/**
 * Deciding whether two names are one name.
 *
 * The cases that matter are not the obvious ones. A threshold high enough to
 * merge "LINKIN PARK" with "Linkin Park" has to be low enough to *refuse*
 * "Song Pt. 1" and "Song Pt. 2", which differ by a single character — and those
 * two requirements pull in opposite directions. Both are pinned here.
 */

const THRESHOLD = 0.9;

describe('normalizeName', () => {
  it('folds case', () => {
    expect(normalizeName('LINKIN PARK')).toBe(normalizeName('Linkin Park'));
  });

  it('folds accents to the letters underneath', () => {
    expect(normalizeName('Beyoncé')).toBe(normalizeName('Beyonce'));
    expect(normalizeName('Sigur Rós')).toBe('sigur ros');
  });

  it('folds the Turkish dotted capital, which lowercasing alone does not', () => {
    /*
     * `'İ'.toLowerCase()` is "i" plus a combining dot above. Stripping marks
     * before lowercasing is what makes this work, and Turkish tags make it a
     * real case rather than a theoretical one.
     */
    expect(normalizeName('İSTANBUL')).toBe('istanbul');
    expect(normalizeName('İstanbul')).toBe(normalizeName('istanbul'));
  });

  it('does not depend on the device locale', () => {
    // Locale-aware folding maps "I" to "ı" in Turkish, which would group a
    // library differently depending on the phone's language.
    expect(normalizeName('INTRO')).toBe('intro');
  });

  it('drops punctuation and collapses the space it leaves', () => {
    expect(normalizeName('  AC/DC  ')).toBe('ac dc');
    expect(normalizeName('Guns N’ Roses')).toBe('guns n roses');
    expect(normalizeName('Song.')).toBe('song');
  });

  it('keeps digits, which distinguish more names than they merge', () => {
    expect(normalizeName('Blink-182')).toBe('blink 182');
  });

  it('survives a name that normalises to nothing', () => {
    expect(normalizeName('...')).toBe('');
    expect(normalizeName('')).toBe('');
  });
});

describe('similarity', () => {
  it('is 1 for names that differ only in case, spacing or punctuation', () => {
    expect(similarity('LINKIN PARK', 'Linkin Park')).toBe(1);
    expect(similarity('Numb', 'Numb ')).toBe(1);
    expect(similarity('Beyoncé', 'BEYONCE')).toBe(1);
  });

  it('scales the distance by the longer name', () => {
    // One edit in eight characters.
    expect(similarity('abcdefgh', 'abcdefgX')).toBeCloseTo(1 - 1 / 8);
  });

  it('is 0 against an empty name rather than dividing by nothing', () => {
    expect(similarity('Linkin Park', '')).toBe(0);
    expect(similarity('...', 'Linkin Park')).toBe(0);
  });

  it('calls two empty names equal, and the callers refuse to group on them', () => {
    expect(similarity('', '')).toBe(1);
  });
});

describe('isSimilar', () => {
  it('merges the spellings this exists for', () => {
    expect(isSimilar('LINKIN PARK', 'Linkin Park', THRESHOLD)).toBe(true);
    expect(isSimilar('Beyoncé', 'Beyonce', THRESHOLD)).toBe(true);
    expect(isSimilar('The Beatles ', 'the beatles', THRESHOLD)).toBe(true);
  });

  it('refuses two tracks a single digit apart', () => {
    /*
     * The case that decides the threshold. "Song Pt. 1" and "Song Pt. 2" are
     * one character apart out of nine and must stay separate; merging them
     * would hide a track somebody owns behind another one.
     */
    expect(isSimilar('Song Pt. 1', 'Song Pt. 2', THRESHOLD)).toBe(false);
    expect(isSimilar('Track 01', 'Track 02', THRESHOLD)).toBe(false);
  });

  it('refuses a version that is genuinely a different recording', () => {
    expect(isSimilar('Numb', 'Numb (Live)', THRESHOLD)).toBe(false);
    expect(isSimilar('In the End', 'In the End (Remix)', THRESHOLD)).toBe(false);
  });

  it('refuses two different bands that happen to start alike', () => {
    expect(isSimilar('The Cure', 'The Cult', THRESHOLD)).toBe(false);
    expect(isSimilar('Muse', 'Mude', THRESHOLD)).toBe(false);
  });

  it('never groups on an empty name', () => {
    // Two untitled tracks are not one track, and a library has plenty of both.
    expect(isSimilar('', '', THRESHOLD)).toBe(false);
    expect(isSimilar('...', '???', THRESHOLD)).toBe(false);
    expect(isSimilar('Numb', '', THRESHOLD)).toBe(false);
  });

  it('refuses a long name against a short one without measuring', () => {
    // Every missing character is an edit, so the lengths alone settle it.
    expect(isSimilar('a', 'abcdefghijklmnop', THRESHOLD)).toBe(false);
  });

  it('agrees with `similarity` at the boundary', () => {
    const pairs = [
      ['Linkin Park', 'Linkin Parc'],
      ['Radiohead', 'Radiohead!'],
      ['abcdefghij', 'abcdefghiX'],
      ['Song Pt. 1', 'Song Pt. 2'],
      ['Muse', 'Mude'],
    ] as const;

    for (const [left, right] of pairs) {
      expect(isSimilar(left, right, THRESHOLD)).toBe(similarity(left, right) >= THRESHOLD);
    }
  });

  it('is symmetric, so grouping cannot depend on which name came first', () => {
    const pairs = [
      ['Linkin Park', 'LINKIN PARK'],
      ['Numb', 'Numb (Live)'],
      ['a', 'abcdefghij'],
    ] as const;

    for (const [left, right] of pairs) {
      expect(isSimilar(left, right, THRESHOLD)).toBe(isSimilar(right, left, THRESHOLD));
    }
  });
});

describe('editDistance', () => {
  it('counts the edits', () => {
    expect(editDistance('kitten', 'sitting')).toBe(3);
    expect(editDistance('', 'abc')).toBe(3);
    expect(editDistance('abc', 'abc')).toBe(0);
  });

  it('gives up past the budget rather than finishing the matrix', () => {
    // The exact value past the budget is never read; only that it exceeds it.
    expect(editDistance('kitten', 'sitting', 1)).toBeGreaterThan(1);
  });

  it('is exact when the answer is inside the budget', () => {
    expect(editDistance('kitten', 'sitting', 5)).toBe(3);
  });
});
