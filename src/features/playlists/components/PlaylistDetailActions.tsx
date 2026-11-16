import { Heart, ListPlus, Pencil, Trash2 } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable } from 'react-native';

import { useThemeColors } from '@/theme/useTheme';

export interface PlaylistDetailActionsProps {
  /**
   * Like or unlike the whole playlist, pinning it to the top of the tab.
   *
   * Absent for Liked Songs, which *is* the liked collection — a heart there
   * would be a switch with nothing behind it. The same goes for the rest:
   * Liked Songs is not editable, so it offers none of these.
   */
  onToggleFavorite?: () => void;
  isFavorite?: boolean;
  /** Open the library picker. */
  onAddTracks?: () => void;
  onRename?: () => void;
  onDelete?: () => void;
}

/** The playlist's own verbs, in the top bar `DetailChrome` lays out. */
export function PlaylistDetailActions({
  onToggleFavorite,
  isFavorite = false,
  onAddTracks,
  onRename,
  onDelete,
}: PlaylistDetailActionsProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();

  return (
    <>
      {onToggleFavorite ? (
        <Pressable
          onPress={onToggleFavorite}
          accessibilityRole="switch"
          accessibilityState={{ checked: isFavorite }}
          accessibilityLabel={isFavorite ? t('playlists.unlike') : t('playlists.like')}
          className="min-h-11 min-w-11 items-center justify-center"
        >
          <Heart
            color={isFavorite ? colors.signal : colors.legend}
            fill={isFavorite ? colors.signal : 'transparent'}
            size={20}
            strokeWidth={2}
          />
        </Pressable>
      ) : null}

      {onAddTracks ? (
        <Pressable
          onPress={onAddTracks}
          accessibilityRole="button"
          accessibilityLabel={t('playlists.addTracks.title')}
          className="min-h-11 min-w-11 items-center justify-center"
        >
          <ListPlus color={colors.signal} size={22} strokeWidth={2} />
        </Pressable>
      ) : null}

      {onRename ? (
        <Pressable
          onPress={onRename}
          accessibilityRole="button"
          accessibilityLabel={t('playlists.rename')}
          className="min-h-11 min-w-11 items-center justify-center"
        >
          <Pencil color={colors.legend} size={20} strokeWidth={2} />
        </Pressable>
      ) : null}

      {onDelete ? (
        <Pressable
          onPress={onDelete}
          accessibilityRole="button"
          accessibilityLabel={t('playlists.delete')}
          className="min-h-11 min-w-11 items-center justify-center"
        >
          <Trash2 color={colors.legend} size={20} strokeWidth={2} />
        </Pressable>
      ) : null}
    </>
  );
}
