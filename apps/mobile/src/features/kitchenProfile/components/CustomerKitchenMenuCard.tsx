import React from 'react';
import {Image, Pressable, StyleSheet, Text, View} from 'react-native';
import {
  colors,
  elevation,
  fontWeight,
  radius,
  spacing,
  touchTarget,
  typography,
} from '../../../design/tokens';
import {Icon} from '../../../shared/components/Icon';
import {getDisplayAvailabilityCount} from '../../../shared/menuAvailability';
import type {CartLine} from '../../cart/domain/cartTypes';
import {formatDishDetailPrice} from '../../dishDetail/dishDetailPurchase';
import {CustomerFavoriteHeartButton} from '../../favorites/components/CustomerFavoriteHeartButton';
import type {CustomerKitchenMenuItemSummary} from '../api/kitchenProfileApi';
import {getCustomerKitchenMenuImage} from '../kitchenProfilePresentation';

export interface CustomerKitchenMenuCardProps {
  item: CustomerKitchenMenuItemSummary;
  cartLine: CartLine | null;
  busy: boolean;
  favorite: boolean;
  favoritePending: boolean;
  favoriteDisabled: boolean;
  onFavoriteToggle: (menuItemId: string, favorite: boolean) => void;
  onOpen: (menuItemId: string) => void;
  onIncrease: (item: CustomerKitchenMenuItemSummary) => void;
  onDecrease: (line: CartLine) => void;
}

function foodTypeLabel(foodType: CustomerKitchenMenuItemSummary['foodType']): string {
  if (foodType === 'NON_VEG') return 'Non-veg';
  if (foodType === 'EGG') return 'Egg';
  return 'Veg';
}

