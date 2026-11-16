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
import { track } from './testing/playbackHarness';

/**
 * A Shuffle button, as opposed to the shuffle toggle.
 *
 * The toggle keeps the current track where it is. The button starts something,
 * and starting it with the list's own first track every time — which is what
 * queue-then-toggle did — is not shuffling where it is most noticed.
 */

const TRACKS = Array.from({ length: 10 }, (_, i) => track(i + 1, 30_000));
const ids = (tracks: readonly { id: number }[]) => tracks.map((entry) => entry.id);

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(async () => {
  await AudioEngine.stop();
  jest.useRealTimers();
});

describe('playShuffled', () => {
  it('starts wherever the shuffle puts first, not at the top of the list', async () => {
    const firsts = new Set<number>();
    // Thirty draws over ten tracks: all landing on one would be 10⁻²⁹.
    for (let draw = 0; draw < 30; draw += 1) {
      await AudioEngine.playShuffled(TRACKS, 'pure');
      const { tracks, index } = AudioEngine.getQueueSnapshot();
      expect(index).toBe(0);
      const first = tracks[index];
      if (first) firsts.add(first.id);
    }
    expect(firsts.size).toBeGreaterThan(1);
  });

  it('queues every track once, playing, with the real order kept underneath', async () => {
    await AudioEngine.playShuffled(TRACKS, 'balanced', { type: 'playlist', id: 4 });

    const { tracks } = AudioEngine.getQueueSnapshot();
    expect([...ids(tracks)].sort((a, b) => a - b)).toEqual(ids(TRACKS));
    expect(AudioEngine.isShuffled()).toBe(true);
    expect(AudioEngine.getState().track?.id).toBe(tracks[0]?.id);
    expect(AudioEngine.getSessionShape()).toMatchObject({
      shuffled: true,
      shuffleAlgorithm: 'balanced',
      source: { type: 'playlist', id: 4 },
    });

    // Turning shuffle off restores the list as it was, around the same track.
    const playing = tracks[0]?.id;
    await AudioEngine.setShuffled(false, 'balanced');
    const after = AudioEngine.getQueueSnapshot();
    expect(ids(after.tracks)).toEqual(ids(TRACKS));
    expect(after.tracks[after.index]?.id).toBe(playing);
  });

  it('stops rather than playing nothing when there is nothing to shuffle', async () => {
    await AudioEngine.playShuffled([], 'pure');
    expect(AudioEngine.getQueueSnapshot().index).toBe(-1);
  });
});
