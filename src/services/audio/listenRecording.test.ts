jest.mock('audio-focus', () => ({
  onAudioBecomingNoisy: () => () => undefined,
  hasAudioFocusEvents: false,
}));

jest.mock('expo-audio', () => ({
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  createAudioPlayer: () => require('./testing/fakeAudioPlayer').makeFakePlayer(),
  setAudioModeAsync: async () => undefined,
  setIsAudioActiveAsync: async () => undefined,
}));

// Below the mocks on purpose: `jest.mock` is hoisted above imports, and the
// engine reads `expo-audio` at module scope, so an import here that ran first
// would load the real native module and throw.
// eslint-disable-next-line import/first
import { startPlayback, track, type PlaybackHarness } from './testing/playbackHarness';

/**
 * The listen-counting matrix, run against the real engine.
 *
 * This exists because the same defect was reported three times and "fixed and
 * verified against the database" twice. Both of those verifications were real
 * device sessions; neither could be re-run, so neither caught the next
 * regression. `ListenCycle` and `isRewindToRestart` each had good unit tests
 * and each was correct in isolation — every miscount lived in the wiring
 * between them inside `AudioEngine.onStatus`, which nothing covered.
 *
 * The scenarios are the ones a person would actually perform, named as such,
 * because the expected answers come from ADR 005 and ADR 011 rather than from
 * whatever the code happens to do.
 *
 * A 30-second track puts both thresholds in easy reach:
 * play at `min(30s, 15s)` = **15,000 ms**, skip below `0.2 × 30s` = **6,000 ms**.
 */

const DURATION_MS = 30_000;
const PLAY_THRESHOLD_MS = 15_000;
/** One status tick. Accumulated time is measured between ticks, so it rounds. */
const TICK_MS = 500;

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-08-02T12:00:00Z'));
});

afterEach(() => {
  jest.useRealTimers();
});

function start(): Promise<PlaybackHarness> {
  return startPlayback([track(1, DURATION_MS), track(2, DURATION_MS)]);
}

describe('a — one track, start to finish', () => {
  it('records exactly one play', async () => {
    const harness = await start();

    await harness.playFor(DURATION_MS - TICK_MS);
    await harness.finishTrack();

    expect(harness.listens).toHaveLength(1);
    expect(harness.listens[0]).toMatchObject({ trackId: 1, outcome: 'play', completed: true });
    expect(harness.listens[0]?.msPlayed).toBeGreaterThanOrEqual(DURATION_MS - 2 * TICK_MS);
  });
});

describe('b — repeat-one, three times round', () => {
  it('records three plays, not one', async () => {
    const harness = await start();
    harness.setRepeat('one');

    for (let pass = 0; pass < 3; pass += 1) {
      await harness.playFor(DURATION_MS - TICK_MS);
      await harness.finishTrack();
    }

    expect(harness.listens).toHaveLength(3);
    for (const listen of harness.listens) {
      expect(listen).toMatchObject({ trackId: 1, outcome: 'play', completed: true });
    }
  });

  it('gives each pass its own start time, so a loop across midnight splits', async () => {
    const harness = await start();
    harness.setRepeat('one');

    await harness.playFor(DURATION_MS - TICK_MS);
    await harness.finishTrack();
    await harness.playFor(DURATION_MS - TICK_MS);
    await harness.finishTrack();

    const [first, second] = harness.listens;
    expect(second?.startedAt).toBeGreaterThan(first?.startedAt ?? 0);
  });
});

describe('c — heard past the play mark, then dragged back to the start', () => {
  /*
   * ADR 011: a rewind to at or below 25% of the track, by a listen that has
   * already earned a play, ends that listen and begins another. Two events, not
   * one — which is what someone who played a song twice means.
   */
  it('records two listens', async () => {
    const harness = await start();

    await harness.playFor(18_000);
    await harness.seekTo(0);
    await harness.playFor(18_000);
    await harness.stop();

    expect(harness.listens).toHaveLength(2);
    expect(harness.listens.map((listen) => listen.outcome)).toEqual(['play', 'play']);
  });

  it('does not split when the rewind is short of the mark', async () => {
    const harness = await start();

    // Back to 26% — past three quarters of the way in, this is an adjustment.
    await harness.playFor(18_000);
    await harness.seekTo(8_000);
    await harness.playFor(6_000);
    await harness.stop();

    expect(harness.listens).toHaveLength(1);
  });

  it('does not split a rewind that has not yet earned a play', async () => {
    const harness = await start();

    await harness.playFor(6_000);
    await harness.seekTo(0);
    await harness.playFor(6_000);
    await harness.stop();

    expect(harness.listens).toHaveLength(1);
    expect(harness.listens[0]?.msPlayed).toBeLessThan(PLAY_THRESHOLD_MS);
  });
});

