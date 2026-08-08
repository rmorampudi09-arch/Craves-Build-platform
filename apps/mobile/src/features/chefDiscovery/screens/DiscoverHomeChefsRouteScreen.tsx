import React, {useCallback} from 'react';
import {Alert, StyleSheet, View} from 'react-native';
import {resolveRouteChromePolicy} from '../../../app/navigation/navigationPolicy';
import {useAppSelector} from '../../../app/store/hooks';
import {SharedViewCartOverlay} from '../../cart/components/SharedViewCartOverlay';
import {
  selectCartFoodSubtotal,
  selectCartItemCount,
} from '../../cart/state/cartSelectors';
import {isViewCartOverlayVisible} from '../../cart/viewCartOverlayModel';
import {resolveChefDiscoveryContentBottomInset} from '../chefDiscoveryActiveCart';
import {DiscoverHomeChefsScreen} from './DiscoverHomeChefsScreen';

const CUSTOMER_CHEFS_ROUTE_POLICY = resolveRouteChromePolicy('Customer', 'Chefs');

export function DiscoverHomeChefsRouteScreen() {
  const itemCount = useAppSelector(selectCartItemCount);
  const subtotal = useAppSelector(selectCartFoodSubtotal);
  const viewCartVisible = isViewCartOverlayVisible(
    {itemCount, subtotal},
    CUSTOMER_CHEFS_ROUTE_POLICY,
  );
  const contentBottomInset = resolveChefDiscoveryContentBottomInset(viewCartVisible);

  const handleOpenCart = useCallback(() => {
    Alert.alert(
      'Cart details unavailable',
      'Your active cart is preserved, but the Cart screen is not available in this build yet.',
    );
  }, []);

  return (
    <View style={styles.root}>
      <View style={[styles.discovery, {paddingBottom: contentBottomInset}]}>
        <DiscoverHomeChefsScreen />
      </View>

      <SharedViewCartOverlay
        routePolicy={CUSTOMER_CHEFS_ROUTE_POLICY}
        onOpenCart={handleOpenCart}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  discovery: {
    flex: 1,
  },
});
