import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import type { PeriodTotals, TopEntry } from '@/db/queries/stats';
import { formatListeningTime } from '@/services/format/listeningTime';
import type { PeriodType } from '@/services/stats/rollups';

export interface WrappedProps {
  period: PeriodType;
  totals: PeriodTotals;
  topTrack: TopEntry | undefined;
  topArtist: TopEntry | undefined;
  unknownArtist: string;
}

/**
 * The period in one card.
 *
 * The brief asks for a summary "worth screenshotting", and the thing that makes
 * one worth screenshotting is a single sentence a person would actually repeat.
 * Nobody says "my top-ten had a Gini coefficient of 0.4"; they say "I listened
 * to four hours and it was mostly one album".
 *
 * So it leads with the listening time in the display face at a size nothing else
 * on the screen uses, and follows with two facts underneath. Everything more
 * granular lives in the ranked lists below it, which is the right place for
 * detail — this is the headline.
 *
 * Deliberately not a gradient, a collage, or a share sheet. The design direction
 * rules out the first two by name, and the third would need an outward-facing
 * intent in an app whose whole promise is that nothing leaves the device. A
 * screenshot is already the share mechanism, and it needs no permission.
 */
export function Wrapped({ period, totals, topTrack, topArtist, unknownArtist }: WrappedProps) {
  const { t, i18n } = useTranslation();

  const time = formatListeningTime(totals.msPlayed, i18n.language);
  const number = (value: number) => new Intl.NumberFormat(i18n.language).format(value);

  return (
    <View className="gap-5 rounded-md border border-subtle bg-surface-elevated p-5">
      <View className="gap-1">
        <Text className="font-body-semibold text-sm text-muted">
          {t(`stats.wrapped.${period}`)}
        </Text>
        {/*
          The one number the card exists for, in the display face. Indigo, which
          the design direction reserves for what is active or important — and on
          this screen nothing else competes for it.
        */}
        <Text className="font-display text-5xl text-accent">{time}</Text>
        <Text className="font-body text-sm text-muted">
          {t('stats.wrapped.across', {
            plays: number(totals.playCount),
            tracks: number(totals.trackCount),
            count: totals.trackCount,
          })}
        </Text>
      </View>

      {/* Absent rather than blank when a period has no clear leader yet. */}
      {topTrack || topArtist ? (
        <View className="gap-3 border-t border-subtle pt-4">
          {topTrack ? (
            <Fact label={t('stats.wrapped.mostPlayed')} value={topTrack.title ?? unknownArtist} />
          ) : null}
          {topArtist ? (
            <Fact label={t('stats.wrapped.mostHeard')} value={topArtist.title ?? unknownArtist} />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

interface FactProps {
  label: string;
  value: string;
}

function Fact({ label, value }: FactProps) {
  return (
    <View className="gap-1">
      <Text className="font-body text-sm text-muted">{label}</Text>
      <Text numberOfLines={1} className="font-body-medium text-base text-primary">
        {value}
      </Text>
    </View>
  );
}