describe('d — abandoned early, skipped forward, finished there', () => {
  /*
   * Ten per cent heard, a jump to 60%, then played out. Only the time actually
   * heard accumulates — the skipped middle is not listening — so this lands on
   * the play threshold from below rather than being credited the whole track.
   */
  it('records one listen, counting only the audio that was heard', async () => {
    const harness = await start();

    await harness.playFor(3_000);
    await harness.seekTo(18_000);
    await harness.playFor(11_000);
    await harness.finishTrack();

    expect(harness.listens).toHaveLength(1);
    expect(harness.listens[0]?.msPlayed).toBeLessThan(DURATION_MS - 10_000);
    expect(harness.listens[0]?.completed).toBe(true);
  });

  it('is a skip when almost none of it was heard', async () => {
    const harness = await start();

    await harness.playFor(2_000);
    await harness.seekTo(29_000);
    await harness.finishTrack();

    expect(harness.listens).toHaveLength(1);
    expect(harness.listens[0]?.outcome).toBe('skip');
  });
});

describe('e — scrubbing back and forth', () => {
  it('produces no extra events', async () => {
    const harness = await start();

    await harness.playFor(18_000);
    for (const positionMs of [15_000, 20_000, 16_000, 22_000, 17_000, 21_000]) {
      await harness.seekTo(positionMs);
      await harness.playFor(1_000);
    }
    await harness.stop();

    expect(harness.listens).toHaveLength(1);
  });

  it('produces no extra events while scrubbing inside the first seconds', async () => {
    const harness = await start();

    await harness.playFor(2_000);
    for (const positionMs of [0, 4_000, 1_000, 5_000, 500]) {
      await harness.seekTo(positionMs);
      await harness.playFor(1_000);
    }
    await harness.stop();

    expect(harness.listens).toHaveLength(1);
  });
});

describe('a track whose stored duration is wrong', () => {
  /*
   * MediaStore returns a null duration for a file it indexed before reading
   * its metadata — a track copied onto the device and played straight away.
   * The scanner stores the zero, and `classifyListen` given a duration of zero
   * returns `partial` however much was heard. Listening to such a track from
   * end to end moved neither counter and vanished from the counts.
   *
   * The engine knows better the moment the file is open, which is always well
   * before a listen ends.
   */
  it('counts a full listen as a play when the scanner stored no duration', async () => {
    const harness = await startPlayback([track(1, 0), track(2, 0)], {
      reportedDurationMs: DURATION_MS,
    });

    await harness.playFor(DURATION_MS - TICK_MS);
    await harness.finishTrack();

    expect(harness.listens).toHaveLength(1);
    expect(harness.listens[0]?.outcome).toBe('play');
  });

  it('still splits a repeat when the scanner stored no duration', async () => {
    const harness = await startPlayback([track(1, 0), track(2, 0)], {
      reportedDurationMs: DURATION_MS,
    });
    harness.setRepeat('one');

    await harness.playFor(DURATION_MS - TICK_MS);
    await harness.finishTrack();
    await harness.playFor(DURATION_MS - TICK_MS);
    await harness.finishTrack();

    expect(harness.listens).toHaveLength(2);
    expect(harness.listens.map((listen) => listen.outcome)).toEqual(['play', 'play']);
  });

  it('prefers the engine when the scanner stored a duration that is too short', async () => {
    // A five-second claim against a thirty-second file. The play threshold
    // would be 2.5s, so almost anything would count — including a real skip.
    const harness = await startPlayback([track(1, 5_000), track(2, 5_000)], {
      reportedDurationMs: DURATION_MS,
    });

    await harness.playFor(3_000);
    await harness.next();

    expect(harness.listens[0]?.outcome).toBe('skip');
  });
});

describe('the queue moving on', () => {
  it('closes the outgoing listen exactly once when a track ends', async () => {
    const harness = await start();

    await harness.playFor(DURATION_MS - TICK_MS);
    await harness.finishTrack();
    await harness.playFor(5_000);
    await harness.stop();

    expect(harness.listens.map((listen) => listen.trackId)).toEqual([1, 2]);
  });

  it('closes the outgoing listen exactly once when the user skips', async () => {
    const harness = await start();

    await harness.playFor(18_000);
    await harness.next();
    await harness.playFor(5_000);
    await harness.stop();

    expect(harness.listens.map((listen) => listen.trackId)).toEqual([1, 2]);
    expect(harness.listens[0]?.completed).toBe(false);
  });

  it('records nothing for a track that never played', async () => {
    const harness = await start();

    await harness.next();
    await harness.stop();

    expect(harness.listens).toHaveLength(0);
  });
});
