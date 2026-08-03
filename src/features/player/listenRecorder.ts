import { recordListen } from '@/db/queries/playEvents';
import { AudioEngine } from '@/services/audio/AudioEngine';
import { getStatsEnabled, getWeekStart } from '@/services/settings';
import { shouldRecordListen } from '@/services/stats/recordingGate';

/**
 * Write finished listens to the database.
 *
 * The wiring lives here, not in the engine: the engine reports that a listen
 * ended and knows nothing about `play_events`, rollups or week-start
 * preferences. That keeps playback testable without a database and keeps the
 * layer direction pointing the right way.
 *
 * **This is also the one place the statistics switch is read.** Nothing under
 * `services/stats` imports settings — the counting rule, the period keys and
 * the rollups are arithmetic that has to answer the same in a test as on a
 * phone — so the flag is read here, beside the week-start preference that is
 * here for exactly the same reason, and handed to a pure gate.
 *
 * Read per listen rather than captured once. The subscription is installed at
 * startup and lives for the whole process, so a flag captured here would keep
 * whatever it was when the app launched and the switch would appear to do
 * nothing until the next cold start.
 *
 * A failure here never reaches the user: losing one statistics row is a
 * smaller harm than interrupting playback to complain about it, and the next
 * track is already loading by the time this runs. It is still reported in
 * development, because a write that fails silently in both is a write nobody
 * finds out about until the statistics look wrong months later.
 */
export function startListenRecording(): () => void {
  AudioEngine.setListenReporter((listen) => {
    if (!shouldRecordListen({ statsEnabled: getStatsEnabled(), msPlayed: listen.msPlayed })) {
      return;
    }

    void recordListen(
      {
        trackId: listen.track.id,
        // The engine's duration, not the track row's. See `FinishedListen`.
        durationMs: listen.durationMs,
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
