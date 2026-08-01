import type { MediaStoreTrack, TrackTags } from 'audio-tags';

import {
  codecOf,
  containerOf,
  fromMediaStore,
  fromTags,
  isLossless,
  needsRescan,
  sortNameOf,
  titleFrom,
  unpackTrackNumber,
} from './trackMapping';

function mediaStoreRow(overrides: Partial<MediaStoreTrack> = {}): MediaStoreTrack {
  return {
    mediaStoreId: '42',
    uri: 'content://media/external/audio/media/42',
    displayName: '03 - Gülpembe.flac',
    title: 'Gülpembe',
    artist: 'Barış Manço',
    album: 'Sakla Samanı',
    albumArtist: 'Barış Manço',
    genre: 'Anadolu rock',
    durationMs: 245_000,
    size: 41_000_000,
    dateAdded: 1_700_000_000_000,
    dateModified: 1_700_000_000_000,
    mimeType: 'audio/flac',
    trackNumberRaw: 3,
    year: 1981,
    ...overrides,
  };
}

function tagRow(overrides: Partial<TrackTags> = {}): TrackTags {
  return {
    uri: 'content://media/external/audio/media/42',
    title: 'Gülpembe',
    artist: 'Barış Manço',
    album: 'Sakla Samanı',
    albumArtist: 'Barış Manço',
    genre: 'Anadolu rock',
    trackNumberRaw: 3,
    discNumber: null,
    year: 1981,
    durationMs: 245_000,
    bitrateKbps: 1006,
    sampleRateHz: 44_100,
    bitDepth: 16,
    channels: 2,
    mimeType: 'audio/flac',
    artworkPath: '/cache/artwork/abc-512.jpg',
    artworkThumbPath: '/cache/artwork/abc-128.jpg',
    error: null,
    ...overrides,
  };
}

describe('unpackTrackNumber', () => {
  it('reads a bare number as a track with no disc', () => {
    // 7 is track 7, not disc 0.
    expect(unpackTrackNumber(7)).toEqual({ discNo: null, trackNo: 7 });
  });

  it('unpacks the disc-times-1000 encoding', () => {
    expect(unpackTrackNumber(1005)).toEqual({ discNo: 1, trackNo: 5 });
    expect(unpackTrackNumber(2011)).toEqual({ discNo: 2, trackNo: 11 });
    expect(unpackTrackNumber(12003)).toEqual({ discNo: 12, trackNo: 3 });
  });

  it('treats a disc with no track as track-unknown', () => {
    expect(unpackTrackNumber(3000)).toEqual({ discNo: 3, trackNo: null });
  });

  it('treats missing or nonsense values as unknown', () => {
    expect(unpackTrackNumber(null)).toEqual({ discNo: null, trackNo: null });
    expect(unpackTrackNumber(0)).toEqual({ discNo: null, trackNo: null });
    expect(unpackTrackNumber(-4)).toEqual({ discNo: null, trackNo: null });
  });
});

describe('titleFrom', () => {
  it('prefers the tag', () => {
    expect(titleFrom('Gülpembe', '03 - track.flac')).toBe('Gülpembe');
  });

  it('falls back to the file name without its extension', () => {
    expect(titleFrom(null, '03 - Gülpembe.flac')).toBe('03 - Gülpembe');
    expect(titleFrom('   ', '03 - Gülpembe.flac')).toBe('03 - Gülpembe');
  });

  it('keeps the file name when there is no extension', () => {
    expect(titleFrom(null, 'untitled')).toBe('untitled');
  });
});

describe('sortNameOf', () => {
  it('strips a leading article', () => {
    expect(sortNameOf('The Doors')).toBe('doors');
    expect(sortNameOf('A Tribe Called Quest')).toBe('tribe called quest');
  });

  it('lowercases with Turkish rules', () => {
    // Not "iSTANBUL" — the dotted/dotless i pair has to use the tr locale.
    expect(sortNameOf('İstanbul')).toBe('istanbul');
  });
});

describe('fromMediaStore', () => {
  it('maps a complete row', () => {
    expect(fromMediaStore(mediaStoreRow())).toEqual({
      mediaStoreId: '42',
      fileUri: 'content://media/external/audio/media/42',
      title: 'Gülpembe',
      artistName: 'Barış Manço',
      albumName: 'Sakla Samanı',
      albumArtist: 'Barış Manço',
      genre: 'Anadolu rock',
      trackNo: 3,
      discNo: null,
      year: 1981,
      durationMs: 245_000,
      fileSize: 41_000_000,
      dateAdded: 1_700_000_000_000,
      dateModified: 1_700_000_000_000,
    });
  });

  it('turns blank tags into null rather than empty strings', () => {
    const row = fromMediaStore(mediaStoreRow({ artist: '   ', album: '', genre: null }));
    expect(row.artistName).toBeNull();
    expect(row.albumName).toBeNull();
    expect(row.genre).toBeNull();
  });

  it('drops a zero year instead of showing year 0', () => {
    expect(fromMediaStore(mediaStoreRow({ year: 0 })).year).toBeNull();
  });

  it('survives a row with nothing but a file name', () => {
    const row = fromMediaStore(
      mediaStoreRow({
        title: null,
        artist: null,
        album: null,
        albumArtist: null,
        genre: null,
        year: null,
        trackNumberRaw: null,
        size: 0,
      }),
    );
    expect(row.title).toBe('03 - Gülpembe');
    expect(row.fileSize).toBeNull();
    expect(row.trackNo).toBeNull();
  });
});

