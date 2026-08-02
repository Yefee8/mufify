import type { AudioStatus } from 'expo-audio';

/**
 * A stand-in for one `expo-audio` player, driven by a virtual clock.
 *
 * The engine's listen counting is a state machine fed by a stream of status
 * ticks, and until now nothing exercised it end to end — `ListenCycle` and
 * `isRewindToRestart` were unit tested in isolation while the wiring between
 * them, which is where every reported miscount actually lived, was only ever
 * checked by hand on a phone. This replays a tick stream through the real
 * engine so those reports become assertions.
 *
 * Deliberately not a general expo-audio mock: it implements the handful of
 * members `AudioEngine` touches and nothing else, so a method the engine starts
 * calling shows up as a missing function rather than as a silent no-op.
 */
export class FakeAudioPlayer {
  isLoaded = true;
  playing = false;
  /** Seconds, matching expo-audio's unit. */
  currentTime = 0;
  duration = 0;

  private listener: ((status: AudioStatus) => void) | null = null;

  /** Every call the engine made, in order, for asserting on side effects. */
  readonly calls: string[] = [];

  addListener(event: string, listener: (status: AudioStatus) => void): { remove(): void } {
    if (event === 'playbackStatusUpdate') this.listener = listener;
    return { remove: () => undefined };
  }

  play(): void {
    this.calls.push('play');
    if (this.isLoaded) this.playing = true;
  }

  pause(): void {
    this.calls.push('pause');
    this.playing = false;
  }

  /**
   * Swapping the source is asynchronous on a device, so the fake mirrors it:
   * `isLoaded` goes false until `finishLoading()`.
   */
  replace(_source: unknown): void {
    this.calls.push('replace');
    this.isLoaded = false;
    this.playing = false;
    this.currentTime = 0;
  }

  async seekTo(seconds: number): Promise<void> {
    this.calls.push(`seekTo:${seconds}`);
    this.currentTime = seconds;
  }

  setActiveForLockScreen(active: boolean): void {
    this.calls.push(`setActiveForLockScreen:${String(active)}`);
  }

  updateLockScreenMetadata(): void {
    this.calls.push('updateLockScreenMetadata');
  }

  setPlaybackStateForLockScreen(playing: boolean): void {
    this.calls.push(`lockScreenPlaying:${String(playing)}`);
  }

  clearLockScreenControls(): void {
    this.calls.push('clearLockScreenControls');
  }

  remove(): void {
    this.calls.push('remove');
  }

  /** The source finished opening. Mirrors expo-audio reporting `isLoaded`. */
  finishLoading(durationSec: number): void {
    this.isLoaded = true;
    this.duration = durationSec;
  }

  emit(overrides: Partial<AudioStatus> = {}): void {
    this.listener?.({
      id: 'fake',
      currentTime: this.currentTime,
      playbackState: this.playing ? 'readyToPlay' : 'paused',
      timeControlStatus: this.playing ? 'playing' : 'paused',
      reasonForWaitingToPlay: '',
      mute: false,
      duration: this.duration,
      playing: this.playing,
      loop: false,
      didJustFinish: false,
      isBuffering: false,
      isLoaded: this.isLoaded,
      playbackRate: 1,
      shouldCorrectPitch: true,
      isLive: false,
      liveOffset: null,
      ...overrides,
    } as AudioStatus);
  }
}

/**
 * The one player the engine builds, shared with the tests that drive it.
 *
 * A module-level handle rather than a return value because `createAudioPlayer`
 * is called from inside the engine, where a test cannot see it.
 */
let live: FakeAudioPlayer | null = null;

/** Called by the `expo-audio` mock in place of `createAudioPlayer`. */
export function makeFakePlayer(): FakeAudioPlayer {
  live = new FakeAudioPlayer();
  return live;
}

/** The player the engine is currently driving. */
export function currentFakePlayer(): FakeAudioPlayer {
  if (live === null) throw new Error('The engine has not created a player yet.');
  return live;
}
