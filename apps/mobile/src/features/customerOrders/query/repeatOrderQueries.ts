import {useInfiniteQuery} from '@tanstack/react-query';
import {createPrivateQueryKey} from '../../../app/query/queryKeys';
import {useAppSelector} from '../../../app/store/hooks';
import {repeatOrdersApi} from '../api/repeatOrdersApi';

const CUSTOMER_ROLE = 'CUSTOMER' as const;
const DOMAIN = 'customer-repeat-order-candidates';

export function useRepeatOrderCandidatesQuery() {
  const identityId = useAppSelector(state => state.auth.identity?.id ?? null);
  const queryKey = identityId
    ? createPrivateQueryKey(DOMAIN, {userId: identityId, role: CUSTOMER_ROLE})
    : (['craves', 'v1', 'private', DOMAIN, 'signed-out'] as const);

  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({pageParam, signal}) => repeatOrdersApi.list(pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: lastPage => lastPage.nextCursor ?? undefined,
    enabled: identityId !== null,
    staleTime: 60_000,
  });

  return {
    ...query,
    identityId,
    sessionRequired: identityId === null,
    items: query.data?.pages.flatMap(page => page.items) ?? [],
  };
}
