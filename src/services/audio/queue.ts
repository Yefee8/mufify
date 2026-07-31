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
 * Where "play next" puts its tracks.
 *
 * Directly after whatever is current, so a sequence of play-next presses builds
 * the order they were pressed in rather than reversing it. Inserting each one at
 * `index + 1` would make the last one pressed play first, which is a bug people
 * describe as "it plays them backwards" — the caller passes the whole batch and
 * this returns one insertion point for it.
 *
 * An empty or unstarted queue inserts at the front: there is no "next" yet, and
 * appending to nothing then refusing to play it is how the button appears dead.
 */
export function playNextIndex(index: number, length: number): number {
  if (length === 0 || index < 0) return 0;
  return Math.min(index + 1, length);
}

/**
 * Where the index has to move after `count` tracks are inserted at `at`.
 *
 * An insert before the current track shifts it along; one after it does not.
 * Getting this wrong does not throw — the queue simply starts pointing at a
 * different track than the one making sound, and every subsequent skip is off
 * by one.
 */
export function shiftForInsert(index: number, at: number, count: number): number {
  if (index < 0) return index;
  return at <= index ? index + count : index;
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
