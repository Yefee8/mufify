/**
 * One listen, from the moment it opens to the moment it is banked.
 *
 * Pulled out of `AudioEngine` because a state bug lived here undetected: the
 * engine closed a listen when a track finished but only reopened one inside
 * `loadIndex`, and repeat-one never calls `loadIndex` — it seeks to zero and
 * plays the same file again. So the first loop was recorded and every loop
 * after it was dropped on the floor, because banking requires an open cycle
 * and nothing had opened one.
 *
 * The engine cannot be unit tested without a real audio session. This can:
 * it holds no player, imports nothing from Android, and takes the clock as an
 * argument. The rule that broke is now a rule something asserts.
 *
 * Time is accumulated tick by tick rather than read off the final position,
 * because the two stop agreeing the moment anyone seeks — scrubbing to the last
 * ten seconds would otherwise report the whole track as played, and the
 * play/skip rule would count it as a full listen.
 */

export interface BankedListen {
  /** When this listen began. Period keys come from here, not from now. */
  startedAt: Date;
  /** Milliseconds of actual playback, excluding pauses and seeks. */
  msPlayed: number;
}

export class ListenCycle {
  private startedAt: Date | null = null;
  private playedMs = 0;
  private lastTickAt: number | null = null;

  /** Whether a listen is currently open and able to be banked. */
  get isOpen(): boolean {
    return this.startedAt !== null;
  }

  /** Playback accumulated in the current cycle, for the rewind check. */
  get msPlayedInCycle(): number {
    return this.playedMs;
  }

  /**
   * Begin a listen. `at` is when it started, which is not always now — but is
   * for every caller so far.
   */
  open(at: Date = new Date()): void {
    this.startedAt = at;
    this.playedMs = 0;
    this.lastTickAt = null;
  }

  /**
   * Fold the time since the previous tick into the total.
   *
   * `playing` false still folds in the elapsed interval, then stops the clock:
   * the time between the last tick and the pause was really played.
   */
  tick(playing: boolean, now: number = Date.now()): void {
    this.accumulate(now);
    if (playing) this.lastTickAt = now;
  }

  /**
   * Bank the listen and close the cycle.
   *
   * Null when there is nothing worth reporting — no cycle was open, or no
   * playback accumulated. A zero-length listen is not a skip, it is a
   * non-event, and writing one would put noise in `play_events`.
   */
  close(now: number = Date.now()): BankedListen | null {
    this.accumulate(now);

    const startedAt = this.startedAt;
    const msPlayed = Math.round(this.playedMs);

    this.startedAt = null;
    this.playedMs = 0;
    this.lastTickAt = null;

    if (startedAt === null || msPlayed <= 0) return null;
    return { startedAt, msPlayed };
  }

  /**
   * Bank the listen and immediately open the next one, same track still loaded.
   *
   * The distinction from `close` is the whole fix: a looped or restarted track
   * keeps playing, so a cycle must be open to receive it. `startedAt` becomes
   * now rather than null, which also puts the two halves of a loop that crosses
   * midnight into the right days.
   */
  restart(now: number = Date.now()): BankedListen | null {
    const banked = this.close(now);
    this.open(new Date(now));
    return banked;
  }

  private accumulate(now: number): void {
    if (this.lastTickAt === null) return;
    this.playedMs += now - this.lastTickAt;
    this.lastTickAt = null;
  }
}
