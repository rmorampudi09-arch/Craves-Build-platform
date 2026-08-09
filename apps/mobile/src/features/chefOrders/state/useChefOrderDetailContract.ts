import React from 'react';
import {useQuery} from '@tanstack/react-query';
import {createPrivateQueryKey} from '../../../app/query/queryKeys';
import {useAppSelector} from '../../../app/store/hooks';
import {
  chefOrderDetailApi,
  isChefOrderId,
} from '../api/chefOrderDetailApi';
import {
  deriveChefOrderDetailContractModel,
  type ChefOrderDetailContractModel,
} from '../domain/chefOrderDetailModel';

const CHEF_ROLE = 'CHEF' as const;

export interface ChefOrderDetailQueryContract {
  data: ChefOrderDetailContractModel | null;
  status: 'pending' | 'error' | 'success';
  error: Error | null;
  isFetching: boolean;
  refresh: () => Promise<void>;
}

export function useChefOrderDetailContract(
  orderId: string | null,
): ChefOrderDetailQueryContract {
  const identityId = useAppSelector(state => state.auth.identity?.id ?? null);
  const validatedOrderId = isChefOrderId(orderId) ? orderId : null;

  const queryKey = React.useMemo(
    () =>
      identityId && validatedOrderId
        ? createPrivateQueryKey('chef-order-detail', {
            userId: identityId,
            role: CHEF_ROLE,
            entityId: validatedOrderId,
          })
        : ([
            'craves',
            'v1',
            'private',
            'chef-order-detail',
            'unavailable',
          ] as const),
    [identityId, validatedOrderId],
  );

  const query = useQuery({
    queryKey,
    queryFn: ({signal}) => {
      if (!validatedOrderId) {
        throw new Error('Chef order ID is unavailable.');
      }
      return chefOrderDetailApi.getOrder(validatedOrderId, signal);
    },
    enabled: identityId !== null && validatedOrderId !== null,
    staleTime: 10_000,
  });

  const data = React.useMemo(
    () => (query.data ? deriveChefOrderDetailContractModel(query.data) : null),
    [query.data],
  );

  const refresh = React.useCallback(async () => {
    if (!validatedOrderId || !identityId) {
      return;
    }
    await query.refetch();
  }, [identityId, query, validatedOrderId]);

  return {
    data,
    status: query.status,
    error: query.error,
    isFetching: query.isFetching,
    refresh,
  };
}
