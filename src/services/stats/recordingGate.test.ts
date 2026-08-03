import { shouldRecordListen } from './recordingGate';

describe('shouldRecordListen', () => {
  it('records a real listen while the switch is on', () => {
    expect(shouldRecordListen({ statsEnabled: true, msPlayed: 20_000 })).toBe(true);
  });

  it('records nothing at all while the switch is off', () => {
    // Including a listen long enough to be a play several times over: the
    // switch is not a threshold, it is an off.
    for (const msPlayed of [1, 20_000, 600_000]) {
      expect(shouldRecordListen({ statsEnabled: false, msPlayed })).toBe(false);
    }
  });

  it('records nothing for a listen with no playback in it', () => {
    // A zero-length listen is a non-event, not a skip. Writing one would put
    // noise in `play_events` and a phantom row in every rollup it touches.
    expect(shouldRecordListen({ statsEnabled: true, msPlayed: 0 })).toBe(false);
    expect(shouldRecordListen({ statsEnabled: true, msPlayed: -1 })).toBe(false);
  });
});
