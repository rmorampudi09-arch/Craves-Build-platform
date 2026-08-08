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
import {CustomerProfileScreen} from './CustomerProfileScreen';

const CUSTOMER_PROFILE_ROUTE_POLICY = resolveRouteChromePolicy('Customer', 'Profile');

/**
 * P59 keeps the P58 Profile hub as the single route implementation and adds
 * only state-driven active-cart chrome. The authoritative shared cart remains
 * outside Profile ownership, so opening Profile or its supported navigation
 * actions cannot silently replace or clear the customer cart.
 */
export function CustomerProfileRouteScreen() {
  const navigation =
    useNavigation<
      NativeStackNavigationProp<CustomerProfileStackParamList, 'CustomerProfileRoot'>
    >();
  const itemCount = useAppSelector(selectCartItemCount);
  const subtotal = useAppSelector(selectCartFoodSubtotal);
  const viewCartVisible = isViewCartOverlayVisible(
    {itemCount, subtotal},
    CUSTOMER_PROFILE_ROUTE_POLICY,
  );
  const contentBottomInset =
    resolveCustomerProfileContentBottomInset(viewCartVisible);

  const handleOpenCart = useCallback(() => {
    navigation.navigate('CustomerCart');
  }, [navigation]);

  return (
    <View style={styles.root}>
      <View style={[styles.profile, {paddingBottom: contentBottomInset}]}>
        <CustomerProfileScreen />
      </View>

      <SharedViewCartOverlay
        routePolicy={CUSTOMER_PROFILE_ROUTE_POLICY}
        onOpenCart={handleOpenCart}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  profile: {
    flex: 1,
  },
});
