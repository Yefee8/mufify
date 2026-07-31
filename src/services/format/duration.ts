/**
 * Track durations, formatted for display.
 *
 * `Intl.NumberFormat` rather than `String.padStart` because `AGENTS.md`
 * requires durations to go through `Intl` with the active locale, and padding
 * by hand hard-codes ASCII digits. A locale using Arabic-Indic or Devanagari
 * numerals gets its own digits from `NumberFormat` for free.
 *
 * The colon separator is deliberately not localised. `Intl.DurationFormat`
 * would localise it, but it is not in Hermes, and every locale writes a track
 * length as `3:45` anyway — a clock reading, not a sentence.
 */

/** `3:45`, or `1:02:03` once an hour is involved. */
export function formatDuration(milliseconds: number, locale: string): string {
  // A negative or non-finite duration is a bug upstream, but a list row is the
  // wrong place to surface it — show a blank clock rather than `NaN:NaN`.
  if (!Number.isFinite(milliseconds) || milliseconds < 0) {
    return zeroDuration(locale);
  }

  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const plain = digits(locale, 1);
  const padded = digits(locale, 2);

  return hours > 0
    ? `${plain.format(hours)}:${padded.format(minutes)}:${padded.format(seconds)}`
    : `${plain.format(minutes)}:${padded.format(seconds)}`;
}

function zeroDuration(locale: string): string {
  return `${digits(locale, 1).format(0)}:${digits(locale, 2).format(0)}`;
}

/*
 * Formatters are not free to construct, and a list scrolling 10,000 rows would
 * build two per row. There are only ever a handful of (locale, width) pairs.
 */
const FORMATTERS = new Map<string, Intl.NumberFormat>();

function digits(locale: string, minimumIntegerDigits: number): Intl.NumberFormat {
  const key = `${locale}:${minimumIntegerDigits}`;
  const cached = FORMATTERS.get(key);
  if (cached) return cached;

  const formatter = new Intl.NumberFormat(locale, {
    minimumIntegerDigits,
    useGrouping: false,
  });
  FORMATTERS.set(key, formatter);
  return formatter;
}
