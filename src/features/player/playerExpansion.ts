import { makeMutable } from 'react-native-reanimated';

/**
 * The root-owned progress values for the surfaces `PlayerLayer` stacks.
 *
 * Module level rather than `useSharedValue` so a gesture can write to them from
 * a worklet without the value being captured by a hook — which is what the
 * React Compiler's immutability rule rejects, correctly, for ordinary values.
 * Each is 0 closed and 1 open, and `Sheet` draws whichever it is handed.
 */

/** Mini player to Now Playing. Written directly by both drag gestures. */
export const playerExpansion = makeMutable(0);

/**
 * Now Playing to the queue.
 *
 * Its own value rather than a second use of `playerExpansion`: the queue opens
 * *over* an already-open player, so the two travel independently, and sharing
 * one would drag the player closed as the queue arrived.
 */
export const queueExpansion = makeMutable(0);

/** Updates root player progress from a Reanimated worklet. */
export function setPlayerExpansion(value: number): void {
  'worklet';
  playerExpansion.value = value;
}
