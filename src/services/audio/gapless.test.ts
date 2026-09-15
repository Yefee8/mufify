jest.mock('audio-focus', () => ({
  onAudioBecomingNoisy: () => () => undefined,
  onMediaSkip: () => () => undefined,
  hasAudioFocusEvents: false,
}));

jest.mock('expo-audio', () => ({
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  createAudioPlayer: () => require('./testing/fakeAudioPlayer').makeFakePlayer(),
  setAudioModeAsync: async () => undefined,
  setIsAudioActiveAsync: async () => undefined,
}));

// Below the mocks on purpose: `jest.mock` is hoisted above imports, and the
// engine reads `expo-audio` at module scope.
// eslint-disable-next-line import/first
import { AudioEngine } from './AudioEngine';
// eslint-disable-next-line import/first
import { startPlayback, track } from './testing/playbackHarness';

/**
 * The seam between two tracks, done by the player rather than by a reload.
 *
 * The engine tells the patched player what comes next; the player prepares it
 * and joins it to the current track when that ends, reporting a transition
 * rather than a stop. What has to stay true across that seam is everything
 * the old `didJustFinish` → `loadIndex` path guaranteed: the finished listen is
 * recorded as completed exactly once, the index moves, the notification is
 * told — and, the whole point, **the player is never asked to `replace`**.
 *
 * A 30-second track, as in `listenRecording.test.ts`, so a full play clears
 * the 15-second threshold.
 */

const DURATION_MS = 30_000;

