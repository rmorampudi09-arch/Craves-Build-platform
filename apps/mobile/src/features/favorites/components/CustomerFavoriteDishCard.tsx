import React from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import {
  borderWidth,
  colors,
  elevation,
  fontWeight,
  radius,
  spacing,
  touchTarget,
  typography,
} from '../../../design/tokens';
import {Button} from '../../../shared/components/Button';
import type {SavedCatalogItem} from '../api/savedCatalogApi';
import {
  availabilityCopyForItem,
  canAddSavedDish,
  canOpenSavedDish,
  savedDishDisplayName,
  savedKitchenDisplayName,
} from '../presentation/savedCatalogPresentation';
import {CustomerFavoriteHeartButton} from './CustomerFavoriteHeartButton';

interface Props {
  dish: SavedCatalogItem;
  favoritePending: boolean;
  favoriteQueued: boolean;
  kitchenSaved: boolean;
  kitchenPending: boolean;
  cartPending: boolean;
  cartDisabled: boolean;
  cartError?: string | null;
  quantity: number;
  onOpenDish: (menuItemId: string) => void;
  onToggleKitchen: (dish: SavedCatalogItem) => void;
  onRemoveFavorite: (menuItemId: string) => void;
  onIncrease: (dish: SavedCatalogItem) => void;
  onDecrease: (dish: SavedCatalogItem) => void;
  onCheckCart: () => void;
}

function formatPrice(amount: number | null, currency: string | null): string | null {
  if (amount === null || !currency) return null;
  const value = Number.isInteger(amount) ? amount.toFixed(0) : amount.toFixed(2);
  return currency === 'INR' ? `₹${value}` : `${currency} ${value}`;
}

function foodTypeCopy(foodType: string | null): string | null {
  if (foodType === 'NON_VEG') return 'Non-veg';
  if (foodType === 'EGG') return 'Egg';
  if (foodType === 'VEG') return 'Veg';
  return null;
}

