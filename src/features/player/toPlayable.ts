import type { TrackListItem } from '@/db/queries/tracks';
import type { PlayableTrack } from '@/services/audio/types';

/**
 * A list row, as the engine wants it.
 *
 * The two types are nearly identical today and still kept apart on purpose:
 * `TrackListItem` is shaped by what a row renders, `PlayableTrack` by what the
 * engine needs to play and to put on the lock screen. Collapsing them would
 * make the engine depend on the database's row shape, which is the coupling
 * `AGENTS.md` rule 2 exists to prevent.
 */
export function toPlayable(track: TrackListItem): PlayableTrack {
  return {
    id: track.id,
    uri: track.fileUri,
    title: track.title,
    artistName: track.artistName,
    albumName: track.albumName,
    durationMs: track.durationMs,
    artworkPath: track.artworkPath,
    playCount: track.playCount,
    isFavorite: track.isFavorite,
  };
}
