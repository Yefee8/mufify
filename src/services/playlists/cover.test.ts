import { Image } from 'react-native';

/*
 * A fake filesystem, one level deep: enough to answer what was written, where,
 * and under what name. Prefixed `mock` because `jest.mock` is hoisted above
 * every declaration and its factory may close over nothing else.
 */
const mockWritten = new Map<string, Uint8Array>();
const mockDeleted: string[] = [];
const mockMoved: [string, string][] = [];
const mockPick = jest.fn();
const mockCrop = jest.fn();
const mockResize = jest.fn();

class MockFile {
  uri: string;
  size = 0;
  private bytesValue = new Uint8Array();
  private failOnRead = false;

  constructor(...parts: (string | { uri: string })[]) {
    this.uri = parts
      .map((part) => (typeof part === 'string' ? part : part.uri))
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

  async move(destination: { uri: string }): Promise<void> {
    mockMoved.push([this.uri, destination.uri]);
    mockWritten.set(destination.uri, mockWritten.get(this.uri) ?? new Uint8Array());
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
  Paths: { document: { uri: 'file:///data/app/files' }, cache: { uri: 'file:///data/app/cache' } },
}));

jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg' },
  ImageManipulator: {
    manipulate: (uri: string) => {
      const context = {
        crop: (rect: unknown) => {
          mockCrop(uri, rect);
          return context;
        },
        resize: (size: unknown) => {
          mockResize(size);
          return context;
        },
        renderAsync: async () => ({
          saveAsync: async () => ({ uri: 'file:///data/app/cache/ImageManipulator/out.jpg' }),
        }),
      };
      return context;
    },
  },
}));

/**
 * Choosing a picture for a playlist, in two steps.
 *
 * The filesystem and the cropper are faked because none of the interesting
 * behaviour is in the writing. It is in what happens around a picker that can
 * be cancelled, hand back something enormous, or hand back something it then
 * cannot read — and in which directory each of the two steps writes to, which
 * is the difference between a cover that survives a full phone and one that
 * quietly disappears.
 *
 * Loaded with `require` inside a hook rather than imported at the top: Babel
 * turns a top-level import into a require above every declaration in this file,
 * so the module under test would pull in `expo-file-system` — and run the
 * factory — while `MockFile` was still in its temporal dead zone.
 */
let cover: typeof import('./cover');

/*
 * `Image.getSize` is spied rather than the module mocked. Replacing the whole
 * of `react-native` takes `Platform.select` with it, which expo-modules-core
 * reaches for at import time — the suite then fails to run at all, for a reason
 * that has nothing to do with covers.
 */
const mockSize = jest.spyOn(Image, 'getSize');

/** The default: a readable 4000×3000 photograph. */
function pickReturns(file: MockFile): void {
  mockPick.mockResolvedValue({ canceled: false, result: file });
}

beforeEach(() => {
  mockWritten.clear();
  mockDeleted.length = 0;
  mockMoved.length = 0;
  mockPick.mockReset();
  mockCrop.mockReset();
  mockResize.mockReset();
  mockSize.mockReset();
  mockSize.mockImplementation((_uri, ok) => ok(4000, 3000));
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  cover = require('./cover');
});

describe('pickCoverSource', () => {
  it('is a quiet no-op when the user backs out', async () => {
    mockPick.mockResolvedValue({ canceled: true, result: null });

    expect(await cover.pickCoverSource()).toEqual({ source: null, error: null });
    expect(mockWritten.size).toBe(0);
  });

  it('refuses a picture too large to be a thumbnail, without writing it', async () => {
    pickReturns(MockFile.source('content://media/photo.jpg', 40 * 1024 * 1024));

    expect(await cover.pickCoverSource()).toEqual({ source: null, error: 'too-large' });
    expect(mockWritten.size).toBe(0);
  });

  it('reports a picked file it cannot read rather than throwing at the screen', async () => {
    // An unmounted SD card, or a cloud file that was never downloaded.
    pickReturns(MockFile.source('content://cloud/photo.jpg', 1024, true));

    expect(await cover.pickCoverSource()).toEqual({ source: null, error: 'unreadable' });
  });

  it('refuses an image whose dimensions cannot be read', async () => {
    // The cropper cannot draw anything without them, and a zero would make the
    // base scale a division by nothing.
    pickReturns(MockFile.source('content://media/broken.jpg', 1024));
    mockSize.mockImplementation((_uri, _ok, fail) => fail?.(new Error('no header')));

    expect(await cover.pickCoverSource()).toEqual({ source: null, error: 'unreadable' });
  });

  it('lands the candidate in the cache, not in documents', async () => {
    /*
     * The whole reason picking is its own step. A cancelled crop must leave
     * nothing behind that Android will not reclaim, and only what the user
     * confirms is worth keeping where it cannot be evicted.
     */
    pickReturns(MockFile.source('content://media/photo.jpg', 1024));

    const { source } = await cover.pickCoverSource();

    expect(source?.uri).toContain('/cache/');
    expect(source?.uri).toContain('/cover-sources/');
    expect(source?.uri).not.toContain('/files/');
  });

  it('reports the dimensions the cropper needs', async () => {
    pickReturns(MockFile.source('content://media/photo.jpg', 1024));

    expect(await cover.pickCoverSource()).toMatchObject({
      source: { width: 4000, height: 3000 },
      error: null,
    });
  });

  it('keeps a recognisable image extension, and refuses to invent one', async () => {
    pickReturns(MockFile.source('content://media/photo.WEBP', 1024));
    expect((await cover.pickCoverSource()).source?.uri).toMatch(/\.webp$/u);

    pickReturns(MockFile.source('content://media/12345', 1024));
    expect((await cover.pickCoverSource()).source?.uri).toMatch(/\.img$/u);
  });
});

