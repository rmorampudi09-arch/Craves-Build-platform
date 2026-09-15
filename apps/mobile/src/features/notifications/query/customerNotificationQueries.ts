import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {createPrivateQueryKey} from '../../../app/query/queryKeys';
import {useAppSelector} from '../../../app/store/hooks';
import {
  customerShellApi,
  type CustomerNotice,
} from '../../customerShell/api/customerShellApi';
import {
  applyCustomerNotificationRead,
  normalizeCustomerNotifications,
} from '../domain/customerNotificationsModel';

const CUSTOMER_ROLE = 'CUSTOMER' as const;
export const CUSTOMER_NOTIFICATION_LIMIT = 100;
const CUSTOMER_NOTIFICATION_DOMAIN = 'customer-notifications';

export const customerNotificationQueryPrefix = [
  'craves',
  'v1',
  'private',
  CUSTOMER_NOTIFICATION_DOMAIN,
] as const;

export function createCustomerNotificationQueryKey(identityId: string) {
  return createPrivateQueryKey(CUSTOMER_NOTIFICATION_DOMAIN, {
    userId: identityId,
    role: CUSTOMER_ROLE,
    paging: {limit: CUSTOMER_NOTIFICATION_LIMIT},
  });
}

export function useCustomerNotificationsListQuery() {
  const identityId = useAppSelector(state => state.auth.identity?.id ?? null);
  const queryKey = identityId
    ? createCustomerNotificationQueryKey(identityId)
    : ([...customerNotificationQueryPrefix, 'signed-out'] as const);
  const query = useQuery({
    queryKey,
    queryFn: ({signal}) =>
      customerShellApi.listNotifications(CUSTOMER_NOTIFICATION_LIMIT, signal),
    enabled: identityId !== null,
    staleTime: 30_000,
    select: normalizeCustomerNotifications,
  });

  return {
    ...query,
    identityId,
    sessionRequired: identityId === null,
  };
}

export function useMarkCustomerNotificationRead() {
  const identityId = useAppSelector(state => state.auth.identity?.id ?? null);
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: [...customerNotificationQueryPrefix, 'mark-read'],
    mutationFn: (noticeId: string) => customerShellApi.markNotificationRead(noticeId),
    onSuccess: (_data, noticeId) => {
      if (!identityId) {
        return;
      }
      const queryKey = createCustomerNotificationQueryKey(identityId);
      queryClient.setQueryData<CustomerNotice[]>(queryKey, current =>
        applyCustomerNotificationRead(
          current ?? [],
          noticeId,
          new Date().toISOString(),
        ),
      );
    },
  });
}
