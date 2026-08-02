import { BarChart3, Disc3, ListMusic, Music, User } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';

import { EmptyState } from '@/components/ui/EmptyState';
import { Screen } from '@/components/ui/Screen';
import { SegmentedControl, type SegmentedControlOption } from '@/components/ui/SegmentedControl';
import {
  usePeriodTotals,
  useTopAlbums,
  useTopArtists,
  useTopPlaylists,
  useTopTracks,
} from '@/db/queries/stats';
import { useMiniPlayerInset } from '@/features/player/playerLayerLayout';
import { useMessages } from '@/i18n';
import { useLifecycleTrace } from '@/services/perf/useLifecycleTrace';
import { getWeekStart } from '@/services/settings';
import { periodKeys } from '@/services/stats/periodKeys';
import { PERIOD_TYPES, type PeriodType } from '@/services/stats/rollups';
import { SPACING } from '@/theme/tokens';

import { StatTotals } from './components/StatTotals';
import { TopList } from './components/TopList';
import { Wrapped } from './components/Wrapped';

/**
 * Listening statistics, computed on-device from the user's own history.
 *
 * Reads `stats_rollups` only. Aggregating `play_events` here would be a scan
 * over the whole listening history on every tab switch, growing forever — see
 * `docs/stats.md`.
 *
 * The Wrapped card leads, then the tiles, then the four ranked lists. That order
 * is deliberate: the summary answers the question people open this tab for, and
 * everything below it is there for whoever wants to keep reading.
 */
export function StatsScreen() {
  useLifecycleTrace('StatsScreen');
  const { t } = useTranslation();
  const messages = useMessages('stats.empty');
  const bottomInset = useMiniPlayerInset();
  const [period, setPeriod] = useState<PeriodType>('week');

  // The key for "now" in the selected period. Recomputed per render rather
  // than stored: the app can be left open across midnight on a Sunday.
  const periodKey = useMemo(() => periodKeys(new Date(), getWeekStart())[period], [period]);

  const totals = usePeriodTotals(period, periodKey);
  const topTracks = useTopTracks(period, periodKey);
  const topArtists = useTopArtists(period, periodKey);
  const topAlbums = useTopAlbums(period, periodKey);
  const topPlaylists = useTopPlaylists(period, periodKey);

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
        <ScrollView
          contentContainerStyle={{
            gap: SPACING[8],
            paddingHorizontal: SPACING[6],
            paddingBottom: SPACING[16] + bottomInset,
          }}
        >
          <Wrapped
            period={period}
            totals={totals}
            topTrack={topTracks[0]}
            topArtist={topArtists[0]}
            unknownArtist={t('common.unknownArtist')}
          />

          <StatTotals totals={totals} />

          <TopList title={t('stats.topTracks')} entries={topTracks} icon={Music} />
          <TopList
            title={t('stats.topArtists')}
            entries={topArtists}
            icon={User}
            unknownTitle={t('common.unknownArtist')}
          />
          <TopList
            title={t('stats.topAlbums')}
            entries={topAlbums}
            icon={Disc3}
            unknownTitle={t('common.unknownAlbum')}
          />
          <TopList title={t('stats.topPlaylists')} entries={topPlaylists} icon={ListMusic} />
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