describe('cropCoverTo', () => {
  const source = { uri: 'file:///data/app/cache/cover-sources/1.jpg', width: 4000, height: 3000 };

  it('stores a bare path in documents, because artwork is drawn as file:// plus it', async () => {
    const { path, error } = await cover.cropCoverTo(7, source, {
      originX: 500,
      originY: 0,
      size: 3000,
    });

    expect(error).toBeNull();
    expect(path?.startsWith('file://')).toBe(false);
    expect(path).toContain('/files/playlist-covers/');
    expect(path).toMatch(/\/7-\d+\.jpg$/u);
  });

  it('moves the cropper output out of the cache rather than pointing at it', async () => {
    // The manipulator writes to its own cache directory, which Android reclaims
    // under storage pressure — the one place a chosen cover must not live.
    await cover.cropCoverTo(7, source, { originX: 0, originY: 0, size: 3000 });

    expect(mockMoved).toHaveLength(1);
    expect(mockMoved[0]?.[0]).toContain('/cache/');
    expect(mockMoved[0]?.[1]).toContain('/files/playlist-covers/');
  });

  it('asks for exactly the square it was given', async () => {
    await cover.cropCoverTo(7, source, { originX: 500, originY: 250, size: 2000 });

    expect(mockCrop).toHaveBeenCalledWith(source.uri, {
      originX: 500,
      originY: 250,
      width: 2000,
      height: 2000,
    });
  });

  it('caps the stored size — a cover is drawn at a third of a phone', async () => {
    await cover.cropCoverTo(7, source, { originX: 0, originY: 0, size: 3000 });

    expect(mockResize).toHaveBeenCalledWith({ width: 1024 });
  });

  it('does not upscale a crop smaller than the cap', async () => {
    await cover.cropCoverTo(7, source, { originX: 0, originY: 0, size: 400 });

    expect(mockResize).toHaveBeenCalledWith({ width: 400 });
  });

  it('clamps a rectangle that runs past an edge instead of letting it throw', async () => {
    // The sheet clamps in floats against a measured layout; one pixel over is
    // not a rounding curiosity to the native cropper.
    await cover.cropCoverTo(7, source, { originX: 3900, originY: 2900, size: 3000 });

    expect(mockCrop).toHaveBeenCalledWith(source.uri, {
      originX: 1000,
      originY: 0,
      width: 3000,
      height: 3000,
    });
  });

  it('writes a new name each time rather than replacing one in place', async () => {
    /*
     * `expo-image` caches by URI, so reusing the path would keep drawing the
     * previous picture until the cache happened to evict it — the user changes
     * the cover and nothing appears to happen.
     */
    const first = await cover.cropCoverTo(7, source, { originX: 0, originY: 0, size: 3000 });
    jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 1000);
    const second = await cover.cropCoverTo(7, source, { originX: 0, originY: 0, size: 3000 });
    jest.spyOn(Date, 'now').mockRestore();

    expect(first.path).not.toBe(second.path);
  });
});

describe('discardCoverSource', () => {
  it('deletes a candidate the user did not use', async () => {
    mockWritten.set('file:///data/app/cache/cover-sources/1.jpg', new Uint8Array());

    cover.discardCoverSource('file:///data/app/cache/cover-sources/1.jpg');

    expect(mockDeleted).toEqual(['file:///data/app/cache/cover-sources/1.jpg']);
  });

  it('ignores a candidate that never existed', () => {
    cover.discardCoverSource(null);
    cover.discardCoverSource(undefined);
    cover.discardCoverSource('');

    expect(mockDeleted).toEqual([]);
  });
});

describe('deleteCoverFile', () => {
  it('ignores a playlist that never had one', () => {
    cover.deleteCoverFile(null);
    cover.deleteCoverFile(undefined);
    cover.deleteCoverFile('');

    expect(mockDeleted).toEqual([]);
  });

  it('deletes the file behind a stored path', () => {
    mockWritten.set('file:///data/app/files/playlist-covers/9-1.jpg', new Uint8Array());

    cover.deleteCoverFile('/data/app/files/playlist-covers/9-1.jpg');

    expect(mockDeleted).toEqual(['file:///data/app/files/playlist-covers/9-1.jpg']);
  });

  it('says nothing when the file is already gone', () => {
    // Best-effort by design: the row is the truth about what a playlist shows,
    // and throwing here would abort the write that actually matters.
    expect(() => cover.deleteCoverFile('/data/app/files/playlist-covers/9-1.jpg')).not.toThrow();
    expect(mockDeleted).toEqual([]);
  });
});
