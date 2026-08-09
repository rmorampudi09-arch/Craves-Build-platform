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
import {resolveCustomerSupportContentBottomInset} from '../customerSupportActiveCart';
import {CustomerHelpSupportScreen} from './CustomerHelpSupportScreen';

const CUSTOMER_SUPPORT_ROUTE_POLICY = resolveRouteChromePolicy(
  'Customer',
  'CustomerSettingsSupport',
);

/**
 * P77 keeps P76 as the single Help & Support composition and layers only the
 * canonical active-cart chrome around it. Support never owns or copies cart
 * state; the wrapper consumes shared cart selectors and shared View Cart.
 */
export function CustomerHelpSupportRouteScreen() {
  const navigation =
    useNavigation<
      NativeStackNavigationProp<
        CustomerProfileStackParamList,
        'CustomerSettingsSupport'
      >
    >();
  const itemCount = useAppSelector(selectCartItemCount);
  const subtotal = useAppSelector(selectCartFoodSubtotal);
  const viewCartVisible = isViewCartOverlayVisible(
    {itemCount, subtotal},
    CUSTOMER_SUPPORT_ROUTE_POLICY,
  );
  const contentBottomInset =
    resolveCustomerSupportContentBottomInset(viewCartVisible);

  const handleOpenCart = useCallback(() => {
    navigation.navigate('CustomerCart');
  }, [navigation]);

  return (
    <View style={styles.root}>
      <View
        style={[styles.support, {paddingBottom: contentBottomInset}]}
        testID={
          viewCartVisible
            ? 'customer-help-support-active-cart'
            : 'customer-help-support-empty-cart-route'
        }>
        <CustomerHelpSupportScreen />
      </View>

      <SharedViewCartOverlay
        routePolicy={CUSTOMER_SUPPORT_ROUTE_POLICY}
        onOpenCart={handleOpenCart}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  support: {
    flex: 1,
  },
});
