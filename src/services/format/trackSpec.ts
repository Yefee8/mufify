/**
 * The technical strip: what this file actually is.
 *
 * "Technical metadata surfaced, not hidden" is one of the app's stated
 * reasons to exist, and the audience is people who care whether a file is
 * 24/96 FLAC or a 128 kbps MP3 someone renamed. Every field is nullable —
 * `MediaMetadataRetriever` returns nothing for sample rate and bit depth below
 * API 31, and an extractor may decline any field at any level — so the rule
 * throughout is to omit what is unknown rather than guess it.
 */

export interface TrackSpec {
  container: string | null;
  codec: string | null;
  bitrateKbps: number | null;
  sampleRateHz: number | null;
  bitDepth: number | null;
  channels: number | null;
  fileSize: number | null;
}

/** `44.1 kHz`, or `96 kHz` when it is a whole number. */
export function formatSampleRate(hz: number | null, locale: string): string | null {
  if (hz === null || hz <= 0) return null;

  const khz = hz / 1000;
  const formatted = new Intl.NumberFormat(locale, {
    maximumFractionDigits: khz % 1 === 0 ? 0 : 1,
  }).format(khz);

  return `${formatted} kHz`;
}

/** `16-bit`. Omitted rather than assumed — below API 31 nothing reports it. */
export function formatBitDepth(bits: number | null, locale: string): string | null {
  if (bits === null || bits <= 0) return null;
  return `${new Intl.NumberFormat(locale).format(bits)}-bit`;
}

/** `1,411 kbps`. */
export function formatBitrate(kbps: number | null, locale: string): string | null {
  if (kbps === null || kbps <= 0) return null;
  return `${new Intl.NumberFormat(locale).format(Math.round(kbps))} kbps`;
}

/**
 * Channel count as a word people use.
 *
 * `2` means stereo to a machine and nothing to a reader mid-glance. Beyond
 * surround the number is more informative than a name, so it stays a number.
 */
export function formatChannels(channels: number | null): string | null {
  if (channels === null || channels <= 0) return null;
  if (channels === 1) return 'Mono';
  if (channels === 2) return 'Stereo';
  return `${channels}ch`;
}

/**
 * File size in binary units, which is what a file manager shows.
 *
 * MB here means 1024², matching every other tool a person would check this
 * against. Being decimally correct and disagreeing with the file manager would
 * be a worse answer.
 */
export function formatFileSize(bytes: number | null, locale: string): string | null {
  if (bytes === null || bytes <= 0) return null;

  const units = ['B', 'KB', 'MB', 'GB'] as const;
  let value = bytes;
  let unit = 0;

  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }

  const formatted = new Intl.NumberFormat(locale, {
    maximumFractionDigits: unit === 0 || value >= 100 ? 0 : 1,
  }).format(value);

  return `${formatted} ${units[unit]}`;
}

/**
 * The strip, in reading order, with unknown fields dropped.
 *
 * Codec is omitted when it merely repeats the container — "FLAC · FLAC" is
 * noise, and the strip is meant to be scanned in one glance.
 */
export function specParts(spec: TrackSpec, locale: string): string[] {
  const codec =
    spec.codec && spec.codec.toLowerCase() !== spec.container?.toLowerCase() ? spec.codec : null;

  return [
    spec.container,
    codec,
    formatSampleRate(spec.sampleRateHz, locale),
    formatBitDepth(spec.bitDepth, locale),
    formatBitrate(spec.bitrateKbps, locale),
    formatChannels(spec.channels),
    formatFileSize(spec.fileSize, locale),
  ].filter((part): part is string => part !== null && part !== '');
}
