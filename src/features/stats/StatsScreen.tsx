import { BarChart3 } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';

import { EmptyState } from '@/components/ui/EmptyState';
import { Screen } from '@/components/ui/Screen';
import { SegmentedControl, type SegmentedControlOption } from '@/components/ui/SegmentedControl';
import { usePeriodTotals, useTopArtists, useTopTracks } from '@/db/queries/stats';
import { useMessages } from '@/i18n';
import { getWeekStart } from '@/services/settings';
import { periodKeys } from '@/services/stats/periodKeys';
import { PERIOD_TYPES, type PeriodType } from '@/services/stats/rollups';

import { StatTotals } from './components/StatTotals';
import { TopList } from './components/TopList';

/**
 * Listening statistics, computed on-device from the user's own history.
 *
 * Reads `stats_rollups` only. Aggregating `play_events` here would be a scan
 * over the whole listening history on every tab switch, growing forever — see
 * `docs/stats.md`.
 */
export function StatsScreen() {
  const { t } = useTranslation();
  const messages = useMessages('stats.empty');
  const [period, setPeriod] = useState<PeriodType>('week');

  // The key for "now" in the selected period. Recomputed per render rather
  // than stored: the app can be left open across midnight on a Sunday.
  const periodKey = useMemo(() => periodKeys(new Date(), getWeekStart())[period], [period]);

  const totals = usePeriodTotals(period, periodKey);
  const topTracks = useTopTracks(period, periodKey);
  const topArtists = useTopArtists(period, periodKey);

  const periodOptions: SegmentedControlOption<PeriodType>[] = PERIOD_TYPES.map((value) => ({
    value,
    label: t(`stats.period.${value}`),
  }));

  const hasData = totals.playCount > 0 || totals.msPlayed > 0;

  return (
    <Screen title={t('stats.title')}>
      <View className="px-6 pb-4">
        <SegmentedControl
          options={periodOptions}
          value={period}
          onChange={setPeriod}
          accessibilityLabel={t('stats.period.label')}
        />
      </View>

      {hasData ? (
        <ScrollView contentContainerClassName="gap-8 px-6 pb-16">
          <StatTotals totals={totals} />
          <TopList title={t('stats.topTracks')} entries={topTracks} />
          <TopList title={t('stats.topArtists')} entries={topArtists} />
        </ScrollView>
      ) : (
        /*
          Empty here means "nothing played in this period", which is not the
          same as "no history at all" — switching to Year usually finds
          something. The message says so rather than implying it is broken.
        */
        <EmptyState icon={BarChart3} messages={messages} />
      )}
    </Screen>
  );
}
