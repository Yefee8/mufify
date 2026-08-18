/*
 * Named with the `mock` prefix because `jest.mock` is hoisted above every
 * declaration in the file, and the factory may not close over anything else.
 */
const mockNative = {
  hasAudioPermission: jest.fn<Promise<boolean>, []>(),
  requestAudioPermission: jest.fn<Promise<{ granted: boolean; canAskAgain: boolean }>, []>(),
};

jest.mock('audio-tags', () => ({ __esModule: true, default: mockNative }));

/**
 * The permission store, which exists to keep one fact in one place.
 *
 * What is worth pinning is not that it calls the native module — it is the two
 * rules that decide what a user is shown. A permanent denial has to survive a
 * foreground refresh, or the app starts offering a Retry button the system
 * silently ignores; and a permission nobody has been asked for is not a
 * refusal, or a first launch accuses someone of something they never did.
 */

/**
 * The store is module state, so each test takes a fresh copy of the module.
 *
 * `require` rather than a dynamic `import`, which Jest cannot re-evaluate
 * without `--experimental-vm-modules`.
 */
function freshStore(): typeof import('./audioPermission') {
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('./audioPermission');
}

beforeEach(() => {
  mockNative.hasAudioPermission.mockReset();
  mockNative.requestAudioPermission.mockReset();
});

describe('refreshAudioPermission', () => {
  it('says granted once the permission is there', async () => {
    const store = freshStore();
    mockNative.hasAudioPermission.mockResolvedValue(true);

    expect(await store.refreshAudioPermission()).toBe('granted');
  });

  it('stays unknown while nobody has been asked yet', async () => {
    // A first launch must not accuse anyone of refusing something they were
    // never offered. The library's empty state already says what to do.
    const store = freshStore();
    mockNative.hasAudioPermission.mockResolvedValue(false);

    expect(await store.refreshAudioPermission()).toBe('unknown');
    expect(store.isDenied(store.getAudioPermissionState())).toBe(false);
  });

  it('never downgrades a permanent denial to an ordinary one', async () => {
    /*
     * `hasAudioPermission` answers granted or not and cannot tell the two
     * denials apart, so a naive refresh would rewrite `blocked` as `denied` on
     * the next foreground — and the warning would swap its "open settings"
     * button, which works, for a "try again" one, which does nothing.
     */
    const store = freshStore();
    mockNative.requestAudioPermission.mockResolvedValue({ granted: false, canAskAgain: false });
    expect(await store.requestAudioPermission()).toBe('blocked');

    mockNative.hasAudioPermission.mockResolvedValue(false);
    expect(await store.refreshAudioPermission()).toBe('blocked');
  });

  it('notices a permission revoked while the app was in the background', async () => {
    const store = freshStore();
    mockNative.requestAudioPermission.mockResolvedValue({ granted: true, canAskAgain: true });
    expect(await store.requestAudioPermission()).toBe('granted');

    mockNative.hasAudioPermission.mockResolvedValue(false);
    expect(await store.refreshAudioPermission()).toBe('denied');
  });

  it('clears a denial once the user grants it from system settings', async () => {
    const store = freshStore();
    mockNative.requestAudioPermission.mockResolvedValue({ granted: false, canAskAgain: false });
    await store.requestAudioPermission();

    mockNative.hasAudioPermission.mockResolvedValue(true);
    expect(await store.refreshAudioPermission()).toBe('granted');
  });
});

describe('requestAudioPermission', () => {
  it('separates the two refusals, because only one of them can be retried', async () => {
    const store = freshStore();

    mockNative.requestAudioPermission.mockResolvedValue({ granted: false, canAskAgain: true });
    expect(await store.requestAudioPermission()).toBe('denied');

    mockNative.requestAudioPermission.mockResolvedValue({ granted: false, canAskAgain: false });
    expect(await store.requestAudioPermission()).toBe('blocked');
  });
});

describe('subscribeAudioPermission', () => {
  it('tells every screen at once, and only when the answer changed', async () => {
    // Two screens ask this question and either can change the answer, so a
    // grant given in Settings has to clear the warning on the Library.
    const store = freshStore();
    const seen: string[] = [];
    const unsubscribe = store.subscribeAudioPermission((state) => seen.push(state));

    mockNative.requestAudioPermission.mockResolvedValue({ granted: false, canAskAgain: true });
    await store.requestAudioPermission();
    await store.requestAudioPermission();

    mockNative.hasAudioPermission.mockResolvedValue(true);
    await store.refreshAudioPermission();
    unsubscribe();

    expect(seen).toEqual(['denied', 'granted']);
  });

  it('stops after unsubscribing', async () => {
    const store = freshStore();
    const seen: string[] = [];
    store.subscribeAudioPermission((state) => seen.push(state))();

    mockNative.hasAudioPermission.mockResolvedValue(true);
    await store.refreshAudioPermission();

    expect(seen).toEqual([]);
  });
});

describe('isDenied', () => {
  it('covers both refusals and nothing else', () => {
    const { isDenied } = freshStore();

    expect(isDenied('denied')).toBe(true);
    expect(isDenied('blocked')).toBe(true);
    expect(isDenied('granted')).toBe(false);
    expect(isDenied('unknown')).toBe(false);
  });
});
