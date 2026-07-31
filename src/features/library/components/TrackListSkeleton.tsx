import { View } from 'react-native';

export interface TrackListSkeletonProps {
  /** Enough to fill a screen. More would only animate off-frame. */
  rows?: number;
}

/**
 * Placeholder rows in the shape of real ones.
 *
 * The States rule asks for skeletons that match the content rather than a
 * centred spinner, specifically so the layout does not jump when data lands:
 * these are the same 64px row with the same 40px artwork square in the same
 * place, so the only thing that changes is that the grey blocks become text.
 */
export function TrackListSkeleton({ rows = 8 }: TrackListSkeletonProps) {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {Array.from({ length: rows }, (_, index) => (
        <View key={index} className="h-16 flex-row items-center gap-3 px-6">
          <View className="h-10 w-10 rounded-xs bg-surface-elevated" />
          <View className="flex-1 gap-2">
            {/* Two widths, alternating, so it reads as a list rather than a grid. */}
            <View
              className={
                index % 2 === 0
                  ? 'h-4 w-3/5 rounded-xs bg-surface-elevated'
                  : 'h-4 w-4/5 rounded-xs bg-surface-elevated'
              }
            />
            <View className="h-3 w-2/5 rounded-xs bg-surface-elevated" />
          </View>
          <View className="h-3 w-8 rounded-xs bg-surface-elevated" />
        </View>
      ))}
    </View>
  );
}
