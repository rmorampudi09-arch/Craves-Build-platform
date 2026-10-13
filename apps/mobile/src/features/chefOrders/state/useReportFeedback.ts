import React from 'react';
import {useChefToast} from '../../chefShell/components/ui';

/**
 * Hands an order action's result to the screen that started it (which shows it once). When that screen is already
 * gone, because the chef switched filters while the request ran, the result is shown as a toast right here instead of being lost.
 */
export function useReportFeedback<T extends {message: string}>(setFeedback: (feedback: T) => void) {
  const toast = useChefToast();
  const mounted = React.useRef(true);
  React.useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  return React.useCallback(
    (feedback: T) => {
      if (mounted.current) {
        setFeedback(feedback);
      } else {
        toast.show(feedback.message);
      }
    },
    [setFeedback, toast],
  );
}
