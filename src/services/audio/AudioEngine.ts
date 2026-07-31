import AudioFocusEvents from 'audio-focus';
import {
  createAudioPlayer,
  setAudioModeAsync,
  setIsAudioActiveAsync,
  type AudioPlayer,
  type AudioStatus,
} from 'expo-audio';

import { isPlayable, nextIndex, previousIndex } from './queue';
import {
  IDLE_PLAYBACK,
  type FinishedListen,
  type PlayableTrack,
  type PlaybackState,
  type RepeatMode,
} from './types';

/**
 * The only file in the app that imports expo-audio.
 *
 * `AGENTS.md` rule 2 and `docs/01-TECH-STACK.md` §2.1 both insist on this, and
 * for a concrete reason: RNTP v4 is frozen and pre-New-Architecture, RNTP v5
 * is commercially licensed and this app ships MIT, so the engine choice is one
 * that may have to be revisited. Keeping every expo-audio symbol behind this
 * facade makes that a one-file change instead of an app-wide one.
 *
 * A singleton rather than a hook. Playback outlives any screen — that is the
 * entire point of background audio — so it cannot be owned by a component that
 * unmounts when the user navigates to Settings.
 */

/** How often the engine reports position. 500ms is expo-audio's own default. */
const STATUS_INTERVAL_MS = 500;

/** Pressing previous past this point restarts the track instead of going back. */
const RESTART_THRESHOLD_MS = 3_000;

type Listener = (state: PlaybackState) => void;
type ListenReporter = (listen: FinishedListen) => void;

class Engine {
  private player: AudioPlayer | null = null;
  private queue: PlayableTrack[] = [];
  private index = -1;
  private repeat: RepeatMode = 'off';
  private state: PlaybackState = IDLE_PLAYBACK;
  private listeners = new Set<Listener>();
  private configured = false;

  /*
   * Listening time is accumulated rather than read off the final position,
   * because the two stop agreeing the moment anyone seeks: scrubbing to the
   * last ten seconds would otherwise report the whole track as played and the
   * play/skip rule would count it as a full listen.
   */
  private reportListen: ListenReporter | null = null;
  private startedAt: Date | null = null;
  private playedMs = 0;
  private lastTickAt: number | null = null;

  /**
   * Set when a track has been handed to the player but is not open yet.
   *
   * `replace()` returns before the new source is ready, so calling `play()`
   * straight after it is a race the player usually loses: the source swaps,
   * nothing starts, and playback stops dead on the second track of every
   * queue. The intent to play is recorded here and acted on when a status
   * update says the file is actually loaded.
   */
  private playWhenReady = false;

