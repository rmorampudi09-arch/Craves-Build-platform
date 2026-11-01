import * as SecureStore from 'expo-secure-store';
import type {QueryClient, QueryKey} from '@tanstack/react-query';
import type {HomeSummary, RiderMe, Trip} from '../api/contract';
import {riderKeys} from './riderQueries';

/**
 * The rider, Home and active trip the server last returned, kept on the phone so a start without signal (a reboot or
 * force stop mid-trip) opens where the rider left off instead of an error (WORKPLAN P2-12). The trip carries the
 * customer's contact details, so the snapshot is encrypted at rest (expo-secure-store, Android Keystore), the trip is
 * kept only while it is in progress, and everything goes at sign-out.
 */
export const SNAPSHOT_KEY = 'rider.snapshot.v1';
/** Older than a day (a shift lasts at most 12 hours), the saved state is no use and is not shown. */
export const SNAPSHOT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const ENDED = ['DELIVERED', 'FAILED', 'CANCELLED'];
const KEPT: readonly QueryKey[] = [riderKeys.me, riderKeys.home, riderKeys.activeTrip];

interface Snapshot {
  /** When GET /me last answered (the cache's time, so seeding from the snapshot never makes it look newer). */
  savedAt: number;
  me: RiderMe;
  home?: HomeSummary;
  activeTrip: Trip | null;
}

const sameKey = (a: QueryKey, b: QueryKey) => a.length === b.length && a.every((part, i) => part === b[i]);

async function read(): Promise<Snapshot | null> {
  try {
    const raw = await SecureStore.getItemAsync(SNAPSHOT_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<Snapshot>) : null;
    return parsed?.me && typeof parsed.savedAt === 'number' ? (parsed as Snapshot) : null;
  } catch {
    return null;
  }
}

export const riderSnapshot = {
  /**
   * Puts the saved rider, Home and trip in the query cache, as old as they are, so the screens show them and refetch
   * when they can. False when nothing usable is saved: the app then shows its error with Try again.
   */
  async seed(queryClient: QueryClient, now = Date.now()): Promise<boolean> {
    const saved = await read();
    if (!saved || now - saved.savedAt > SNAPSHOT_MAX_AGE_MS || saved.savedAt > now) {
      return false;
    }
    queryClient.setQueryData(riderKeys.me, saved.me, {updatedAt: saved.savedAt});
    if (saved.home) {
      queryClient.setQueryData(riderKeys.home, saved.home, {updatedAt: saved.savedAt});
    }
    queryClient.setQueryData(riderKeys.activeTrip, saved.activeTrip ?? null, {updatedAt: saved.savedAt});
    return true;
  },

  /** Saves the rider, Home and trip whenever the cache gets new ones (fetched, or set after a trip step). */
  watch(queryClient: QueryClient): () => void {
    let scheduled = false;
    const save = () => {
      scheduled = false;
      const me = queryClient.getQueryData<RiderMe>(riderKeys.me);
      if (!me) {
        return;
      }
      const trip = queryClient.getQueryData<Trip | null>(riderKeys.activeTrip);
      const snapshot: Snapshot = {
        savedAt: queryClient.getQueryState(riderKeys.me)?.dataUpdatedAt || Date.now(),
        me,
        home: queryClient.getQueryData<HomeSummary>(riderKeys.home),
        activeTrip: trip && !ENDED.includes(trip.step) ? trip : null,
      };
      SecureStore.setItemAsync(SNAPSHOT_KEY, JSON.stringify(snapshot)).catch(() => undefined);
    };
    return queryClient.getQueryCache().subscribe(event => {
      if (
        event.type === 'updated' &&
        event.action.type === 'success' &&
        KEPT.some(key => sameKey(key, event.query.queryKey)) &&
        !scheduled
      ) {
        // One write for the burst of answers a start or a refresh brings.
        scheduled = true;
        setTimeout(save, 0);
      }
    });
  },

  async clear(): Promise<void> {
    await SecureStore.deleteItemAsync(SNAPSHOT_KEY).catch(() => undefined);
  },
};
