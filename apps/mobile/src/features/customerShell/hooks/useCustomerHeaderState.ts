import {useCallback} from 'react';
import {useNavigation, type NavigationProp, type ParamListBase} from '@react-navigation/native';
import {useQuery, useQueryClient} from '@tanstack/react-query';
import {createPrivateQueryKey} from '../../../app/query/queryKeys';
import type {CustomerTabParamList} from '../../../app/navigation/types';
import {useAppDispatch, useAppSelector} from '../../../app/store/hooks';
import {useCustomerNotificationsListQuery} from '../../notifications/query/customerNotificationQueries';
import {customerShellApi, unreadNoticeCount} from '../api/customerShellApi';
import {invalidateCustomerLocationDependentQueries} from '../query/customerLocationReconciliation';
import {persistCustomerLocation} from '../state/customerLocationPersistence';
import {
  customerShellActions,
  type CustomerBrowsingLocation,
} from '../state/customerShellSlice';

const CUSTOMER_ROLE = 'CUSTOMER' as const;

export function useCustomerHeaderState() {
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const selectedLocation = useAppSelector(
    state => state.customerShell.selectedLocation,
  );
  const notificationsQuery = useCustomerNotificationsListQuery();
  const unreadCount = unreadNoticeCount(notificationsQuery.data ?? []);

  const openNotifications = useCallback(() => {
    if (navigation.getState().routeNames.includes('CustomerNotifications')) {
      navigation.navigate('CustomerNotifications');
      return;
    }

    const tabs = navigation.getParent<NavigationProp<CustomerTabParamList>>();
    if (tabs) {
      tabs.navigate('Profile', {screen: 'CustomerNotifications'});
      return;
    }
    notificationsQuery.refetch().catch(() => undefined);
  }, [navigation, notificationsQuery]);

  return {
    selectedLocation,
    locationDisplayName: selectedLocation?.displayName ?? 'Choose location',
    unreadCount,
    badgeLabel:
      unreadCount > 99 ? '99+' : unreadCount > 0 ? String(unreadCount) : null,
    notificationStatus: notificationsQuery.status,
    openNotifications,
    // Existing CustomerHeader callers use this callback name. P62 changes the
    // bell action from refresh-only to the real Notifications destination.
    refreshNotifications: openNotifications,
    refetchNotifications: notificationsQuery.refetch,
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
    if (identityId) {
      persistCustomerLocation(identityId, location).catch(() => undefined);
    }

    if (changed) {
      invalidateCustomerLocationDependentQueries(queryClient);
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