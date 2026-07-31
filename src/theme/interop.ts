import { Image } from 'expo-image';
import { cssInterop } from 'nativewind';

/**
 * Teach NativeWind about third-party components.
 *
 * NativeWind only rewrites `className` into `style` for components it knows.
 * Anything else silently receives a `className` prop it does not understand
 * and renders unstyled — no warning, no error, just a view with no size.
 *
 * That is not hypothetical: `TrackRow`'s artwork was `className="h-10 w-10"`
 * on `expo-image`, which meant every track that actually had a cover rendered
 * it at zero by zero and collapsed its row, while tracks falling back to the
 * plain `View` placeholder looked fine. The failure showed up only on the rows
 * that were working hardest.
 *
 * Registering here rather than at each call site means a second `expo-image`
 * elsewhere does not have to rediscover this.
 */
export function registerComponentInterop(): void {
  cssInterop(Image, { className: 'style' });
}
