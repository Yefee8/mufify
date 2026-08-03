/**
 * Whether a finished listen should be written down.
 *
 * Pure, and it takes the switch as an argument rather than reading it. Nothing
 * under `services/stats` imports settings, and this is the file that would
 * have been the first to: the counting rule, the period keys and the rollups
 * are all arithmetic that has to give the same answer in a test as on a phone,
 * and a module-level MMKV read inside any of them would end that.
 *
 * So the flag is read in exactly one place — `features/player/listenRecorder`,
 * the port between the engine and the database, which already reads the
 * week-start preference for the same reason — and passed in here.
 *
 * ## What turning it off does and does not do
 *
 * It stops **new** `play_events` and, with them, the `track_stats` upsert and
 * the rollup increments that ride along in `recordListen`. It does not touch a
 * single row already written. Clearing history is a separate, deliberately
 * separately-worded action; a switch labelled "record listening history" that
 * quietly deleted a year of it would be a different feature wearing this one's
 * label.
 *
 * The decision is made when a listen **ends**, not when it starts. Turning the
 * switch off mid-track therefore drops the listen in progress, which is the
 * reading that matches the words: from the moment you turn it off, nothing new
 * is written.
 */

export interface ListenRecordingInput {
  /** `getStatsEnabled()`, read by the caller. */
  statsEnabled: boolean;
  /** Milliseconds of real playback in the finished listen. */
  msPlayed: number;
}

/**
 * True when this listen earns a row.
 *
 * The `msPlayed` guard is not redundant with `ListenCycle.close()`, which
 * already refuses to bank an empty cycle. It is here because this function is
 * the thing the tests point at when they ask "does a listen get recorded", and
 * an answer that depends on a collaborator two layers away is not one anybody
 * can check.
 */
export function shouldRecordListen({ statsEnabled, msPlayed }: ListenRecordingInput): boolean {
  if (!statsEnabled) return false;
  return msPlayed > 0;
}
