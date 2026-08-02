import { onAudioBecomingNoisy } from 'audio-focus';
import {
  createAudioPlayer,
  setAudioModeAsync,
  setIsAudioActiveAsync,
  type AudioPlayer,
  type AudioStatus,
} from 'expo-audio';

import { shuffleTracks, type ShuffleAlgorithm } from '@/services/shuffle';
import { ListenCycle, type BankedListen } from '@/services/stats/listenCycle';
import { isRewindToRestart } from '@/services/stats/repeatListen';

import { lockScreenArtworkUri, prepareNotificationArtwork } from './notificationArtwork';

import {
  isPlayable,
  nextIndex,
  playNextIndex,
  previousIndex,
  shouldRestartCurrentTrack,
  shiftForInsert,
} from './queue';
import {
  IDLE_PLAYBACK,
  LIBRARY_SOURCE,
  type FinishedListen,
  type PlayableTrack,
  type PlaybackState,
  type QueueSource,
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

type Listener = (state: PlaybackState) => void;
type ListenReporter = (listen: FinishedListen) => void;

/** What the queue screen renders. */
export interface QueueSnapshot {
  tracks: readonly PlayableTrack[];
  index: number;
}

type QueueListener = (snapshot: QueueSnapshot) => void;

class Engine {
  private player: AudioPlayer | null = null;
  private queue: PlayableTrack[] = [];
  private index = -1;
  private repeat: RepeatMode = 'off';

  /*
   * The queue as the user built it, kept alongside the shuffled one so that
   * turning shuffle off restores the original order rather than freezing
   * whatever random arrangement happened to be playing.
   */
  private sourceQueue: PlayableTrack[] = [];
  private shuffled = false;

  /*
   * Where the current queue came from, and which shuffle reordered it. Both are
   * attributes of the *queue*, not of a track, so they belong here rather than
   * on `PlayableTrack` — the same track played from a playlist and from the
   * library is two different listens with two different attributions.
   */
  private source: QueueSource = LIBRARY_SOURCE;
  private shuffleAlgorithm: ShuffleAlgorithm | null = null;
  private state: PlaybackState = IDLE_PLAYBACK;
  private listeners = new Set<Listener>();
  private configured = false;

  /*
   * The queue has its own subscription rather than riding on PlaybackState.
   * State is emitted twice a second for the position, and a queue screen
   * re-rendering several hundred rows at that rate is the difference between
   * a list that scrolls and one that does not. The snapshot object is only
   * rebuilt when the queue or the index actually changes, so
   * `useSyncExternalStore` can compare it by reference.
   */
  private queueListeners = new Set<QueueListener>();
  private queueSnapshot: QueueSnapshot = { tracks: [], index: -1 };

  /*
   * Listening time is accumulated rather than read off the final position,
   * because the two stop agreeing the moment anyone seeks: scrubbing to the
   * last ten seconds would otherwise report the whole track as played and the
   * play/skip rule would count it as a full listen.
   */
  private reportListen: ListenReporter | null = null;
  private listenCycle = new ListenCycle();

  /**
   * Position at the previous status tick, for spotting a rewind.
   *
   * A listen used to end only when the loaded track changed, so a track on
   * repeat-one recorded one play no matter how many times it went round. This is
   * what lets the engine notice the track starting over without the track
   * changing. See `src/services/stats/repeatListen.ts`.
   */
  private lastPositionMs = 0;

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
   * Whether this player is already the lock screen's active player.
   *
   * Claiming it is a session rebuild; keeping it is a metadata update. See
   * `bindLockScreen`. Cleared by `stop()`, which hands the session back.
   */
  private lockScreenBound = false;

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

    // Unpacked before the first track binds the lock screen, so a track with
    // no cover has the app's placeholder to show rather than a blank square.
    await prepareNotificationArtwork();

    /*
     * Pause when the audio route changes to the speaker.
     *
     * Android broadcasts this just before it reroutes — headphones out,
     * Bluetooth gone — and expects a media app to stop. Audio focus does not
     * cover it: unplugging headphones takes focus from nobody, so expo-audio's
     * focus handling never fires and the music would simply continue out loud.
     * Registered once, with the session, and never removed: the engine is a
     * singleton and this must hold for as long as the app can play anything.
     *
     * A build without the native module gets a no-op rather than a crash —
     * see the note in modules/audio-focus.
     */
    onAudioBecomingNoisy(() => this.pause());
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

  subscribeQueue(listener: QueueListener): () => void {
    this.queueListeners.add(listener);
    listener(this.queueSnapshot);
    return () => {
      this.queueListeners.delete(listener);
    };
  }

  getQueueSnapshot(): QueueSnapshot {
    return this.queueSnapshot;
  }

  /** Rebuild the snapshot and notify, but only when something really moved. */
  private emitQueue(): void {
    if (this.queueSnapshot.tracks === this.queue && this.queueSnapshot.index === this.index) {
      return;
    }
    this.queueSnapshot = { tracks: this.queue, index: this.index };
    for (const listener of this.queueListeners) listener(this.queueSnapshot);
  }

  private emit(next: Partial<PlaybackState>): void {
    this.state = { ...this.state, ...next };
    for (const listener of this.listeners) listener(this.state);
  }

  /**
   * Replace the queue and start at `startIndex`.
   *
   * `source` defaults to the library because that is where most queues come
   * from, and defaulting it means a caller that forgets attributes a listen
   * plausibly rather than crashing. Playlist playback passes its own.
   */
  async setQueue(
    tracks: PlayableTrack[],
    startIndex: number,
    source: QueueSource = LIBRARY_SOURCE,
  ): Promise<void> {
    this.sourceQueue = tracks;
    this.queue = tracks;
    this.shuffled = false;
    this.shuffleAlgorithm = null;
    this.source = source;

    if (!isPlayable(startIndex, tracks.length)) {
      await this.stop();
      return;
    }
    await this.loadIndex(startIndex, true);
  }

  isShuffled(): boolean {
    return this.shuffled;
  }

  /**
   * Append to the end of the queue.
   *
   * Starts playing when nothing is loaded. "Add to queue" on an idle player has
   * to do something audible or the gesture looks broken — the user asked for
   * these tracks, and a silent queue they cannot see is not an answer.
   *
   * Tracks already in the queue are added again rather than deduplicated:
   * queueing the same song twice is a choice someone can make, and silently
   * dropping the second one is more surprising than honouring it.
   */
  async enqueue(tracks: PlayableTrack[]): Promise<void> {
    if (tracks.length === 0) return;

    const wasEmpty = this.queue.length === 0;
    this.queue = [...this.queue, ...tracks];
    this.sourceQueue = [...this.sourceQueue, ...tracks];

    if (wasEmpty) {
      await this.loadIndex(0, true);
      return;
    }
    this.emitQueue();
  }

  /**
   * Insert directly after what is playing.
   *
   * The whole batch goes in at one point, in the order given, so pressing play-
   * next on three tracks queues them in that order rather than reversed.
   */
  async playNext(tracks: PlayableTrack[]): Promise<void> {
    if (tracks.length === 0) return;

    const wasEmpty = this.queue.length === 0;
    const at = playNextIndex(this.index, this.queue.length);

    this.queue = [...this.queue.slice(0, at), ...tracks, ...this.queue.slice(at)];

    /*
     * The source queue is the *unshuffled* order, so the shuffled queue's
     * insertion point means nothing in it. Appending is the honest answer:
     * "play next" is a statement about the order playing now, and turning
     * shuffle off afterwards should not claim the user had asked for these
     * tracks at some particular place in the album order.
     */
    this.sourceQueue = [...this.sourceQueue, ...tracks];

    if (wasEmpty) {
      await this.loadIndex(0, true);
      return;
    }

    this.index = shiftForInsert(this.index, at, tracks.length);
    this.emitQueue();
  }

  /**
   * Turn shuffle on or off without interrupting what is playing.
   *
   * The current track stays current — it moves to the front of the reordered
   * queue rather than being replaced. Reshuffling underneath a playing track
   * and jumping to a different one is the behaviour every player gets wrong
   * once; pressing shuffle is a statement about what comes *next*.
   *
   * Turning it off restores the original order and finds the current track's
   * place in it, so the album resumes from where it actually is.
   */
  async setShuffled(shuffled: boolean, algorithm: ShuffleAlgorithm): Promise<void> {
    const current = this.queue[this.index] ?? null;
    this.shuffled = shuffled;
    this.shuffleAlgorithm = shuffled ? algorithm : null;

    if (!shuffled) {
      this.queue = this.sourceQueue;
    } else {
      const rest = this.sourceQueue.filter((track) => track.id !== current?.id);
      const reordered = shuffleTracks(rest, algorithm);
      this.queue = current ? [current, ...reordered] : reordered;
    }

    // Follow the current track to its new home. Nothing reloads: the audio
    // keeps playing and only the index moves.
    this.index = current ? this.queue.findIndex((track) => track.id === current.id) : -1;
    this.emitQueue();
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
    this.reportClosedListen(this.listenCycle.close(), completed);
  }

  /** Send an already-banked cycle to statistics while its track is still current. */
  private reportClosedListen(listen: BankedListen | null, completed: boolean): void {
    const track = this.state.track;

    if (track !== null && listen !== null) {
      this.reportListen?.({
        track,
        // The engine's duration, falling back to the scanner's only when the
        // file never opened. See `FinishedListen.durationMs`: classifying
        // against a MediaStore duration of zero turns every listen into a
        // `partial` and loses it from the counts.
        durationMs: this.state.durationMs > 0 ? this.state.durationMs : track.durationMs,
        msPlayed: listen.msPlayed,
        startedAt: listen.startedAt,
        completed,
        source: this.source,
        shuffleAlgorithm: this.shuffleAlgorithm,
      });
    }
  }

  /**
   * Bank the listen so far and open a new one, same track still loaded.
   *
   * Distinct from `flushListen` in one respect that matters: `startedAt` is set
   * to now rather than cleared, because the next listen has already begun. Period
   * keys come from when a listen *started*, so a loop that crosses midnight puts
   * its two halves in the right days.
   */
  private beginNextCycle(): void {
    this.reportClosedListen(this.listenCycle.restart(), true);
  }

  private async loadIndex(index: number, autoPlay: boolean): Promise<void> {
    const track = this.queue[index];
    if (!track) return;

    // The outgoing track's listen closes before the incoming one starts.
    this.flushListen(false);
    this.listenCycle.open();

    this.index = index;
    this.lastPositionMs = 0;
    this.emitQueue();
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
   *
   * **Called once, then updated in place.** This used to run on every track
   * load, and `setActiveForLockScreen` on an already-active player does not
   * refresh a session — it releases the MediaSession and builds a new one on
   * the main queue. Between the release and the rebuild there is a window with
   * no live session, and the notification's play/pause icon is drawn from
   * `session.player.isPlaying` at the moment it is posted. A state change
   * landing in that window is drawn against a released session and then never
   * corrected, which is how the notification came to show "playing" for audio
   * that had stopped. It is also why `dumpsys media_session` reports nonsense
   * for this app, which `docs/player.md` records as an unexplained quirk: it
   * was catching the swap.
   *
   * `updateLockScreenMetadata` changes the metadata on the live session and
   * re-posts the notification, with no session release and no window.
   */
  private bindLockScreen(track: PlayableTrack): void {
    const metadata = {
      title: track.title,
      artist: track.artistName ?? undefined,
      albumTitle: track.albumName ?? undefined,
      // The app's own placeholder rather than nothing, so a track without a
      // cover looks the same in the notification as it does on screen.
      artworkUrl: lockScreenArtworkUri(track.artworkPath),
    };

    if (this.lockScreenBound) {
      this.player?.updateLockScreenMetadata(metadata);
      return;
    }

    this.lockScreenBound = true;
    this.player?.setActiveForLockScreen(true, metadata, {
      showSeekForward: true,
      showSeekBackward: true,
    });
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

    const positionMs = Math.round(status.currentTime * 1000);

    // Clock the interval that just elapsed before anything else changes.
    this.listenCycle.tick(status.playing);

    // A track that reached its end advances the queue. `didJustFinish` fires
    // once, unlike `currentTime >= duration`, which fires on every tick after.
    if (status.didJustFinish) {
      this.flushListen(true);
      this.lastPositionMs = 0;
      void this.advance(false);
      return;
    }

    /*
     * The same track started over — looped, or dragged back to the beginning.
     * Close the listen and open another, so a song on repeat is counted as many
     * times as it is actually heard.
     *
     * Checked before the state is emitted, so `lastPositionMs` is still the
     * previous tick's value when the comparison happens.
     */
    if (
      isRewindToRestart({
        previousPositionMs: this.lastPositionMs,
        positionMs,
        durationMs: this.state.durationMs,
        msPlayedInCycle: this.listenCycle.msPlayedInCycle,
      })
    ) {
      this.beginNextCycle();
    }

    this.lastPositionMs = positionMs;

    if (this.state.phase === 'error') return;

    this.emit({
      phase: status.playing ? 'playing' : this.state.phase === 'loading' ? 'loading' : 'paused',
      positionMs,
      // expo-audio reports -1 or 0 before the file is open; the scanner's
      // figure is the better answer until then.
      durationMs: status.duration > 0 ? Math.round(status.duration * 1000) : this.state.durationMs,
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
      // `onStatus` just banked the completed listen. Unlike loadIndex, this
      // path keeps the same source, so it must explicitly open the next pass.
      this.listenCycle.open();
      await this.seekTo(0);
      this.play();
      return;
    }

    await this.loadIndex(next, true);
  }

  /**
   * The previous track, or the start of this one.
   *
   * The ten-second rule lives here rather than in the queue because it needs
   * the playback position, which the queue does not have. It is what every
   * other player does and what the button is expected to do.
   */
  async previous(): Promise<void> {
    if (shouldRestartCurrentTrack(this.state.positionMs)) {
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

  /**
   * Drop one entry from the queue.
   *
   * Removing what is playing is not a stop — it plays what would have come
   * next, which is what the gesture means on every other player.
   */
  async removeAt(index: number): Promise<void> {
    if (!isPlayable(index, this.queue.length)) return;

    const removed = this.queue[index];
    const wasCurrent = index === this.index;

    this.queue = this.queue.filter((_, position) => position !== index);
    this.sourceQueue = this.sourceQueue.filter((track) => track.id !== removed?.id);

    if (this.queue.length === 0) {
      await this.stop();
      return;
    }

    if (wasCurrent) {
      // The next track has slid into this index; if it was the last one, wrap
      // back rather than pointing past the end.
      await this.loadIndex(Math.min(index, this.queue.length - 1), true);
      return;
    }

    if (index < this.index) this.index -= 1;
    this.emitQueue();
  }

  /** Empty the queue and stop. */
  async clearQueue(): Promise<void> {
    this.queue = [];
    this.sourceQueue = [];
    await this.stop();
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
    this.lockScreenBound = false;
    this.index = -1;
    this.emitQueue();
    this.emit({ ...IDLE_PLAYBACK });
    await setIsAudioActiveAsync(false);
  }
}

/** The single engine instance. Playback outlives every screen. */
export const AudioEngine = new Engine();
