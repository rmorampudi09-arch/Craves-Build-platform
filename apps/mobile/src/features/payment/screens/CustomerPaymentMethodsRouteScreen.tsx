import React, {useCallback} from 'react';
import {StyleSheet, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import type {NavigationProp} from '@react-navigation/native';
import {resolveRouteChromePolicy} from '../../../app/navigation/navigationPolicy';
import type {
  CustomerCartStackParamList,
  CustomerPaymentMethodsStackParamList,
} from '../../../app/navigation/types';
import {spacing, touchTarget} from '../../../design/tokens';
import {SharedViewCartOverlay} from '../../cart/components/SharedViewCartOverlay';
import {CustomerPaymentMethodsScreen} from './CustomerPaymentMethodsScreen';

const CUSTOMER_PAYMENT_METHODS_ROUTE_POLICY = resolveRouteChromePolicy(
  'Customer',
  'CustomerPaymentMethods',
);
const PAYMENT_METHODS_CART_OVERLAY_OFFSET =
  touchTarget.comfortable + spacing.xl;

type PaymentMethodsNavigation = NavigationProp<
  CustomerPaymentMethodsStackParamList & CustomerCartStackParamList,
  'CustomerPaymentMethods'
>;

/**
 * P68 keeps Payment Methods as one shared route while the canonical View Cart
 * overlay derives its active/empty visibility directly from the cart domain.
 */
export function CustomerPaymentMethodsRouteScreen() {
  const navigation = useNavigation<PaymentMethodsNavigation>();

  const handleOpenCart = useCallback(() => {
    navigation.navigate('CustomerCart');
  }, [navigation]);

  return (
    <View style={styles.root}>
      <CustomerPaymentMethodsScreen />
      <SharedViewCartOverlay
        routePolicy={CUSTOMER_PAYMENT_METHODS_ROUTE_POLICY}
        onOpenCart={handleOpenCart}
        bottomOffset={PAYMENT_METHODS_CART_OVERLAY_OFFSET}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
