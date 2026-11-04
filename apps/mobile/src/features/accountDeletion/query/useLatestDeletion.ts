import {useCallback} from 'react';
import {useFocusEffect} from '@react-navigation/native';
import {useQuery} from '@tanstack/react-query';
import {useAppSelector} from '../../../app/store/hooks';
import {toAppApiError} from '../../../core/http/apiError';
import {accountDeletionApi} from '../api/accountDeletionApi';
import {shouldShowDeleteRow} from '../domain/deletionModel';
import {accountDeletionQueryKey} from './accountDeletionQueryKey';

/** The person's latest delete request, and whether the Delete row may show (only when the server answered). */
export function useLatestDeletion() {
  const identityId = useAppSelector(state => state.auth.identity?.id);
  const query = useQuery({
    // Disabled while signed out, so the placeholder id is never fetched.
    queryKey: accountDeletionQueryKey(identityId ?? 'signed-out'),
    queryFn: () => accountDeletionApi.getLatest(),
    enabled: Boolean(identityId),
    refetchOnMount: 'always',
    retry: false,
  });
  const queryRefetch = query.refetch;
  // refetch() ignores `enabled`, so the signed-out case is guarded here.
  const refetch = useCallback(
    (cancelRefetch = true) => {
      if (identityId) {
        void queryRefetch({cancelRefetch});
      }
    },
    [identityId, queryRefetch],
  );

  // cancelRefetch false: the fetch the mount just started is joined, not restarted.
  useFocusEffect(useCallback(() => refetch(false), [refetch]));

  const showRow =
    query.isSuccess ||
    (query.isError && shouldShowDeleteRow({ok: false, error: toAppApiError(query.error)}));

  return {
    // A failed refresh keeps the old data in react-query; the row is hidden then, so the request goes too.
    latest: query.isSuccess ? query.data : null,
    showRow,
    status: query.status,
    refetch: () => refetch(),
  };
}
