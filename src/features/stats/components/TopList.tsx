import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import type { TopEntry } from '@/db/queries/stats';

export interface TopListProps {
  /** Already translated. */
  title: string;
  entries: readonly TopEntry[];
}

/**
 * A ranked list — top tracks, top artists.
 *
 * Renders nothing when empty rather than an empty card: on a fresh week the
 * screen already says there is no listening yet, and a second "nothing here"
 * underneath it is noise.
 */
export function TopList({ title, entries }: TopListProps) {
  const { t, i18n } = useTranslation();
  if (entries.length === 0) return null;

  const leader = entries[0]?.playCount ?? 0;

  return (
    <View className="gap-3">
      <Text className="font-body-semibold text-sm text-muted">{title}</Text>

      <View className="gap-3">
        {entries.map((entry, index) => (
          <View key={`${entry.id}-${index}`} className="flex-row items-center gap-3">
            <Text className="w-6 font-mono text-sm text-muted">{index + 1}</Text>

            <View className="flex-1 gap-1">
              <Text numberOfLines={1} className="font-body text-base text-primary">
                {entry.title}
              </Text>
              {entry.subtitle ? (
                <Text numberOfLines={1} className="font-body text-sm text-muted">
                  {entry.subtitle}
                </Text>
              ) : null}
              {/*
                A bar relative to the leader. Cheaper to read than a number
                and it makes "one track dominated the week" visible at a
                glance, which is the whole appeal of a Wrapped-style summary.
              */}
              <View className="h-1 w-full rounded-full bg-surface-elevated">
                <View
                  className="h-1 rounded-full bg-accent"
                  style={{ width: `${leader > 0 ? (entry.playCount / leader) * 100 : 0}%` }}
                />
              </View>
            </View>

            <Text className="font-mono text-sm text-muted">
              {t('stats.playCount', {
                count: entry.playCount,
                formatted: new Intl.NumberFormat(i18n.language).format(entry.playCount),
              })}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