  /**
   * Claim the audio session.
   *
   * `doNotMix` is not a preference: the tech stack doc records that the
   * lock-screen controls only bind correctly when exclusive focus is
   * requested. It is also the right behaviour — a music player that keeps
   * playing under a podcast is not what anyone wants.
   */
  private async configure(): Promise<void> {
    if (this.configured) return;
    this.configured = true;

    await setAudioModeAsync({
      playsInSilentMode: true,
      interruptionMode: 'doNotMix',
      shouldPlayInBackground: true,
    });

    /*
     * Pause when the audio route changes to the speaker.
     *
     * Android broadcasts this just before it reroutes — headphones out,
     * Bluetooth gone — and expects a media app to stop. Audio focus does not
     * cover it: unplugging headphones takes focus from nobody, so expo-audio's
     * focus handling never fires and the music would simply continue out loud.
     * Registered once, with the session, and never removed: the engine is a
     * singleton and this must hold for as long as the app can play anything.
     */
    AudioFocusEvents.addListener('audioBecomingNoisy', () => {
      this.pause();
    });
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getState(): PlaybackState {
    return this.state;
  }

  private emit(next: Partial<PlaybackState>): void {
    this.state = { ...this.state, ...next };
    for (const listener of this.listeners) listener(this.state);
  }

  /** Replace the queue and start at `startIndex`. */
  async setQueue(tracks: PlayableTrack[], startIndex: number): Promise<void> {
    this.queue = tracks;
    if (!isPlayable(startIndex, tracks.length)) {
      await this.stop();
      return;
    }
    await this.loadIndex(startIndex, true);
  }

  /**
   * Hand finished listens somewhere. Set once, at startup.
   *
   * A port rather than a direct call into `src/db`, so the engine stays a
   * playback concern and can be exercised without a database.
   */
  setListenReporter(reporter: ListenReporter | null): void {
    this.reportListen = reporter;
  }

  /** Bank the time played so far and hand the listen over. */
  private flushListen(completed: boolean): void {
    this.accumulate();

    const track = this.state.track;
    const startedAt = this.startedAt;

    if (track !== null && startedAt !== null && this.playedMs > 0) {
      this.reportListen?.({ track, msPlayed: Math.round(this.playedMs), startedAt, completed });
    }

    this.startedAt = null;
    this.playedMs = 0;
    this.lastTickAt = null;
  }

  /** Fold the time since the last tick into the running total. */
  private accumulate(): void {
    if (this.lastTickAt === null) return;
    this.playedMs += Date.now() - this.lastTickAt;
    this.lastTickAt = null;
  }

  private async loadIndex(index: number, autoPlay: boolean): Promise<void> {
    const track = this.queue[index];
    if (!track) return;

    // The outgoing track's listen closes before the incoming one starts.
    this.flushListen(false);
    this.startedAt = new Date();

    this.index = index;
    this.emit({ phase: 'loading', track, positionMs: 0, durationMs: track.durationMs });

    try {
      await this.configure();
      await setIsAudioActiveAsync(true);

      this.playWhenReady = autoPlay;

      if (this.player === null) {
        this.player = createAudioPlayer({ uri: track.uri }, { updateInterval: STATUS_INTERVAL_MS });
        this.player.addListener('playbackStatusUpdate', this.onStatus);
      } else {
        this.player.replace({ uri: track.uri });
      }

      this.bindLockScreen(track);

      // A freshly constructed player is ready synchronously; a replaced source
      // is not. Try now and let `onStatus` retry once it reports loaded.
      this.startIfReady();
    } catch (error) {
      this.emit({
        phase: 'error',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Put the track on the lock screen and the notification.
   *
   * Without `setActiveForLockScreen` Android stops the audio after roughly
   * three minutes in the background — it is what promotes the session to a
   * foreground media service, not merely what draws the controls. The tech
   * stack doc flags this as the single Android gotcha of this library.
   */
  private bindLockScreen(track: PlayableTrack): void {
    this.player?.setActiveForLockScreen(
      true,
      {
        title: track.title,
        artist: track.artistName ?? undefined,
        albumTitle: track.albumName ?? undefined,
        artworkUrl: track.artworkPath ? `file://${track.artworkPath}` : undefined,
      },
      { showSeekForward: true, showSeekBackward: true },
    );
  }

  /** Start playback once the source is actually open. Safe to call repeatedly. */
  private startIfReady(): void {
    if (!this.playWhenReady) return;
    if (this.player === null || !this.player.isLoaded) return;

    this.playWhenReady = false;
    this.player.play();
  }

  private onStatus = (status: AudioStatus): void => {
    // The pending start from `loadIndex`, now that the file may be open.
    if (status.isLoaded) this.startIfReady();

    // Clock the interval that just elapsed before anything else changes.
    if (status.playing) {
      this.accumulate();
      this.lastTickAt = Date.now();
    } else {
      this.accumulate();
    }

    // A track that reached its end advances the queue. `didJustFinish` fires
    // once, unlike `currentTime >= duration`, which fires on every tick after.
    if (status.didJustFinish) {
      this.flushListen(true);
      void this.advance(false);
      return;
    }

    if (this.state.phase === 'error') return;

    this.emit({
      phase: status.playing ? 'playing' : this.state.phase === 'loading' ? 'loading' : 'paused',
      positionMs: Math.round(status.currentTime * 1000),
      // expo-audio reports -1 or 0 before the file is open; the scanner's
      // figure is the better answer until then.
      durationMs:
        status.duration > 0 ? Math.round(status.duration * 1000) : this.state.durationMs,
    });
  };

  play(): void {
    // Pressing play on a track that is still opening has to be remembered,
    // not dropped — otherwise the button does nothing and the user presses it
    // again, which is how a double-start happens.
    this.playWhenReady = true;
    this.startIfReady();
  }

  pause(): void {
    // Also cancels a start that has not happened yet, so pausing during load
    // is not overridden a moment later when the file opens.
    this.playWhenReady = false;
    this.player?.pause();
  }

  toggle(): void {
    if (this.state.phase === 'playing') this.pause();
    else this.play();
  }

  async seekTo(positionMs: number): Promise<void> {
    await this.player?.seekTo(Math.max(0, positionMs) / 1000);
    this.emit({ positionMs: Math.max(0, positionMs) });
  }

  /** The next track. `explicit` marks a user press rather than a track ending. */
  async advance(explicit: boolean): Promise<void> {
    const next = nextIndex(
      { index: this.index, length: this.queue.length, repeat: this.repeat },
      explicit,
    );

    if (next === null) {
      await this.stop();
      return;
    }

    // Repeat-one on a finished track: same index, so seek rather than reload.
    if (next === this.index && !explicit) {
      await this.seekTo(0);
      this.play();
      return;
    }

    await this.loadIndex(next, true);
  }

  /**
   * The previous track, or the start of this one.
   *
   * The three-second rule lives here rather than in the queue because it needs
   * the playback position, which the queue does not have. It is what every
   * other player does and what the button is expected to do.
   */
  async previous(): Promise<void> {
    if (this.state.positionMs > RESTART_THRESHOLD_MS) {
      await this.seekTo(0);
      return;
    }

    const target = previousIndex({
      index: this.index,
      length: this.queue.length,
      repeat: this.repeat,
    });

    if (target === null) {
      await this.seekTo(0);
      return;
    }
    await this.loadIndex(target, true);
  }

  /** Jump straight to a queue position, as a queue screen tap would. */
  async jumpTo(index: number): Promise<void> {
    if (!isPlayable(index, this.queue.length)) return;
    await this.loadIndex(index, true);
  }

  setRepeat(mode: RepeatMode): void {
    this.repeat = mode;
  }

  getRepeat(): RepeatMode {
    return this.repeat;
  }

  getQueue(): { tracks: PlayableTrack[]; index: number } {
    return { tracks: this.queue, index: this.index };
  }

  /**
   * Stop and release the session.
   *
   * Clearing the lock screen matters: a notification with dead transport
   * controls is worse than no notification, and Android will happily keep
   * showing one for a player that has gone away.
   */
  async stop(): Promise<void> {
    this.flushListen(false);
    this.player?.pause();
    this.player?.clearLockScreenControls();
    this.index = -1;
    this.emit({ ...IDLE_PLAYBACK });
    await setIsAudioActiveAsync(false);
  }
}

/** The single engine instance. Playback outlives every screen. */
export const AudioEngine = new Engine();
