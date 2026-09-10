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
import {resolveCustomerFavoritesContentBottomInset} from '../customerFavoritesActiveCart';
import {CustomerFavoritesScreen} from './CustomerFavoritesScreen';

const CUSTOMER_FAVORITES_ROUTE_POLICY = resolveRouteChromePolicy(
  'Customer',
  'CustomerFavorites',
);

/**
 * P61 keeps P60 Favorites as the single route implementation and layers only
 * authoritative active-cart chrome around it. Favorites does not own or copy
 * cart state; it consumes the shared cart selectors and View Cart control.
 */
export function CustomerFavoritesRouteScreen() {
  const navigation =
    useNavigation<
      NativeStackNavigationProp<CustomerProfileStackParamList, 'CustomerFavorites'>
    >();
  const itemCount = useAppSelector(selectCartItemCount);
  const subtotal = useAppSelector(selectCartFoodSubtotal);
  const viewCartVisible = isViewCartOverlayVisible(
    {itemCount, subtotal},
    CUSTOMER_FAVORITES_ROUTE_POLICY,
  );
  const contentBottomInset =
    resolveCustomerFavoritesContentBottomInset(viewCartVisible);

  const handleOpenCart = useCallback(() => {
    navigation.navigate('CustomerCart');
  }, [navigation]);

  return (
    <View style={styles.root}>
      <View style={[styles.favorites, {paddingBottom: contentBottomInset}]}>
        <CustomerFavoritesScreen />
      </View>

      <SharedViewCartOverlay
        routePolicy={CUSTOMER_FAVORITES_ROUTE_POLICY}
        onOpenCart={handleOpenCart}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  favorites: {
    flex: 1,
  },
});
