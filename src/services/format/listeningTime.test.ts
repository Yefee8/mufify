import { formatListeningTime, listeningTimeParts } from './listeningTime';

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
    expect(formatListeningTime(4 * 3_600_000 + 37 * 60_000, 'en')).toBe('4h 37m');
  });

  it('omits the hours entirely below one', () => {
    // "0h 37m" reads like a placeholder.
    expect(formatListeningTime(37 * 60_000, 'en')).toBe('37m');
  });

  it('keeps a zero-minute hour rather than hiding it', () => {
    expect(formatListeningTime(2 * 3_600_000, 'en')).toBe('2h 0m');
  });

  it('groups large hour counts through Intl', () => {
    // A year of listening runs to four digits.
    expect(formatListeningTime(1234 * 3_600_000, 'en')).toBe('1,234h 0m');
  });

  it('reads the same in Turkish, which shares these digits', () => {
    expect(formatListeningTime(90 * 60_000, 'tr')).toBe('1h 30m');
  });
});
