/**
 * The library's read side.
 *
 * One export, deliberately. There used to be a separate `useTrackCount`, and
 * the screen showed its number above a list fed from somewhere else — which is
 * how the header could read "14 tracks" over an empty list. The count is now
 * `tracks.length` of the same array the list renders, so the two cannot
 * disagree.
 */
export { useTracks } from '@/db/queries/tracks';
