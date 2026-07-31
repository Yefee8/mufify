import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import type { PeriodTotals } from '@/db/queries/stats';
import { formatListeningTime } from '@/services/format/listeningTime';

export interface StatTotalsProps {
  totals: PeriodTotals;
}

/** The headline numbers for the selected period. */
export function StatTotals({ totals }: StatTotalsProps) {
  const { t, i18n } = useTranslation();

  return (
    <View className="flex-row gap-3">
      <Figure
        value={formatListeningTime(totals.msPlayed, i18n.language)}
        label={t('stats.totals.listening')}
      />
      <Figure
        value={new Intl.NumberFormat(i18n.language).format(totals.playCount)}
        label={t('stats.totals.plays')}
      />
      <Figure
        value={new Intl.NumberFormat(i18n.language).format(totals.trackCount)}
        label={t('stats.totals.tracks')}
      />
    </View>
  );
}

interface FigureProps {
  value: string;
  label: string;
}

function Figure({ value, label }: FigureProps) {
  return (
    <View className="flex-1 gap-1 rounded-md border border-subtle bg-surface-elevated p-4">
      {/* Mono for every technical value, so the three columns align. */}
      <Text numberOfLines={1} className="font-mono-medium text-xl text-primary">
        {value}
      </Text>
      <Text className="font-body text-sm text-muted">{label}</Text>
    </View>
  );
}
