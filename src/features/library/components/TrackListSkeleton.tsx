import { SkeletonRows } from '@/components/ui/Skeleton';

export interface TrackListSkeletonProps {
  /** Enough to fill a screen. More would only animate off-frame. */
  rows?: number;
}

/**
 * Placeholder rows in the shape of library rows.
 *
 * A named wrapper rather than `SkeletonRows` inline at the call sites, because
 * the row geometry — 64px tall, 40px artwork square — has to stay in step with
 * `TrackRow`, and one place to change it is the point.
 */
export function TrackListSkeleton({ rows = 8 }: TrackListSkeletonProps) {
  return <SkeletonRows rows={rows} rowClassName="h-16" leading="square" />;
}
