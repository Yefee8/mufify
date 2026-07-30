import { monthKey, periodKeys, weekKey, yearKey } from './periodKeys';

/** Local-component construction: these are wall-clock times for the user. */
function local(year: number, month: number, day: number, hour = 12, minute = 0, second = 0): Date {
  return new Date(year, month - 1, day, hour, minute, second);
}

describe('weekKey — ISO 8601 with a Monday start', () => {
  it('numbers an ordinary mid-year week', () => {
    // Thursday 30 July 2026 is in ISO week 31.
    expect(weekKey(local(2026, 7, 30), 'monday')).toBe('2026-W31');
  });

  it('pads single-digit week numbers', () => {
    expect(weekKey(local(2026, 1, 8), 'monday')).toBe('2026-W02');
  });

  it('gives December days to the next year when the week leans that way', () => {
    // Wed 31 Dec 2025 sits in the week whose Thursday is 1 Jan 2026.
    expect(weekKey(local(2025, 12, 31), 'monday')).toBe('2026-W01');
  });

  it('gives January days to the previous year when the week leans that way', () => {
    // Fri 1 Jan 2027 sits in the week whose Thursday is 31 Dec 2026.
    expect(weekKey(local(2027, 1, 1), 'monday')).toBe('2026-W53');
  });

  it('keeps a 53-week year and its neighbour consistent', () => {
    // Sun 3 Jan 2027 closes 2026-W53; Mon 4 Jan 2027 opens 2027-W01.
    expect(weekKey(local(2027, 1, 3), 'monday')).toBe('2026-W53');
    expect(weekKey(local(2027, 1, 4), 'monday')).toBe('2027-W01');
  });

  it('holds every day of one week to the same key', () => {
    const keys = [27, 28, 29, 30, 31].map((day) => weekKey(local(2026, 7, day), 'monday'));
    keys.push(weekKey(local(2026, 8, 1), 'monday'));
    keys.push(weekKey(local(2026, 8, 2), 'monday'));
    expect(new Set(keys).size).toBe(1);
  });

  it('starts a new key on Monday', () => {
    // Sunday 2 Aug 2026 vs Monday 3 Aug 2026.
    expect(weekKey(local(2026, 8, 2), 'monday')).not.toBe(weekKey(local(2026, 8, 3), 'monday'));
  });
});

describe('weekKey — Sunday start', () => {
  it('breaks the week a day earlier than the Monday setting does', () => {
    // Sunday 2 Aug 2026 opens a new week here, but closes one under Monday.
    expect(weekKey(local(2026, 8, 1), 'sunday')).not.toBe(weekKey(local(2026, 8, 2), 'sunday'));
    expect(weekKey(local(2026, 8, 2), 'sunday')).toBe(weekKey(local(2026, 8, 3), 'sunday'));
  });

  it('holds every day of one Sunday-based week to the same key', () => {
    const keys = [2, 3, 4, 5, 6, 7, 8].map((day) => weekKey(local(2026, 8, day), 'sunday'));
    expect(new Set(keys).size).toBe(1);
  });

  it('can put the same instant in a different year from the Monday key', () => {
    // Sat 3 Jan 2026. Its Monday-based week leans into 2026; its Sunday-based
    // week started 28 Dec and leans back into 2025. This is why changing the
    // setting has to rebuild every rollup, not just renumber them.
    expect(weekKey(local(2026, 1, 3), 'monday')).toBe('2026-W01');
    expect(weekKey(local(2026, 1, 3), 'sunday')).toBe('2025-W53');
  });
});

describe('DST', () => {
  /*
   * The keys are derived from the local calendar day only, never from elapsed
   * milliseconds, so an hour appearing or disappearing cannot move them.
   * These hold in any timezone, with or without DST.
   */

  it('keeps one civil day together across a spring-forward jump', () => {
    // 29 March 2026 is the European spring transition.
    const before = periodKeys(local(2026, 3, 29, 1, 30), 'monday');
    const after = periodKeys(local(2026, 3, 29, 3, 30), 'monday');
    expect(after).toEqual(before);
  });

  it('keeps one civil day together across an autumn fall-back', () => {
    // 25 October 2026 is the European autumn transition.
    const before = periodKeys(local(2026, 10, 25, 1, 30), 'monday');
    const after = periodKeys(local(2026, 10, 25, 3, 30), 'monday');
    expect(after).toEqual(before);
  });

  it('still separates days either side of local midnight', () => {
    expect(weekKey(local(2026, 8, 2, 23, 59), 'monday')).not.toBe(
      weekKey(local(2026, 8, 3, 0, 1), 'monday'),
    );
  });
});

describe('monthKey and yearKey', () => {
  it('pads the month', () => {
    expect(monthKey(local(2026, 1, 15))).toBe('2026-01');
    expect(monthKey(local(2026, 12, 15))).toBe('2026-12');
  });

  it('reads the local calendar, not UTC', () => {
    // Just after local midnight on New Year's Day. In any timezone behind UTC
    // the UTC date is still the old year; the key must not be.
    expect(yearKey(local(2026, 1, 1, 0, 30))).toBe('2026');
    expect(monthKey(local(2026, 1, 1, 0, 30))).toBe('2026-01');
  });

  it('rolls at local midnight on New Year', () => {
    expect(yearKey(local(2025, 12, 31, 23, 59))).toBe('2025');
    expect(yearKey(local(2026, 1, 1, 0, 0))).toBe('2026');
  });
});

describe('periodKeys', () => {
  it('returns all three for one instant', () => {
    expect(periodKeys(local(2026, 7, 30), 'monday')).toEqual({
      week: '2026-W31',
      month: '2026-07',
      year: '2026',
    });
  });

  it('can hand a December instant a next-year week key', () => {
    // The week and the month legitimately disagree about the year here.
    expect(periodKeys(local(2025, 12, 31), 'monday')).toEqual({
      week: '2026-W01',
      month: '2025-12',
      year: '2025',
    });
  });
});
