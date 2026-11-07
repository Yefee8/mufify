import { GripVertical } from 'lucide-react-native';
import { View } from 'react-native';

import { useThemeColors } from '@/theme/useTheme';

/**
 * The grip at the end of a reorderable row.
 *
 * Its own component because it is drawn in two places that have to match to
 * the pixel: on the row in the list, and on the floating copy that replaces the
 * row while it is held. A copy whose handle sat a point to one side would make
 * the pick-up visibly jump.
 */
export function DragHandle() {
  const colors = useThemeColors();

  return (
    <View className="min-h-11 min-w-11 items-center justify-center pr-4">
      <GripVertical color={colors.legend} size={20} strokeWidth={2} />
    </View>
  );
}
