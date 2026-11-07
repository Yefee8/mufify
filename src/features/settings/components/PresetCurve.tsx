import { memo, useMemo } from 'react';
import Svg, { Line, Polyline } from 'react-native-svg';

import { curveShape } from '@/services/equalizer/curveShape';
import type { CurvePoint } from '@/services/equalizer/presets';

export interface PresetCurveProps {
  points: readonly CurvePoint[];
  width: number;
  height: number;
  /** The line itself. */
  color: string;
  /** The 0 dB reference behind it. */
  baseline: string;
}

const STROKE = 2;

/**
 * A preset's shape, drawn small enough to sit on a tile.
 *
 * The name of a preset says what it is for; the line says what it does, which
 * is the part people actually want to know before they choose it — "Rock"
 * means something different to everybody, a smile with both ends up does not.
 * It is the same curve the bands will be set to (`curveShape`), not an icon.
 */
export const PresetCurve = memo(function PresetCurve({
  points,
  width,
  height,
  color,
  baseline,
}: PresetCurveProps) {
  const polyline = useMemo(() => {
    const shape = curveShape(points);
    const step = (width - STROKE) / (shape.length - 1);
    const middle = height / 2;
    const reach = middle - STROKE;
    return shape
      .map((value, index) => `${STROKE / 2 + index * step},${middle - value * reach}`)
      .join(' ');
  }, [height, points, width]);

  return (
    <Svg width={width} height={height}>
      <Line
        x1={0}
        y1={height / 2}
        x2={width}
        y2={height / 2}
        stroke={baseline}
        strokeOpacity={0.45}
        strokeWidth={1}
      />
      <Polyline
        points={polyline}
        fill="none"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
});