export function CustomerFavoriteDishCard({
  dish,
  favoritePending,
  favoriteQueued,
  kitchenSaved,
  kitchenPending,
  cartPending,
  cartDisabled,
  cartError,
  quantity,
  onOpenDish,
  onToggleKitchen,
  onRemoveFavorite,
  onIncrease,
  onDecrease,
  onCheckCart,
}: Props) {
  const {width, fontScale} = useWindowDimensions();
  const compact = width < 360 || fontScale > 1.4;
  const imageSize = compact ? 80 : 104;
  const displayName = savedDishDisplayName(dish);
  const kitchenName = savedKitchenDisplayName(dish);
  const canOpen = canOpenSavedDish(dish);
  const canAdd = canAddSavedDish(dish);
  const availability = availabilityCopyForItem(dish);
  const foodType = foodTypeCopy(dish.foodType);
  const meta = [dish.category, foodType].filter(Boolean).join(' · ');
  const price = formatPrice(dish.price, dish.currency);

  return (
    <View
      style={[styles.card, !canOpen && styles.cardUnavailable]}
      testID={`favorite-row-${dish.menuItemId}`}>
      <View style={styles.row}>
        <Pressable
          accessibilityLabel={`View ${displayName}`}
          accessibilityRole="button"
          accessibilityState={{disabled: !canOpen}}
          disabled={!canOpen}
          onPress={() => onOpenDish(dish.menuItemId)}
          style={styles.photoButton}>
          {dish.primaryImageUrl ? (
            <Image
              accessibilityIgnoresInvertColors
              source={{uri: dish.primaryImageUrl}}
              resizeMode="cover"
              style={[styles.photo, {width: imageSize, height: imageSize}]}
            />
          ) : (
            <View
              style={[
                styles.photo,
                styles.photoFallback,
                {width: imageSize, height: imageSize},
              ]}>
              <Text style={styles.photoInitial}>
                {(displayName.trim().charAt(0) || 'C').toUpperCase()}
              </Text>
            </View>
          )}
        </Pressable>

        <View style={styles.copy}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{disabled: !canOpen}}
            disabled={!canOpen}
            onPress={() => onOpenDish(dish.menuItemId)}
            style={styles.nameButton}>
            <Text numberOfLines={2} style={styles.name}>
              {displayName}
            </Text>
          </Pressable>
          <Text numberOfLines={1} style={styles.secondary}>
            {kitchenName}
          </Text>
          {meta ? <Text style={styles.meta}>{meta}</Text> : null}
          {price ? <Text style={styles.price}>{price}</Text> : null}
          <View style={styles.availabilityBadge}>
            <Text style={styles.availabilityTitle}>{availability.title}</Text>
          </View>
          {availability.detail ? (
            <Text style={styles.availabilityDetail}>{availability.detail}</Text>
          ) : null}

          {dish.kitchenId ? (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{selected: kitchenSaved, busy: kitchenPending}}
              disabled={kitchenPending}
              onPress={() => onToggleKitchen(dish)}
              style={({pressed}) => [
                styles.kitchenAction,
                pressed && !kitchenPending && styles.pressed,
              ]}>
              <Text style={styles.kitchenActionText}>
                {kitchenSaved ? 'Kitchen saved' : 'Save kitchen'}
              </Text>
            </Pressable>
          ) : null}
        </View>

        <CustomerFavoriteHeartButton
          favorite
          pending={favoritePending}
          itemLabel={displayName}
          onToggle={() => onRemoveFavorite(dish.menuItemId)}
        />
      </View>

      {favoriteQueued ? (
        <Text style={styles.queuedText}>Waiting to sync</Text>
      ) : null}

      <View style={[styles.actions, compact && styles.actionsCompact]}>
        {canOpen ? (
          <Button
            label="View dish"
            variant="ghost"
            onPress={() => onOpenDish(dish.menuItemId)}
            style={styles.viewAction}
          />
        ) : null}

        {quantity > 0 ? (
          <View style={styles.quantity}>
            <Button
              label="−"
              variant="outline"
              accessibilityLabel={`Remove one ${displayName}`}
              disabled={cartDisabled}
              onPress={() => onDecrease(dish)}
              style={styles.stepper}
            />
            <View style={styles.quantityValue} accessibilityLiveRegion="polite">
              {cartPending ? (
                <ActivityIndicator
                  accessibilityLabel="Updating cart"
                  color={colors.flameRedAccessible}
                  size="small"
                />
              ) : (
                <Text style={styles.quantityText}>{quantity}</Text>
              )}
            </View>
            <Button
              label="+"
              variant="outline"
              accessibilityLabel={`Add one ${displayName}`}
              disabled={cartDisabled || !canAdd || quantity >= 100}
              onPress={() => onIncrease(dish)}
              style={styles.stepper}
            />
          </View>
        ) : canAdd ? (
          <Button
            label={cartPending ? 'Adding…' : 'Add'}
            variant="outline"
            loading={cartPending}
            disabled={cartDisabled}
            onPress={() => onIncrease(dish)}
            style={styles.addAction}
          />
        ) : null}
      </View>

      {cartError ? (
        <View style={styles.notice}>
          <Text accessibilityRole="alert" style={styles.error}>
            {cartError}
          </Text>
          <Button
            label={cartPending ? 'Checking…' : 'Check cart'}
            variant="ghost"
            loading={cartPending}
            disabled={cartPending}
            onPress={onCheckCart}
            style={styles.checkCartAction}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.xs,
    padding: spacing.sm,
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    ...elevation.card,
  },
  cardUnavailable: {elevation: 0, shadowOpacity: 0},
  row: {flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm},
  photoButton: {minWidth: touchTarget.minimum, minHeight: touchTarget.minimum},
  photo: {borderRadius: radius.md, backgroundColor: colors.surfaceMuted},
  photoFallback: {alignItems: 'center', justifyContent: 'center'},
  photoInitial: {
    color: colors.flameRedAccessible,
    fontSize: typography.hero,
    fontWeight: fontWeight.extrabold,
  },
  copy: {flex: 1, minWidth: 0, paddingTop: spacing.xxs},
  nameButton: {minHeight: touchTarget.minimum, justifyContent: 'center'},
  name: {
    color: colors.espressoBrown,
    fontSize: typography.body,
    fontWeight: fontWeight.bold,
  },
  secondary: {color: colors.textSecondary, fontSize: typography.small},
  meta: {
    marginTop: spacing.xxs,
    color: colors.textSecondary,
    fontSize: typography.tiny,
  },
  price: {
    marginTop: spacing.xs,
    color: colors.flameRedAccessible,
    fontSize: typography.body,
    fontWeight: fontWeight.bold,
  },
  availabilityBadge: {
    alignSelf: 'flex-start',
    marginTop: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
  },
  availabilityTitle: {
    color: colors.textSecondary,
    fontSize: typography.tiny,
    fontWeight: fontWeight.bold,
  },
  availabilityDetail: {
    marginTop: spacing.xxs,
    color: colors.textSecondary,
    fontSize: typography.tiny,
  },
  kitchenAction: {
    alignSelf: 'flex-start',
    minHeight: 40,
    justifyContent: 'center',
    marginTop: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.iconSurface,
  },
  kitchenActionText: {
    color: colors.flameRedAccessible,
    fontSize: typography.tiny,
    fontWeight: fontWeight.bold,
  },
  queuedText: {
    color: colors.flameRedAccessible,
    fontSize: typography.tiny,
    fontWeight: fontWeight.bold,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  actionsCompact: {
    alignItems: 'stretch',
    flexDirection: 'column',
  },
  viewAction: {
    width: 120,
    maxWidth: '100%',
    minHeight: touchTarget.minimum,
    paddingHorizontal: spacing.xs,
  },
  addAction: {
    width: 120,
    maxWidth: '100%',
    minHeight: touchTarget.minimum,
  },
  quantity: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexShrink: 0,
  },
  stepper: {
    width: touchTarget.minimum,
    minHeight: touchTarget.minimum,
    paddingHorizontal: spacing.xs,
    flexShrink: 0,
  },
  quantityValue: {
    minWidth: 40,
    paddingHorizontal: spacing.xs,
    alignItems: 'center',
  },
  quantityText: {
    color: colors.espressoBrown,
    fontSize: typography.body,
    fontWeight: fontWeight.bold,
  },
  notice: {
    gap: spacing.xxs,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    padding: spacing.sm,
  },
  error: {
    color: colors.flameRedAccessible,
    fontSize: typography.small,
    lineHeight: 21,
  },
  checkCartAction: {alignSelf: 'flex-start'},
  pressed: {opacity: 0.72},
});
