import { createChangeBatcher } from './changeBatcher';

/** A schedule that holds the flush until the test releases it. */
function manualSchedule() {
  const queued: (() => void)[] = [];
  return {
    schedule: (flush: () => void) => {
      queued.push(flush);
    },
    get scheduled() {
      return queued.length;
    },
    run() {
      const due = queued.splice(0);
      for (const flush of due) flush();
    },
  };
}

describe('createChangeBatcher', () => {
  it('runs a subscriber once for a burst of row changes', () => {
    const clock = manualSchedule();
    const batcher = createChangeBatcher(clock.schedule);
    const listener = jest.fn();
    batcher.subscribe(['tracks'], listener);

    for (let row = 0; row < 500; row += 1) batcher.changed('tracks');

    expect(clock.scheduled).toBe(1);
    expect(listener).not.toHaveBeenCalled();
    clock.run();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('runs a subscriber once when several of its tables changed together', () => {
    const clock = manualSchedule();
    const batcher = createChangeBatcher(clock.schedule);
    const listener = jest.fn();
    batcher.subscribe(['tracks', 'track_stats', 'albums'], listener);

    batcher.changed('track_stats');
    batcher.changed('albums');
    batcher.changed('tracks');
    clock.run();

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('wakes only the subscribers whose tables changed', () => {
    const clock = manualSchedule();
    const batcher = createChangeBatcher(clock.schedule);
    const library = jest.fn();
    const stats = jest.fn();
    batcher.subscribe(['tracks'], library);
    batcher.subscribe(['stats_rollups'], stats);

    batcher.changed('stats_rollups');
    clock.run();

    expect(stats).toHaveBeenCalledTimes(1);
    expect(library).not.toHaveBeenCalled();
  });

  it('schedules nothing for a table nobody watches', () => {
    const clock = manualSchedule();
    const batcher = createChangeBatcher(clock.schedule);
    batcher.subscribe(['tracks'], jest.fn());

    batcher.changed('play_events');

    expect(clock.scheduled).toBe(0);
  });

  it('starts a new burst after a flush', () => {
    const clock = manualSchedule();
    const batcher = createChangeBatcher(clock.schedule);
    const listener = jest.fn();
    batcher.subscribe(['tracks'], listener);

    batcher.changed('tracks');
    clock.run();
    batcher.changed('tracks');
    clock.run();

    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('does not call a subscriber that left before the flush', () => {
    const clock = manualSchedule();
    const batcher = createChangeBatcher(clock.schedule);
    const listener = jest.fn();
    const unsubscribe = batcher.subscribe(['tracks'], listener);

    batcher.changed('tracks');
    unsubscribe();
    clock.run();

    expect(listener).not.toHaveBeenCalled();
  });

  it('does not call a subscriber another one removed during the flush', () => {
    const clock = manualSchedule();
    const batcher = createChangeBatcher(clock.schedule);
    const second = jest.fn();
    let unsubscribeSecond = (): void => undefined;
    batcher.subscribe(['tracks'], () => unsubscribeSecond());
    unsubscribeSecond = batcher.subscribe(['tracks'], second);

    batcher.changed('tracks');
    clock.run();

    expect(second).not.toHaveBeenCalled();
  });
});
