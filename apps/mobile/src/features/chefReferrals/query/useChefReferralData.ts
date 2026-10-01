import { useQuery } from '@tanstack/react-query';
import { useAppSelector } from '../../../app/store/hooks';
import {
  CHEF_REFERRAL_EARNINGS_AVAILABLE,
  chefReferralEarningsApi,
} from '../api/chefReferralEarningsApi';
import {
  REFERRAL_CODE_AVAILABLE,
  referralRewardsApi,
} from '../../referralsV2/api/referralRewardsApi';

export function useChefReferralEarnings() {
  const identityId = useAppSelector(state => state.auth.identity?.id ?? null);
  return useQuery({
    queryKey: ['craves', 'v1', 'private', 'chef-referral-earnings', identityId],
    queryFn: ({ signal }) => chefReferralEarningsApi.get(signal),
    enabled: identityId !== null && CHEF_REFERRAL_EARNINGS_AVAILABLE,
    staleTime: 30_000,
  });
}

export function useChefReferralCode() {
  const identityId = useAppSelector(state => state.auth.identity?.id ?? null);
  return useQuery({
    queryKey: ['craves', 'v1', 'private', 'chef-referral-code', identityId],
    queryFn: ({ signal }) => referralRewardsApi.getCode(signal),
    enabled: identityId !== null && REFERRAL_CODE_AVAILABLE,
    staleTime: 30_000,
  });
}
