import { Image } from 'expo-image';
import { ListMusic } from 'lucide-react-native';
import { View } from 'react-native';

import { useThemeColors } from '@/theme/useTheme';

export interface PlaylistMosaicProps {
  /** Up to four artwork paths, bare, in playlist order. */
  covers: readonly string[];
  /**
   * A cover the user chose, bare. Replaces the grid outright.
   *
   * Separate from `covers` rather than being its first element: a chosen cover
   * is a decision, and letting it share the grid would put it in a corner next
   * to three album squares the moment the playlist gained a second record.
   */
  cover?: string | null;
  /**
   * Rendered at this size, square. Tailwind size class, not a number.
   *
   * `fill` takes the size of whatever contains it, for the one caller that
   * needs to wrap the artwork in a pressable: `lg` sets its own width, and
   * nesting that inside a box already a third of the screen wide would draw it
   * at a ninth.
   */
  size?: 'sm' | 'lg' | 'fill';
}

/**
 * A playlist's cover: the first four album covers in a 2×2 grid.
 *
 * The count decides the layout, and each case is chosen rather than degraded:
 *
 * - **Four** — the grid, as intended.
 * - **Two or three** — still the grid, with the last cell empty. Deliberate: a
 *   part-filled grid says "this playlist spans a few records", which is true,
 *   and stretching two covers to fill four cells says something false.
 * - **One** — one cover, full bleed. A single album repeated four times looks
 *   like a rendering fault, and this is the common case for an album saved as a
 *   playlist.
 * - **None** — the icon. An empty playlist, or one whose tracks have no
 *   embedded art.
 *
 * A cover the user chose overrides all four cases. It is the whole square,
 * because a picture somebody picked is not one of a set.
 */
export function PlaylistMosaic({ covers, cover, size = 'sm' }: PlaylistMosaicProps) {
  const colors = useThemeColors();
  /*
   * A fraction rather than a fixed size for the large variant. The obvious
   * 128px square is not on the spacing scale, so it compiled to nothing and the
   * mosaic drew at zero by zero — see `src/theme/scale.test.ts`, which now fails
   * on any such class.
   */
  const box =
    size === 'fill' ? 'h-full w-full' : size === 'lg' ? 'aspect-square w-1/3' : 'h-12 w-12';

  if (cover) {
    return <Cover path={cover} className={`${box} rounded-xs`} />;
  }

  if (covers.length === 0) {
    return (
      <View className={`${box} items-center justify-center rounded-xs bg-surface-elevated`}>
        <ListMusic color={colors.legend} size={size === 'sm' ? 20 : 40} strokeWidth={2} />
      </View>
    );
  }

  if (covers.length === 1) {
    return <Cover path={covers[0]} className={`${box} rounded-xs`} />;
  }

  return (
    <View className={`${box} flex-row flex-wrap overflow-hidden rounded-xs bg-surface-elevated`}>
      {/*
        Four fixed cells rather than one per cover, so a three-cover playlist
        leaves a gap in the fourth instead of reflowing the other three into
        different shapes.
      */}
      {[0, 1, 2, 3].map((cell) => {
        const path = covers[cell];
        return path ? (
          <Cover key={cell} path={path} className="h-1/2 w-1/2" />
        ) : (
          <View key={cell} className="h-1/2 w-1/2" />
        );
      })}
    </View>
  );
}

interface CoverProps {
  path: string | undefined;
  className: string;
}

/** One cell. Paths are stored bare; expo-image needs the scheme. */
function Cover({ path, className }: CoverProps) {
  if (!path) return <View className={className} />;
  return (
    <Image
      source={{ uri: `file://${path}` }}
      recyclingKey={path}
      cachePolicy="memory-disk"
      contentFit="cover"
      transition={0}
      className={className}
    />
  );
}
