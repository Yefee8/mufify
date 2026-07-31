import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * Whether the user has asked the system to reduce motion.
 *
 * The design direction calls for one orchestrated moment and quiet transitions
 * everywhere else, and both have to be skippable: "Remove animations" in
 * Android's accessibility settings is often set by people for whom motion
 * causes actual nausea, not as a preference about taste.
 *
 * Subscribed rather than read once — it is a setting the user can change while
 * the app is open, and coming back to an app that still animates is the exact
 * failure the setting exists to prevent.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let active = true;

    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (active) setReduced(enabled);
    });

    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);

    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  return reduced;
}
