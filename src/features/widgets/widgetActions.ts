import { listFavoriteEntries, listPlaylistEntries } from '@/db/queries/playlists';
import { listLibraryTracks } from '@/db/queries/tracks';
import { entryToPlayable, toPlayable } from '@/features/player/toPlayable';
import { AudioEngine } from '@/services/audio/AudioEngine';
import { LIBRARY_SOURCE, type PlayableTrack, type QueueSource } from '@/services/audio/types';
import { dedupeTracks } from '@/services/library/dedupeTracks';
import { getDuplicateSetting } from '@/services/library/duplicateSetting';
import { getShuffleAlgorithm, getTrackSort } from '@/services/settings';
import { resolveJump, type CollectionKey, type WidgetAction } from '@/services/widgets/widgetState';

/**
 * Carry out a press on a home-screen widget.
 *
 * Each one is what the same button does in the app: the transport buttons are
 * the mini player's, and a collection's Play and Shuffle are the ones at the
 * top of its screen — same queue, same order, same source for the statistics.
 */
export async function performWidgetAction(action: WidgetAction): Promise<void> {
  switch (action.type) {
    case 'play':
      AudioEngine.play();
      return;
    case 'pause':
      AudioEngine.pause();
      return;
    case 'next':
      await AudioEngine.advance(true);
      return;
    case 'previous':
      await AudioEngine.previous();
      return;
    case 'jump': {
      const index = resolveJump(AudioEngine.getQueueSnapshot(), action.index, action.trackId);
      if (index !== -1) await AudioEngine.jumpTo(index);
      return;
    }
    case 'playCollection':
    case 'shuffleCollection': {
      const { tracks, source } = await loadCollection(action.collection);
      if (tracks.length === 0) return;
      // Queue first, shuffle second, as on every screen: the engine keeps the
      // real order underneath, so turning shuffle off later restores it.
      await AudioEngine.setQueue(tracks, 0, source);
      if (action.type === 'shuffleCollection') {
        await AudioEngine.setShuffled(true, getShuffleAlgorithm());
      }
      return;
    }
  }
}

/**
 * A collection's tracks as its own screen would queue them.
 *
 * The library in the order its tab is sorted, without the duplicates that tab
 * hides. Liked songs report as the library and a playlist as itself, exactly as
 * `usePlaylistPlayback` attributes them.
 */
async function loadCollection(
  key: CollectionKey,
): Promise<{ tracks: PlayableTrack[]; source: QueueSource }> {
  switch (key.kind) {
    case 'library': {
      const rows = await listLibraryTracks(getTrackSort());
      const { hidden, match } = getDuplicateSetting();
      const listed = hidden ? dedupeTracks(rows, match) : rows;
      return { tracks: listed.map(toPlayable), source: LIBRARY_SOURCE };
    }
    case 'liked':
      return { tracks: (await listFavoriteEntries()).map(entryToPlayable), source: LIBRARY_SOURCE };
    case 'playlist':
      return {
        tracks: (await listPlaylistEntries(key.id)).map(entryToPlayable),
        source: { type: 'playlist', id: key.id },
      };
  }
}
