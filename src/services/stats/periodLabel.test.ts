import { periodLabel } from './periodLabel';

// Monday 16 November 2026, mid-afternoon local time.
const NOW = new Date(2026, 10, 16, 15, 0);

describe('periodLabel', () => {
  it('names the year and the month, in the language asked for', () => {
    expect(periodLabel('year', NOW, 'monday', 'en')).toBe('2026');
    expect(periodLabel('month', NOW, 'monday', 'en')).toBe('November 2026');
    expect(periodLabel('month', NOW, 'monday', 'tr')).toBe('Kasım 2026');
  });

  it('names the week by its dates, starting on the chosen day', () => {
    expect(periodLabel('week', NOW, 'monday', 'tr')).toBe('16–22 Kasım 2026');
    expect(periodLabel('week', NOW, 'sunday', 'tr')).toBe('15–21 Kasım 2026');
    expect(periodLabel('week', NOW, 'monday', 'en')).toBe('November 16–22, 2026');
  });

  it('names both months when a week crosses one', () => {
    const lateMonth = new Date(2026, 9, 29); // Thursday 29 October 2026
    expect(periodLabel('week', lateMonth, 'monday', 'tr')).toBe('26 Ekim – 1 Kasım 2026');
  });

  it('names both years when a week crosses New Year', () => {
    const newYear = new Date(2026, 11, 31); // Thursday 31 December 2026
    expect(periodLabel('week', newYear, 'monday', 'tr')).toBe('28 Aralık 2026 – 3 Ocak 2027');
  });
});
