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
import {resolveCustomerProfileContentBottomInset} from '../customerProfileActiveCart';
import {CustomerProfileEditScreen} from './CustomerProfileEditScreen';

const CUSTOMER_PROFILE_EDIT_ROUTE_POLICY = resolveRouteChromePolicy(
  'Customer',
  'CustomerProfileEdit',
);

/**
 * P65 renders references 23/24 through one route. The empty variant has no cart
 * CTA; the active variant reuses the authoritative shared overlay and only adds
 * content clearance, so editing never forks or mutates cart state.
 */
export function CustomerProfileEditRouteScreen() {
  const navigation =
    useNavigation<
      NativeStackNavigationProp<CustomerProfileStackParamList, 'CustomerProfileEdit'>
    >();
  const itemCount = useAppSelector(selectCartItemCount);
  const subtotal = useAppSelector(selectCartFoodSubtotal);
  const viewCartVisible = isViewCartOverlayVisible(
    {itemCount, subtotal},
    CUSTOMER_PROFILE_EDIT_ROUTE_POLICY,
  );
  const contentBottomInset =
    resolveCustomerProfileContentBottomInset(viewCartVisible);

  const handleOpenCart = useCallback(() => {
    navigation.navigate('CustomerCart');
  }, [navigation]);

  return (
    <View style={styles.root}>
      <View style={[styles.content, {paddingBottom: contentBottomInset}]}>
        <CustomerProfileEditScreen />
      </View>
      <SharedViewCartOverlay
        routePolicy={CUSTOMER_PROFILE_EDIT_ROUTE_POLICY}
        onOpenCart={handleOpenCart}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1},
  content: {flex: 1},
});