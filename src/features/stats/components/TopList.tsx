import { Image } from 'expo-image';
import type { LucideIcon } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import type { TopEntry } from '@/db/queries/stats';
import { formatListeningTime } from '@/services/format/listeningTime';
import { useThemeColors } from '@/theme/useTheme';

export interface TopListProps {
  /** Already translated. */
  title: string;
  entries: readonly TopEntry[];
  /** Drawn when an entry has no cover. Says what kind of thing this list holds. */
  icon: LucideIcon;
  /** Used only by the reserved unknown artist or album row. */
  unknownTitle?: string;
}

/**
 * A ranked list — top tracks, artists, albums or playlists.
 *
 * Renders nothing when empty rather than an empty card: on a fresh week the
 * screen already says there is no listening yet, and a second "nothing here"
 * underneath it is noise. Top playlists is empty for most people most of the
 * time, and a permanent empty card for it would be worse than its absence.
 *
 * Every row carries both numbers. The play count answers "how often" and the
 * listening time answers "how much", and they disagree constantly — a
 * three-minute song played twice beats a forty-minute mix played once on one
 * measure and loses badly on the other. Showing only the count was hiding half
 * of what `stats_rollups` already knew.
 */
export function TopList({ title, entries, icon: Icon, unknownTitle }: TopListProps) {
  const { t, i18n } = useTranslation();
  const colors = useThemeColors();

  if (entries.length === 0) return null;

  const leader = entries[0]?.playCount ?? 0;

  return (
    <View className="gap-3">
      <Text className="font-body-semibold text-sm text-muted">{title}</Text>

      <View className="gap-2 rounded-md border border-subtle bg-surface-elevated p-4">
        {entries.map((entry, index) => (
          <View key={`${entry.id}-${index}`} className="flex-row items-center gap-3 py-1">
            {/* Mono, so the ranks line up as a column. */}
            <Text className="w-5 font-mono text-sm text-muted">{index + 1}</Text>

            {entry.artworkPath ? (
              <Image
                source={{ uri: `file://${entry.artworkPath}` }}
                recyclingKey={String(entry.id)}
                cachePolicy="memory-disk"
                contentFit="cover"
                transition={0}
                className="h-10 w-10 rounded-xs"
              />
            ) : (
              <View className="h-10 w-10 items-center justify-center rounded-xs bg-surface">
                <Icon color={colors.legend} size={18} strokeWidth={2} />
              </View>
            )}

            <View className="flex-1 gap-1">
              <Text numberOfLines={1} className="font-body text-base text-primary">
                {entry.title ?? unknownTitle}
              </Text>

              {/*
                A bar relative to the leader. Cheaper to read than a number and
                it makes "one track dominated the week" visible at a glance,
                which is the whole appeal of a Wrapped-style summary.
              */}
              <View className="h-1 w-full rounded-full bg-surface">
                <View
                  className="h-1 rounded-full bg-accent"
                  style={{ width: `${leader > 0 ? (entry.playCount / leader) * 100 : 0}%` }}
                />
              </View>
            </View>

            {/* Both numbers, right-aligned so the column reads down. */}
            <View className="items-end">
              <Text className="font-mono text-sm text-primary">
                {t('stats.playCount', {
                  count: entry.playCount,
                  formatted: new Intl.NumberFormat(i18n.language).format(entry.playCount),
                })}
              </Text>
              <Text className="font-mono text-sm text-muted">
                {formatListeningTime(entry.msPlayed, i18n.language)}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}
