import {useInfiniteQuery, useQuery} from '@tanstack/react-query';
import type {EarningsRange} from '../api/contract';
import {riderApi} from '../api/riderApi';

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

export const useRiderHome = () =>
  useQuery({queryKey: riderKeys.home, queryFn: riderApi.getHome, refetchInterval: 30_000});

export const useActiveTrip = () =>
  useQuery({queryKey: riderKeys.activeTrip, queryFn: riderApi.getActiveTrip});

export const useTerms = () => useQuery({queryKey: riderKeys.terms, queryFn: riderApi.getTerms});

export const useProfile = () => useQuery({queryKey: riderKeys.profile, queryFn: riderApi.getProfile});

export const usePayouts = () => useQuery({queryKey: riderKeys.payouts, queryFn: riderApi.getPayouts});

export const useTripEarning = (tripId: string) =>
  useQuery({queryKey: riderKeys.tripEarning(tripId), queryFn: () => riderApi.getTripEarning(tripId)});

export const useEarnings = (range: EarningsRange) =>
  useInfiniteQuery({
    queryKey: riderKeys.earnings(range),
    queryFn: ({pageParam}) => riderApi.getEarnings(range, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: last => last.nextCursor,
  });
