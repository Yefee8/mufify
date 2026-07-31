import { recordListen } from '@/db/queries/playEvents';
import { AudioEngine } from '@/services/audio/AudioEngine';
import { getWeekStart } from '@/services/settings';

/**
 * Write finished listens to the database.
 *
 * The wiring lives here, not in the engine: the engine reports that a listen
 * ended and knows nothing about `play_events`, rollups or week-start
 * preferences. That keeps playback testable without a database and keeps the
 * layer direction pointing the right way.
 *
 * Failures are swallowed on purpose. Losing one statistics row is a smaller
 * harm than interrupting playback to complain about it, and the next track is
 * already loading by the time this runs.
 */
export function startListenRecording(): () => void {
  AudioEngine.setListenReporter((listen) => {
    void recordListen(
      {
        trackId: listen.track.id,
        durationMs: listen.track.durationMs,
        msPlayed: listen.msPlayed,
        startedAt: listen.startedAt,
        sourceType: 'library',
        completed: listen.completed,
      },
      getWeekStart(),
    ).catch(() => {
      // See above: statistics must never be able to stop the music.
    });
  });

  return () => AudioEngine.setListenReporter(null);
}
