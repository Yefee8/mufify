import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { useTrackSpec } from '@/db/queries/tracks';
import { isLosslessContainer, specParts } from '@/services/format/trackSpec';

export interface SpecStripProps {
  trackId: number | null;
}

/**
 * What this file actually is: container, rate, depth, bitrate, channels, size.
 *
 * "Technical metadata surfaced, not hidden" is one of the app's stated reasons
 * to exist. The audience is people who want to know whether they are hearing
 * 24/96 FLAC or a 128 kbps MP3 someone renamed, and every other player buries
 * this three menus deep or drops it entirely.
 *
 * Renders nothing when nothing is known. Placeholders would suggest the file
 * is odd rather than that stage two of the scan has not reached it yet.
 */
export function SpecStrip({ trackId }: SpecStripProps) {
  const { t, i18n } = useTranslation();
  const spec = useTrackSpec(trackId);

  if (spec === null) return null;

  const parts = specParts(spec, i18n.language);
  if (parts.length === 0) return null;

  const lossless = isLosslessContainer(spec.container);

  return (
    <View className="gap-2">
      {/*
        The badge gets its own line rather than sharing one with the specs.
        Sitting inline it read as the first item in the list — "Lossless, FLAC,
        44.1 kHz" — when it is a verdict *about* that list, not a member of it.
        Above, it labels what follows.

        "Is this the real thing or a transcode someone renamed" is the first
        question this audience has about a file, and the container answers it
        without any bitrate arithmetic.
      */}
      {lossless ? (
        <View className="flex-row">
          <View className="rounded-xs border border-accent px-2 py-1">
            <Text className="font-mono-medium text-sm text-accent">{t('player.lossless')}</Text>
          </View>
        </View>
      ) : null}

      <View className="flex-row flex-wrap items-center gap-2">
        {parts.map((part, index) => (
          <View key={part} className="flex-row items-center gap-2">
            {/* A separator between, never leading — mono so the strip aligns. */}
            {index > 0 ? <Text className="font-mono text-sm text-muted">·</Text> : null}
            <Text className="font-mono text-sm text-muted">{part}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
