import { rebuildSession, type SessionIds } from './session';

const track = (id: number) => ({ id });
const library = (...ids: number[]) => new Map(ids.map((id) => [id, track(id)]));

const saved = (overrides: Partial<SessionIds> = {}): SessionIds => ({
  queue: [1, 2, 3, 4],
  sourceQueue: [1, 2, 3, 4],
  queueIndex: 1,
  positionMs: 42_000,
  shuffled: false,
  shuffleAlgorithm: null,
  repeat: 'all',
  sourceType: 'album',
  sourceId: 7,
  ...overrides,
});

describe('rebuildSession', () => {
  it('restores the queue, the current track and where it was', () => {
    const session = rebuildSession(saved(), library(1, 2, 3, 4));

    expect(session?.queue.map((t) => t.id)).toEqual([1, 2, 3, 4]);
    expect(session?.index).toBe(1);
    expect(session?.positionMs).toBe(42_000);
    expect(session?.repeat).toBe('all');
    expect(session?.source).toEqual({ type: 'album', id: 7 });
  });

  it('drops tracks that no longer exist and keeps the current one in place', () => {
    const session = rebuildSession(saved({ queueIndex: 2 }), library(1, 3, 4));

    expect(session?.queue.map((t) => t.id)).toEqual([1, 3, 4]);
    expect(session?.queue[session.index]?.id).toBe(3);
    expect(session?.positionMs).toBe(42_000);
  });

  it('resumes at the next survivor, from the start, when the current track is gone', () => {
    const session = rebuildSession(saved({ queueIndex: 1 }), library(1, 3, 4));

    expect(session?.queue[session.index]?.id).toBe(3);
    expect(session?.positionMs).toBe(0);
  });

  it('falls back to the last survivor when nothing after the current track is left', () => {
    const session = rebuildSession(saved({ queueIndex: 3 }), library(1, 2));

    expect(session?.queue[session.index]?.id).toBe(2);
    expect(session?.positionMs).toBe(0);
  });

  it('restores nothing when every track is gone', () => {
    expect(rebuildSession(saved(), library())).toBeNull();
  });

  it('keeps the unshuffled order so shuffle can be turned off again', () => {
    const session = rebuildSession(
      saved({
        queue: [3, 1, 4, 2],
        sourceQueue: [1, 2, 3, 4],
        shuffled: true,
        shuffleAlgorithm: 'balanced',
      }),
      library(1, 2, 3, 4),
    );

    expect(session?.shuffled).toBe(true);
    expect(session?.sourceQueue.map((t) => t.id)).toEqual([1, 2, 3, 4]);
  });

  it('distrusts values it does not recognise', () => {
    const session = rebuildSession(
      saved({
        repeat: 'sometimes',
        sourceType: 'radio',
        shuffled: true,
        shuffleAlgorithm: 'chaos',
      }),
      library(1, 2, 3, 4),
    );

    expect(session?.repeat).toBe('off');
    expect(session?.source).toEqual({ type: 'library' });
    expect(session?.shuffled).toBe(false);
  });
});
