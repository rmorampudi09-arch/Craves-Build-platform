import React from 'react';
import {useQuery} from '@tanstack/react-query';
import {useAppSelector} from '../../../app/store/hooks';
import {chefProfileApi} from '../../chefProfile/api/chefProfileApi';
import {createChefProfileKitchenQueryKey} from '../../chefProfile/state/chefProfileQuery';
import {chefBusinessInformationApi} from '../api/chefBusinessInformationApi';
import {createChefBusinessVerificationQueryKey} from './chefBusinessInformationQuery';

const SIGNED_OUT_KITCHEN_KEY = [
  'craves',
  'v1',
  'private',
  'chef-profile-kitchen',
  'signed-out',
] as const;
const SIGNED_OUT_VERIFICATION_KEY = [
  'craves',
  'v1',
  'private',
  'chef-business-information',
  'signed-out',
] as const;

export function useChefBusinessInformationModel() {
  const identity = useAppSelector(state => state.auth.identity);

  const kitchenQueryKey = React.useMemo(
    () =>
      identity?.id
        ? createChefProfileKitchenQueryKey(identity.id)
        : SIGNED_OUT_KITCHEN_KEY,
    [identity?.id],
  );
  const verificationQueryKey = React.useMemo(
    () =>
      identity?.id
        ? createChefBusinessVerificationQueryKey(identity.id)
        : SIGNED_OUT_VERIFICATION_KEY,
    [identity?.id],
  );

  const kitchenQuery = useQuery({
    queryKey: kitchenQueryKey,
    queryFn: ({signal}) => chefProfileApi.getKitchen(signal),
    enabled: identity?.id !== undefined,
    staleTime: 60_000,
  });
  const verificationQuery = useQuery({
    queryKey: verificationQueryKey,
    queryFn: ({signal}) => chefBusinessInformationApi.getVerificationRecord(signal),
    enabled: identity?.id !== undefined,
    staleTime: 60_000,
  });

  const refresh = React.useCallback(async () => {
    await Promise.allSettled([
      kitchenQuery.refetch(),
      verificationQuery.refetch(),
    ]);
  }, [kitchenQuery, verificationQuery]);

  const kitchen = kitchenQuery.data ?? null;
  const verification = verificationQuery.data ?? null;

  return {
    identity,
    kitchen,
    verification,
    kitchenStatus: kitchenQuery.status,
    verificationStatus: verificationQuery.status,
    isInitialLoading:
      (!kitchen && kitchenQuery.isPending) ||
      (!verification && verificationQuery.isPending),
    hasInitialError:
      (!kitchen && kitchenQuery.isError) ||
      (!verification && verificationQuery.isError),
    isRefreshing: kitchenQuery.isFetching || verificationQuery.isFetching,
    refresh,
  };
}
