import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { setWidgetAppearance, setWidgetCollections } from 'mufify-widgets';

import { useLikedCount, usePlaylists } from '@/db/queries/playlists';
import { getThemePreference, onThemePreferenceChanged } from '@/services/settings';
import { widgetCollections } from '@/services/widgets/widgetState';

/**
 * Tells the home-screen widgets what they may show and how to say it: the
 * collections a collection widget can be set to, the theme, and every word,
 * in the app's language.
 *
 * Renders nothing. A component rather than a subscription because all three
 * are things React already knows live — the playlists and counts from the
 * database, the language from i18n — and the widget only needs them while
 * the app is open to change them. The track and queue, which change with no
 * screen mounted, are `startWidgetSync`'s.
 *
 * Mounted once, in the root layout, after migrations.
 */
export function WidgetCatalog() {
  const { t } = useTranslation();
  const playlists = usePlaylists();
  const likedCount = useLikedCount();
  const theme = useSyncExternalStore(onThemePreferenceChanged, getThemePreference);

  const collections = useMemo(
    () =>
      widgetCollections({
        libraryName: t('library.title'),
        likedName: t('playlists.likedSongs'),
        likedCount,
        playlists,
        trackCount: (count) => t('library.trackCount', { count }),
      }),
    // `t` changes identity with the language, which is when the words change.
    [t, likedCount, playlists],
  );

  useEffect(() => {
    setWidgetCollections(collections);
  }, [collections]);

  useEffect(() => {
    setWidgetAppearance({
      theme,
      strings: {
        nothingPlaying: t('widgets.nothingPlaying'),
        openApp: t('widgets.openApp'),
        upNext: t('widgets.upNext'),
        queueEnd: t('widgets.queueEnd'),
        play: t('widgets.play'),
        pause: t('widgets.pause'),
        next: t('widgets.next'),
        previous: t('widgets.previous'),
        shuffle: t('widgets.shuffle'),
        library: t('library.title'),
        pickTitle: t('widgets.pickTitle'),
        missing: t('widgets.missing'),
      },
    });
  }, [t, theme]);

  return null;
}
