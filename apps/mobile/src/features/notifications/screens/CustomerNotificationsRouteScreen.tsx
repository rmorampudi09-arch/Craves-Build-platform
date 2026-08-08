import React, {useCallback} from 'react';
import {StyleSheet, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {resolveRouteChromePolicy} from '../../../app/navigation/navigationPolicy';
import type {CustomerProfileStackParamList} from '../../../app/navigation/types';
import {useAppSelector} from '../../../app/store/hooks';
import {SharedViewCartOverlay} from '../../cart/components/SharedViewCartOverlay';
import {
  selectCartFoodSubtotal,
  selectCartItemCount,
} from '../../cart/state/cartSelectors';
import {isViewCartOverlayVisible} from '../../cart/viewCartOverlayModel';
import {resolveCustomerNotificationsContentBottomInset} from '../customerNotificationsActiveCart';
import {CustomerNotificationsScreen} from './CustomerNotificationsScreen';

const CUSTOMER_NOTIFICATIONS_ROUTE_POLICY = resolveRouteChromePolicy(
  'Customer',
  'CustomerNotifications',
);

/**
 * P63 keeps the P62 Notifications inbox as the single route implementation and
 * layers only authoritative active-cart chrome around it. Notifications does
 * not own or copy cart state; it consumes shared cart selectors and View Cart.
 */
export function CustomerNotificationsRouteScreen() {
  const navigation =
    useNavigation<
      NativeStackNavigationProp<
        CustomerProfileStackParamList,
        'CustomerNotifications'
      >
    >();
  const itemCount = useAppSelector(selectCartItemCount);
  const subtotal = useAppSelector(selectCartFoodSubtotal);
  const viewCartVisible = isViewCartOverlayVisible(
    {itemCount, subtotal},
    CUSTOMER_NOTIFICATIONS_ROUTE_POLICY,
  );
  const contentBottomInset =
    resolveCustomerNotificationsContentBottomInset(viewCartVisible);

  const handleOpenCart = useCallback(() => {
    navigation.navigate('CustomerCart');
  }, [navigation]);

  return (
    <View style={styles.root}>
      <View style={[styles.notifications, {paddingBottom: contentBottomInset}]}>
        <CustomerNotificationsScreen />
      </View>

      <SharedViewCartOverlay
        routePolicy={CUSTOMER_NOTIFICATIONS_ROUTE_POLICY}
        onOpenCart={handleOpenCart}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  notifications: {
    flex: 1,
  },
});
