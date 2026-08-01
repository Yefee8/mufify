/**
 * Listening time, in the units a person would use.
 *
 * Different from `formatDuration`, which renders a clock reading for one
 * track. "You listened to 4:37:12 this week" is not how anyone says it — the
 * answer is "4h 37m", and past a certain size the seconds are noise.
 *
 * Goes through `Intl.NumberFormat` for the digits, per `AGENTS.md`. The unit
 * letters are translated by the caller's locale file rather than hard-coded
 * here, so this returns the number and the key it needs.
 */

export interface ListeningTimeParts {
  hours: number;
  minutes: number;
}

/** Hours and whole minutes. Seconds are dropped, never rounded up into a lie. */
export function listeningTimeParts(milliseconds: number): ListeningTimeParts {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return { hours: 0, minutes: 0 };

  const totalMinutes = Math.floor(milliseconds / 60_000);
  return { hours: Math.floor(totalMinutes / 60), minutes: totalMinutes % 60 };
}

/**
 * `4h 37m`, or `37m` under an hour, or `42s` under a minute.
 *
 * The seconds case exists because the per-row totals on the statistics screen
 * exposed it: a handful of short tracks all read "0m", which tells the reader
 * nothing at all and looks like a value that failed to load. Under a minute the
 * only informative unit is seconds.
 *
 * It stops there. `4h 37m 12s` is not how anyone reports listening time, and
 * once there are minutes to show the seconds are noise.
 *
 * The `h`/`m`/`s` suffixes are deliberately not localised: they are the same in
 * both shipped locales, and a translated unit would need plural rules for a
 * string nobody reads as a sentence. If a third locale disagrees, this becomes
 * three `t()` keys and the function returns parts instead.
 */
export function formatListeningTime(milliseconds: number, locale: string): string {
  const { hours, minutes } = listeningTimeParts(milliseconds);
  const format = (value: number) => new Intl.NumberFormat(locale).format(value);

  if (hours > 0) return `${format(hours)}h ${format(minutes)}m`;
  if (minutes > 0) return `${format(minutes)}m`;

  // Rounded down, like the minutes above: never round a listen up into a lie.
  const seconds = Math.max(0, Math.floor((Number.isFinite(milliseconds) ? milliseconds : 0) / 1000));
  return `${format(seconds)}s`;
}
