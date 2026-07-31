import { useEffect, useRef, useState } from 'react';

/**
 * Let a live query settle before the UI follows it.
 *
 * Stage two of a scan writes in batches of 25, so enriching a 528-track
 * library re-runs the library query about twenty times in a minute. Each run
 * returns a fresh array of fresh objects, and the list re-diffs and re-measures
 * against it — which is both wasted work and enough churn to leave FlashList
 * rendering a gap where it thinks content is.
 *
 * The user is not reading titles at twenty updates a minute. Coalescing them
 * costs nothing they can perceive.
 *
 * The first value passes through immediately: a cold start must paint as soon
 * as there is anything to paint, and delaying that would be the opposite of
 * what the two-stage scan is for.
 */
export function useThrottledData<T>(value: T, intervalMs = 500): T {
  const [settled, setSettled] = useState(value);
  const lastEmitted = useRef(0);

  useEffect(() => {
    const sinceLast = Date.now() - lastEmitted.current;

    if (sinceLast >= intervalMs) {
      lastEmitted.current = Date.now();
      setSettled(value);
      return;
    }

    const timer = setTimeout(() => {
      lastEmitted.current = Date.now();
      setSettled(value);
    }, intervalMs - sinceLast);

    return () => clearTimeout(timer);
  }, [value, intervalMs]);

  return settled;
}