function uriOf(id: number): string {
  return `content://media/external/audio/media/${id}`;
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(async () => {
  await AudioEngine.stop();
  jest.useRealTimers();
});

describe('arming the next track', () => {
  it('tells the player what comes next as soon as a track is loaded', async () => {
    const harness = await startPlayback([track(1, DURATION_MS), track(2, DURATION_MS)]);

    expect(harness.player().armedUri).toBe(uriOf(2));
  });

  it('arms nothing at the end of the queue, so the player stops as it always has', async () => {
    const harness = await startPlayback([track(1, DURATION_MS)]);

    expect(harness.player().armedUri).toBeNull();
  });

  it('arms the first track at the end of the queue when repeating all', async () => {
    const harness = await startPlayback([track(1, DURATION_MS), track(2, DURATION_MS)], {
      startIndex: 1,
      repeat: 'all',
    });

    expect(harness.player().armedUri).toBe(uriOf(1));
  });

  it('arms nothing on repeat-one, which restarts by seeking', async () => {
    // A second copy of the same file in the timeline would double-count the
    // listen; the seek path counts it once per pass, and it stays that way.
    const harness = await startPlayback([track(1, DURATION_MS), track(2, DURATION_MS)], {
      repeat: 'one',
    });

    expect(harness.player().armedUri).toBeNull();
  });

  it('re-arms when the repeat mode changes under a playing track', async () => {
    const harness = await startPlayback([track(1, DURATION_MS)]);
    expect(harness.player().armedUri).toBeNull();

    harness.setRepeat('all');

    // Repeat-all on a one-track queue wraps to itself, which is repeat-one in
    // all but name — nothing to arm.
    expect(harness.player().armedUri).toBeNull();

    await AudioEngine.enqueue([track(2, DURATION_MS)]);
    expect(harness.player().armedUri).toBe(uriOf(2));
  });

  it('re-arms when play-next puts a different track at the next index', async () => {
    /*
     * The reason arming is keyed by URI and not by index. Play-next inserts at
     * `index + 1`; the index the player was armed for is unchanged and the
     * track at it is not.
     */
    const harness = await startPlayback([track(1, DURATION_MS), track(2, DURATION_MS)]);
    expect(harness.player().armedUri).toBe(uriOf(2));

    await AudioEngine.playNext([track(9, DURATION_MS)]);

    expect(harness.player().armedUri).toBe(uriOf(9));
  });

  it('does not re-send the same next track on every queue notification', async () => {
    const harness = await startPlayback([track(1, DURATION_MS), track(2, DURATION_MS)]);
    const before = harness.player().calls.filter((call) => call.startsWith('setNextSource')).length;

    await harness.playFor(2_000);

    const after = harness.player().calls.filter((call) => call.startsWith('setNextSource')).length;
    expect(after).toBe(before);
  });
});

describe('the transition itself', () => {
  it('moves to the next track without asking the player to replace anything', async () => {
    const harness = await startPlayback([track(1, DURATION_MS), track(2, DURATION_MS)]);
    await harness.playFor(DURATION_MS);
    const replacesBefore = harness.player().calls.filter((call) => call === 'replace').length;

    await harness.transitionTrack();

    expect(AudioEngine.getState().track?.id).toBe(2);
    expect(AudioEngine.getState().phase).toBe('playing');
    expect(harness.player().calls.filter((call) => call === 'replace')).toHaveLength(replacesBefore);
  });

  it('records the finished track as one completed listen', async () => {
    const harness = await startPlayback([track(1, DURATION_MS), track(2, DURATION_MS)]);
    await harness.playFor(DURATION_MS);

    await harness.transitionTrack();
    await harness.playFor(2_000);

    expect(harness.listens).toHaveLength(1);
    expect(harness.listens[0]).toMatchObject({ trackId: 1, completed: true, outcome: 'play' });
  });

  it('does not mistake the jump back to zero for the same track restarting', async () => {
    /*
     * The rewind detector sees position go from the end of one file to the
     * start of the next and, left to itself, would call that a repeat of the
     * *first* track and open a second listen on it. The transition is handled
     * before that check runs.
     */
    const harness = await startPlayback([track(1, DURATION_MS), track(2, DURATION_MS)]);
    await harness.playFor(DURATION_MS);
    await harness.transitionTrack();
    await harness.playFor(DURATION_MS);
    await harness.finishTrack();

    expect(harness.listens.map((listen) => listen.trackId)).toEqual([1, 2]);
  });

  it('tells the notification about the new track', async () => {
    const harness = await startPlayback([track(1, DURATION_MS), track(2, DURATION_MS)]);
    await harness.playFor(DURATION_MS);
    const before = harness.player().calls.filter((c) => c === 'updateLockScreenMetadata').length;

    await harness.transitionTrack();

    const after = harness.player().calls.filter((c) => c === 'updateLockScreenMetadata').length;
    expect(after).toBe(before + 1);
  });

  it('arms the track after the one it just moved to', async () => {
    const harness = await startPlayback([
      track(1, DURATION_MS),
      track(2, DURATION_MS),
      track(3, DURATION_MS),
    ]);
    await harness.playFor(DURATION_MS);

    await harness.transitionTrack();

    expect(harness.player().armedUri).toBe(uriOf(3));
  });

  it('runs a whole queue through without a single replace', async () => {
    const harness = await startPlayback([
      track(1, DURATION_MS),
      track(2, DURATION_MS),
      track(3, DURATION_MS),
    ]);
    const replacesBefore = harness.player().calls.filter((call) => call === 'replace').length;

    await harness.playFor(DURATION_MS);
    await harness.transitionTrack();
    await harness.playFor(DURATION_MS);
    await harness.transitionTrack();
    await harness.playFor(DURATION_MS);
    await harness.finishTrack();

    expect(harness.listens.map((listen) => listen.trackId)).toEqual([1, 2, 3]);
    expect(harness.listens.every((listen) => listen.completed)).toBe(true);
    expect(harness.player().calls.filter((call) => call === 'replace')).toHaveLength(replacesBefore);
  });

  it('falls back to a plain load when the queue no longer agrees with the player', async () => {
    /*
     * `armNext` keeps the two in step, so this is defensive — but the failure it
     * defends against is playing a track the queue does not contain, and the
     * cost of the defence is one gap, once.
     */
    const harness = await startPlayback([track(1, DURATION_MS), track(2, DURATION_MS)]);
    await harness.playFor(DURATION_MS);
    // Pretend the player was armed with something else.
    harness.player().armedUri = uriOf(7);

    await harness.transitionTrack();

    expect(AudioEngine.getState().track?.id).toBe(2);
    expect(harness.player().calls.filter((call) => call === 'replace').length).toBeGreaterThan(1);
  });
});

describe('what a manual skip still does', () => {
  it('replaces rather than using the armed item, and re-arms afterwards', async () => {
    // Skipping is a reload on purpose: the armed item is whatever the queue
    // said *before* the press, and a press is allowed to mean something else.
    const harness = await startPlayback([
      track(1, DURATION_MS),
      track(2, DURATION_MS),
      track(3, DURATION_MS),
    ]);
    const before = harness.player().calls.filter((call) => call === 'replace').length;

    await harness.next();

    expect(harness.player().calls.filter((call) => call === 'replace')).toHaveLength(before + 1);
    expect(AudioEngine.getState().track?.id).toBe(2);
    expect(harness.player().armedUri).toBe(uriOf(3));
  });
});
