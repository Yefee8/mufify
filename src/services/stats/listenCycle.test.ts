import { ListenCycle } from './listenCycle';

/** A fixed clock, so nothing here depends on how fast the test runs. */
const T0 = 1_700_000_000_000;

describe('ListenCycle', () => {
  it('is closed before anything opens it', () => {
    const cycle = new ListenCycle();
    expect(cycle.isOpen).toBe(false);
    expect(cycle.close(T0)).toBeNull();
  });

  it('accumulates only the intervals it was playing', () => {
    const cycle = new ListenCycle();
    cycle.open(new Date(T0));

    cycle.tick(true, T0); //  clock starts
    cycle.tick(true, T0 + 10_000); // +10s played
    cycle.tick(false, T0 + 15_000); // +5s played, then paused
    cycle.tick(false, T0 + 60_000); // paused throughout, adds nothing
    cycle.tick(true, T0 + 60_000); // clock restarts
    cycle.tick(true, T0 + 62_000); // +2s played

    expect(cycle.close(T0 + 62_000)).toEqual({
      startedAt: new Date(T0),
      msPlayed: 17_000,
    });
  });

  it('reports nothing for a cycle that never played', () => {
    const cycle = new ListenCycle();
    cycle.open(new Date(T0));
    expect(cycle.close(T0 + 5_000)).toBeNull();
  });

  it('closes the cycle so a second close reports nothing', () => {
    const cycle = new ListenCycle();
    cycle.open(new Date(T0));
    cycle.tick(true, T0);
    cycle.tick(true, T0 + 30_000);

    expect(cycle.close(T0 + 30_000)?.msPlayed).toBe(30_000);
    expect(cycle.isOpen).toBe(false);
    expect(cycle.close(T0 + 30_000)).toBeNull();
  });

  describe('restart — the repeat-one regression', () => {
    it('leaves a cycle open, so the next loop can still be banked', () => {
      const cycle = new ListenCycle();
      cycle.open(new Date(T0));
      cycle.tick(true, T0);
      cycle.tick(true, T0 + 200_000);

      cycle.restart(T0 + 200_000);

      // The bug was here: close() alone left no open cycle, and every
      // subsequent loop was silently discarded.
      expect(cycle.isOpen).toBe(true);
    });

    it('banks each pass of a track looped five times', () => {
      const cycle = new ListenCycle();
      const banked: number[] = [];
      const trackMs = 200_000;

      cycle.open(new Date(T0));
      for (let loop = 0; loop < 5; loop += 1) {
        const from = T0 + loop * trackMs;
        cycle.tick(true, from);
        cycle.tick(true, from + trackMs);
        const listen = cycle.restart(from + trackMs);
        if (listen) banked.push(listen.msPlayed);
      }

      expect(banked).toEqual([trackMs, trackMs, trackMs, trackMs, trackMs]);
    });

    it('dates each pass from when that pass began, not when the first did', () => {
      const cycle = new ListenCycle();
      cycle.open(new Date(T0));
      cycle.tick(true, T0);
      cycle.tick(true, T0 + 200_000);

      const first = cycle.restart(T0 + 200_000);
      cycle.tick(true, T0 + 200_000);
      cycle.tick(true, T0 + 400_000);
      const second = cycle.close(T0 + 400_000);

      expect(first?.startedAt).toEqual(new Date(T0));
      // A loop crossing midnight has to put its halves in different days.
      expect(second?.startedAt).toEqual(new Date(T0 + 200_000));
    });

    it('does not bank a restart that played nothing', () => {
      const cycle = new ListenCycle();
      cycle.open(new Date(T0));
      expect(cycle.restart(T0 + 1_000)).toBeNull();
      expect(cycle.isOpen).toBe(true);
    });
  });
});
