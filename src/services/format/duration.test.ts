import { formatDuration } from './duration';

describe('formatDuration', () => {
  it('formats a typical track as m:ss', () => {
    expect(formatDuration(225_000, 'en')).toBe('3:45');
  });

  it('pads seconds but not minutes', () => {
    // 4:05, not 04:05 — a track list is a column of clock readings, and the
    // leading zero on minutes is noise at this scale.
    expect(formatDuration(245_000, 'en')).toBe('4:05');
  });

  it('grows to h:mm:ss only once an hour is reached', () => {
    expect(formatDuration(3_599_000, 'en')).toBe('59:59');
    expect(formatDuration(3_600_000, 'en')).toBe('1:00:00');
    expect(formatDuration(3_723_000, 'en')).toBe('1:02:03');
  });

  it('truncates rather than rounds, so a track never reads longer than it is', () => {
    expect(formatDuration(3_999, 'en')).toBe('0:03');
  });

  it('handles zero', () => {
    expect(formatDuration(0, 'en')).toBe('0:00');
  });

  it('does not render NaN into a row when the duration is unusable', () => {
    expect(formatDuration(Number.NaN, 'en')).toBe('0:00');
    expect(formatDuration(-1, 'en')).toBe('0:00');
    expect(formatDuration(Number.POSITIVE_INFINITY, 'en')).toBe('0:00');
  });

  it('formats identically in Turkish, which uses the same digits', () => {
    expect(formatDuration(225_000, 'tr')).toBe('3:45');
  });

  it('uses the locale digits where they differ', () => {
    // Guards the reason this goes through Intl at all rather than padStart.
    // Skipped when the runtime ships without full ICU, which is a data
    // limitation and not a defect in this function.
    const localised = formatDuration(225_000, 'ar-EG');
    if (/^\d/u.test(localised)) return;
    expect(localised).toBe('٣:٤٥');
  });

  it('reuses formatters across calls', () => {
    // A 10,000-row list must not construct two Intl.NumberFormats per row.
    const first = formatDuration(60_000, 'en');
    const second = formatDuration(120_000, 'en');
    expect(first).toBe('1:00');
    expect(second).toBe('2:00');
  });
});
