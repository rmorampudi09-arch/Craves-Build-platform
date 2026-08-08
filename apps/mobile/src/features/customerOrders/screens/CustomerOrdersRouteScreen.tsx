import React, {useCallback} from 'react';
import {StyleSheet, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {resolveRouteChromePolicy} from '../../../app/navigation/navigationPolicy';
import type {CustomerOrdersStackParamList} from '../../../app/navigation/types';
import {useAppSelector} from '../../../app/store/hooks';
import {SharedViewCartOverlay} from '../../cart/components/SharedViewCartOverlay';
import {
  selectCartFoodSubtotal,
  selectCartItemCount,
} from '../../cart/state/cartSelectors';
import {isViewCartOverlayVisible} from '../../cart/viewCartOverlayModel';
import {resolveCustomerOrdersContentBottomInset} from '../customerOrdersActiveCart';
import {CustomerOrdersScreen} from './CustomerOrdersScreen';

const CUSTOMER_ORDERS_ROUTE_POLICY = resolveRouteChromePolicy('Customer', 'Orders');

/**
 * P54 keeps the P53 Orders composition as one route and adds only the
 * state-driven active-cart chrome. Cart opening uses the existing real Cart
 * destination; unsupported reorder/cart merge behavior remains fail-closed in
 * the Orders cards until an authoritative contract is available.
 */
export function CustomerOrdersRouteScreen() {
  const navigation =
    useNavigation<
      NativeStackNavigationProp<
        CustomerOrdersStackParamList,
        'CustomerOrdersRoot'
      >
    >();
  const itemCount = useAppSelector(selectCartItemCount);
  const subtotal = useAppSelector(selectCartFoodSubtotal);
  const viewCartVisible = isViewCartOverlayVisible(
    {itemCount, subtotal},
    CUSTOMER_ORDERS_ROUTE_POLICY,
  );
  const contentBottomInset =
    resolveCustomerOrdersContentBottomInset(viewCartVisible);

  const handleOpenCart = useCallback(() => {
    navigation.navigate('CustomerCart');
  }, [navigation]);

  return (
    <View style={styles.root}>
      <View style={[styles.orders, {paddingBottom: contentBottomInset}]}>
        <CustomerOrdersScreen />
      </View>

      <SharedViewCartOverlay
        routePolicy={CUSTOMER_ORDERS_ROUTE_POLICY}
        onOpenCart={handleOpenCart}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  orders: {
    flex: 1,
  },
});
