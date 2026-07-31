import { PRIMARY_VOLUME_ROOT, treeUriToPath } from './treeUri';

const AUTHORITY = 'content://com.android.externalstorage.documents';

describe('treeUriToPath', () => {
  it('resolves a folder on the primary volume', () => {
    expect(treeUriToPath(`${AUTHORITY}/tree/primary%3AMusic`)).toBe(`${PRIMARY_VOLUME_ROOT}/Music`);
  });

  it('resolves a nested folder', () => {
    expect(treeUriToPath(`${AUTHORITY}/tree/primary%3AMusic%2FFLAC%2FLive`)).toBe(
      `${PRIMARY_VOLUME_ROOT}/Music/FLAC/Live`,
    );
  });

  it('resolves the volume root', () => {
    expect(treeUriToPath(`${AUTHORITY}/tree/primary%3A`)).toBe(PRIMARY_VOLUME_ROOT);
  });

  it('handles a Turkish folder name', () => {
    // Percent-encoded UTF-8 has to survive the round trip intact.
    expect(treeUriToPath(`${AUTHORITY}/tree/primary%3AM%C3%BCzik%2FT%C3%BCrk%C3%A7e`)).toBe(
      `${PRIMARY_VOLUME_ROOT}/Müzik/Türkçe`,
    );
  });

  it('ignores a trailing document segment', () => {
    // The picker returns tree+document for some flows; only the tree is ours.
    expect(
      treeUriToPath(`${AUTHORITY}/tree/primary%3AMusic/document/primary%3AMusic%2Fa.flac`),
    ).toBe(`${PRIMARY_VOLUME_ROOT}/Music`);
  });

  it('gives up on a removable volume rather than guessing a path', () => {
    // SD cards carry an opaque volume id; there is no supported mapping.
    expect(treeUriToPath(`${AUTHORITY}/tree/1AEF-2understanding%3AMusic`)).toBeNull();
    expect(treeUriToPath(`${AUTHORITY}/tree/0000-1111%3A`)).toBeNull();
  });

  it('returns null for anything that is not a tree URI', () => {
    expect(treeUriToPath('content://media/external/audio/media/42')).toBeNull();
    expect(treeUriToPath('')).toBeNull();
    expect(treeUriToPath('not a uri')).toBeNull();
  });

  it('returns null when the volume separator is missing', () => {
    expect(treeUriToPath(`${AUTHORITY}/tree/primary`)).toBeNull();
  });

  it('survives malformed percent encoding instead of throwing', () => {
    expect(treeUriToPath(`${AUTHORITY}/tree/primary%3AMus%ZZic`)).toBeNull();
  });

  it('normalises stray slashes', () => {
    expect(treeUriToPath(`${AUTHORITY}/tree/primary%3A%2FMusic%2F`)).toBe(
      `${PRIMARY_VOLUME_ROOT}/Music`,
    );
  });
});
