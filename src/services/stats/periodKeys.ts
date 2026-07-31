/**
 * Period keys for statistics rollups.
 *
 * These are written at insert time, in the user's local timezone, and never
 * recomputed at read time — recomputing gives wrong answers across DST and
 * travel, and forces a table scan.
 *
 * Everything here is pure and has no storage or native import, so the whole
 * of it is unit tested.
 */

export const WEEK_STARTS = ['monday', 'sunday'] as const;
export type WeekStart = (typeof WEEK_STARTS)[number];

export interface PeriodKeys {
  /** ISO-style week, e.g. `2026-W31`. */
  week: string;
  /** `2026-07`. */
  month: string;
  /** `2026`. */
  year: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_START_DAY: Record<WeekStart, number> = { sunday: 0, monday: 1 };

/**
 * Reduce an instant to the calendar day the *user* was living in, carried as
 * a UTC midnight.
 *
 * This is the whole DST defence. Local wall-clock arithmetic breaks on the
 * days that gain or lose an hour; UTC has no such days. By taking the local
 * year/month/day once and doing every subsequent step in UTC, a DST boundary
 * cannot move a key.
 */
function toCivilDay(date: Date): Date {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
}

/** First day of the week containing `civilDay`. */
function startOfWeek(civilDay: Date, weekStart: WeekStart): Date {
  const offset = (civilDay.getUTCDay() - WEEK_START_DAY[weekStart] + 7) % 7;
  return new Date(civilDay.getTime() - offset * DAY_MS);
}

/**
 * The fourth day of a week decides which year owns it, so a week straddling
 * New Year belongs to whichever year holds most of it. With a Monday start
 * that fourth day is Thursday, which is exactly the ISO 8601 rule.
 */
function weekAnchor(weekStartDay: Date): Date {
  return new Date(weekStartDay.getTime() + 3 * DAY_MS);
}

/** Start of week 1 of `year` — the first week whose anchor falls inside it. */
function firstWeekStart(year: number, weekStart: WeekStart): Date {
  const start = startOfWeek(new Date(Date.UTC(year, 0, 1)), weekStart);
  return weekAnchor(start).getUTCFullYear() < year ? new Date(start.getTime() + 7 * DAY_MS) : start;
}

/**
 * `2026-W31`. With `monday` this is ISO 8601 week numbering, so the last days
 * of December can belong to the next year's week 1 and vice versa.
 */
export function weekKey(date: Date, weekStart: WeekStart): string {
  const civilDay = toCivilDay(date);
  const start = startOfWeek(civilDay, weekStart);
  const year = weekAnchor(start).getUTCFullYear();
  const week1 = firstWeekStart(year, weekStart);
  const number = Math.round((start.getTime() - week1.getTime()) / (7 * DAY_MS)) + 1;

  return `${year}-W${String(number).padStart(2, '0')}`;
}

/** `2026-07`, from the local calendar month. */
export function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** `2026`, from the local calendar year. */
export function yearKey(date: Date): string {
  return String(date.getFullYear());
}

/** All three keys for one instant. Call this once, at insert time. */
export function periodKeys(date: Date, weekStart: WeekStart): PeriodKeys {
  return {
    week: weekKey(date, weekStart),
    month: monthKey(date),
    year: yearKey(date),
  };
}
