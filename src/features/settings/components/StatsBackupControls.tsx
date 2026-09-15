import { Directory } from 'expo-file-system';
import { FolderOpen, HardDriveDownload, HardDriveUpload, Save } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import { SettingSwitch } from '@/components/ui/SettingSwitch';
import {
  backupStatsNow,
  chooseStatsBackupFolder,
  refreshStatsBackupFolder,
  restoreStatsFrom,
  setStatsBackupOn,
  useStatsBackupStatus,
} from '@/services/backup/statsBackup';
import { isPickerDismissal } from '@/services/scanner/pickerError';
import { treeUriToLabel } from '@/services/scanner/treeUri';
import { showToast } from '@/services/toast';
import { useThemeColors } from '@/theme/useTheme';

/**
 * The listening history's second home.
 *
 * A switch, a line saying where the file is and when it was last written, and
 * three buttons: pick a folder, write now, read back. Most people never touch
 * any of it — the file is written on its own into the first library folder,
 * and read back on its own when that folder is added again after a reinstall.
 * The buttons are for the rest: a folder kept for this on purpose, a backup
 * taken before wiping a phone, a history brought over from another one.
 */
export function StatsBackupControls() {
  const { t, i18n } = useTranslation();
  const status = useStatsBackupStatus();
  const [restoring, setRestoring] = useState(false);

  // The borrowed folder is a database read, so it is not known at first paint.
  useEffect(() => {
    void refreshStatsBackupFolder();
  }, []);

  const pickFolder = useCallback(async () => {
    try {
      const directory = await Directory.pickDirectoryAsync();
      await chooseStatsBackupFolder(directory.uri);
      showToast(t('settings.backup.written'));
    } catch (error) {
      if (!isPickerDismissal(error)) showToast(t('settings.backup.failed'));
    }
  }, [t]);

  const backUp = useCallback(async () => {
    await backupStatsNow();
    showToast(t('settings.backup.written'));
  }, [t]);

  const restore = useCallback(async () => {
    const folder = status.folderUri;
    if (folder === null) return;
    setRestoring(true);
    try {
      const outcome = await restoreStatsFrom(folder);
      if (!outcome.found) showToast(t('settings.backup.nothingFound'));
      else showToast(t('settings.backup.restored', { count: outcome.restored }));
    } catch {
      showToast(t('settings.backup.failed'));
    } finally {
      setRestoring(false);
    }
  }, [status.folderUri, t]);

  const where =
    status.folderUri === null
      ? t('settings.backup.noFolder')
      : t(status.chosen ? 'settings.backup.chosenFolder' : 'settings.backup.libraryFolder', {
          folder: treeUriToLabel(status.folderUri),
        });
  const when =
    status.lastBackupAt === null
      ? t('settings.backup.never')
      : t('settings.backup.last', {
          when: new Intl.DateTimeFormat(i18n.language, {
            dateStyle: 'medium',
            timeStyle: 'short',
          }).format(new Date(status.lastBackupAt)),
        });

  return (
    <View className="gap-3">
      <SettingSwitch
        icon={Save}
        label={t('settings.backup.enable')}
        description={t('settings.backup.enableHint')}
        value={status.enabled}
        onChange={setStatsBackupOn}
      />

      <Text className="font-body text-sm text-muted">
        {where}
        {'\n'}
        {when}
      </Text>

      <View className="flex-row flex-wrap gap-2">
        <ActionChip
          icon={FolderOpen}
          label={t('settings.backup.pickFolder')}
          onPress={() => void pickFolder()}
          disabled={status.busy}
        />
        <ActionChip
          icon={HardDriveUpload}
          label={t('settings.backup.backUpNow')}
          onPress={() => void backUp()}
          disabled={status.busy || status.folderUri === null}
        />
        <ActionChip
          icon={HardDriveDownload}
          label={t('settings.backup.restoreNow')}
          onPress={() => void restore()}
          disabled={status.busy || restoring || status.folderUri === null}
        />
      </View>
    </View>
  );
}

interface ActionChipProps {
  icon: typeof Save;
  label: string;
  onPress: () => void;
  disabled: boolean;
}

function ActionChip({ icon: Icon, label, onPress, disabled }: ActionChipProps) {
  const colors = useThemeColors();

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      android_ripple={{ color: colors.etch }}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      className={`min-h-11 flex-row items-center gap-2 rounded-full border border-subtle px-4 ${
        disabled ? 'opacity-50' : ''
      }`}
    >
      <Icon color={colors.legend} size={18} strokeWidth={2} />
      <Text className="font-body-medium text-sm text-primary">{label}</Text>
    </Pressable>
  );
}
