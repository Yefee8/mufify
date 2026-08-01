import { Modal, Pressable, Text, View } from 'react-native';

import type { TrackListItem } from '@/db/queries/tracks';
import { useTrackSpec } from '@/db/queries/tracks';
import { formatDuration } from '@/services/format/duration';
import { useTranslation } from 'react-i18next';

export interface TrackInfoSheetProps {
  track: TrackListItem | null;
  onClose: () => void;
}

/**
 * Everything the file will admit to.
 *
 * The design direction says technical metadata is surfaced, not hidden, and this
 * is where that promise is kept in full — the spec strip on Now Playing is the
 * restrained one-line version, and this is the whole row.
 *
 * Every value is nullable and every one is rendered as `—` when absent rather
 * than omitted. Below API 31 `MediaMetadataRetriever` reports no sample rate or
 * bit depth, and stage two of the scan may not have reached the row yet; a field
 * that vanishes reads as a bug, while a field that says it does not know reads
 * as an answer.
 */
export function TrackInfoSheet({ track, onClose }: TrackInfoSheetProps) {
  const { t, i18n } = useTranslation();
  const spec = useTrackSpec(track?.id ?? null);

  const rows: [string, string][] = [
    [t('track.field.title'), track?.title ?? '—'],
    [t('track.field.artist'), track?.artistName ?? '—'],
    [t('track.field.album'), track?.albumName ?? '—'],
    [t('track.field.duration'), track ? formatDuration(track.durationMs, i18n.language) : '—'],
    [t('track.field.codec'), spec?.codec?.toUpperCase() ?? '—'],
    [t('track.field.container'), spec?.container ?? '—'],
    [t('track.field.bitrate'), spec?.bitrateKbps ? `${spec.bitrateKbps} kbps` : '—'],
    [
      t('track.field.sampleRate'),
      spec?.sampleRateHz ? `${(spec.sampleRateHz / 1_000).toFixed(1)} kHz` : '—',
    ],
    [t('track.field.bitDepth'), spec?.bitDepth ? `${spec.bitDepth} bit` : '—'],
    [t('track.field.channels'), spec?.channels ? String(spec.channels) : '—'],
    [t('track.field.fileSize'), spec?.fileSize ? formatBytes(spec.fileSize, i18n.language) : '—'],
  ];

  return (
    <Modal visible={track !== null} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={t('common.close')}
        className="flex-1 justify-end bg-surface/80"
      >
        <Pressable
          onPress={absorb}
          className="gap-4 rounded-md border border-subtle bg-surface-elevated p-5"
        >
          <Text className="font-body-semibold text-base text-primary">{t('track.info')}</Text>

          <View className="gap-2">
            {rows.map(([label, value]) => (
              <View key={label} className="flex-row items-baseline gap-4">
                <Text className="w-1/3 font-body text-sm text-muted">{label}</Text>
                {/* Mono for every technical value, so the column aligns. */}
                <Text numberOfLines={1} className="flex-1 font-mono text-sm text-primary">
                  {value}
                </Text>
              </View>
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/**
 * Bytes as MB, through `Intl` like every other number in the app.
 *
 * Decimal megabytes, not binary: it is what the file manager on the phone shows,
 * and disagreeing with the OS about a file's size to be technically correct
 * helps nobody.
 */
function formatBytes(bytes: number, locale: string): string {
  const mb = bytes / 1_000_000;
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(mb)} MB`;
}

function absorb(): void {
  // Stops a tap inside the sheet from reaching the dismissing scrim.
}
