import * as SecureStore from 'expo-secure-store';
import {QueryClient} from '@tanstack/react-query';
import type {HomeSummary, RiderMe, Trip} from '../api/contract';
import {riderKeys} from './riderQueries';
import {riderSnapshot, SNAPSHOT_KEY, SNAPSHOT_MAX_AGE_MS} from './riderSnapshot';

const me = {riderId: 'r1', name: 'Ravi Kumar', language: 'en'} as RiderMe;
const home = {online: true, todayEarningsPaise: 0, todayTrips: 0} as HomeSummary;
const trip = {tripId: 't1', step: 'AT_KITCHEN'} as Trip;
const secure = new Map<string, string>();

const flush = () => new Promise<void>(resolve => setTimeout(resolve, 0));
const saved = () => JSON.parse(secure.get(SNAPSHOT_KEY) ?? 'null');

beforeEach(() => {
  secure.clear();
  (SecureStore.getItemAsync as jest.Mock).mockImplementation(async (key: string) => secure.get(key) ?? null);
  (SecureStore.setItemAsync as jest.Mock).mockImplementation(async (key: string, value: string) => {
    secure.set(key, value);
  });
  (SecureStore.deleteItemAsync as jest.Mock).mockImplementation(async (key: string) => {
    secure.delete(key);
  });
});

describe('riderSnapshot', () => {
  it('saves what the server returned and seeds a new cache with it, as old as it was', async () => {
    const before = new QueryClient();
    const stop = riderSnapshot.watch(before);
    before.setQueryData(riderKeys.me, me, {updatedAt: 1_000});
    before.setQueryData(riderKeys.home, home);
    before.setQueryData(riderKeys.activeTrip, trip);
    await flush();
    stop();
    expect(saved()).toEqual({savedAt: 1_000, me, home, activeTrip: trip});

    const after = new QueryClient();
    expect(await riderSnapshot.seed(after, 2_000)).toBe(true);
    expect(after.getQueryData(riderKeys.me)).toEqual(me);
    expect(after.getQueryData(riderKeys.home)).toEqual(home);
    expect(after.getQueryData(riderKeys.activeTrip)).toEqual(trip);
    expect(after.getQueryState(riderKeys.me)?.dataUpdatedAt).toBe(1_000);
  });

  it('keeps no trip once it has ended, so the customer details go with it', async () => {
    const cache = new QueryClient();
    const stop = riderSnapshot.watch(cache);
    cache.setQueryData(riderKeys.me, me);
    cache.setQueryData(riderKeys.activeTrip, {...trip, step: 'DELIVERED'});
    await flush();
    stop();
    expect(saved().activeTrip).toBeNull();
  });

  it('does not seed from nothing, from a snapshot older than a day, or from one dated in the future', async () => {
    expect(await riderSnapshot.seed(new QueryClient())).toBe(false);
    secure.set(SNAPSHOT_KEY, JSON.stringify({savedAt: 0, me, activeTrip: null}));
    expect(await riderSnapshot.seed(new QueryClient(), SNAPSHOT_MAX_AGE_MS + 1)).toBe(false);
    expect(await riderSnapshot.seed(new QueryClient(), SNAPSHOT_MAX_AGE_MS)).toBe(true);
    secure.set(SNAPSHOT_KEY, JSON.stringify({savedAt: 5_000, me, activeTrip: null}));
    expect(await riderSnapshot.seed(new QueryClient(), 4_000)).toBe(false);
    secure.set(SNAPSHOT_KEY, '{not json');
    expect(await riderSnapshot.seed(new QueryClient())).toBe(false);
  });

  it('is removed at sign-out', async () => {
    secure.set(SNAPSHOT_KEY, JSON.stringify({savedAt: 0, me, activeTrip: null}));
    await riderSnapshot.clear();
    expect(secure.has(SNAPSHOT_KEY)).toBe(false);
  });
});
