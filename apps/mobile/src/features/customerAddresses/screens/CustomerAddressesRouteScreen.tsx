import React, {useCallback} from 'react';
import {StyleSheet, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {resolveRouteChromePolicy} from '../../../app/navigation/navigationPolicy';
import type {CustomerProfileStackParamList} from '../../../app/navigation/types';
import {useAppSelector} from '../../../app/store/hooks';
import {SharedViewCartOverlay} from '../../cart/components/SharedViewCartOverlay';
import {selectCartFoodSubtotal, selectCartItemCount} from '../../cart/state/cartSelectors';
import {isViewCartOverlayVisible} from '../../cart/viewCartOverlayModel';
import {resolveCustomerAddressesContentBottomInset} from '../customerAddressesActiveCart';
import {CustomerAddressesScreen} from './CustomerAddressesScreen';

const CUSTOMER_ADDRESSES_ROUTE_POLICY = resolveRouteChromePolicy(
  'Customer',
  'CustomerAddresses',
);

/** P66 uses one My Addresses route for both active and empty cart references. */
export function CustomerAddressesRouteScreen() {
  const navigation =
    useNavigation<
      NativeStackNavigationProp<CustomerProfileStackParamList, 'CustomerAddresses'>
    >();
  const itemCount = useAppSelector(selectCartItemCount);
  const subtotal = useAppSelector(selectCartFoodSubtotal);
  const viewCartVisible = isViewCartOverlayVisible(
    {itemCount, subtotal},
    CUSTOMER_ADDRESSES_ROUTE_POLICY,
  );
  const contentBottomInset =
    resolveCustomerAddressesContentBottomInset(viewCartVisible);

  const handleOpenCart = useCallback(() => {
    navigation.navigate('CustomerCart');
  }, [navigation]);

  return (
    <View style={styles.root}>
      <View style={[styles.content, {paddingBottom: contentBottomInset}]}>
        <CustomerAddressesScreen />
      </View>
      <SharedViewCartOverlay
        routePolicy={CUSTOMER_ADDRESSES_ROUTE_POLICY}
        onOpenCart={handleOpenCart}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1},
  content: {flex: 1},
});