describe("MediaStore's <unknown> placeholder", () => {
  it('becomes null rather than an artist called <unknown>', () => {
    // Stored as-is it gets an `artists` row, tops the statistics for anyone
    // with a folder of untagged files, and makes the balanced shuffle treat
    // every untagged track as the same act.
    const row = fromMediaStore(
      mediaStoreRow({ artist: '<unknown>', album: '<unknown>', albumArtist: '<unknown>' }),
    );
    expect(row.artistName).toBeNull();
    expect(row.albumName).toBeNull();
    expect(row.albumArtist).toBeNull();
  });

  it('is matched case-insensitively and around whitespace', () => {
    expect(fromMediaStore(mediaStoreRow({ artist: '  <Unknown>  ' })).artistName).toBeNull();
  });

  it('does not touch a real artist whose name merely contains the word', () => {
    expect(fromMediaStore(mediaStoreRow({ artist: 'Unknown Mortal Orchestra' })).artistName).toBe(
      'Unknown Mortal Orchestra',
    );
  });
});

describe('fromTags', () => {
  it('returns null for a file that could not be opened', () => {
    expect(fromTags(tagRow({ error: 'setDataSource failed' }))).toBeNull();
  });

  it('maps the spec strip fields', () => {
    const enriched = fromTags(tagRow());
    expect(enriched).toMatchObject({
      artistName: 'Barış Manço',
      albumName: 'Sakla Samanı',
      albumArtist: 'Barış Manço',
      container: 'FLAC',
      // Null rather than 'flac': container and codec read the same MIME
      // subtype, so repeating it produced the strip "FLAC · flac".
      codec: null,
      bitrateKbps: 1006,
      sampleRateHz: 44_100,
      bitDepth: 16,
      channels: 2,
    });
  });

  it('leaves missing technical fields null rather than guessing', () => {
    // Below API 31 the retriever has no sample rate or bit depth.
    const enriched = fromTags(tagRow({ sampleRateHz: null, bitDepth: null, bitrateKbps: null }));
    expect(enriched?.sampleRateHz).toBeNull();
    expect(enriched?.bitDepth).toBeNull();
    expect(enriched?.bitrateKbps).toBeNull();
  });

  it('prefers an explicit disc number over the packed one', () => {
    expect(fromTags(tagRow({ trackNumberRaw: 5, discNumber: 2 }))?.discNo).toBe(2);
  });

  it('omits the title when the file has none, so MediaStore keeps its own', () => {
    expect(fromTags(tagRow({ title: null }))).not.toHaveProperty('title');
  });

  it('keeps missing collection tags null so they become one fallback category', () => {
    const enriched = fromTags(tagRow({ artist: null, album: null, albumArtist: null }));
    expect(enriched).toMatchObject({
      artistName: null,
      albumName: null,
      albumArtist: null,
    });
  });
});

describe('containerOf', () => {
  it('names the common containers the way a listener would', () => {
    expect(containerOf('audio/flac')).toBe('FLAC');
    expect(containerOf('audio/mpeg')).toBe('MP3');
    expect(containerOf('audio/x-wav')).toBe('WAV');
    expect(containerOf('audio/opus')).toBe('Opus');
  });

  it('falls back to the subtype for anything unknown', () => {
    expect(containerOf('audio/weirdcodec')).toBe('WEIRDCODEC');
  });

  it('returns null when there is no mime type', () => {
    expect(containerOf(null)).toBeNull();
  });
});

describe('codecOf', () => {
  it('is null when the container name already says it', () => {
    // Both read the same MIME subtype, so `audio/mpeg` gave "MP3 · mpeg" —
    // the identical fact spelled worse.
    expect(codecOf('audio/mpeg')).toBeNull();
    expect(codecOf('audio/flac')).toBeNull();
    expect(codecOf('audio/x-wav')).toBeNull();
    expect(codecOf('audio/mp4')).toBeNull();
  });

  it('is null for every format on the user Mi 9T, which is not a defect', () => {
    // Read from the device on 2026-08-01: `codec` null on all 521 rows while
    // `container` and the rest of the spec were populated. That was written up
    // as an unexplained finding twice. It is this function working: a library
    // of mainstream formats has a null codec on every row by design, because
    // the MIME subtype is already the container name. A non-null codec needs a
    // subtype outside CONTAINER_NAMES, which a FLAC/MP3/M4A library never has.
    for (const mime of ['audio/flac', 'audio/mp4', 'audio/mpeg']) {
      expect(codecOf(mime)).toBeNull();
      expect(containerOf(mime)).not.toBeNull();
    }
  });

  it('keeps a subtype nothing is known about', () => {
    expect(codecOf('audio/weird-new-thing')).toBe('weird-new-thing');
  });

  it('is null for a missing or malformed mime type', () => {
    expect(codecOf(null)).toBeNull();
    expect(codecOf('audio')).toBeNull();
  });
});

describe('isLossless', () => {
  it('separates lossless from lossy', () => {
    expect(isLossless('audio/flac')).toBe(true);
    expect(isLossless('audio/x-wav')).toBe(true);
    expect(isLossless('audio/mpeg')).toBe(false);
    expect(isLossless(null)).toBe(false);
  });
});

describe('needsRescan', () => {
  const existing = { fileSize: 41_000_000, dateModified: 1_700_000_000_000 };

  it('rescans anything it has never seen', () => {
    expect(needsRescan(null, existing)).toBe(true);
  });

  it('skips a file whose size and mtime are unchanged', () => {
    // This is what makes a rescan of an untouched library near-instant.
    expect(needsRescan(existing, { ...existing })).toBe(false);
  });

  it('rescans when the file was modified', () => {
    expect(needsRescan(existing, { ...existing, dateModified: 1_700_000_001_000 })).toBe(true);
  });

  it('rescans when the size changed even if the mtime did not', () => {
    // Tag edits in place can leave mtime alone on some filesystems.
    expect(needsRescan(existing, { ...existing, fileSize: 41_000_100 })).toBe(true);
  });
});
