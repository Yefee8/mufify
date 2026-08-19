import { onAudioBecomingNoisy, onMediaSkip } from 'audio-focus';
import {
  createAudioPlayer,
  setAudioModeAsync,
  setIsAudioActiveAsync,
  type AudioPlayer,
  type AudioStatus,
} from 'expo-audio';

import { attachToSession } from '@/services/equalizer/equalizerController';
import { getTrackFadeMs } from '@/services/settings';
import { shuffleTracks, type ShuffleAlgorithm } from '@/services/shuffle';
import { ListenCycle, type BankedListen } from '@/services/stats/listenCycle';
import { isRewindToRestart } from '@/services/stats/repeatListen';

import { fadeOutDelay, VolumeFade } from './fade';
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
   * `replace()` returns before the new source is ready. The intent to play is
   * recorded here, asked for immediately, and asked for again on each status
   * update until the file is open — see `requestPlay`.
   */
  private playWhenReady = false;

  /**
   * Whether the audio session is claimed and has not been handed back.
   *
   * `setIsAudioActiveAsync` used to run on every track load. It is an async
   * native call, and awaiting it sat directly between the track that had just
   * ended and the file that should already have been opening — to re-enable a
   * session that was, in the steady state, already enabled. It is worth
   * exactly one round trip, on the first track after silence.
   */
  private audioActive = false;

  /**
   * The session the equaliser is currently bound to.
   *
   * Held so the effect is not rebuilt for every track on the same player, and
   * so it *is* rebuilt when the player hands out a new one.
   */
  private equalizedSession: number | null = null;

  /**
   * Whether this player is already the lock screen's active player.
   *
   * Claiming it is a session rebuild; keeping it is a metadata update. See
   * `bindLockScreen`. Cleared by `stop()`, which hands the session back.
   */
  private lockScreenBound = false;

  /**
   * The ramp at a track boundary, and the timer that starts the fade-out.
   *
   * Created once and reused: the gain belongs to the player, so two ramps
   * fighting over it is the one way this can be heard going wrong. Everything
   * about it is inert while the setting is off — `run` with a duration under
   * the floor applies the target and returns, so "off" is the code path that
   * shipped before fading existed.
   */
  private fade = new VolumeFade((gain) => {
    if (this.player !== null) this.player.volume = gain;
  });

  private fadeOutTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * What to show where a track has no artist or album.
   *
   * Set once at startup from `app/_layout`. The engine cannot call `t()` — it
   * is a service and translating is not its job — but a notification that
   * leaves the artist line blank while the app underneath says "Bilinmeyen
   * sanatçı" for the same track is the inconsistency this whole surface was
   * reported for. So the strings are handed in, the way the listen reporter and
   * the week-start preference are.
   */
  private metadataFallbacks: { unknownArtist?: string; unknownAlbum?: string } = {};

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

    /*
     * Next and previous from outside the app — a Bluetooth remote, a headset
     * button, a car.
     *
     * They arrive here rather than at the player because the queue is here.
     * expo-audio's session refused both commands outright, so the buttons did
     * nothing while play and pause worked; `patches/expo-audio` restores them
     * and has the session announce them instead of seeking a timeline that
     * holds one item. `docs/adr/017` has the whole of it.
     *
     * `explicit` is true: a remote's skip is a person pressing a button, and
     * the play/skip rule should count it the same as pressing next in the app.
     */
    onMediaSkip((direction) => {
      if (direction === 'next') void this.advance(true);
      else void this.previous();
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

  /**
   * Names for a track with no artist or album, already translated.
   *
   * Re-pushes the metadata if something is already loaded, so changing the
   * language updates the notification rather than leaving the previous one's
   * words on screen until the next track.
   */
  setMetadataFallbacks(fallbacks: { unknownArtist?: string; unknownAlbum?: string }): void {
    this.metadataFallbacks = fallbacks;
    const track = this.state.track;
    if (track !== null && this.lockScreenBound) this.bindLockScreen(track);
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

  /**
   * Point the player at a queue position.
   *
   * The order here is the gap between tracks, so it is deliberate. Everything
   * the next file does not need happens *after* it has been handed over, and
   * once the session is warm nothing is awaited in front of it at all.
   *
   * What used to be in front of it: `configure` and `setIsAudioActiveAsync`,
   * two async native calls made on every single load, and `emit`, which
   * re-renders the player UI. Then the file was handed over and playback
   * waited for a status event to cross into JS and a `play()` to cross back —
   * because `replace` resumes by itself only when the player *was* playing,
   * and a track that reached its own end has already stopped. On a run of
   * short tracks that read as roughly a third of a second of silence between
   * every one of them.
   */
  private async loadIndex(index: number, autoPlay: boolean): Promise<void> {
    const track = this.queue[index];
    if (!track) return;

    // Closes before `emit` below replaces the track it is attributed to.
    this.flushListen(false);
    this.listenCycle.open();

    /*
     * The previous track's fade-out, if one was pending or running.
     *
     * Cancelled rather than left to finish: a skip during a fade-out would
     * otherwise carry the ramp onto the incoming track and leave it playing at
     * whatever gain the ramp had reached, for its whole length. The symptom —
     * one quiet song after a skip — points nowhere near a fade.
     */
    this.cancelFadeOut();
    const fadeMs = getTrackFadeMs();
    this.fade.run(fadeMs > 0 ? 0 : 1, 1, fadeMs);

    this.index = index;
    this.lastPositionMs = 0;
    this.playWhenReady = autoPlay;

    try {
      if (this.player !== null && this.audioActive) {
        // The warm path, and the only one that runs between two tracks.
        this.player.replace({ uri: track.uri });
        this.requestPlay();
      } else {
        await this.configure();
        await setIsAudioActiveAsync(true);
        this.audioActive = true;

        if (this.player === null) {
          this.player = createAudioPlayer(
            { uri: track.uri },
            { updateInterval: STATUS_INTERVAL_MS },
          );
          this.player.addListener('playbackStatusUpdate', this.onStatus);
        } else {
          this.player.replace({ uri: track.uri });
        }

        this.requestPlay();
      }

      this.bindLockScreen(track);
    } catch (error) {
      this.emit({
        phase: 'error',
        error: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    this.emitQueue();
    this.emit({ phase: 'loading', track, positionMs: 0, durationMs: track.durationMs });
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
      // The same words the app shows for the same track, not a blank line.
      artist: track.artistName ?? this.metadataFallbacks.unknownArtist,
      albumTitle: track.albumName ?? this.metadataFallbacks.unknownAlbum,
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

  /**
   * Hand the player's audio session to the equaliser.
   *
   * On every load rather than once: `Equalizer` is an effect bound to one
   * session id, and a session is replaced whenever the player is. An effect
   * left on the old one is not an error — it is simply no longer in the signal
   * path, which is the shape of "the equaliser stopped doing anything after a
   * while". Attaching to a session already attached does nothing.
   *
   * Deliberately not awaited: the equaliser is not allowed to stand between a
   * finished track and the next one, and a build without the native module is
   * one that plays music without an equaliser.
   */
  private bindEqualizer(): void {
    /*
     * Its own guard, inside the caller's.
     *
     * `loadIndex` wraps the whole load in a try that turns anything thrown
     * into a playback error, so a failure here would stop the music instead of
     * losing an effect. That is not theoretical: reading the session id
     * straight off ExoPlayer throws, because it is confined to the main looper
     * and this runs on the JS thread — and for one build every track failed
     * with an error and no sound. The effect is optional; playback is not.
     */
    try {
      this.attachEqualizer();
    } catch {
      // No equaliser on this track. The music is what matters.
    }
  }

  private attachEqualizer(): void {
    /*
     * `audioSessionId` is not in expo-audio's own types — it is the property
     * `patches/expo-audio` adds, and the patch is Kotlin only. Declaring the
     * shape here keeps the coupling visible in this file rather than hidden in
     * a modified `.d.ts` inside `node_modules`, and optional means a build
     * without the patch reads `undefined` and simply does not equalise.
     */
    const player: (AudioPlayer & { audioSessionId?: number }) | null = this.player;
    const sessionId = player?.audioSessionId;
    if (typeof sessionId !== 'number' || sessionId === 0) return;
    if (sessionId === this.equalizedSession) return;

    this.equalizedSession = sessionId;
    void attachToSession(sessionId);
  }

  /**
   * Ask to play, whether or not the file is open yet. Safe to call repeatedly.
   *
   * ExoPlayer treats `play()` as an intention: it sets `playWhenReady` and
   * starts the moment the source is prepared, with no second round trip
   * through JS. Waiting for `isLoaded` first, as this used to, spent a status
   * interval doing nothing on every track change.
   *
   * What does not survive an early call is expo-audio's own guard — `play()`
   * is dropped outright while the module's audio session is disabled, which is
   * the race the old check was really protecting against. So the intent is
   * kept rather than cleared, and re-asked on each status update, until the
   * player reports the file open and the ask has plainly been heard.
   */
  private requestPlay(): void {
    if (!this.playWhenReady || this.player === null) return;
    this.player.play();
    if (this.player.isLoaded) this.playWhenReady = false;
  }

  private onStatus = (status: AudioStatus): void => {
    // The pending start from `loadIndex`, in case the eager ask was too early.
    this.requestPlay();

    /*
     * The equaliser, once there is audio to attach it to.
     *
     * Not during the load: ExoPlayer's session id is unset until its audio
     * renderer is initialised, so asking then returns a zero that cannot be
     * attached to anything. Reading it also costs a hop to the main thread,
     * which is the one place a track transition must not spend time — see
     * `loadIndex`. Here it is off that path and behind a cheap guard.
     */
    if (status.playing) this.bindEqualizer();

    const positionMs = Math.round(status.currentTime * 1000);

    // Clock the interval that just elapsed before anything else changes.
    this.listenCycle.tick(status.playing);

    if (status.playing) this.scheduleFadeOut(positionMs);

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
    this.requestPlay();
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

  /**
   * Start the ramp down as the track runs out.
   *
   * Driven from the status tick rather than from a timer set at load, because
   * a seek moves the end without the load being repeated — dragging into the
   * last few seconds has to fade, and dragging back out has to un-schedule it.
   *
   * Deliberately does nothing on a manual skip: `advance(true)` loads the next
   * track immediately, and somebody who pressed next wants it now rather than
   * a second later. The fade *in* still applies, which is what removes the
   * click at the start of the incoming track.
   */
  private scheduleFadeOut(positionMs: number): void {
    const fadeMs = getTrackFadeMs();
    const delay = fadeOutDelay(positionMs, this.state.durationMs, fadeMs, STATUS_INTERVAL_MS);

    if (delay === null) {
      // Out of the window: a seek backwards is the case that matters, and it
      // has to cancel a ramp that has already begun as well as one that is
      // merely pending.
      this.cancelFadeOut();
      if (this.fade.heading === 0) this.fade.reset();
      return;
    }

    // Already heading down for this track, and rescheduling twice a second
    // would restart the ramp from full every time.
    if (this.fadeOutTimer !== null || this.fade.heading === 0) return;

    this.fadeOutTimer = setTimeout(() => {
      this.fadeOutTimer = null;
      this.fade.run(1, 0, fadeMs);
    }, delay);
  }

  private cancelFadeOut(): void {
    if (this.fadeOutTimer !== null) {
      clearTimeout(this.fadeOutTimer);
      this.fadeOutTimer = null;
    }
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
    // Back to full gain before anything else. A stop during a fade-out would
    // otherwise leave the player muted for whatever plays next.
    this.cancelFadeOut();
    this.fade.reset();
    this.player?.pause();
    this.player?.clearLockScreenControls();
    this.lockScreenBound = false;
    this.index = -1;
    this.emitQueue();
    this.emit({ ...IDLE_PLAYBACK });
    this.audioActive = false;
    this.equalizedSession = null;
    await setIsAudioActiveAsync(false);
  }
}

/** The single engine instance. Playback outlives every screen. */
export const AudioEngine = new Engine();
