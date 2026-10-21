import {useEffect, useState} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {AppApiError} from '../../../core/http/apiError';
import {riderApi} from '../api/riderApi';
import {createOfflineQueue} from '../domain/offlineQueue';

/** The one queue every trip action goes through, kept in AsyncStorage so it survives restarts. */
export const tripQueue = createOfflineQueue({
  storage: AsyncStorage,
  send: entry => riderApi.tripAction(entry.tripId, entry.action, entry.body, entry.key),
  // A 401 means the session needs renewing, not that the server refused the step: keep it.
  isRetriable: error =>
    !(error instanceof AppApiError) ||
    error.retriable ||
    !error.status ||
    error.status === 401 ||
    error.status >= 500,
  describe: error =>
    error instanceof AppApiError
      ? {code: error.code, message: error.message}
      : {code: 'UNKNOWN', message: 'Something went wrong. Try again.'},
});

/** Count of this rider's actions still waiting to sync; drives "Saved · will sync" and the sign-out block. */
export function usePendingActions(riderId: string | undefined, tripId?: string): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!riderId) {
      return;
    }
    let active = true;
    const refresh = () =>
      tripQueue.pending(riderId, tripId).then(n => {
        if (active) {
          setCount(n);
        }
      });
    refresh();
    const unsubscribe = tripQueue.subscribe(refresh);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [riderId, tripId]);
  return count;
}
