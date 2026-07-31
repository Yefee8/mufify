import { FlaskConical } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { timeLibraryQuery } from '@/db/queries/tracks';
import { clearDatabase, seedStressLibrary } from '@/db/seed';
import * as perf from '@/services/perf';
import { useThemeColors } from '@/theme/useTheme';

/**
 * Development-only tools. Absent from a release build.
 *
 * Exists so Phase 9's numbers come from a library nobody had to assemble by
 * hand, and so the same measurement can be reproduced on demand rather than
 * described.
 *
 * The strings here are deliberately *not* in `en.json` / `tr.json`. The i18n
 * rule protects text a user can see, and none of this ships — translating it
 * would put developer jargon in the shipped bundle in two languages.
 */
export function DevTools() {
  if (!__DEV__) return null;
  return <DevToolsPanel />;
}

const SIZES = [1_000, 10_000] as const;

function DevToolsPanel() {
  const colors = useThemeColors();
  const [status, setStatus] = useState('idle');

  const seed = useCallback(async (total: number) => {
    setStatus(`seeding ${total}…`);
    perf.mark('seed');
    const inserted = await seedStressLibrary(total);
    const elapsed = perf.measure('seed', inserted);
    setStatus(`inserted ${inserted} in ${elapsed}ms`);
  }, []);

  const wipe = useCallback(async () => {
    setStatus('clearing…');
    await clearDatabase();
    setStatus('cleared');
  }, []);

  /*
   * Time the library query with nothing else happening.
   *
   * The measurement taken through `useLiveQuery` on mount is wall-clock from
   * the effect firing to the rows landing, so it also contains migrations, font
   * loading and the launch scan sweep competing for the JS thread. On the Mi 9T
   * that came to 1608ms for 521 tracks, which is far too slow to be SQL — this
   * separates the two rather than guessing which it was.
   */
  const timeQuery = useCallback(async () => {
    setStatus('timing…');
    const runs: number[] = [];
    let rows = 0;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const started = Date.now();
      rows = (await timeLibraryQuery()).length;
      runs.push(Date.now() - started);
    }

    const sorted = [...runs].sort((a, b) => a - b);
    perf.value('query.min', sorted[0] ?? 0);
    perf.value('query.median', sorted[2] ?? 0);
    setStatus(`${rows} rows: ${runs.join('/')}ms`);
  }, []);

  return (
    <View className="gap-4">
      <View className="flex-row items-center gap-3">
        <FlaskConical color={colors.legend} size={20} strokeWidth={2} />
        <Text className="flex-1 font-body text-base text-primary">Stress library</Text>
        <Text className="font-mono text-xs text-muted">{status}</Text>
      </View>

      <View className="flex-row gap-2">
        {SIZES.map((total) => (
          <Pressable
            key={total}
            onPress={() => void seed(total)}
            accessibilityRole="button"
            accessibilityLabel={`Seed ${total} tracks`}
            className="min-h-11 flex-1 items-center justify-center rounded-sm border border-subtle px-3"
          >
            <Text className="font-mono text-sm text-accent">{`seed ${total / 1_000}k`}</Text>
          </Pressable>
        ))}

        <Pressable
          onPress={() => void wipe()}
          accessibilityRole="button"
          accessibilityLabel="Clear the library"
          className="min-h-11 flex-1 items-center justify-center rounded-sm border border-subtle px-3"
        >
          <Text className="font-mono text-sm text-muted">clear</Text>
        </Pressable>
      </View>

      <Pressable
        onPress={() => void timeQuery()}
        accessibilityRole="button"
        accessibilityLabel="Time the library query"
        className="min-h-11 items-center justify-center rounded-sm border border-subtle px-3"
      >
        <Text className="font-mono text-sm text-accent">time library query ×5</Text>
      </Pressable>
    </View>
  );
}
