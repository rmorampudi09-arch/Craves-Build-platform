import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {createPrivateQueryKey} from '../../../app/query/queryKeys';
import {useAppSelector} from '../../../app/store/hooks';
import {
  customerShellApi,
  unreadNoticeCount,
  type CustomerNotice,
} from '../../customerShell/api/customerShellApi';
import {
  CUSTOMER_NOTIFICATION_INBOX_V2_AVAILABLE,
  customerNotificationInboxApi,
} from '../api/customerNotificationInboxApi';
import {
  applyCustomerNotificationRead,
  normalizeCustomerNotifications,
} from '../domain/customerNotificationsModel';

const CUSTOMER_ROLE = 'CUSTOMER' as const;
export const CUSTOMER_NOTIFICATION_LIMIT = 100;
export const CUSTOMER_NOTIFICATION_PAGE_SIZE = 50;
const CUSTOMER_NOTIFICATION_DOMAIN = 'customer-notifications';
const CUSTOMER_NOTIFICATION_V2_DOMAIN = 'customer-notifications-v2';
const CUSTOMER_NOTIFICATION_COUNT_DOMAIN = 'customer-notification-unread-count';

export const customerNotificationQueryPrefix = [
  'craves',
  'v1',
  'private',
  CUSTOMER_NOTIFICATION_DOMAIN,
] as const;

export const customerNotificationV2QueryPrefix = [
  'craves',
  'v1',
  'private',
  CUSTOMER_NOTIFICATION_V2_DOMAIN,
] as const;

export function createCustomerNotificationQueryKey(identityId: string) {
  return createPrivateQueryKey(CUSTOMER_NOTIFICATION_DOMAIN, {
    userId: identityId,
    role: CUSTOMER_ROLE,
    paging: {limit: CUSTOMER_NOTIFICATION_LIMIT},
  });
}

export function createCustomerNotificationV2QueryKey(identityId: string) {
  return createPrivateQueryKey(CUSTOMER_NOTIFICATION_V2_DOMAIN, {
    userId: identityId,
    role: CUSTOMER_ROLE,
    paging: {limit: CUSTOMER_NOTIFICATION_PAGE_SIZE},
  });
}

export function createCustomerNotificationCountQueryKey(identityId: string) {
  return createPrivateQueryKey(CUSTOMER_NOTIFICATION_COUNT_DOMAIN, {
    userId: identityId,
    role: CUSTOMER_ROLE,
  });
}

