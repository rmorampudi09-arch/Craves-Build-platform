import {useSyncExternalStore} from 'react';
import type {RiderOnlineStatus} from '../native/riderOnlineService';

// Whether the phone reaches Craves, as the online service's uploads last found (RiderRuntime passes every riderStatus).
let unreachable = false;
const listeners = new Set<() => void>();

export const connection = {
  /**
   * A failed upload (ERROR, not connected: "No internet. Retrying.") means no. One that got through (ONLINE, or ERROR only
   * because offers can't ring) means yes, and so does OFFLINE: nothing is calling, so nothing is known to be failing.
   */
  update(status: Pick<RiderOnlineStatus, 'state' | 'connected'>) {
    const next = status.state === 'ERROR' && !status.connected;
    if (next !== unreachable) {
      unreachable = next;
      listeners.forEach(listener => listener());
    }
  },
  unreachable: () => unreachable,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

/** True while the phone can't reach Craves (OfflineBanner). */
export const useUnreachable = () => useSyncExternalStore(connection.subscribe, connection.unreachable);
