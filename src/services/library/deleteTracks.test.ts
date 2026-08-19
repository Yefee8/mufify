import type { DeletableTrack } from './deleteTracks';

/*
 * Prefixed `mock` because `jest.mock` is hoisted above every declaration here
 * and its factory may close over nothing else.
 */
const mockNative = {
  canDeleteAudioFiles: jest.fn<boolean, []>(),
  deleteAudioFiles: jest.fn(),
};

jest.mock('audio-tags', () => ({ __esModule: true, default: mockNative }));

/**
 * What the app is allowed to forget after asking the system to delete files.
 *
 * The delete itself is the platform's and is not worth faking in detail. What
 * is worth pinning is the accounting around it: a run can be approved in part,
 * refused in part, and refused by the platform outright, and each of those has
 * a different consequence for the rows this app holds.
 *
 * Loaded with `require` in a hook rather than imported at the top: Babel turns
 * a top-level import into a require above every declaration here, so the module
 * under test would reach for `audio-tags` — and run the factory — while
 * `mockNative` was still in its temporal dead zone.
 */
let canDeleteFiles: typeof import('./deleteTracks').canDeleteFiles;
let deleteTracks: typeof import('./deleteTracks').deleteTracks;

function track(id: number): DeletableTrack {
  return { id, fileUri: `content://media/external/audio/media/${id}` };
}

const NOTHING = { deleted: [], denied: [], failed: [] };

beforeEach(() => {
  mockNative.canDeleteAudioFiles.mockReset();
  mockNative.deleteAudioFiles.mockReset();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ({ canDeleteFiles, deleteTracks } = require('./deleteTracks'));
});

describe('deleteTracks', () => {
  it('does not disturb the platform over an empty list', async () => {
    const retire = jest.fn();

    expect(await deleteTracks([], retire)).toEqual({ deleted: 0, denied: 0, failed: 0 });
    expect(mockNative.deleteAudioFiles).not.toHaveBeenCalled();
    expect(retire).not.toHaveBeenCalled();
  });

  it('retires only the rows whose files the platform said were deleted', async () => {
    /*
     * The regression this exists for. Retiring on "the request came back" would
     * hide a track the user still has — and that is the worse of the two
     * failures: a leftover row is fixed by the next scan, an invisible file is
     * fixed by nothing the user can find.
     */
    const [one, two, three] = [track(1), track(2), track(3)];
    mockNative.deleteAudioFiles.mockResolvedValue({
      ...NOTHING,
      deleted: [one.fileUri],
      denied: [two.fileUri],
      failed: [three.fileUri],
    });
    const retire = jest.fn();

    const outcome = await deleteTracks([one, two, three], retire);

    expect(retire).toHaveBeenCalledWith([1]);
    expect(outcome).toEqual({ deleted: 1, denied: 1, failed: 1 });
  });

  it('retires nothing at all when the user declines', async () => {
    const tracks = [track(1), track(2)];
    mockNative.deleteAudioFiles.mockResolvedValue({
      ...NOTHING,
      denied: tracks.map((entry) => entry.fileUri),
    });
    const retire = jest.fn();

    expect(await deleteTracks(tracks, retire)).toEqual({ deleted: 0, denied: 2, failed: 0 });
    expect(retire).toHaveBeenCalledWith([]);
  });

  it('matches URIs to ids rather than trusting the order they come back in', async () => {
    // API 30 answers for the whole list at once and API 29 one file at a time,
    // so neither the order nor the length of the answer is something to index.
    const [one, two, three] = [track(1), track(2), track(3)];
    mockNative.deleteAudioFiles.mockResolvedValue({
      ...NOTHING,
      deleted: [three.fileUri, one.fileUri],
    });
    const retire = jest.fn();

    await deleteTracks([one, two, three], retire);

    expect(retire).toHaveBeenCalledWith([3, 1]);
  });

  it('ignores a URI it never asked about', async () => {
    // Defensive: a bucket naming something not in the request would otherwise
    // retire nothing under an id of `undefined`.
    mockNative.deleteAudioFiles.mockResolvedValue({
      ...NOTHING,
      deleted: ['content://media/external/audio/media/999'],
    });
    const retire = jest.fn();

    expect(await deleteTracks([track(1)], retire)).toEqual({ deleted: 0, denied: 0, failed: 0 });
    expect(retire).toHaveBeenCalledWith([]);
  });

  it('asks the platform about every file it was given, once', async () => {
    const tracks = [track(1), track(2)];
    mockNative.deleteAudioFiles.mockResolvedValue(NOTHING);

    await deleteTracks(tracks, jest.fn());

    expect(mockNative.deleteAudioFiles).toHaveBeenCalledTimes(1);
    expect(mockNative.deleteAudioFiles).toHaveBeenCalledWith(tracks.map((one) => one.fileUri));
  });
});

describe('canDeleteFiles', () => {
  it('passes the platform answer through without softening it', () => {
    mockNative.canDeleteAudioFiles.mockReturnValue(false);
    expect(canDeleteFiles()).toBe(false);

    mockNative.canDeleteAudioFiles.mockReturnValue(true);
    expect(canDeleteFiles()).toBe(true);
  });
});
