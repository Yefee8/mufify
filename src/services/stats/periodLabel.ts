import type { WeekStart } from './periodKeys';
import type { PeriodType } from './rollups';

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_START_DAY: Record<WeekStart, number> = { sunday: 0, monday: 1 };

/**
 * The period a share card is about, as a person would write it.
 *
 * "This week" is right on the stats screen, which is read today; a shared
 * picture is read next month, when "this week" is a different week. So the
 * card names the dates: "10–16 November 2026", "November 2026", "2026" — in
 * the app's language, through `Intl`, with the week starting on the day the
 * user chose for their statistics.
 */
export function periodLabel(
  period: PeriodType,
  now: Date,
  weekStart: WeekStart,
  locale: string,
): string {
  if (period === 'year') {
    return new Intl.DateTimeFormat(locale, { year: 'numeric' }).format(now);
  }
  if (period === 'month') {
    return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(now);
  }

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const offset = (today.getDay() - WEEK_START_DAY[weekStart] + 7) % 7;
  const start = new Date(today.getTime() - offset * DAY_MS);
  const end = new Date(start.getTime() + 6 * DAY_MS);

  const full = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' });

  if (start.getFullYear() !== end.getFullYear()) {
    return `${full.format(start)} – ${full.format(end)}`;
  }
  if (start.getMonth() !== end.getMonth()) {
    const dayMonth = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long' });
    return `${dayMonth.format(start)} – ${full.format(end)}`;
  }

  /*
   * One month: the end date written the language's way, with its day turned
   * into the range — "16–22 Kasım 2026", "November 16–22, 2026". Built from
   * `formatToParts` rather than `formatRange`, which Hermes does not have, so
   * the phone and the tests produce the same string.
   */
  const startDay = new Intl.DateTimeFormat(locale, { day: 'numeric' }).format(start);
  return full
    .formatToParts(end)
    .map((part) => (part.type === 'day' ? `${startDay}–${part.value}` : part.value))
    .join('');
}
