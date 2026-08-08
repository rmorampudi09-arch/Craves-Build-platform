import {useQuery, useQueryClient} from '@tanstack/react-query';
import {createPrivateQueryKey} from '../../../app/query/queryKeys';
import {useAppDispatch, useAppSelector} from '../../../app/store/hooks';
import {invalidateCustomerHomeFeedQueries} from '../../home/query/homeFeedQueries';
import {customerShellApi, unreadNoticeCount} from '../api/customerShellApi';
import {
  customerShellActions,
  type CustomerBrowsingLocation,
} from '../state/customerShellSlice';

const CUSTOMER_ROLE = 'CUSTOMER' as const;

export function useCustomerHeaderState() {
  const identityId = useAppSelector(state => state.auth.identity?.id ?? null);
  const selectedLocation = useAppSelector(
    state => state.customerShell.selectedLocation,
  );

  const notificationsQuery = useQuery({
    queryKey: identityId
      ? createPrivateQueryKey('customer-notification-header', {
          userId: identityId,
          role: CUSTOMER_ROLE,
          paging: {limit: 100},
        })
      : [
          'craves',
          'v1',
          'private',
          'customer-notification-header',
          'signed-out',
        ],
    queryFn: () => customerShellApi.listNotifications(100),
    enabled: Boolean(identityId),
    staleTime: 30_000,
  });

  const unreadCount = unreadNoticeCount(notificationsQuery.data ?? []);

  return {
    selectedLocation,
    locationDisplayName: selectedLocation?.displayName ?? 'Choose location',
    unreadCount,
    badgeLabel:
      unreadCount > 99 ? '99+' : unreadCount > 0 ? String(unreadCount) : null,
    notificationStatus: notificationsQuery.status,
    refreshNotifications: notificationsQuery.refetch,
  };
}

export function useCustomerLocationOptions() {
  const dispatch = useAppDispatch();
  const queryClient = useQueryClient();
  const identityId = useAppSelector(state => state.auth.identity?.id ?? null);
  const selectedLocation = useAppSelector(
    state => state.customerShell.selectedLocation,
  );

  const locationsQuery = useQuery({
    queryKey: identityId
      ? createPrivateQueryKey('customer-saved-locations', {
          userId: identityId,
          role: CUSTOMER_ROLE,
        })
      : [
          'craves',
          'v1',
          'private',
          'customer-saved-locations',
          'signed-out',
        ],
    queryFn: customerShellApi.listSavedLocations,
    enabled: Boolean(identityId),
    staleTime: 60_000,
  });

  const selectLocation = (location: CustomerBrowsingLocation) => {
    const changed =
      selectedLocation?.addressId !== location.addressId ||
      selectedLocation.latitude !== location.latitude ||
      selectedLocation.longitude !== location.longitude;

    dispatch(customerShellActions.locationSelected(location));

    if (changed) {
      invalidateCustomerHomeFeedQueries(queryClient);
    }
  };

  return {
    locations: locationsQuery.data ?? [],
    status: locationsQuery.status,
    error: locationsQuery.error,
    refresh: locationsQuery.refetch,
    selectLocation,
  };
}
