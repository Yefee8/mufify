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
 * A failure here never reaches the user: losing one statistics row is a
 * smaller harm than interrupting playback to complain about it, and the next
 * track is already loading by the time this runs. It is still reported in
 * development, because a write that fails silently in both is a write nobody
 * finds out about until the statistics look wrong months later.
 */
export function startListenRecording(): () => void {
  AudioEngine.setListenReporter((listen) => {
    void recordListen(
      {
        trackId: listen.track.id,
        durationMs: listen.track.durationMs,
        msPlayed: listen.msPlayed,
        startedAt: listen.startedAt,
        sourceType: listen.source.type,
        sourceId: listen.source.id,
        shuffleAlgorithm: listen.shuffleAlgorithm ?? undefined,
        completed: listen.completed,
      },
      getWeekStart(),
    ).catch((error: unknown) => {
      if (__DEV__) console.warn('Failed to record a listen:', error);
    });
  });

  return () => AudioEngine.setListenReporter(null);
}
