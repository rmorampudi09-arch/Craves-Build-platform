import {useEffect, useRef} from 'react';
import {AppState} from 'react-native';
import {useInfiniteQuery, useQuery} from '@tanstack/react-query';
import type {EarningsRange, RiderMe} from '../api/contract';
import {riderApi} from '../api/riderApi';
import {problemOf} from '../domain/problem';

/** Every rider query key starts with 'rider', so sign-out can clear them together. */
export const riderKeys = {
  all: ['rider'] as const,
  me: ['rider', 'me'] as const,
  home: ['rider', 'home'] as const,
  activeTrip: ['rider', 'trip', 'active'] as const,
  terms: ['rider', 'terms'] as const,
  profile: ['rider', 'profile'] as const,
  payouts: ['rider', 'payouts'] as const,
  earnings: (range: EarningsRange) => ['rider', 'earnings', range] as const,
  tripEarning: (tripId: string) => ['rider', 'tripEarning', tripId] as const,
};

export const useRiderMe = () => useQuery({queryKey: riderKeys.me, queryFn: riderApi.getMe});

/**
 * Only an active or paused rider holds the RIDER role the work routes need; anyone else (signing up, waiting for ops,
 * closed) would get a 403 on every poll, so those queries wait until /me says the role is there.
 */
export const hasRiderRole = (me?: RiderMe) => me?.status === 'ACTIVE' || me?.status === 'SUSPENDED';
const useRiderRole = () => hasRiderRole(useRiderMe().data);

export const useRiderHome = () =>
  useQuery({
    queryKey: riderKeys.home,
    queryFn: riderApi.getHome,
    // Not while the server refuses for the role: each try would renew the sign-in for nothing. "Check again" restarts it.
    refetchInterval: query => (problemOf(query.state.error) === 'notAllowed' ? false : 30_000),
    enabled: useRiderRole(),
  });

export const useActiveTrip = () =>
  useQuery({queryKey: riderKeys.activeTrip, queryFn: riderApi.getActiveTrip, enabled: useRiderRole()});

export const useTerms = () => useQuery({queryKey: riderKeys.terms, queryFn: riderApi.getTerms, enabled: useRiderRole()});

// Any rider ops added may read their profile (documents before activation too); someone not signed up yet may not (403).
export const useProfile = (enabled = true) => useQuery({queryKey: riderKeys.profile, queryFn: riderApi.getProfile, enabled});

/**
 * While the rider waits on ops (an application in review, no rate card yet), asks again every minute and whenever they come
 * back to the app, so an approval or a request for fixes shows without a restart.
 */
export function useRecheck(recheck: () => unknown, waiting: boolean) {
  const latest = useRef(recheck);
  latest.current = recheck;
  useEffect(() => {
    if (!waiting) {
      return undefined;
    }
    const timer = setInterval(() => latest.current(), 60_000);
    const appState = AppState.addEventListener('change', state => state === 'active' && latest.current());
    return () => {
      clearInterval(timer);
      appState.remove();
    };
  }, [waiting]);
}

export const usePayouts = () => useQuery({queryKey: riderKeys.payouts, queryFn: riderApi.getPayouts, enabled: useRiderRole()});

export const useTripEarning = (tripId: string) =>
  useQuery({queryKey: riderKeys.tripEarning(tripId), queryFn: () => riderApi.getTripEarning(tripId), enabled: useRiderRole()});

export const useEarnings = (range: EarningsRange) =>
  useInfiniteQuery({
    queryKey: riderKeys.earnings(range),
    queryFn: ({pageParam}) => riderApi.getEarnings(range, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: last => last.nextCursor,
    enabled: useRiderRole(),
  });
