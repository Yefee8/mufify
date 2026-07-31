import type { MediaStoreTrack, TrackTags } from 'audio-tags';

import {
  DEFAULT_SCAN_OPTIONS,
  enrichLibrary,
  enumerateLibrary,
  type ScanProgress,
  type ScannerPorts,
} from './scanner';
import type { EnrichedFields, ScannedTrack } from './trackMapping';

function row(id: number): MediaStoreTrack {
  return {
    mediaStoreId: String(id),
    uri: `content://media/external/audio/media/${id}`,
    displayName: `${id}.flac`,
    title: `Track ${id}`,
    artist: 'Artist',
    album: 'Album',
    albumArtist: 'Artist',
    genre: null,
    durationMs: 200_000,
    size: 30_000_000,
    dateAdded: 1_700_000_000_000,
    dateModified: 1_700_000_000_000,
    mimeType: 'audio/flac',
    trackNumberRaw: id,
    year: 1981,
  };
}

function tags(uri: string, overrides: Partial<TrackTags> = {}): TrackTags {
  return {
    uri,
    title: 'Track',
    artist: 'Artist',
    album: 'Album',
    albumArtist: 'Artist',
    genre: 'Rock',
    trackNumberRaw: 1,
    discNumber: null,
    year: 1981,
    durationMs: 200_000,
    bitrateKbps: 1006,
    sampleRateHz: 44_100,
    bitDepth: 16,
    channels: 2,
    mimeType: 'audio/flac',
    artworkPath: '/cache/a-512.jpg',
    artworkThumbPath: '/cache/a-128.jpg',
    error: null,
    ...overrides,
  };
}

interface Harness {
  ports: ScannerPorts;
  saved: ScannedTrack[];
  /** URIs handed to `retireUnseen`, or null when it was never called. */
  retired: { seen: string[] } | null;
  enriched: { fileUri: string; fields: EnrichedFields }[];
  yields: number;
  queries: { limit: number; offset: number }[];
}

function harness(library: MediaStoreTrack[], pending: string[] = []): Harness {
  const saved: ScannedTrack[] = [];
  const enriched: { fileUri: string; fields: EnrichedFields }[] = [];
  const queries: { limit: number; offset: number }[] = [];
  const queue = [...pending];
  const state = { yields: 0, retired: null as { seen: string[] } | null };

  const ports: ScannerPorts = {
    countAudioFiles: async () => library.length,
    queryAudioFiles: async ({ limit, offset }) => {
      queries.push({ limit, offset });
      return library.slice(offset, offset + limit);
    },
    readTags: async (uris) => uris.map((uri) => tags(uri)),
    retireUnseen: async (seen) => {
      state.retired = { seen };
    },
    saveEnumerated: async (rows) => {
      saved.push(...rows);
    },
    saveEnriched: async (rows) => {
      enriched.push(...rows);
    },
    listUnenrichedUris: async (limit) => queue.splice(0, limit),
    yieldToUi: async () => {
      state.yields += 1;
    },
  };

  return {
    ports,
    saved,
    enriched,
    queries,
    get yields() {
      return state.yields;
    },
    get retired() {
      return state.retired;
    },
  };
}

const options = { ...DEFAULT_SCAN_OPTIONS, enumerateBatchSize: 10, enrichBatchSize: 4 };

describe('enumerateLibrary', () => {
  it('pages through the whole library', async () => {
    const library = Array.from({ length: 25 }, (_, index) => row(index + 1));
    const test = harness(library);

    const result = await enumerateLibrary(test.ports, options, () => {});

    expect(result.phase).toBe('done');
    expect(test.saved).toHaveLength(25);
    expect(test.queries.map((query) => query.offset)).toEqual([0, 10, 20]);
  });

  it('stops asking once a short page proves the cursor is exhausted', async () => {
    // 25 rows over a page size of 10: the third page returns 5, so a fourth
    // query would cost a round trip to learn nothing.
    const test = harness(Array.from({ length: 25 }, (_, index) => row(index + 1)));
    await enumerateLibrary(test.ports, options, () => {});
    expect(test.queries).toHaveLength(3);
  });

  it('handles an empty library without reporting failure', async () => {
    const test = harness([]);
    const result = await enumerateLibrary(test.ports, options, () => {});

    expect(result.phase).toBe('done');
    expect(result.total).toBe(0);
    expect(test.saved).toHaveLength(0);
  });

  it('yields between pages so scrolling survives a scan', async () => {
    const test = harness(Array.from({ length: 25 }, (_, index) => row(index + 1)));
    await enumerateLibrary(test.ports, options, () => {});
    expect(test.yields).toBe(3);
  });

  it('reports total before it reports progress', async () => {
    const test = harness(Array.from({ length: 25 }, (_, index) => row(index + 1)));
    const seen: ScanProgress[] = [];

    await enumerateLibrary(test.ports, options, (progress) => seen.push({ ...progress }));

    expect(seen[0]?.phase).toBe('enumerating');
    expect(seen[1]?.total).toBe(25);
    expect(seen.at(-1)?.phase).toBe('done');
    expect(seen.at(-1)?.processed).toBe(25);
  });

  it('stops promptly when cancelled and keeps what it already wrote', async () => {
    const test = harness(Array.from({ length: 100 }, (_, index) => row(index + 1)));
    let pages = 0;
    const controller = { isCancelled: () => pages++ >= 2 };

    const result = await enumerateLibrary(test.ports, options, () => {}, controller);

    expect(result.phase).toBe('cancelled');
    expect(test.saved.length).toBeGreaterThan(0);
    expect(test.saved.length).toBeLessThan(100);
  });

  it('surfaces a failure instead of pretending it finished', async () => {
    const test = harness([row(1)]);
    test.ports.queryAudioFiles = async () => {
      throw new Error('MediaStore unavailable');
    };

    const result = await enumerateLibrary(test.ports, options, () => {});

    expect(result.phase).toBe('failed');
    expect(result.error).toBe('MediaStore unavailable');
  });
});

