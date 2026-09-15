import {useEffect, useState} from 'react';
import {AccessibilityInfo} from 'react-native';

/**
 * Tracks the platform reduce-motion accessibility preference. The conservative
 * initial value suppresses non-essential animation until Android reports the
 * actual setting, avoiding an accessibility flash during startup.
 */
export function useReducedMotionPreference(): boolean {
  const [reduceMotionEnabled, setReduceMotionEnabled] = useState(true);

  useEffect(() => {
    let mounted = true;

    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      enabled => {
        if (mounted) {
          setReduceMotionEnabled(enabled);
        }
      },
    );

    AccessibilityInfo.isReduceMotionEnabled().then(
      enabled => {
        if (mounted) {
          setReduceMotionEnabled(enabled);
        }
      },
      () => undefined,
    );

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return reduceMotionEnabled;
}
