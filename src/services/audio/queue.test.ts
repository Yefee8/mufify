import { cycleRepeat, isPlayable, nextIndex, previousIndex } from './queue';
import type { RepeatMode } from './types';

function at(index: number, length: number, repeat: RepeatMode = 'off') {
  return { index, length, repeat };
}

describe('nextIndex', () => {
  it('advances through the queue', () => {
    expect(nextIndex(at(0, 3), false)).toBe(1);
    expect(nextIndex(at(1, 3), false)).toBe(2);
  });

  it('stops at the end with repeat off', () => {
    expect(nextIndex(at(2, 3), false)).toBeNull();
  });

  it('wraps at the end with repeat all', () => {
    expect(nextIndex(at(2, 3, 'all'), false)).toBe(0);
  });

  it('repeats the current track when it ends under repeat one', () => {
    expect(nextIndex(at(1, 3, 'one'), false)).toBe(1);
  });

  it('still advances on an explicit skip under repeat one', () => {
    // Repeating the track someone just asked to skip reads as a broken
    // button, not as a respected setting.
    expect(nextIndex(at(1, 3, 'one'), true)).toBe(2);
  });

  it('honours repeat-off at the end even on an explicit skip under repeat one', () => {
    expect(nextIndex(at(2, 3, 'one'), true)).toBeNull();
  });

  it('has nowhere to go in an empty or unstarted queue', () => {
    expect(nextIndex(at(0, 0), false)).toBeNull();
    expect(nextIndex(at(-1, 3), false)).toBeNull();
  });

  it('handles a single-track queue', () => {
    expect(nextIndex(at(0, 1), false)).toBeNull();
    expect(nextIndex(at(0, 1, 'all'), false)).toBe(0);
    expect(nextIndex(at(0, 1, 'one'), false)).toBe(0);
  });
});

describe('previousIndex', () => {
  it('steps back through the queue', () => {
    expect(previousIndex(at(2, 3))).toBe(1);
    expect(previousIndex(at(1, 3))).toBe(0);
  });

  it('stops at the start with repeat off', () => {
    expect(previousIndex(at(0, 3))).toBeNull();
  });

  it('wraps to the end with repeat all', () => {
    expect(previousIndex(at(0, 3, 'all'))).toBe(2);
  });

  it('treats repeat one like off, since repeat has no meaning for a skip', () => {
    expect(previousIndex(at(0, 3, 'one'))).toBeNull();
    expect(previousIndex(at(2, 3, 'one'))).toBe(1);
  });

  it('has nowhere to go in an empty or unstarted queue', () => {
    expect(previousIndex(at(0, 0))).toBeNull();
    expect(previousIndex(at(-1, 3))).toBeNull();
  });
});

describe('isPlayable', () => {
  it('accepts indexes inside the queue', () => {
    expect(isPlayable(0, 3)).toBe(true);
    expect(isPlayable(2, 3)).toBe(true);
  });

  it('rejects anything outside it', () => {
    expect(isPlayable(-1, 3)).toBe(false);
    expect(isPlayable(3, 3)).toBe(false);
    expect(isPlayable(0, 0)).toBe(false);
  });

  it('rejects non-integers, which arrive from arithmetic more often than expected', () => {
    expect(isPlayable(1.5, 3)).toBe(false);
    expect(isPlayable(Number.NaN, 3)).toBe(false);
  });
});

describe('cycleRepeat', () => {
  it('escalates off -> all -> one -> off', () => {
    // Escalating rather than jumping straight to single-track repeat: someone
    // who wants "keep the album going" should not have to pass through a mode
    // that stops it dead.
    expect(cycleRepeat('off')).toBe('all');
    expect(cycleRepeat('all')).toBe('one');
    expect(cycleRepeat('one')).toBe('off');
  });

  it('returns to the start after three presses', () => {
    expect(cycleRepeat(cycleRepeat(cycleRepeat('off')))).toBe('off');
  });
});