export function CustomerKitchenMenuCard({
  item,
  cartLine,
  busy,
  favorite,
  favoritePending,
  favoriteDisabled,
  onFavoriteToggle,
  onOpen,
  onIncrease,
  onDecrease,
}: CustomerKitchenMenuCardProps) {
  const image = getCustomerKitchenMenuImage(item);
  const availableCount = getDisplayAvailabilityCount(item.id);
  const typeColor =
    item.foodType === 'VEG'
      ? colors.success
      : item.foodType === 'EGG'
        ? colors.warning
        : colors.error;

  return (
    <View style={styles.card}>
      <Pressable
        accessibilityLabel={`Open ${item.itemName}`}
        accessibilityRole="button"
        onPress={() => onOpen(item.id)}
        style={({pressed}) => [styles.imagePressable, pressed && styles.pressed]}>
        {image ? (
          <Image
            accessibilityIgnoresInvertColors
            accessibilityLabel={`${item.itemName} image`}
            resizeMode="cover"
            source={{uri: image.url}}
            style={styles.image}
          />
        ) : (
          <View style={styles.imageFallback}>
            <Text numberOfLines={2} style={styles.imageFallbackText}>
              {item.category}
            </Text>
          </View>
        )}
      </Pressable>

      <View style={styles.copy}>
        <Pressable
          accessibilityLabel={`Open ${item.itemName}`}
          accessibilityRole="button"
          onPress={() => onOpen(item.id)}
          style={({pressed}) => [styles.copyPressable, pressed && styles.pressed]}>
          <Text numberOfLines={1} style={styles.title}>
            {item.itemName}
          </Text>
          <View style={styles.availabilityRow}>
            <Icon name="check" size={17} color={colors.success} surface={false} />
            <Text numberOfLines={1} style={styles.availabilityText}>
              Available - {availableCount}
            </Text>
          </View>
          <View style={styles.metadataRow}>
            <Text numberOfLines={1} style={styles.metadataText}>
              {item.category}
            </Text>
            {item.preparationTimeMinutes ? (
              <>
                <Text style={styles.metadataDivider}>|</Text>
                <Icon name="clock" size={17} color={colors.textSecondary} surface={false} />
                <Text numberOfLines={1} style={styles.metadataText}>
                  {item.preparationTimeMinutes} min
                </Text>
              </>
            ) : null}
          </View>
          <View style={styles.foodTypePill}>
            <View style={[styles.foodTypeDot, {backgroundColor: typeColor}]} />
            <Text style={styles.foodTypeText}>{foodTypeLabel(item.foodType)}</Text>
          </View>
        </Pressable>

        <View style={styles.purchaseRow}>
          <Text numberOfLines={1} style={styles.price}>
            {formatDishDetailPrice(item.price.amount, item.price.currency)}
          </Text>
          {cartLine ? (
            <View style={styles.quantityControl}>
              <Pressable
                accessibilityLabel={`Decrease ${item.itemName} quantity`}
                accessibilityRole="button"
                accessibilityState={{disabled: busy}}
                disabled={busy}
                onPress={() => onDecrease(cartLine)}
                style={({pressed}) => [
                  styles.quantityButton,
                  pressed && !busy && styles.pressedControl,
                  busy && styles.disabled,
                ]}>
                <Text style={styles.quantityButtonText}>−</Text>
              </Pressable>
              <Text accessibilityLabel={`${cartLine.quantity} in cart`} style={styles.quantityText}>
                {cartLine.quantity}
              </Text>
              <Pressable
                accessibilityLabel={`Increase ${item.itemName} quantity`}
                accessibilityRole="button"
                accessibilityState={{disabled: busy}}
                disabled={busy}
                onPress={() => onIncrease(item)}
                style={({pressed}) => [
                  styles.quantityButton,
                  pressed && !busy && styles.pressedControl,
                  busy && styles.disabled,
                ]}>
                <Text style={styles.quantityButtonText}>+</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              accessibilityLabel={`Add ${item.itemName} to cart`}
              accessibilityRole="button"
              accessibilityState={{busy, disabled: busy}}
              disabled={busy}
              onPress={() => onIncrease(item)}
              style={({pressed}) => [
                styles.addButton,
                pressed && !busy && styles.addButtonPressed,
                busy && styles.disabled,
              ]}>
              <Text style={styles.addButtonText}>{busy ? 'Adding…' : 'Add'}</Text>
            </Pressable>
          )}
        </View>
      </View>

      <CustomerFavoriteHeartButton
        favorite={favorite}
        pending={favoritePending}
        disabled={favoriteDisabled}
        itemLabel={item.itemName}
        onToggle={() => onFavoriteToggle(item.id, favorite)}
        style={styles.favoriteButton}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    height: 176,
    flexDirection: 'row',
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.white,
    overflow: 'hidden',
    ...elevation.card,
  },
  imagePressable: {
    width: '40%',
    height: '100%',
    backgroundColor: colors.surfaceMuted,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imageFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
    padding: spacing.sm,
  },
  imageFallbackText: {
    color: colors.espressoBrown,
    fontSize: typography.small,
    fontWeight: fontWeight.semibold,
    textAlign: 'center',
  },
  copy: {
    flex: 1,
    minWidth: 0,
    paddingTop: spacing.sm,
    paddingRight: spacing.sm,
    paddingBottom: spacing.sm,
    paddingLeft: spacing.md,
  },
  copyPressable: {
    flex: 1,
    minHeight: 0,
    paddingRight: touchTarget.minimum,
  },
  title: {
    color: colors.espressoBrown,
    fontSize: typography.body,
    fontWeight: fontWeight.bold,
  },
  availabilityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    marginTop: spacing.xxs,
  },
  availabilityText: {
    color: colors.success,
    fontSize: typography.small,
    fontWeight: fontWeight.medium,
  },
  metadataRow: {
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  metadataText: {
    color: colors.textSecondary,
    fontSize: typography.small,
  },
  metadataDivider: {
    color: colors.borderStrong,
    fontSize: typography.small,
  },
  foodTypePill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    marginTop: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    backgroundColor: 'transparent',
  },
  foodTypeDot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
  },
  foodTypeText: {
    color: colors.textPrimary,
    fontSize: typography.small,
    fontWeight: fontWeight.medium,
  },
  purchaseRow: {
    minHeight: touchTarget.minimum,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  price: {
    flexShrink: 1,
    color: colors.espressoBrown,
    fontSize: typography.heading,
    fontWeight: fontWeight.extrabold,
  },
  favoriteButton: {
    position: 'absolute',
    top: spacing.xs,
    right: spacing.xs,
    zIndex: 4,
    backgroundColor: 'transparent',
  },
  addButton: {
    width: 108,
    height: touchTarget.minimum,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.flameRedAccessible,
  },
  addButtonPressed: {
    opacity: 0.88,
    transform: [{scale: 0.985}],
  },
  addButtonText: {
    color: colors.white,
    fontSize: typography.button,
    fontWeight: fontWeight.bold,
  },
  quantityControl: {
    width: 116,
    minHeight: touchTarget.minimum,
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.flameRed,
    borderRadius: radius.md,
    backgroundColor: colors.white,
    overflow: 'hidden',
  },
  quantityButton: {
    width: 38,
    minHeight: touchTarget.minimum,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressedControl: {
    backgroundColor: colors.iconSurface,
  },
  quantityButtonText: {
    color: colors.flameRedAccessible,
    fontSize: typography.heading,
    fontWeight: fontWeight.bold,
  },
  quantityText: {
    minWidth: 24,
    textAlign: 'center',
    color: colors.espressoBrown,
    fontSize: typography.body,
    fontWeight: fontWeight.bold,
  },
  pressed: {
    opacity: 0.88,
  },
  disabled: {
    opacity: 0.48,
  },
});
