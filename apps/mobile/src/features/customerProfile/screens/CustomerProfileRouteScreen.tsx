import React, {useCallback} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {resolveRouteChromePolicy} from '../../../app/navigation/navigationPolicy';
import type {CustomerProfileStackParamList} from '../../../app/navigation/types';
import {useAppSelector} from '../../../app/store/hooks';
import {colors, radius, spacing, touchTarget} from '../../../design/tokens';
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
 * P74 adds an explicit Settings entry point without changing the P58/P59
 * profile hub or its canonical active-cart overlay behavior.
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

  const handleOpenSettings = useCallback(() => {
    navigation.navigate('CustomerSettings');
  }, [navigation]);

  return (
    <View style={styles.root}>
      <View style={[styles.profile, {paddingBottom: contentBottomInset}]}>
        <CustomerProfileScreen />
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open Settings"
        accessibilityHint="Opens account and preference settings"
        hitSlop={spacing.xs}
        onPress={handleOpenSettings}
        style={({pressed}) => [styles.settingsShortcut, pressed && styles.pressed]}>
        <Text style={styles.settingsGlyph}>⚙️</Text>
      </Pressable>

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
  settingsShortcut: {
    position: 'absolute',
    top: spacing.sm,
    right: touchTarget.minimum + spacing.lg,
    width: touchTarget.minimum,
    height: touchTarget.minimum,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    zIndex: 4,
  },
  settingsGlyph: {
    fontSize: 20,
  },
  pressed: {
    opacity: 0.75,
  },
});