export function useCustomerNotificationsListQuery() {
  const identityId = useAppSelector(state => state.auth.identity?.id ?? null);

  const legacyQueryKey = identityId
    ? createCustomerNotificationQueryKey(identityId)
    : ([...customerNotificationQueryPrefix, 'signed-out'] as const);

  const v2QueryKey = identityId
    ? createCustomerNotificationV2QueryKey(identityId)
    : ([...customerNotificationV2QueryPrefix, 'signed-out'] as const);

  const countQueryKey = identityId
    ? createCustomerNotificationCountQueryKey(identityId)
    : ([
        'craves',
        'v1',
        'private',
        CUSTOMER_NOTIFICATION_COUNT_DOMAIN,
        'signed-out',
      ] as const);

  const legacyQuery = useQuery({
    queryKey: legacyQueryKey,
    queryFn: ({signal}) =>
      customerShellApi.listNotifications(CUSTOMER_NOTIFICATION_LIMIT, signal),
    enabled:
      identityId !== null && !CUSTOMER_NOTIFICATION_INBOX_V2_AVAILABLE,
    staleTime: 30_000,
    select: normalizeCustomerNotifications,
  });

  const v2Query = useInfiniteQuery({
    queryKey: v2QueryKey,
    queryFn: ({pageParam, signal}) =>
      customerNotificationInboxApi.page({
        limit: CUSTOMER_NOTIFICATION_PAGE_SIZE,
        cursor: pageParam,
        unreadOnly: false,
        signal,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: lastPage =>
      lastPage.hasMore ? lastPage.nextCursor ?? undefined : undefined,
    enabled:
      identityId !== null && CUSTOMER_NOTIFICATION_INBOX_V2_AVAILABLE,
    staleTime: 30_000,
  });

  const countQuery = useQuery({
    queryKey: countQueryKey,
    queryFn: ({signal}) => customerNotificationInboxApi.unreadCount(signal),
    enabled:
      identityId !== null && CUSTOMER_NOTIFICATION_INBOX_V2_AVAILABLE,
    staleTime: 15_000,
  });

  const v2Notices = normalizeCustomerNotifications(
    v2Query.data?.pages.flatMap(page => page.notices) ?? [],
  );
  const notices = CUSTOMER_NOTIFICATION_INBOX_V2_AVAILABLE
    ? v2Notices
    : legacyQuery.data ?? [];

  const unreadCount = CUSTOMER_NOTIFICATION_INBOX_V2_AVAILABLE
    ? countQuery.data?.unreadCount ?? 0
    : unreadNoticeCount(notices);

  const refetch = async () => {
    if (CUSTOMER_NOTIFICATION_INBOX_V2_AVAILABLE) {
      await Promise.allSettled([v2Query.refetch(), countQuery.refetch()]);
      return;
    }
    await legacyQuery.refetch();
  };

  return {
    data: notices,
    unreadCount,
    identityId,
    sessionRequired: identityId === null,
    v2Available: CUSTOMER_NOTIFICATION_INBOX_V2_AVAILABLE,
    isPending: CUSTOMER_NOTIFICATION_INBOX_V2_AVAILABLE
      ? v2Query.isPending || countQuery.isPending
      : legacyQuery.isPending,
    isError: CUSTOMER_NOTIFICATION_INBOX_V2_AVAILABLE
      ? v2Query.isError || countQuery.isError
      : legacyQuery.isError,
    isRefetching: CUSTOMER_NOTIFICATION_INBOX_V2_AVAILABLE
      ? v2Query.isRefetching || countQuery.isRefetching
      : legacyQuery.isRefetching,
    refetch,
    hasNextPage: CUSTOMER_NOTIFICATION_INBOX_V2_AVAILABLE
      ? Boolean(v2Query.hasNextPage)
      : false,
    isFetchingNextPage: CUSTOMER_NOTIFICATION_INBOX_V2_AVAILABLE
      ? v2Query.isFetchingNextPage
      : false,
    fetchNextPage: () =>
      CUSTOMER_NOTIFICATION_INBOX_V2_AVAILABLE
        ? v2Query.fetchNextPage().then(() => undefined)
        : Promise.resolve(),
  };
}

export function useMarkCustomerNotificationRead() {
  const identityId = useAppSelector(state => state.auth.identity?.id ?? null);
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: [...customerNotificationQueryPrefix, 'mark-read'],
    mutationFn: (noticeId: string) =>
      CUSTOMER_NOTIFICATION_INBOX_V2_AVAILABLE
        ? customerNotificationInboxApi.markRead(noticeId)
        : customerShellApi.markNotificationRead(noticeId),
    onSuccess: (_data, noticeId) => {
      if (!identityId) return;

      if (CUSTOMER_NOTIFICATION_INBOX_V2_AVAILABLE) {
        void Promise.all([
          queryClient.invalidateQueries({
            queryKey: createCustomerNotificationV2QueryKey(identityId),
            exact: true,
          }),
          queryClient.invalidateQueries({
            queryKey: createCustomerNotificationCountQueryKey(identityId),
            exact: true,
          }),
        ]);
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

export function useMarkAllCustomerNotificationsRead() {
  const identityId = useAppSelector(state => state.auth.identity?.id ?? null);
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: [...customerNotificationV2QueryPrefix, 'mark-all-read'],
    mutationFn: () => {
      if (!CUSTOMER_NOTIFICATION_INBOX_V2_AVAILABLE) {
        throw new Error('CUSTOMER_NOTIFICATION_INBOX_V2_UNAVAILABLE');
      }
      return customerNotificationInboxApi.markAllRead();
    },
    onSuccess: () => {
      if (!identityId) return;
      void Promise.all([
        queryClient.invalidateQueries({
          queryKey: createCustomerNotificationV2QueryKey(identityId),
          exact: true,
        }),
        queryClient.invalidateQueries({
          queryKey: createCustomerNotificationCountQueryKey(identityId),
          exact: true,
        }),
      ]);
    },
  });
}
