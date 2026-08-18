import { ImagePlus, ImageOff } from 'lucide-react-native';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { ActionSheet, type ActionSheetAction } from '@/components/ui/ActionSheet';

export interface CoverActionSheetProps {
  visible: boolean;
  /** Whether there is a chosen cover to remove. */
  hasCover: boolean;
  onPick: () => void;
  onClear: () => void;
  onClose: () => void;
}

/**
 * Choose a playlist's picture, or go back to the mosaic.
 *
 * A sheet rather than the picker straight away, and the second option is the
 * reason: the system picker can only hand back a file, so "remove this cover"
 * would have nowhere to live and the four-square grid would become
 * unreachable the moment anybody tried a picture once.
 *
 * Removing is only offered when there is something to remove — an option that
 * undoes nothing is a control the user has to test to understand.
 */
export function CoverActionSheet({
  visible,
  hasCover,
  onPick,
  onClear,
  onClose,
}: CoverActionSheetProps) {
  const { t } = useTranslation();

  const actions = useMemo<ActionSheetAction[]>(() => {
    const pick: ActionSheetAction = {
      id: 'pick',
      label: hasCover ? t('playlists.cover.replace') : t('playlists.cover.choose'),
      icon: ImagePlus,
      emphasis: true,
    };
    if (!hasCover) return [pick];
    return [pick, { id: 'clear', label: t('playlists.cover.remove'), icon: ImageOff }];
  }, [hasCover, t]);

  return (
    <ActionSheet
      visible={visible}
      title={t('playlists.cover.title')}
      actions={actions}
      onSelect={(id) => (id === 'pick' ? onPick() : onClear())}
      onClose={onClose}
    />
  );
}
