/**
 * Queue arithmetic, kept pure and away from the player.
 *
 * "What plays next" is the part of a music player that has the most edge cases
 * and the least to do with audio: the last track with repeat off, the first
 * track with previous pressed, repeat-one interacting with an explicit skip.
 * None of that needs a device to test, and all of it is wrong at least once
 * before it is right.
 */

import type { RepeatMode } from './types';

export interface QueuePosition {
  /** Index into the queue, or -1 when nothing is queued. */
  index: number;
  length: number;
  repeat: RepeatMode;
}

/**
 * The next index, or null when playback should stop.
 *
 * `explicit` distinguishes the user pressing skip from a track ending on its
 * own. Under repeat-one a finished track repeats, but a pressed skip still
 * moves on — repeating the same track when someone asks for the next one
 * reads as a broken button, not as a respected setting.
 */
export function nextIndex({ index, length, repeat }: QueuePosition, explicit: boolean): number | null {
  if (length === 0 || index < 0) return null;
  if (repeat === 'one' && !explicit) return index;

  const following = index + 1;
  if (following < length) return following;

  // Past the end. Wrapping is repeat-all's whole job; otherwise stop.
  return repeat === 'all' ? 0 : null;
}

/**
 * The previous index, or null when there is nowhere to go.
 *
 * Deliberately does not implement "restart the current track if more than
 * three seconds in" — that rule belongs to the button, which knows the
 * playback position, not to the queue, which does not.
 */
export function previousIndex({ index, length, repeat }: QueuePosition): number | null {
  if (length === 0 || index < 0) return null;
  if (index > 0) return index - 1;

  // At the start. Repeat-all wraps to the end; repeat-one has no meaning for
  // a skip, so it behaves like off.
  return repeat === 'all' ? length - 1 : null;
}

/** Whether an index can be played. Guards every queue jump. */
export function isPlayable(index: number, length: number): boolean {
  return Number.isInteger(index) && index >= 0 && index < length;
}

/**
 * The next repeat mode when the button is pressed.
 *
 * off → all → one → off. Escalating: no repeat, then repeat the queue, then
 * narrow to the one track. Going straight from off to one would strand anyone
 * who wanted "keep the album going" behind a mode that stops it dead.
 */
export function cycleRepeat(mode: RepeatMode): RepeatMode {
  switch (mode) {
    case 'off':
      return 'all';
    case 'all':
      return 'one';
    case 'one':
      return 'off';
  }
}
