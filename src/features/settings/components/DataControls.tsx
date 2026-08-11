import { ListX, Trash2 } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { clearLibrary, clearStatistics } from '@/db/queries/maintenance';
import { AudioEngine } from '@/services/audio/AudioEngine';
import { SPACING } from '@/theme/tokens';
import { useThemeColors } from '@/theme/useTheme';

/** Which confirmation is open, if any. */
type Pending = 'library' | 'statistics' | null;

/**
 * Throwing things away, one kind at a time.
 *
 * Two actions rather than one, because they are different kinds of loss: a
 * library is rebuilt by scanning again, and a listening history is not
 * rebuildable at all. Each says what it takes with it before it takes it —
 * clearing the library also clears the history, since those rows hang off the
 * tracks, and that is exactly the surprise a confirmation exists to prevent.
 */
export function DataControls() {
  const { t } = useTranslation();
  const [pending, setPending] = useState<Pending>(null);

  const confirm = useCallback(async () => {
    const action = pending;
    setPending(null);
    if (action === null) return;

    if (action === 'statistics') {
      await clearStatistics();
      return;
    }

    /*
     * Stop before deleting what is playing. The queue holds tracks whose rows
     * are about to go, and the engine would carry on with a file whose id no
     * longer resolves — the next thing to touch it would be reading a track
     * that is not there.
     */
    await AudioEngine.clearQueue();
    await clearLibrary();
  }, [pending]);

  return (
    <View style={{ gap: SPACING[4] }}>
      <DangerRow
        icon={ListX}
        label={t('settings.data.clearLibrary')}
        description={t('settings.data.clearLibraryHint')}
        onPress={() => setPending('library')}
      />
      <DangerRow
        icon={Trash2}
        label={t('settings.data.clearStats')}
        description={t('settings.data.clearStatsHint')}
        onPress={() => setPending('statistics')}
      />

      <ConfirmDialog
        visible={pending !== null}
        title={
          pending === 'statistics'
            ? t('settings.data.clearStatsConfirm.title')
            : t('settings.data.clearLibraryConfirm.title')
        }
        body={
          pending === 'statistics'
            ? t('settings.data.clearStatsConfirm.body')
            : t('settings.data.clearLibraryConfirm.body')
        }
        confirmLabel={t('settings.data.clear')}
        destructive
        onConfirm={() => void confirm()}
        onCancel={() => setPending(null)}
      />
    </View>
  );
}

interface DangerRowProps {
  icon: typeof Trash2;
  label: string;
  description: string;
  onPress: () => void;
}

function DangerRow({ icon: Icon, label, description, onPress }: DangerRowProps) {
  const colors = useThemeColors();

  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: colors.etch }}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="min-h-11 flex-row items-start gap-3"
    >
      <View className="pt-0.5">
        <Icon color={colors.legend} size={20} strokeWidth={2} />
      </View>
      <View className="flex-1 gap-1">
        <Text className="font-body-medium text-base text-primary">{label}</Text>
        <Text className="font-body text-sm text-muted">{description}</Text>
      </View>
    </Pressable>
  );
}
