import { Share2, X } from 'lucide-react-native';
import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Modal,
  Pressable,
  Text,
  useWindowDimensions,
  View,
  type HostInstance,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { panelInset } from '@/components/ui/panelInset';
import { SegmentedControl, type SegmentedControlOption } from '@/components/ui/SegmentedControl';
import { usePeriodTotals, useTopArtists, useTopTracks } from '@/db/queries/stats';
import { getWeekStart } from '@/services/settings';
import { periodKeys } from '@/services/stats/periodKeys';
import { periodLabel } from '@/services/stats/periodLabel';
import { PERIOD_TYPES, type PeriodType } from '@/services/stats/rollups';
import { SPACING } from '@/theme/tokens';
import { useThemeColors } from '@/theme/useTheme';

import { useShareCard } from '../hooks/useShareCard';
import { SHARE_CARD_HEIGHT, SHARE_CARD_WIDTH, ShareCard } from './ShareCard';

export interface ShareStatsSheetProps {
  visible: boolean;
  /** The period the stats screen is showing, so the sheet opens on it. */
  initialPeriod: PeriodType;
  onClose: () => void;
}

/** Room the sheet keeps around the preview: its own chrome, controls and padding. */
const SHEET_CHROME = 280;

/**
 * Pick a week, a month or a year, see the picture, share it.
 *
 * The preview is the card itself, drawn at its real size and scaled down for
 * the screen — so what is captured is exactly what was seen, at full
 * resolution rather than a blown-up thumbnail.
 */
export function ShareStatsSheet({ visible, initialPeriod, onClose }: ShareStatsSheetProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {/* Mounted only while open: the queries below run for the sheet, not the tab. */}
      {visible ? <ShareStatsBody initialPeriod={initialPeriod} onClose={onClose} /> : null}
    </Modal>
  );
}

interface ShareStatsBodyProps {
  initialPeriod: PeriodType;
  onClose: () => void;
}

function ShareStatsBody({ initialPeriod, onClose }: ShareStatsBodyProps) {
  const { t, i18n } = useTranslation();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [period, setPeriod] = useState<PeriodType>(initialPeriod);

  const now = useMemo(() => new Date(), []);
  const weekStart = getWeekStart();
  const key = useMemo(() => periodKeys(now, weekStart)[period], [now, weekStart, period]);
  const totals = usePeriodTotals(period, key);
  const topTracks = useTopTracks(period, key, 3);
  const topArtists = useTopArtists(period, key, 3);

  const cardRef = useRef<HostInstance>(null);
  const { sharing, share } = useShareCard(cardRef);
  const empty = totals.playCount === 0 && totals.msPlayed === 0;

  // Scaled to whatever the window leaves: a phone, a tablet, sideways.
  const scale = Math.min(
    (width - SPACING[6] * 2 - insets.left - insets.right) / SHARE_CARD_WIDTH,
    (height - SHEET_CHROME - insets.top - insets.bottom) / SHARE_CARD_HEIGHT,
    1,
  );

  const options: SegmentedControlOption<PeriodType>[] = PERIOD_TYPES.map((value) => ({
    value,
    label: t(`stats.share.period.${value}`),
  }));

  return (
    <View className="flex-1 justify-end bg-surface/80">
      <View
        style={panelInset(insets, { bottom: SPACING[5], side: SPACING[5] })}
        className="items-center gap-4 rounded-md border border-subtle bg-surface-elevated pt-4"
      >
        <View className="w-full flex-row items-center justify-between">
          <Text className="font-body-semibold text-base text-primary">
            {t('stats.share.title')}
          </Text>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
            className="min-h-11 min-w-11 items-center justify-center"
          >
            <X color={colors.legend} size={22} strokeWidth={2} />
          </Pressable>
        </View>

        <View className="w-full">
          <SegmentedControl
            options={options}
            value={period}
            onChange={setPeriod}
            accessibilityLabel={t('stats.period.label')}
          />
        </View>

        {/* The card at full size, scaled from its top-left corner into this box. */}
        <View
          style={{ width: SHARE_CARD_WIDTH * scale, height: SHARE_CARD_HEIGHT * scale }}
          className="overflow-hidden rounded-md border border-subtle"
        >
          <View style={{ transform: [{ scale }], transformOrigin: 'top left' }}>
            <ShareCard
              cardRef={cardRef}
              periodLabel={periodLabel(period, now, weekStart, i18n.language)}
              totals={totals}
              topTracks={topTracks}
              topArtists={topArtists}
            />
          </View>
        </View>

        <Pressable
          onPress={share}
          disabled={empty || sharing}
          accessibilityRole="button"
          accessibilityState={{ disabled: empty || sharing }}
          accessibilityLabel={t('stats.share.action')}
          className={
            empty
              ? 'min-h-11 w-full flex-row items-center justify-center gap-2 rounded-sm border border-subtle px-4'
              : 'min-h-11 w-full flex-row items-center justify-center gap-2 rounded-sm bg-accent px-4'
          }
        >
          <Share2 color={empty ? colors.legend : colors.onSignal} size={18} strokeWidth={2} />
          <Text
            className={
              empty
                ? 'font-body-medium text-base text-muted'
                : 'font-body-medium text-base text-on-accent'
            }
          >
            {empty ? t('stats.share.nothing') : t('stats.share.action')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
