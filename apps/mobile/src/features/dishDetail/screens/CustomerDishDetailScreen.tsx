import React from 'react';
import {Alert, Pressable, StyleSheet, View} from 'react-native';
import MaterialDesignIcons from '@react-native-vector-icons/material-design-icons';
import {useRoute, type RouteProp} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import type {CustomerDishDetailStackParamList} from '../../../app/navigation/types';
import {colors, radius, spacing, touchTarget} from '../../../design/tokens';
import {
  isFavoriteMenuItem,
  useCustomerFavoritesQuery,
  useToggleCustomerFavorite,
} from '../../favorites/query/customerFavoritesQueries';
import {CustomerDishDetailScreen as CustomerDishDetailLegacyScreen} from './CustomerDishDetailLegacyScreen';

type DishDetailRoute = RouteProp<
  CustomerDishDetailStackParamList,
  'CustomerDishDetail'
>;

/**
 * Keeps the proven dish-detail/cart implementation intact while replacing its
 * former text-only Save placeholder with the server-backed favorite heart.
 * The overlay occupies the exact legacy Save action slot; the legacy screen is
 * retained verbatim for rollback until the next visual consolidation pass.
 */
export function CustomerDishDetailScreen() {
  const route = useRoute<DishDetailRoute>();
  const insets = useSafeAreaInsets();
  const favorites = useCustomerFavoritesQuery();
  const toggleFavorite = useToggleCustomerFavorite();
  const favorite = isFavoriteMenuItem(favorites.data, route.params.menuItemId);

  const toggle = React.useCallback(() => {
    if (favorites.sessionRequired || toggleFavorite.isPending) return;
    toggleFavorite.mutate(
      {menuItemId: route.params.menuItemId, favorite},
      {
        onError: () => {
          Alert.alert(
            'Favorite could not be updated',
            'Craves did not confirm the change. Please check your connection and try again.',
          );
        },
      },
    );
  }, [favorite, favorites.sessionRequired, route.params.menuItemId, toggleFavorite]);

  return (
    <View style={styles.root}>
      <CustomerDishDetailLegacyScreen />
      <Pressable
        accessibilityLabel={favorite ? 'Remove dish from favorites' : 'Save dish to favorites'}
        accessibilityRole="button"
        accessibilityState={{disabled: favorites.sessionRequired, busy: toggleFavorite.isPending}}
        disabled={favorites.sessionRequired || toggleFavorite.isPending}
        hitSlop={spacing.xxs}
        onPress={toggle}
        style={({pressed}) => [
          styles.favoriteButton,
          {top: insets.top + 4},
          (pressed || toggleFavorite.isPending) && styles.pressed,
        ]}>
        <MaterialDesignIcons
          name="heart"
          size={24}
          color={favorite ? colors.flameRed : colors.textSecondary}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1},
  favoriteButton: {
    position: 'absolute',
    right: touchTarget.minimum + spacing.lg,
    zIndex: 20,
    width: touchTarget.minimum,
    height: touchTarget.minimum,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.iconSurface,
  },
  pressed: {opacity: 0.62},
});
