import {
  formatBitDepth,
  isLosslessContainer,
  formatBitrate,
  formatChannels,
  formatFileSize,
  formatSampleRate,
  specParts,
  type TrackSpec,
} from './trackSpec';

const EMPTY: TrackSpec = {
  container: null,
  codec: null,
  bitrateKbps: null,
  sampleRateHz: null,
  bitDepth: null,
  channels: null,
  fileSize: null,
};

describe('formatSampleRate', () => {
  it('drops the decimal when the rate is a whole number of kHz', () => {
    expect(formatSampleRate(96_000, 'en')).toBe('96 kHz');
    expect(formatSampleRate(48_000, 'en')).toBe('48 kHz');
  });

  it('keeps one decimal for CD rates', () => {
    expect(formatSampleRate(44_100, 'en')).toBe('44.1 kHz');
    expect(formatSampleRate(88_200, 'en')).toBe('88.2 kHz');
  });

  it('omits rather than guesses when unknown', () => {
    // Below API 31 nothing reports this. A zero would read as a real value.
    expect(formatSampleRate(null, 'en')).toBeNull();
    expect(formatSampleRate(0, 'en')).toBeNull();
  });
});

describe('formatBitDepth', () => {
  it('formats known depths', () => {
    expect(formatBitDepth(16, 'en')).toBe('16-bit');
    expect(formatBitDepth(24, 'en')).toBe('24-bit');
  });

  it('omits when unknown', () => {
    expect(formatBitDepth(null, 'en')).toBeNull();
    expect(formatBitDepth(0, 'en')).toBeNull();
  });
});

describe('formatBitrate', () => {
  it('groups thousands', () => {
    // 1,411 kbps is CD-quality PCM and the number people recognise.
    expect(formatBitrate(1411, 'en')).toBe('1,411 kbps');
  });

  it('rounds to whole kbps', () => {
    expect(formatBitrate(143.7, 'en')).toBe('144 kbps');
  });

  it('omits when unknown', () => {
    expect(formatBitrate(null, 'en')).toBeNull();
    expect(formatBitrate(0, 'en')).toBeNull();
  });
});

describe('formatChannels', () => {
  it('names the two everyone has', () => {
    expect(formatChannels(1)).toBe('Mono');
    expect(formatChannels(2)).toBe('Stereo');
  });

  it('keeps the number past stereo, where it is more informative than a name', () => {
    expect(formatChannels(6)).toBe('6ch');
  });

  it('omits when unknown', () => {
    expect(formatChannels(null)).toBeNull();
    expect(formatChannels(0)).toBeNull();
  });
});

describe('formatFileSize', () => {
  it('uses binary units, matching what a file manager shows', () => {
    expect(formatFileSize(1024, 'en')).toBe('1 KB');
    expect(formatFileSize(1024 * 1024, 'en')).toBe('1 MB');
    expect(formatFileSize(41 * 1024 * 1024, 'en')).toBe('41 MB');
  });

  it('keeps one decimal until the number is large enough not to need it', () => {
    expect(formatFileSize(Math.round(1.5 * 1024 * 1024), 'en')).toBe('1.5 MB');
    expect(formatFileSize(Math.round(120.4 * 1024 * 1024), 'en')).toBe('120 MB');
  });

  it('stops at GB rather than inventing a unit', () => {
    expect(formatFileSize(3 * 1024 ** 3, 'en')).toBe('3 GB');
    expect(formatFileSize(2048 * 1024 ** 3, 'en')).toBe('2,048 GB');
  });

  it('omits when unknown', () => {
    expect(formatFileSize(null, 'en')).toBeNull();
    expect(formatFileSize(0, 'en')).toBeNull();
  });
});

describe('specParts', () => {
  it('reads as a full hi-res strip when everything is known', () => {
    expect(
      specParts(
        {
          container: 'FLAC',
          codec: 'FLAC',
          bitrateKbps: 2304,
          sampleRateHz: 96_000,
          bitDepth: 24,
          channels: 2,
          fileSize: 41 * 1024 * 1024,
        },
        'en',
      ),
    ).toEqual(['FLAC', '96 kHz', '24-bit', '2,304 kbps', 'Stereo', '41 MB']);
  });

  it('drops a codec that only repeats the container', () => {
    // "FLAC · FLAC" is noise in a strip meant to be read in one glance.
    const parts = specParts({ ...EMPTY, container: 'FLAC', codec: 'flac' }, 'en');
    expect(parts).toEqual(['FLAC']);
  });

  it('keeps a codec that says something the container does not', () => {
    const parts = specParts({ ...EMPTY, container: 'MP4', codec: 'ALAC' }, 'en');
    expect(parts).toEqual(['MP4', 'ALAC']);
  });

  it('returns an empty strip rather than placeholders when nothing is known', () => {
    // The row then renders nothing, which is honest. A line of dashes would
    // suggest the file is odd rather than that the scan has not reached it.
    expect(specParts(EMPTY, 'en')).toEqual([]);
  });

  it('shows a partial strip below API 31, where depth and rate are absent', () => {
    expect(
      specParts(
        { ...EMPTY, container: 'MP3', codec: 'MP3', bitrateKbps: 320, channels: 2 },
        'en',
      ),
    ).toEqual(['MP3', '320 kbps', 'Stereo']);
  });
});

describe('isLosslessContainer', () => {
  it('recognises the containers this audience actually keeps', () => {
    for (const container of ['FLAC', 'ALAC', 'WAV', 'AIFF', 'APE', 'WavPack']) {
      expect(isLosslessContainer(container)).toBe(true);
    }
  });

  it('does not claim lossy formats', () => {
    for (const container of ['MP3', 'AAC', 'Opus', 'Vorbis', 'OGG', 'M4A']) {
      expect(isLosslessContainer(container)).toBe(false);
    }
  });

  it('says nothing when the container is unknown', () => {
    // Stage two may not have reached the row. Absence is not "lossy".
    expect(isLosslessContainer(null)).toBe(false);
    expect(isLosslessContainer('')).toBe(false);
  });
});
