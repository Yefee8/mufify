import { PRIMARY_VOLUME_ROOT, treeUriToLabel, treeUriToPath } from './treeUri';

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

describe('treeUriToLabel', () => {
  const TREE = 'content://com.android.externalstorage.documents/tree';

  it('names a primary-volume folder by its path', () => {
    expect(treeUriToLabel(`${TREE}/primary%3AMusic`)).toBe('Music');
    expect(treeUriToLabel(`${TREE}/primary%3AMusic%2FFLAC%2F2024`)).toBe('Music/FLAC/2024');
  });

  it('names the primary volume root', () => {
    expect(treeUriToLabel(`${TREE}/primary%3A`)).toBe('Internal storage');
  });

  it('qualifies a removable volume, which is the question the user is asking', () => {
    // treeUriToPath returns null here because there is no resolvable path, but
    // the settings list still has to render the row as something.
    expect(treeUriToLabel(`${TREE}/1AEF-1A0F%3AMusic`)).toBe('1AEF-1A0F: Music');
    expect(treeUriToLabel(`${TREE}/1AEF-1A0F%3A`)).toBe('1AEF-1A0F');
  });

  it('returns something renderable for any real URI, however malformed', () => {
    // The guarantee the settings list depends on: a stored folder always
    // renders as *something*, so the screen cannot quietly lose a row it is
    // supposed to be accounting for. Scoped to non-empty input because
    // `scan_folders.uri` is NOT NULL and comes from the system picker.
    for (const input of ['nonsense', 'content://x/tree/', `${TREE}/%E0%A4%A`, `${TREE}/nocolon`]) {
      expect(treeUriToLabel(input).length).toBeGreaterThan(0);
    }
  });

  it('passes an empty string straight through rather than inventing a name', () => {
    // A fabricated label would be worse than a blank one: it would look like a
    // real folder. This input cannot occur through the picker.
    expect(treeUriToLabel('')).toBe('');
  });

  it('ignores a document segment, like treeUriToPath does', () => {
    expect(treeUriToLabel(`${TREE}/primary%3AMusic/document/primary%3AMusic%2Fa.flac`)).toBe(
      'Music',
    );
  });
});
