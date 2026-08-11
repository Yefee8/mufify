import { db } from '../client';
import {
  albums,
  artists,
  playEvents,
  statsRollups,
  trackStats,
  tracks,
} from '../schema';

/**
 * The two things a user is allowed to throw away, and nothing else.
 *
 * Separate on purpose. They are different kinds of loss: a library can be
 * rebuilt by scanning again, and a listening history cannot be rebuilt at all.
 * Offering one button for both would make the cheap one carry the weight of the
 * expensive one.
 *
 * `clearDatabase` in `db/seed` is not this. That one is a development tool that
 * empties everything including playlists, and it is behind `__DEV__`.
 */

/**
 * Forget every scanned track.
 *
 * Artists and albums go with them — they exist only to group tracks, and a
 * shelf of empty artists is not a library. So does listening history, and not
 * by choice: `play_events` and `track_stats` are foreign-key children of
 * `tracks` with `ON DELETE CASCADE`, so the rows are gone the moment the tracks
 * are. The rollups have no foreign key and are deleted explicitly, because
 * leaving them would keep the statistics screens showing totals for music the
 * app no longer knows about.
 *
 * The confirmation says all of this. It is the one place where a user could
 * reasonably expect "clear the list" to mean less than it does.
 *
 * Playlists survive as playlists, but not as contents: their rows point at
 * track ids, and a rescan mints new ones.
 */
export async function clearLibrary(): Promise<void> {
  await db.transaction(async (tx) => {
    // Not a cascade child; deleted first so no screen can read a rollup whose
    // track has already gone.
    await tx.delete(statsRollups);
    await tx.delete(tracks);
    await tx.delete(albums);
    await tx.delete(artists);
  });
}

/**
 * Forget what has been listened to, and keep the music.
 *
 * `track_stats` holds two unrelated things: the counters, and whether a track
 * is a favourite. Deleting the rows — which is what the development tool does —
 * would quietly empty Liked Songs along with the history, so the counters are
 * reset in place and the favourite flags are left exactly where they are.
 */
export async function clearStatistics(): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(playEvents);
    await tx.delete(statsRollups);
    await tx.update(trackStats).set({
      playCount: 0,
      skipCount: 0,
      msPlayedTotal: 0,
      lastPlayedAt: null,
    });
  });
}
