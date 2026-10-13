import React from 'react';
import {useQuery} from '@tanstack/react-query';
import {shouldRetryQuery} from '../../../app/query/queryPolicy';
import {createPrivateQueryKey} from '../../../app/query/queryKeys';
import {useAppSelector} from '../../../app/store/hooks';
import {isRouteNotPublished} from '../../../core/http/routeAvailability';

/**
 * One chef-private read for a Profile screen. It never asks again for a route the server has not
 * published for the app yet; the screen shows Coming soon for that (see ReadState).
 */
export function useChefRead<T>(
  domain: string,
  read: (signal: AbortSignal) => Promise<T>,
  options: {entityId?: string; staleTime?: number; enabled?: boolean} = {},
) {
  const identityId = useAppSelector(state => state.auth.identity?.id ?? null);
  const {entityId, staleTime = 30_000, enabled = true} = options;
  const queryKey = React.useMemo(
    () =>
      identityId
        ? createPrivateQueryKey(domain, {userId: identityId, role: 'CHEF', entityId})
        : (['craves', 'v1', 'private', domain, 'signed-out'] as const),
    [domain, entityId, identityId],
  );
  const query = useQuery({
    queryKey,
    queryFn: ({signal}) => read(signal),
    enabled: identityId !== null && enabled,
    staleTime,
    retry: (count, error) => !isRouteNotPublished(error) && shouldRetryQuery(count, error),
  });
  return {query, queryKey, identityId};
}
