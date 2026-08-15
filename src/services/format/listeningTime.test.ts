import { formatListeningTime, listeningTimeParts } from './listeningTime';

/** English units, so the existing expectations still read as they did. */
const EN = { hour: 'h', minute: 'm', second: 's' };

describe('listeningTimeParts', () => {
  it('splits into hours and whole minutes', () => {
    expect(listeningTimeParts(4 * 3_600_000 + 37 * 60_000)).toEqual({ hours: 4, minutes: 37 });
  });

  it('drops seconds rather than rounding up', () => {
    // Rounding 59 seconds up to a minute would let a week of near-misses
    // inflate the headline figure. Under-reporting is the honest direction.
    expect(listeningTimeParts(59_999)).toEqual({ hours: 0, minutes: 0 });
    expect(listeningTimeParts(119_999)).toEqual({ hours: 0, minutes: 1 });
  });

  it('handles zero and nonsense without producing NaN', () => {
    for (const input of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(listeningTimeParts(input)).toEqual({ hours: 0, minutes: 0 });
    }
  });
});

describe('formatListeningTime', () => {
  it('shows hours and minutes once past an hour', () => {
    expect(formatListeningTime(4 * 3_600_000 + 37 * 60_000, 'en', EN)).toBe('4h 37m');
  });

  it('omits the hours entirely below one', () => {
    // "0h 37m" reads like a placeholder.
    expect(formatListeningTime(37 * 60_000, 'en', EN)).toBe('37m');
  });

  it('keeps a zero-minute hour rather than hiding it', () => {
    expect(formatListeningTime(2 * 3_600_000, 'en', EN)).toBe('2h 0m');
  });

  it('groups large hour counts through Intl', () => {
    // A year of listening runs to four digits.
    expect(formatListeningTime(1234 * 3_600_000, 'en', EN)).toBe('1,234h 0m');
  });

  it('reads the same in Turkish, which shares these digits', () => {
    expect(formatListeningTime(90 * 60_000, 'tr', EN)).toBe('1h 30m');
  });
});

describe('formatListeningTime under a minute', () => {
  it('reports seconds rather than a useless zero', () => {
    /*
     * The per-row totals on the statistics screen exposed this: a handful of
     * six-second tracks all read "0m", which tells the reader nothing and looks
     * like a value that failed to load.
     */
    expect(formatListeningTime(42_000, 'en', EN)).toBe('42s');
  });

  it('rounds seconds down, like the minutes above', () => {
    expect(formatListeningTime(6_900, 'en', EN)).toBe('6s');
  });

  it('says 0s for nothing at all, not an empty string', () => {
    expect(formatListeningTime(0, 'en', EN)).toBe('0s');
    expect(formatListeningTime(-1, 'en', EN)).toBe('0s');
  });

  it('switches to minutes the moment there is one', () => {
    expect(formatListeningTime(59_999, 'en', EN)).toBe('59s');
    expect(formatListeningTime(60_000, 'en', EN)).toBe('1m');
  });
});

describe('the units are the caller\'s', () => {
  const TR = { hour: 'sa', minute: 'dk', second: 'sn' };

  it('reads in Turkish when Turkish labels are handed in', () => {
    expect(formatListeningTime(16_620_000, 'tr', TR)).toBe('4sa 37dk');
    expect(formatListeningTime(2_220_000, 'tr', TR)).toBe('37dk');
    expect(formatListeningTime(42_000, 'tr', TR)).toBe('42sn');
  });

  it('still reads in English when English labels are', () => {
    expect(formatListeningTime(16_620_000, 'en', EN)).toBe('4h 37m');
  });
});
