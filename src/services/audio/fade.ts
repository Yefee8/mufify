/**
 * Ramping the player's own gain, for the seam between two tracks.
 *
 * Not a crossfade, and the difference is worth stating rather than blurring: a
 * crossfade overlaps two tracks, which needs two players, and the player here
 * is also the one holding the media session, the statistics cycle and the
 * equaliser's audio session. Moving all of that between two players at every
 * track boundary is the change that once left the notification drawing a
 * released session — see the note on `bindLockScreen`. See ADR 023.
 *
 * What this does is the other half of the same complaint. A track that stops
 * dead and a track that starts at full level are what make the gap between
 * them read as a fault rather than as a pause; ramping both ends turns the
 * seam into something deliberate. It does not shorten the gap. It stops it
 * sounding like a glitch.
 *
 * The ramp runs in JS on a timer, which is fine at this rate — about thirty
 * property writes for a one-second fade — and keeps the whole feature out of
 * the native path, so switching it off is genuinely the behaviour that shipped
 * before it existed.
 */

/** How often the gain is rewritten. Below a frame, above a bridge crossing. */
const STEP_MS = 33;

/** Anything shorter is not a fade, it is a click with extra steps. */
export const MIN_FADE_MS = 200;

export interface FadeTimers {
  setInterval: (callback: () => void, ms: number) => ReturnType<typeof setInterval>;
  clearInterval: (handle: ReturnType<typeof setInterval>) => void;
}

/**
 * The gain at one point through a ramp.
 *
 * Equal-power rather than linear: two linear ramps summing through a
 * transition dip in the middle, because loudness goes as the square of
 * amplitude. The same curve applied to a single fade keeps the *rate* of
 * apparent loudness change even, which is what stops a fade sounding like it
 * rushes at one end.
 */
export function fadeGain(from: number, to: number, progress: number): number {
  const clamped = Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 1));
  const shaped = Math.sin((clamped * Math.PI) / 2) ** 2;
  return from + (to - from) * shaped;
}

/**
 * One ramp at a time, on one player.
 *
 * Starting a ramp cancels whatever was running, and cancelling **settles at
 * the target** rather than freezing where it was. That matters more than it
 * sounds: a fade-out interrupted by the user pressing next would otherwise
 * leave the gain at 0.3 for the whole of the following track, and the bug
 * would look like a broken volume control rather than a fade that never
 * finished.
 */
export class VolumeFade {
  private handle: ReturnType<typeof setInterval> | null = null;
  private target = 1;

  constructor(
    private readonly apply: (gain: number) => void,
    private readonly timers: FadeTimers = globalTimers,
  ) {}

  /** Where the ramp is heading, so a caller can tell out from in. */
  get heading(): number {
    return this.target;
  }

  get isRunning(): boolean {
    return this.handle !== null;
  }

  /**
   * Ramp from `from` to `to` over `durationMs`.
   *
   * A duration under the floor is applied outright. There is no point spending
   * six timer ticks on a change nobody can hear as a ramp, and it keeps "fade
   * off" and "fade of 0ms" the same code path.
   */
  run(from: number, to: number, durationMs: number): void {
    this.stop();
    this.target = to;

    if (durationMs < MIN_FADE_MS) {
      this.apply(to);
      return;
    }

    this.apply(from);
    let elapsed = 0;

    this.handle = this.timers.setInterval(() => {
      elapsed += STEP_MS;
      if (elapsed >= durationMs) {
        this.settle();
        return;
      }
      this.apply(fadeGain(from, to, elapsed / durationMs));
    }, STEP_MS);
  }

  /** Stop early and land on the target, never in between. */
  settle(): void {
    this.stop();
    this.apply(this.target);
  }

  /** Stop and go straight to full gain — the state everything else assumes. */
  reset(): void {
    this.stop();
    this.target = 1;
    this.apply(1);
  }

  private stop(): void {
    if (this.handle === null) return;
    this.timers.clearInterval(this.handle);
    this.handle = null;
  }
}

const globalTimers: FadeTimers = {
  setInterval: (callback, ms) => setInterval(callback, ms),
  clearInterval: (handle) => clearInterval(handle),
};

/**
 * How long to wait before starting a fade-out, given where the track is.
 *
 * Null means "not yet" — the fade is further off than the next status update,
 * so there is nothing to schedule and scheduling anyway would mean cancelling
 * and rescheduling twice a second for the length of a track.
 *
 * Status updates arrive every half second, so the decision has to be made a
 * status *early*: waiting for the position to be exactly `duration - fade`
 * means the window is missed on every track whose updates happen to straddle
 * it.
 */
export function fadeOutDelay(
  positionMs: number,
  durationMs: number,
  fadeMs: number,
  statusIntervalMs: number,
): number | null {
  if (fadeMs < MIN_FADE_MS || !Number.isFinite(durationMs) || durationMs <= 0) return null;

  const remaining = durationMs - positionMs;
  // A fade longer than what is left of a short track would start before the
  // track did. Fading whatever remains is better than not fading at all.
  if (remaining <= 0) return null;
  if (remaining > fadeMs + statusIntervalMs) return null;

  return Math.max(0, remaining - fadeMs);
}
