import { matchesSearch } from './search';

/**
 * What a typed query finds.
 *
 * The one rule worth pinning is that a search is as forgiving as the tags are
 * messy: what somebody types on a phone keyboard has no accents and no
 * capitals, and the library was tagged by tools that used both.
 */

describe('matchesSearch', () => {
  it('matches everything on an empty query', () => {
    expect(matchesSearch('', 'Linkin Park')).toBe(true);
    expect(matchesSearch('   ', 'Linkin Park')).toBe(true);
  });

  it('ignores case', () => {
    expect(matchesSearch('linkin', 'LINKIN PARK')).toBe(true);
    expect(matchesSearch('LINKIN', 'Linkin Park')).toBe(true);
  });

  it('finds an accented name from an unaccented query', () => {
    // A phone keyboard produces "beyonce"; the tag says "Beyoncé".
    expect(matchesSearch('beyonce', 'Beyoncé')).toBe(true);
    expect(matchesSearch('istanbul', 'İSTANBUL')).toBe(true);
  });

  it('finds a substring, not only a prefix', () => {
    expect(matchesSearch('park', 'Linkin Park')).toBe(true);
  });

  it('searches every field it is given', () => {
    expect(matchesSearch('linkin', 'Numb', 'Linkin Park', 'Meteora')).toBe(true);
  });

  it('requires every word, across fields', () => {
    // "park numb": one half is the artist, the other the title.
    expect(matchesSearch('park numb', 'Numb', 'Linkin Park')).toBe(true);
    expect(matchesSearch('park faint', 'Numb', 'Linkin Park')).toBe(false);
  });

  it('is indifferent to punctuation on either side', () => {
    expect(matchesSearch('acdc', 'AC/DC')).toBe(true);
    expect(matchesSearch('ac/dc', 'ACDC')).toBe(true);
  });

  it('skips null and empty fields rather than matching on them', () => {
    expect(matchesSearch('x', null, undefined, '')).toBe(false);
  });

  it('does not match what is not there', () => {
    expect(matchesSearch('muse', 'Linkin Park', 'Meteora')).toBe(false);
  });
});
