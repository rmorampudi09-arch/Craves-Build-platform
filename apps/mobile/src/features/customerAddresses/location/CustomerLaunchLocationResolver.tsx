import React from 'react';
import {AppState} from 'react-native';
import * as Location from 'expo-location';
import {useQueryClient} from '@tanstack/react-query';
import {useAppDispatch, useAppSelector} from '../../../app/store/hooks';
import {customerShellActions} from '../../customerShell/state/customerShellSlice';
import {invalidateCustomerLocationDependentQueries} from '../../customerShell/query/customerLocationReconciliation';
import {customerAddressesApi} from '../api/customerAddressesApi';
import {
  isCustomerAddressDeliveryReady,
  toCustomerBrowsingLocation,
} from '../domain/customerAddressContract';

const LIVE_LOCATION_ID = 'LIVE_GPS';
const SAVED_ADDRESS_MATCH_RADIUS_METERS = 100;

/**
 * Resolves the customer's current browsing/delivery location when the customer
 * shell starts and whenever the app returns to the foreground. The OS prompt
 * is shown only while permission is still requestable; a denied permission is
 * not re-prompted on every foreground transition.
 */
export function CustomerLaunchLocationResolver() {
  const dispatch = useAppDispatch();
  const queryClient = useQueryClient();
  const identityId = useAppSelector(state => state.auth.identity?.id ?? null);
  const inFlight = React.useRef(false);
  const mounted = React.useRef(true);

  React.useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const publish = React.useCallback(
    async (location: Parameters<typeof customerShellActions.locationSelected>[0]) => {
      if (!mounted.current) {
        return;
      }
      dispatch(customerShellActions.locationSelected(location));
      await invalidateCustomerLocationDependentQueries(queryClient);
    },
    [dispatch, queryClient],
  );

  const selectSavedFallback = React.useCallback(async () => {
    try {
      const addresses = await customerAddressesApi.list();
      const fallback =
        addresses.find(
          candidate =>
            candidate.isDefault && isCustomerAddressDeliveryReady(candidate),
        ) ?? addresses.find(isCustomerAddressDeliveryReady);
      const location = fallback ? toCustomerBrowsingLocation(fallback) : null;
      if (location) {
        await publish(location);
      }
    } catch {
      // The header remains in its normal choose-location state if neither GPS
      // nor saved addresses can be resolved.
    }
  }, [publish]);

  const resolveCurrentLocation = React.useCallback(async () => {
    if (!identityId || inFlight.current) {
      return;
    }

    inFlight.current = true;
    try {
      let permission = await Location.getForegroundPermissionsAsync();
      if (
        permission.status === Location.PermissionStatus.UNDETERMINED &&
        permission.canAskAgain
      ) {
        permission = await Location.requestForegroundPermissionsAsync();
      }

      if (permission.status !== Location.PermissionStatus.GRANTED) {
        await selectSavedFallback();
        return;
      }

      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      const latitude = current.coords.latitude;
      const longitude = current.coords.longitude;

      try {
        const recommendation = await customerAddressesApi.recommendLocation(
          latitude,
          longitude,
          SAVED_ADDRESS_MATCH_RADIUS_METERS,
        );
        if (
          recommendation.locationType === 'SAVED_ADDRESS' &&
          recommendation.selectedSavedAddress &&
          isCustomerAddressDeliveryReady(recommendation.selectedSavedAddress)
        ) {
          const savedLocation = toCustomerBrowsingLocation(
            recommendation.selectedSavedAddress,
          );
          if (savedLocation) {
            await publish(savedLocation);
            return;
          }
        }
      } catch {
        // Recommendation is an optimization. Live GPS still remains usable.
      }

      let displayName = 'Current location';
      try {
        const resolved = await customerAddressesApi.reverseGeocode(
          latitude,
          longitude,
        );
        displayName =
          resolved.area ||
          resolved.city ||
          resolved.district ||
          resolved.formattedAddress;
      } catch {
        // Discovery can use coordinates even if the written label cannot be
        // resolved at this moment.
      }

      await publish({
        kind: 'LIVE_GPS',
        addressId: LIVE_LOCATION_ID,
        label: 'Current location',
        displayName,
        latitude,
        longitude,
      });
    } catch {
      await selectSavedFallback();
    } finally {
      inFlight.current = false;
    }
  }, [identityId, publish, selectSavedFallback]);

  React.useEffect(() => {
    resolveCurrentLocation().catch(() => undefined);
    const subscription = AppState.addEventListener('change', nextState => {
      if (nextState === 'active') {
        resolveCurrentLocation().catch(() => undefined);
      }
    });
    return () => subscription.remove();
  }, [resolveCurrentLocation]);

  return null;
}
