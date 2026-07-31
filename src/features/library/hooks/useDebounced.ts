import { useEffect, useState } from 'react';

/**
 * A value that settles after typing stops.
 *
 * The *query* is debounced, never the text field: a field that lags behind
 * the keyboard feels broken, and that is the mistake which gives debouncing
 * its bad reputation. The input stays instant and only the database work
 * waits.
 *
 * 250ms is below the threshold where a pause reads as the app thinking, and
 * long enough that a 10,000-track LIKE scan does not run once per keystroke.
 */
export function useDebounced<T>(value: T, delayMs = 250): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return settled;
}
