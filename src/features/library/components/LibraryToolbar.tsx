import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { LikedFilter } from '@/components/ui/LikedFilter';
import { SearchField } from '@/components/ui/SearchField';
import {
  ALBUM_SORT_KEYS,
  ARTIST_SORT_KEYS,
  DEFAULT_ALBUM_SORT,
  DEFAULT_ARTIST_SORT,
  DEFAULT_TRACK_SORT,
  TRACK_SORT_KEYS,
} from '@/services/library/sortOrder';

import type { LibrarySort } from '../hooks/useLibrarySort';
import { SortControl } from './SortControl';

export interface LibraryToolbarProps {
  view: 'tracks' | 'artists' | 'albums';
  search: string;
  onSearchChange: (search: string) => void;
  /** The heart, for the view on screen. */
  likedOnly: boolean;
  onLikedOnlyChange: (likedOnly: boolean) => void;
  sort: LibrarySort;
}

/**
 * The row under the view switch: search, the liked filter, and the order.
 *
 * One search box for every view. It used to appear on the tracks view only, on
 * the grounds that a grid of a few cards did not need one — which stopped being
 * true the first time a library held two hundred albums. The same field, the
 * same text: switching view keeps what was typed, because the question "where
 * is X" does not change with the shape of the answer.
 *
 * The heart and the order sit side by side in every view, so the two ways of
 * narrowing and arranging a shelf are always in the same place — the album
 * heart used to have a row of its own and the artist shelf had none. Both are
 * per view: the heart filters the shelf it sits above (artists by what was
 * liked of theirs — see `useLikedArtistIds`), and the sort button opens the
 * options for that shelf.
 */
export function LibraryToolbar({
  view,
  search,
  onSearchChange,
  likedOnly,
  onLikedOnlyChange,
  sort,
}: LibraryToolbarProps) {
  const { t } = useTranslation();

  return (
    <View className="mb-4 flex-row items-center gap-3 px-6">
      <SearchField value={search} onChange={onSearchChange} inRow />

      <LikedFilter
        active={likedOnly}
        onChange={onLikedOnlyChange}
        accessibilityLabel={t(LIKED_LABEL[view])}
      />

      {view === 'tracks' ? (
        <SortControl
          view="tracks"
          keys={TRACK_SORT_KEYS}
          order={sort.tracks}
          defaultOrder={DEFAULT_TRACK_SORT}
          onChange={sort.changeTracks}
        />
      ) : view === 'albums' ? (
        <SortControl
          view="albums"
          keys={ALBUM_SORT_KEYS}
          order={sort.albums}
          defaultOrder={DEFAULT_ALBUM_SORT}
          onChange={sort.changeAlbums}
        />
      ) : (
        <SortControl
          view="artists"
          keys={ARTIST_SORT_KEYS}
          order={sort.artists}
          defaultOrder={DEFAULT_ARTIST_SORT}
          onChange={sort.changeArtists}
        />
      )}
    </View>
  );
}

const LIKED_LABEL = {
  tracks: 'library.likedFilter',
  artists: 'library.likedArtistFilter',
  albums: 'library.likedAlbumFilter',
} as const;
