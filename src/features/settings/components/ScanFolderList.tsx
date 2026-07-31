import { FolderOpen, X } from 'lucide-react-native';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import { removeScanFolder, useScanFolders } from '@/db/queries/scanning';
import { treeUriToLabel } from '@/services/scanner/treeUri';
import { useThemeColors } from '@/theme/useTheme';

/**
 * The folders `Add music` has been pointed at.
 *
 * Adding is cumulative and a rescan sweeps all of them, so without this the
 * list is invisible state: the user has no way to see what they have added, or
 * to tell why a folder they added months ago is still being re-indexed.
 */
export function ScanFolderList() {
  const { t } = useTranslation();
  const folders = useScanFolders();

  const handleRemove = useCallback((id: number) => {
    void removeScanFolder(id);
  }, []);

  if (folders.length === 0) {
    return (
      <Text className="font-body text-sm text-muted">{t('settings.folders.empty')}</Text>
    );
  }

  return (
    <View className="gap-4">
      {folders.map((folder) => (
        <ScanFolderRow key={folder.id} id={folder.id} uri={folder.uri} onRemove={handleRemove} />
      ))}
      {/*
        Says what removing does, because the obvious reading is wrong: the
        tracks stay, since they are ordinary MediaStore content the automatic
        sweep finds anyway.
      */}
      <Text className="font-body text-sm text-muted">{t('settings.folders.removeNote')}</Text>
    </View>
  );
}

interface ScanFolderRowProps {
  id: number;
  uri: string;
  onRemove: (id: number) => void;
}

function ScanFolderRow({ id, uri, onRemove }: ScanFolderRowProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const label = treeUriToLabel(uri);
  const handleRemove = useCallback(() => onRemove(id), [onRemove, id]);

  return (
    <View className="flex-row items-center gap-3">
      <FolderOpen color={colors.legend} size={18} strokeWidth={2} />
      <Text numberOfLines={1} className="flex-1 font-mono text-sm text-primary">
        {label}
      </Text>
      <Pressable
        onPress={handleRemove}
        accessibilityRole="button"
        accessibilityLabel={t('settings.folders.remove', { folder: label })}
        className="min-h-11 min-w-11 items-center justify-center"
      >
        <X color={colors.legend} size={18} strokeWidth={2} />
      </Pressable>
    </View>
  );
}
