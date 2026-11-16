import { Image } from 'expo-image';
import { Music } from 'lucide-react-native';
import type { Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View, type HostInstance } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import type { PeriodTotals, TopEntry } from '@/db/queries/stats';
import { formatListeningTime } from '@/services/format/listeningTime';
import { useTimeUnits } from '@/services/format/useTimeUnits';
import { useThemeColors } from '@/theme/useTheme';

/** The card's own size, in points: 9:16, a story's shape. Captured at 1080×1920. */
export const SHARE_CARD_WIDTH = 360;
export const SHARE_CARD_HEIGHT = 640;

export interface ShareCardProps {
  /** What `captureRef` reads. The card is drawn at full size whatever the preview shows. */
  cardRef: Ref<HostInstance>;
  /** "16–22 November 2026": a shared picture is read long after "this week". */
  periodLabel: string;
  totals: PeriodTotals;
  topTracks: readonly TopEntry[];
  topArtists: readonly TopEntry[];
}

/**
 * A period of listening, as a picture worth posting.
 *
 * Its own design rather than a screenshot of the stats screen: a story is
 * 9:16, seen for a few seconds, by people who do not have the app. So it says
 * one big thing — how long — then the record that led the period with its
 * cover, then the top three of each, and the app's mark. It is drawn with the
 * same tokens as everything else, so it follows the theme, and every word goes
 * through `t()`, so it follows the language.
 */
export function ShareCard({ cardRef, periodLabel, totals, topTracks, topArtists }: ShareCardProps) {
  const { t, i18n } = useTranslation();
  const units = useTimeUnits();
  const colors = useThemeColors();

  const number = (value: number) => new Intl.NumberFormat(i18n.language).format(value);
  const leader = topTracks[0];

  return (
    <View
      ref={cardRef}
      collapsable={false}
      style={{ width: SHARE_CARD_WIDTH, height: SHARE_CARD_HEIGHT }}
      className="justify-between bg-surface p-6"
    >
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          {/* The launcher icon's curve: the mark, without a box around it. */}
          <Svg width={28} height={28} viewBox="0 0 24 24">
            <Path
              d="M4.5 18C6 10 7.6 6 9 6C10.7 6 10.2 13 12 13C13.8 13 13.3 6 15 6C16.4 6 18 10 19.5 18"
              stroke={colors.signal}
              strokeWidth={2.2}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </Svg>
          <Text className="font-display text-lg text-primary">Mufify</Text>
        </View>
        <Text numberOfLines={1} className="ml-4 flex-1 text-right font-body text-sm text-muted">
          {periodLabel}
        </Text>
      </View>

      <View className="gap-1">
        <Text className="font-body-semibold text-sm text-muted">{t('stats.share.listened')}</Text>
        <Text numberOfLines={1} adjustsFontSizeToFit className="font-display text-6xl text-accent">
          {formatListeningTime(totals.msPlayed, i18n.language, units)}
        </Text>
        <Text className="font-mono text-sm text-muted">
          {t('stats.wrapped.across', {
            plays: number(totals.playCount),
            tracks: number(totals.trackCount),
            count: totals.trackCount,
          })}
        </Text>
      </View>

      {leader ? (
        <View className="flex-row items-center gap-4">
          {leader.artworkPath ? (
            <Image
              source={{ uri: `file://${leader.artworkPath}` }}
              recyclingKey={`share-${leader.id}`}
              cachePolicy="memory-disk"
              contentFit="cover"
              transition={0}
              className="h-16 w-16 rounded-md"
            />
          ) : (
            <View className="h-16 w-16 items-center justify-center rounded-md bg-surface-elevated">
              <Music color={colors.legend} size={32} strokeWidth={1.5} />
            </View>
          )}
          <View className="flex-1 gap-1">
            <Text className="font-body text-sm text-muted">{t('stats.wrapped.mostPlayed')}</Text>
            <Text numberOfLines={2} className="font-display text-xl text-primary">
              {leader.title ?? t('common.unknownArtist')}
            </Text>
            {leader.subtitle ? (
              <Text numberOfLines={1} className="font-body text-sm text-muted">
                {leader.subtitle}
              </Text>
            ) : null}
          </View>
        </View>
      ) : (
        <View />
      )}

      <View className="flex-row gap-4">
        <Ranked
          title={t('stats.topArtists')}
          entries={topArtists}
          unknown={t('common.unknownArtist')}
        />
        <Ranked
          title={t('stats.topTracks')}
          entries={topTracks}
          unknown={t('common.unknownArtist')}
        />
      </View>

      <Text className="font-body text-xs text-muted">{t('stats.share.footer')}</Text>
    </View>
  );
}

interface RankedProps {
  title: string;
  entries: readonly TopEntry[];
  unknown: string;
}

/** A top three, numbered. Absent entries are simply not drawn. */
function Ranked({ title, entries, unknown }: RankedProps) {
  return (
    <View className="flex-1 gap-2">
      <Text className="font-body-semibold text-sm text-muted">{title}</Text>
      {entries.slice(0, 3).map((entry, index) => (
        <View key={entry.id} className="flex-row gap-2">
          <Text className="font-mono text-sm text-accent">{index + 1}</Text>
          <Text numberOfLines={1} className="flex-1 font-body-medium text-sm text-primary">
            {entry.title ?? unknown}
          </Text>
        </View>
      ))}
    </View>
  );
}
