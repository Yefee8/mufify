import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  eventKey,
  parseBackup,
  planRestore,
  serializeBackup,
  type BackupEvent,
  type LibraryTrack,
  type StatsBackup,
} from './backup';

/**
 * The file that outlives the app.
 *
 * Two things are worth pinning. Parsing has to refuse anything that is not
 * ours or is damaged, because the file sits in a folder the user can see and
 * a restore that crashes halfway is worse than no restore. And planning has to
 * be idempotent and identity-aware: the same file restored twice writes
 * nothing the second time, and a listen finds its track by file first and by
 * tags second, so a reinstall that renumbered every row still gets its year
 * of listening back.
 */

function event(partial: Partial<BackupEvent> = {}): BackupEvent {
  return {
    track: 0,
    startedAtUtc: 1_700_000_000_000,
    msPlayed: 180_000,
    completed: true,
    outcome: 'play',
    sourceType: 'library',
    sourceId: null,
    shuffleAlgorithm: null,
    weekKey: '2023-W46',
    monthKey: '2023-11',
    yearKey: '2023',
    ...partial,
  };
}

function backup(partial: Partial<StatsBackup> = {}): StatsBackup {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: 1_700_000_000_000,
    tracks: [
      { uri: 'content://media/1', title: 'Numb', artist: 'Linkin Park', album: null, durationMs: 185_000 },
    ],
    events: [event()],
    favourites: [],
    ...partial,
  };
}

function libraryTrack(partial: Partial<LibraryTrack> = {}): LibraryTrack {
  return {
    id: 1,
    uri: 'content://media/1',
    title: 'Numb',
    artist: 'Linkin Park',
    durationMs: 185_000,
    ...partial,
  };
}

describe('parseBackup', () => {
  it('reads back what serializeBackup wrote', () => {
    const original = backup({ favourites: [{ track: 0, favoriteAt: 5 }] });

    expect(parseBackup(serializeBackup(original))).toEqual(original);
  });

  it('refuses a file that is not ours', () => {
    expect(parseBackup('{"hello":"world"}')).toBeNull();
    expect(parseBackup('not json at all')).toBeNull();
    expect(parseBackup('[]')).toBeNull();
  });

  it('refuses a version it does not know', () => {
    const text = JSON.stringify({ ...backup(), version: 99 });

    expect(parseBackup(text)).toBeNull();
  });

  it('refuses an event pointing outside the track list', () => {
    // A truncated or edited file, and the one mistake that would otherwise
    // attach a listen to an undefined track.
    const text = JSON.stringify(backup({ events: [event({ track: 7 })] }));

    expect(parseBackup(text)).toBeNull();
  });

  it('refuses an outcome the counting rule does not know', () => {
    const loose = JSON.parse(serializeBackup(backup())) as { events: Record<string, unknown>[] };
    loose.events[0] = { ...loose.events[0], outcome: 'listened' };
    const text = JSON.stringify(loose);

    expect(parseBackup(text)).toBeNull();
  });

  it('tolerates a missing optional field rather than failing the file', () => {
    const loose = JSON.parse(serializeBackup(backup())) as Record<string, unknown>;
    delete loose.createdAt;
    const events = loose.events as Record<string, unknown>[];
    delete events[0]?.sourceId;
    delete events[0]?.shuffleAlgorithm;

    const parsed = parseBackup(JSON.stringify(loose));

    expect(parsed?.createdAt).toBe(0);
    expect(parsed?.events[0]).toMatchObject({ sourceId: null, shuffleAlgorithm: null });
  });
});

describe('planRestore', () => {
  it('attaches a listen to the track with the same file', () => {
    const plan = planRestore(backup(), [libraryTrack({ id: 42 })], new Set());

    expect(plan.events).toHaveLength(1);
    expect(plan.events[0]?.trackId).toBe(42);
    expect(plan.unmatchedTracks).toBe(0);
  });

  it('falls back to the tags when the file has moved', () => {
    /*
     * A rebuilt media index gives every file a new id, which is a new URI.
     * The title, the artist and the length are the same file's, and that is
     * enough.
     */
    const plan = planRestore(
      backup(),
      [libraryTrack({ id: 9, uri: 'content://media/9999' })],
      new Set(),
    );

    expect(plan.events[0]?.trackId).toBe(9);
  });

  it('matches tags the way the library does — case and punctuation aside', () => {
    const plan = planRestore(
      backup(),
      [libraryTrack({ id: 3, uri: 'x', title: 'NUMB', artist: 'linkin park' })],
      new Set(),
    );

    expect(plan.events[0]?.trackId).toBe(3);
  });

  it('does not attach a listen to a different recording of the same song', () => {
    // A live take shares the title and the artist. Length tells them apart.
    const plan = planRestore(
      backup(),
      [libraryTrack({ id: 5, uri: 'x', durationMs: 260_000 })],
      new Set(),
    );

    expect(plan.events).toHaveLength(0);
    expect(plan.unmatchedTracks).toBe(1);
  });

  it('prefers the file over the tags when both would match different rows', () => {
    const plan = planRestore(
      backup(),
      [
        libraryTrack({ id: 1, uri: 'content://media/1', title: 'Renamed' }),
        libraryTrack({ id: 2, uri: 'content://media/2' }),
      ],
      new Set(),
    );

    expect(plan.events[0]?.trackId).toBe(1);
  });

  it('skips a listen the database already holds', () => {
    const existing = new Set([eventKey(1, 1_700_000_000_000)]);

    const plan = planRestore(backup(), [libraryTrack()], existing);

    expect(plan.events).toHaveLength(0);
    expect(plan.alreadyPresent).toBe(1);
  });

  it('writes nothing the second time the same file is restored', () => {
    const first = planRestore(backup(), [libraryTrack()], new Set());
    const afterFirst = new Set(first.events.map((e) => eventKey(e.trackId, e.startedAtUtc)));

    const second = planRestore(backup(), [libraryTrack()], afterFirst);

    expect(second.events).toHaveLength(0);
  });

  it('does not write a listen that appears twice in one file', () => {
    const plan = planRestore(backup({ events: [event(), event()] }), [libraryTrack()], new Set());

    expect(plan.events).toHaveLength(1);
  });

  it('leaves the listens of a track that is not in the library for later', () => {
    // An unmounted SD card is not a reason to lose the history on it.
    const plan = planRestore(backup(), [], new Set());

    expect(plan.events).toHaveLength(0);
    expect(plan.unmatchedTracks).toBe(1);
  });

  it('never matches an untitled file by its tags', () => {
    const plan = planRestore(
      backup({ tracks: [{ uri: 'a', title: '', artist: null, album: null, durationMs: 100 }] }),
      [libraryTrack({ uri: 'b', title: '', artist: null, durationMs: 100 })],
      new Set(),
    );

    expect(plan.events).toHaveLength(0);
  });

  it('carries the hearts across', () => {
    const plan = planRestore(
      backup({ favourites: [{ track: 0, favoriteAt: 77 }] }),
      [libraryTrack({ id: 4 })],
      new Set(),
    );

    expect(plan.favourites).toEqual([{ trackId: 4, favoriteAt: 77 }]);
  });
});
