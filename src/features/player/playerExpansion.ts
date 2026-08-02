import { makeMutable } from 'react-native-reanimated';

/** The one root-owned progress value for the mini player and Now Playing overlay. */
export const playerExpansion = makeMutable(0);

/** Updates root player progress from a Reanimated worklet. */
export function setPlayerExpansion(value: number): void {
  'worklet';
  playerExpansion.value = value;
}
