/**
 * Measurement, so performance claims come with numbers.
 *
 * `AGENTS.md`: "Before claiming a performance fix, measure it and report the
 * numbers." This is how. Everything here compiles to nothing in a release build
 * — the `__DEV__` checks are constant-folded by Metro's minifier, so a shipped
 * bundle contains no marks, no counters and no strings.
 *
 * Output goes to `console.log`, which reaches logcat in a debug build, so a
 * measurement run is `adb logcat` and a grep rather than a profiler session.
 * The tag is deliberately greppable.
 */

const TAG = 'MUFIFY_PERF';

const counters = new Map<string, number>();
const marks = new Map<string, number>();

/** Hermes exposes a monotonic sub-millisecond clock; Date is the fallback. */
function now(): number {
  return globalThis.performance?.now?.() ?? Date.now();
}

/**
 * Count an occurrence and log the running total.
 *
 * Used for the questions that are about *how often* rather than how long: how
 * many times a live query re-ran, how many times a screen mounted. A count of
 * one where you expected one is the cheapest possible answer.
 */
export function count(label: string): void {
  if (!__DEV__) return;
  const next = (counters.get(label) ?? 0) + 1;
  counters.set(label, next);
  console.log(`${TAG} count ${label} ${next}`);
}

/** Start a stopwatch. Overwrites any unfinished one under the same label. */
export function mark(label: string): void {
  if (!__DEV__) return;
  marks.set(label, now());
}

/**
 * Stop a stopwatch and log the elapsed milliseconds.
 *
 * Returns the duration so a caller can act on it, and 0 when `mark` was never
 * called — a missing start is a measurement bug, not a fast operation, so it
 * says so rather than reporting a plausible number.
 */
export function measure(label: string, detail?: string | number): number {
  if (!__DEV__) return 0;

  const started = marks.get(label);
  if (started === undefined) {
    console.log(`${TAG} measure ${label} NO_MARK`);
    return 0;
  }

  marks.delete(label);
  const elapsed = now() - started;
  console.log(
    `${TAG} measure ${label} ${elapsed.toFixed(1)}ms${detail === undefined ? '' : ` ${detail}`}`,
  );
  return elapsed;
}

/** A single labelled value — a row count, a queue length. */
export function value(label: string, amount: number): void {
  if (!__DEV__) return;
  console.log(`${TAG} value ${label} ${amount}`);
}

/** Reset every counter, so one run's numbers do not accumulate into the next. */
export function reset(): void {
  if (!__DEV__) return;
  counters.clear();
  marks.clear();
  console.log(`${TAG} reset`);
}
