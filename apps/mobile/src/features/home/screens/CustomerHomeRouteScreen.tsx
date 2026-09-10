import React, {useCallback} from 'react';
import {StyleSheet, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {resolveRouteChromePolicy} from '../../../app/navigation/navigationPolicy';
import type {CustomerHomeStackParamList} from '../../../app/navigation/types';
import {useAppSelector} from '../../../app/store/hooks';
import {safeArea, spacing, touchTarget} from '../../../design/tokens';
import {SharedViewCartOverlay} from '../../cart/components/SharedViewCartOverlay';
import {
  selectCartFoodSubtotal,
  selectCartItemCount,
} from '../../cart/state/cartSelectors';
import {isViewCartOverlayVisible} from '../../cart/viewCartOverlayModel';
import {CustomerHomeScreen} from './CustomerHomeScreen';

const CUSTOMER_HOME_ROUTE_POLICY = resolveRouteChromePolicy('Customer', 'Home');
const VIEW_CART_CONTENT_CLEARANCE =
  safeArea.floatingControlClearance + touchTarget.comfortable + spacing.md;

/**
 * P46 owns the real Cart destination. Keeping the overlay wrapper outside the
 * P31/P33 Home content lets Cart navigation become live without disturbing the
 * discovery screen's preserved search/filter/scroll implementation.
 */
export function CustomerHomeRouteScreen() {
  const navigation =
    useNavigation<
      NativeStackNavigationProp<CustomerHomeStackParamList, 'CustomerHomeRoot'>
    >();
  const itemCount = useAppSelector(selectCartItemCount);
  const subtotal = useAppSelector(selectCartFoodSubtotal);
  const viewCartVisible = isViewCartOverlayVisible(
    {itemCount, subtotal},
    CUSTOMER_HOME_ROUTE_POLICY,
  );

  const handleOpenCart = useCallback(() => {
    navigation.navigate('CustomerCart');
  }, [navigation]);

  return (
    <View style={styles.root}>
      <View
        style={[
          styles.home,
          viewCartVisible && styles.homeWithViewCart,
        ]}>
        <CustomerHomeScreen />
      </View>
      <SharedViewCartOverlay
        routePolicy={CUSTOMER_HOME_ROUTE_POLICY}
        onOpenCart={handleOpenCart}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  home: {
    flex: 1,
  },
  homeWithViewCart: {
    paddingBottom: VIEW_CART_CONTENT_CLEARANCE,
  },
});
