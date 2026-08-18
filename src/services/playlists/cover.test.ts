/*
 * A fake filesystem, one level deep: enough to answer what was written, where,
 * and under what name. Prefixed `mock` because `jest.mock` is hoisted above
 * every declaration and its factory may close over nothing else.
 */
const mockWritten = new Map<string, Uint8Array>();
const mockDeleted: string[] = [];
const mockPick = jest.fn();

class MockFile {
  uri: string;
  size = 0;
  private bytesValue = new Uint8Array();
  private failOnRead = false;

  constructor(...parts: (string | { uri: string })[]) {
    const joined = parts.map((part) => (typeof part === 'string' ? part : part.uri));
    this.uri = joined
      .join('/')
      .replace(/(?<!:)\/{2,}/gu, '/')
      .replace(/^file:\//u, 'file://');
  }

  static pickFileAsync = mockPick;

  get extension(): string {
    const name = this.uri.slice(this.uri.lastIndexOf('/') + 1);
    const dot = name.lastIndexOf('.');
    return dot <= 0 ? '' : name.slice(dot);
  }

  get exists(): boolean {
    return mockWritten.has(this.uri);
  }

  create(): void {
    mockWritten.set(this.uri, new Uint8Array());
  }

  write(content: Uint8Array): void {
    mockWritten.set(this.uri, content);
  }

  delete(): void {
    mockDeleted.push(this.uri);
    mockWritten.delete(this.uri);
  }

  async bytes(): Promise<Uint8Array> {
    if (this.failOnRead) throw new Error('provider went away');
    return this.bytesValue;
  }

  /** Builds what the picker would hand back. */
  static source(uri: string, size: number, failOnRead = false): MockFile {
    const file = new MockFile(uri);
    file.size = size;
    file.bytesValue = new Uint8Array([1, 2, 3]);
    file.failOnRead = failOnRead;
    return file;
  }
}

class MockDirectory {
  uri: string;
  exists = true;

  constructor(...parts: (string | { uri: string })[]) {
    this.uri = parts.map((part) => (typeof part === 'string' ? part : part.uri)).join('/');
  }

  create(): void {
    this.exists = true;
  }
}

jest.mock('expo-file-system', () => ({
  File: MockFile,
  Directory: MockDirectory,
  Paths: { document: { uri: 'file:///data/app/files' } },
}));

/**
 * Choosing a picture for a playlist.
 *
 * The filesystem is faked because none of the interesting behaviour is in the
 * writing: it is in what happens around a picker that can be cancelled, hand
 * back something enormous, or hand back something it then cannot read.
 *
 * Loaded with `require` inside a hook rather than imported at the top. Babel
 * turns a top-level import into a require above every declaration in this
 * file, so the module under test would pull in `expo-file-system` — and run
 * the factory — while `MockFile` was still in its temporal dead zone.
 */
let deleteCoverFile: typeof import('./cover').deleteCoverFile;
let pickPlaylistCover: typeof import('./cover').pickPlaylistCover;

beforeEach(() => {
  mockWritten.clear();
  mockDeleted.length = 0;
  mockPick.mockReset();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ({ deleteCoverFile, pickPlaylistCover } = require('./cover'));
});

describe('pickPlaylistCover', () => {
  it('is a quiet no-op when the user backs out', async () => {
    mockPick.mockResolvedValue({ canceled: true, result: null });

    expect(await pickPlaylistCover(3)).toEqual({ path: null, error: null });
    expect(mockWritten.size).toBe(0);
  });

  it('refuses a picture too large to be a thumbnail, without writing it', async () => {
    mockPick.mockResolvedValue({
      canceled: false,
      result: MockFile.source('content://media/photo.jpg', 40 * 1024 * 1024),
    });

    expect(await pickPlaylistCover(3)).toEqual({ path: null, error: 'too-large' });
    expect(mockWritten.size).toBe(0);
  });

  it('reports a picked file it cannot read rather than throwing at the screen', async () => {
    // An unmounted SD card, or a cloud file that was never downloaded. The user
    // can pick something else; they cannot fix the provider.
    mockPick.mockResolvedValue({
      canceled: false,
      result: MockFile.source('content://cloud/photo.jpg', 1024, true),
    });

    expect(await pickPlaylistCover(3)).toEqual({ path: null, error: 'unreadable' });
  });

  it('stores a bare path, because artwork is drawn as file:// plus the path', async () => {
    mockPick.mockResolvedValue({
      canceled: false,
      result: MockFile.source('content://media/photo.jpg', 1024),
    });

    const { path } = await pickPlaylistCover(3);

    expect(path).not.toBeNull();
    expect(path?.startsWith('file://')).toBe(false);
    expect(path).toContain('/playlist-covers/');
  });

  it('keeps a recognisable image extension, and refuses to invent one', async () => {
    mockPick.mockResolvedValue({
      canceled: false,
      result: MockFile.source('content://media/photo.WEBP', 1024),
    });
    expect((await pickPlaylistCover(3)).path).toMatch(/\.webp$/u);

    mockPick.mockResolvedValue({
      canceled: false,
      result: MockFile.source('content://media/12345', 1024),
    });
    expect((await pickPlaylistCover(3)).path).toMatch(/\.img$/u);
  });

  it('writes a new name each time rather than replacing one in place', async () => {
    /*
     * `expo-image` caches by URI, so reusing the path would keep drawing the
     * previous picture until the cache happened to evict it — the user changes
     * the cover and nothing appears to happen.
     */
    mockPick.mockResolvedValue({
      canceled: false,
      result: MockFile.source('content://media/photo.jpg', 1024),
    });

    const first = await pickPlaylistCover(3);
    jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 1000);
    const second = await pickPlaylistCover(3);
    jest.spyOn(Date, 'now').mockRestore();

    expect(first.path).not.toBe(second.path);
    expect(mockWritten.size).toBe(2);
  });

  it('names the file after the playlist it belongs to', async () => {
    mockPick.mockResolvedValue({
      canceled: false,
      result: MockFile.source('content://media/photo.jpg', 1024),
    });

    expect((await pickPlaylistCover(42)).path).toMatch(/\/42-\d+\.jpg$/u);
  });
});

describe('deleteCoverFile', () => {
  it('ignores a playlist that never had one', () => {
    deleteCoverFile(null);
    deleteCoverFile(undefined);
    deleteCoverFile('');

    expect(mockDeleted).toEqual([]);
  });

  it('deletes the file behind a stored path', async () => {
    mockPick.mockResolvedValue({
      canceled: false,
      result: MockFile.source('content://media/photo.jpg', 1024),
    });
    const { path } = await pickPlaylistCover(3);

    deleteCoverFile(path);

    expect(mockDeleted).toEqual([`file://${path}`]);
  });

  it('says nothing when the file is already gone', () => {
    // Best-effort by design: the row is the truth about what a playlist shows,
    // and throwing here would abort the write that actually matters.
    expect(() => deleteCoverFile('/data/app/files/playlist-covers/9-1.jpg')).not.toThrow();
    expect(mockDeleted).toEqual([]);
  });
});
