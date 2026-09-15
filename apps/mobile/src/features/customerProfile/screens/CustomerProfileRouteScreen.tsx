import React, {useCallback} from 'react';
import {StyleSheet, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {resolveRouteChromePolicy} from '../../../app/navigation/navigationPolicy';
import type {CustomerProfileStackParamList} from '../../../app/navigation/types';
import {useAppSelector} from '../../../app/store/hooks';
import {colors} from '../../../design/tokens';
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
 * Profile owns the account hub. Settings is exposed from the canonical profile
 * menu inside CustomerProfileScreen; this route must not add a second shortcut.
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
    backgroundColor: colors.white,
  },
  profile: {
    flex: 1,
  },
});
