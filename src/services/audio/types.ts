/**
 * The vocabulary everything outside `src/services/audio` speaks.
 *
 * No expo-audio types appear here. That is the point of the boundary in
 * `AGENTS.md` rule 2: the engine is expected to be swapped — the tech stack
 * doc names `react-native-audio-pro` and RNTP v5 as fallbacks if expo-audio
 * cannot do gapless or Android Auto — and a swap should touch one directory,
 * not every screen.
 */

/** A track as the player needs it: identity, where the audio is, what to show. */
export interface PlayableTrack {
  id: number;
  /** `content://media/external/audio/media/<id>`. */
  uri: string;
  title: string;
  artistName: string | null;
  albumName: string | null;
  durationMs: number;
  /** Bare filesystem path, no scheme. Null when the file has no cover. */
  artworkPath: string | null;
  /**
   * Lifetime plays. Carried so the queue satisfies `ShuffleTrack` — the
   * discovery algorithm weights by it, and re-querying at shuffle time would
   * put a database round trip between the button and the music.
   */
  playCount: number;
  /** Favourited. Carried for the same reason as `playCount`. */
  isFavorite: boolean;
}

/**
 * What the player is doing.
 *
 * `loading` is separate from `playing` because a FLAC on a slow SD card takes
 * long enough to open that the UI has to say something, and showing a pause
 * button for audio that has not started is a lie.
 */
export type PlaybackPhase = 'idle' | 'loading' | 'playing' | 'paused' | 'error';

export interface PlaybackState {
  phase: PlaybackPhase;
  /** Null only when phase is `idle`. */
  track: PlayableTrack | null;
  positionMs: number;
  /**
   * What the engine reports, which can differ from `track.durationMs` — the
   * scanner's figure comes from MediaStore and is occasionally wrong. The
   * engine's is authoritative once loaded.
   */
  durationMs: number;
  /** Set only when phase is `error`. A message, already plain. */
  error?: string;
}

export type RepeatMode = 'off' | 'all' | 'one';

/**
 * Where a queue came from.
 *
 * Carried so a finished listen can be attributed. Without it every play looks
 * like it came from the library, and `stats_rollups` — which has an entity type
 * for playlists — never gains a single playlist row. The statistics screen can
 * then show top tracks and top artists but never top playlists, and nothing
 * about that failure is visible: the query returns no rows, which looks exactly
 * like a user who has not played any playlists.
 */
export interface QueueSource {
  type: 'library' | 'album' | 'artist' | 'playlist' | 'queue';
  /** The playlist, album or artist id. Absent for the library. */
  id?: number;
}

export const LIBRARY_SOURCE: QueueSource = { type: 'library' };

/**
 * One finished listen, handed out when a track stops being the current one.
 *
 * `msPlayed` is accumulated wall-clock time spent actually playing, not the
 * final position. The two differ as soon as anyone seeks: scrubbing to the
 * last ten seconds of a track would otherwise report the whole thing as
 * listened, and the play/skip rule would count it.
 */
export interface FinishedListen {
  track: PlayableTrack;
  msPlayed: number;
  /** When this track started. Period keys derive from it, not from "now". */
  startedAt: Date;
  /** True when it reached its end rather than being skipped or replaced. */
  completed: boolean;
  /** Where the queue this played from came from. */
  source: QueueSource;
  /**
   * Which shuffle algorithm was running, or null when playing in order.
   *
   * `play_events` has had this column since Phase 1 and nothing ever wrote to
   * it, so the question it exists to answer — which shuffle produces listens
   * people finish — was unanswerable.
   */
  shuffleAlgorithm: string | null;
}

export const IDLE_PLAYBACK: PlaybackState = {
  phase: 'idle',
  track: null,
  positionMs: 0,
  durationMs: 0,
};
