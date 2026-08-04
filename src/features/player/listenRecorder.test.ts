jest.mock('audio-focus', () => ({
  onAudioBecomingNoisy: () => () => undefined,
  onMediaSkip: () => () => undefined,
  hasAudioFocusEvents: false,
}));

jest.mock('expo-audio', () => ({
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  createAudioPlayer: () => require('@/services/audio/testing/fakeAudioPlayer').makeFakePlayer(),
  setAudioModeAsync: async () => undefined,
  setIsAudioActiveAsync: async () => undefined,
}));

/**
 * The one thing that has to be faked: it opens SQLite at import time.
 *
 * The `mock` prefix is not style. Jest hoists `jest.mock` above the `const`,
 * and only names beginning with it are allowed through that window.
 */
const mockRecordListen = jest.fn((_input: unknown, _weekStart: unknown) => Promise.resolve());
jest.mock('@/db/queries/playEvents', () => ({
  // Wrapped rather than passed straight through: `jest.mock` is hoisted above
  // the `const`, so a factory that returns the mock directly captures it while
  // it is still undefined. Reading it inside a call defers that to call time.
  recordListen: (input: unknown, weekStart: unknown) => mockRecordListen(input, weekStart),
}));

// eslint-disable-next-line import/first
import { setStatsEnabled } from '@/services/settings';
// eslint-disable-next-line import/first
import { startPlayback, track } from '@/services/audio/testing/playbackHarness';

// eslint-disable-next-line import/first
import { startListenRecording } from './listenRecorder';

/**
 * The statistics switch, end to end.
 *
 * Everything here is real except the database: the real engine, the real
 * `ListenCycle`, the real MMKV-backed setting. The switch is only worth
 * anything if playback that would certainly have been recorded is not, so the
 * listens below are full ones well past the play threshold rather than
 * anything borderline.
 */

const DURATION_MS = 30_000;
const TICK_MS = 500;

let stop: (() => void) | null = null;

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-08-03T12:00:00Z'));
  mockRecordListen.mockClear();
  setStatsEnabled(true);
});

afterEach(() => {
  stop?.();
  stop = null;
  jest.useRealTimers();
});

/** Play one track from end to end, with the recorder installed. */
async function playOneTrackThrough(): Promise<void> {
  const harness = await startPlayback([track(1, DURATION_MS), track(2, DURATION_MS)]);
  // Replaces the harness's own reporter: this is the wiring under test.
  stop = startListenRecording();

  await harness.playFor(DURATION_MS - TICK_MS);
  await harness.finishTrack();
}

describe('the statistics switch', () => {
  it('writes a listen while it is on', async () => {
    setStatsEnabled(true);

    await playOneTrackThrough();

    expect(mockRecordListen).toHaveBeenCalledTimes(1);
    expect(mockRecordListen.mock.calls[0]?.[0]).toMatchObject({ trackId: 1 });
  });

  it('writes nothing at all while it is off', async () => {
    setStatsEnabled(false);

    await playOneTrackThrough();

    expect(mockRecordListen).not.toHaveBeenCalled();
  });

  it('is read per listen, so turning it off takes effect without a restart', async () => {
    // The subscription is installed once at startup and lives for the whole
    // process. A flag captured at install time would keep whatever it was when
    // the app launched, and the switch would appear to do nothing all session.
    setStatsEnabled(true);
    await playOneTrackThrough();
    expect(mockRecordListen).toHaveBeenCalledTimes(1);

    setStatsEnabled(false);
    await playOneTrackThrough();
    expect(mockRecordListen).toHaveBeenCalledTimes(1);

    setStatsEnabled(true);
    await playOneTrackThrough();
    expect(mockRecordListen).toHaveBeenCalledTimes(2);
  });

  it('leaves playback alone either way', async () => {
    setStatsEnabled(false);

    const harness = await startPlayback([track(1, DURATION_MS), track(2, DURATION_MS)]);
    stop = startListenRecording();

    await harness.playFor(DURATION_MS - TICK_MS);
    await harness.finishTrack();
    await harness.playFor(2_000);

    // The queue still advanced. Not recording is not the same as not playing.
    expect(harness.player().playing).toBe(true);
    expect(mockRecordListen).not.toHaveBeenCalled();
  });
});