describe('enrichLibrary', () => {
  const pending = Array.from(
    { length: 9 },
    (_, index) => `content://media/external/audio/media/${index + 1}`,
  );

  it('drains the queue in batches', async () => {
    const test = harness([], [...pending]);

    const result = await enrichLibrary(test.ports, options, () => {});

    expect(result.phase).toBe('done');
    expect(test.enriched).toHaveLength(9);
    expect(result.processed).toBe(9);
  });

  it('writes each batch before starting the next', async () => {
    // A scan killed halfway must keep what it already did.
    const test = harness([], [...pending]);
    const sizesAtYield: number[] = [];
    test.ports.yieldToUi = async () => {
      sizesAtYield.push(test.enriched.length);
    };

    await enrichLibrary(test.ports, options, () => {});

    expect(sizesAtYield).toEqual([4, 8, 9]);
  });

  it('skips a file that will not open rather than aborting the scan', async () => {
    const test = harness([], [...pending]);
    test.ports.readTags = async (uris) =>
      uris.map((uri, index) =>
        index === 0 ? tags(uri, { error: 'setDataSource failed' }) : tags(uri),
      );

    const result = await enrichLibrary(test.ports, options, () => {});

    expect(result.phase).toBe('done');
    // One per batch failed and was dropped, but every URI still counted.
    expect(test.enriched.length).toBe(6);
    expect(result.processed).toBe(9);
  });

  it('does nothing when there is nothing left to enrich', async () => {
    const test = harness([], []);
    const result = await enrichLibrary(test.ports, options, () => {});

    expect(result.phase).toBe('done');
    expect(test.enriched).toHaveLength(0);
  });

  it('stops when cancelled', async () => {
    const test = harness(
      [],
      Array.from({ length: 100 }, (_, index) => `uri-${index}`),
    );
    let batches = 0;
    const controller = { isCancelled: () => batches++ >= 2 };

    const result = await enrichLibrary(test.ports, options, () => {}, controller);

    expect(result.phase).toBe('cancelled');
    expect(test.enriched.length).toBeGreaterThan(0);
    expect(test.enriched.length).toBeLessThan(100);
  });

  it('surfaces a failure', async () => {
    const test = harness([], [...pending]);
    test.ports.readTags = async () => {
      throw new Error('retriever exploded');
    };

    const result = await enrichLibrary(test.ports, options, () => {});

    expect(result.phase).toBe('failed');
    expect(result.error).toBe('retriever exploded');
  });
});

/** A library of `count` sequential tracks. */
function rows(count: number): MediaStoreTrack[] {
  return Array.from({ length: count }, (_, index) => row(index + 1));
}

describe('retiring tracks the sweep did not see', () => {
  it('hands every seen URI over after a complete sweep', async () => {
    const bench = harness(rows(25));
    await enumerateLibrary(bench.ports, options, () => {});

    expect(bench.retired?.seen).toHaveLength(25);
    expect(bench.retired?.seen[0]).toBe('content://media/external/audio/media/1');
  });

  it('does not retire anything when the scan was cancelled', async () => {
    // A cancelled sweep has not seen the whole library. Acting on its partial
    // result would mark most of the library missing — the library would
    // appear to empty itself because someone pressed Stop.
    const bench = harness(rows(50));
    let pages = 0;
    const cancelAfterFirstPage = {
      isCancelled: () => {
        pages += 1;
        return pages > 1;
      },
    };

    await enumerateLibrary(bench.ports, options, () => {}, cancelAfterFirstPage);
    expect(bench.retired).toBeNull();
  });

  it('does not retire anything when the sweep threw', async () => {
    const bench = harness(rows(10));
    const failing: ScannerPorts = {
      ...bench.ports,
      queryAudioFiles: async () => {
        throw new Error('cursor closed');
      },
    };

    const result = await enumerateLibrary(failing, options, () => {});
    expect(result.phase).toBe('failed');
    expect(bench.retired).toBeNull();
  });

  it('still retires on an empty library, so a deleted last track disappears', async () => {
    // The query layer refuses an empty seen set — that is where "the
    // permission was revoked" is handled — but the scanner must still make
    // the call rather than deciding for it.
    const bench = harness([]);
    await enumerateLibrary(bench.ports, options, () => {});
    expect(bench.retired?.seen).toEqual([]);
  });
});
