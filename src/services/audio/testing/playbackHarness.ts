import { classifyListen, type ListenOutcome } from '@/services/stats/playCounting';

import { AudioEngine } from '../AudioEngine';
import type { FinishedListen, PlayableTrack, QueueSource, RepeatMode } from '../types';
import { currentFakePlayer, type FakeAudioPlayer } from './fakeAudioPlayer';

/**
 * Drive the real `AudioEngine` from a scripted status stream.
 *
 * Time is the fake timer clock, which `ListenCycle` reads through `Date.now()`,
 * so a listen's `msPlayed` here is the same arithmetic that runs on a phone.
 *
 * The engine is a module-level singleton on purpose — playback outlives every
 * screen — so each harness resets it through its own public API rather than by
 * reloading the module. That also keeps one fake player alive across a suite,
 * which is what a device does: `createAudioPlayer` happens once and every track
 * after it arrives through `replace()`.
 */

/** What `recordListen` would write for one reported listen. */
export interface RecordedListen {
  trackId: number;
  msPlayed: number;
  outcome: ListenOutcome;
  completed: boolean;
  startedAt: number;
}

/** expo-audio's own default, and what the engine asks for. */
const TICK_MS = 500;

export interface PlaybackHarness {
  /** Every listen the engine reported, in order. One per `play_events` row. */
  readonly listens: RecordedListen[];
  /** Play for this long, in ticks, advancing the clock and the position. */
  playFor(ms: number): Promise<void>;
  /** Paused wall-clock time. Ticks still arrive; the position does not move. */
  pauseFor(ms: number): Promise<void>;
  /** Run to the end of the current track and report `didJustFinish`. */
  finishTrack(): Promise<void>;
  /** Seek the way the scrubber does — through the engine, not the player. */
  seekTo(ms: number): Promise<void>;
  /** Press play/pause. */
  toggle(): Promise<void>;
  /** Press next. */
  next(): Promise<void>;
  /** Press previous. */
  previous(): Promise<void>;
  setRepeat(mode: RepeatMode): void;
  stop(): Promise<void>;
  /** Position the engine currently believes it is at, in ms. */
  positionMs(): number;
  /** The fake player the engine is driving. */
  player(): FakeAudioPlayer;
}

export interface StartOptions {
  startIndex?: number;
  source?: QueueSource;
  repeat?: RepeatMode;
}

/** Build a track with sane defaults; only `durationMs` usually matters. */
export function track(id: number, durationMs: number, title = `track-${id}`): PlayableTrack {
  return {
    id,
    uri: `content://media/external/audio/media/${id}`,
    title,
    artistName: null,
    albumName: null,
    durationMs,
    artworkPath: null,
    playCount: 0,
    isFavorite: false,
  };
}

/** Start playback and return the driver. Resets the engine first. */
export async function startPlayback(
  tracks: PlayableTrack[],
  options: StartOptions = {},
): Promise<PlaybackHarness> {
  // Drop whatever a previous test left loaded before anything is listening, so
  // its final flush is not attributed to this one.
  AudioEngine.setListenReporter(null);
  AudioEngine.setRepeat('off');
  await AudioEngine.clearQueue();
  await flush();

  const listens: RecordedListen[] = [];
  AudioEngine.setListenReporter((listen: FinishedListen) => {
    listens.push({
      trackId: listen.track.id,
      msPlayed: listen.msPlayed,
      // The same call `recordListen` makes, so an outcome here is the outcome
      // that would be written to the row.
      outcome: classifyListen(listen.msPlayed, listen.track.durationMs),
      completed: listen.completed,
      startedAt: listen.startedAt.getTime(),
    });
  });

  if (options.repeat) AudioEngine.setRepeat(options.repeat);

  await AudioEngine.setQueue(tracks, options.startIndex ?? 0, options.source);
  await flush();
  await settleLoad();

  return {
    listens,
    player: currentFakePlayer,

    positionMs() {
      return AudioEngine.getState().positionMs;
    },

    async playFor(ms: number) {
      for (let elapsed = 0; elapsed < ms; elapsed += TICK_MS) {
        jest.advanceTimersByTime(TICK_MS);
        const live = currentFakePlayer();
        if (live.playing) live.currentTime += TICK_MS / 1000;
        live.emit();
        await flush();
      }
    },

    async pauseFor(ms: number) {
      for (let elapsed = 0; elapsed < ms; elapsed += TICK_MS) {
        jest.advanceTimersByTime(TICK_MS);
        currentFakePlayer().emit();
        await flush();
      }
    },

    async finishTrack() {
      const live = currentFakePlayer();
      jest.advanceTimersByTime(TICK_MS);
      live.currentTime = live.duration;
      live.playing = false;
      live.emit({ didJustFinish: true });
      await flush();
      await settleLoad();
    },

    async seekTo(ms: number) {
      await AudioEngine.seekTo(ms);
      await flush();
    },

    async toggle() {
      AudioEngine.toggle();
      await flush();
    },

    async next() {
      await AudioEngine.advance(true);
      await flush();
      await settleLoad();
    },

    async previous() {
      await AudioEngine.previous();
      await flush();
      await settleLoad();
    },

    setRepeat(mode: RepeatMode) {
      AudioEngine.setRepeat(mode);
    },

    async stop() {
      await AudioEngine.stop();
      await flush();
    },
  };
}

/**
 * Let a `replace()` finish opening and report it, the way a device would.
 *
 * Modelling the swap as instant would hide the `playWhenReady` race the engine
 * exists to handle — and that race is the reason playback used to stop dead on
 * the second track of every queue.
 */
async function settleLoad(): Promise<void> {
  const live = currentFakePlayer();
  if (live.isLoaded) return;
  const current = AudioEngine.getState().track;
  if (current === null) return;
  live.finishLoading(current.durationMs / 1000);
  live.emit();
  await flush();
}

/**
 * Let the engine's un-awaited promise chains run out.
 *
 * `onStatus` fires `void this.advance(false)` on a finished track, so the
 * interesting work happens in microtasks the caller never sees. Twenty turns is
 * far more than the deepest chain and costs nothing.
 */
export async function flush(): Promise<void> {
  for (let turn = 0; turn < 20; turn += 1) await Promise.resolve();
}
