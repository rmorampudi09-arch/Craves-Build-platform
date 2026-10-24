import React, {useRef} from 'react';
import {Image, Pressable, StyleSheet, Text, View} from 'react-native';
import {BlurTargetView} from 'expo-blur';
import {
  colors,
  elevation,
  fontWeight,
  radius,
  spacing,
  typography,
  iconSize,
} from '../../../design/tokens';
import {Icon} from '../../../shared/components/Icon';
import {LiquidGlassSurface} from '../../../shared/components/LiquidGlassSurface';
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

const PHOTO_SIZE = 116;
const CART_CONTROL_HEIGHT = 40;
const CART_CONTROL_HIT_SLOP = {top: 4, bottom: 4, left: 4, right: 4};

function foodTypeLabel(foodType: CustomerKitchenMenuItemSummary['foodType']): string {
  if (foodType === 'NON_VEG') return 'Non-veg';
  if (foodType === 'EGG') return 'Egg';
  return 'Veg';
}

/** The square veg / non-veg / egg mark used on Indian food packaging. */
function FoodTypeMark({foodType}: {foodType: CustomerKitchenMenuItemSummary['foodType']}) {
  const color =
    foodType === 'VEG' ? colors.success : foodType === 'EGG' ? colors.warning : colors.error;
  return (
    <View accessibilityLabel={foodTypeLabel(foodType)} style={[styles.mark, {borderColor: color}]}>
      {foodType === 'NON_VEG' ? (
        <View style={[styles.markTriangle, {borderBottomColor: color}]} />
      ) : (
        <View style={[styles.markDot, {backgroundColor: color}]} />
      )}
    </View>
  );
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
  const photoTarget = useRef<View | null>(null);
  const meta = [
    item.preparationTimeMinutes ? `${item.preparationTimeMinutes} min` : null,
    item.servesCount ? `Serves ${item.servesCount}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <View style={styles.row}>
      <Pressable
        accessibilityLabel={`Open ${item.itemName}`}
        accessibilityRole="button"
        onPress={() => onOpen(item.id)}
        style={({pressed}) => [styles.copy, pressed && styles.pressed]}>
        <FoodTypeMark foodType={item.foodType} />
        <Text numberOfLines={2} style={styles.title}>
          {item.itemName}
        </Text>
        <Text numberOfLines={1} style={styles.price}>
          {formatDishDetailPrice(item.price.amount, item.price.currency)}
        </Text>
        {meta ? (
          <View style={styles.metaRow}>
            {item.preparationTimeMinutes ? (
              <Icon name="clock" size={iconSize.xs} color={colors.textSecondary} surface={false} />
            ) : null}
            <Text numberOfLines={1} style={styles.metaText}>
              {meta}
            </Text>
          </View>
        ) : null}
      </Pressable>

      <View style={styles.media}>
        <Pressable
          accessible={false}
          onPress={() => onOpen(item.id)}
          style={({pressed}) => [styles.photo, pressed && styles.pressed]}>
          {image ? (
            <BlurTargetView ref={photoTarget} style={styles.photoImage}>
              <Image
                accessibilityIgnoresInvertColors
                resizeMode="cover"
                source={{uri: image.url}}
                style={styles.photoImage}
              />
            </BlurTargetView>
          ) : (
            <View style={styles.photoFallback}>
              <Icon name="meal" size={28} color={colors.textSecondary} surface={false} />
            </View>
          )}
        </Pressable>

        <LiquidGlassSurface
          appearance="home"
          blurTarget={image ? photoTarget : undefined}
          style={styles.favoriteGlass}>
          <CustomerFavoriteHeartButton
            favorite={favorite}
            pending={favoritePending}
            disabled={favoriteDisabled}
            inactiveColor={image ? colors.white : colors.espressoBrown}
            itemLabel={item.itemName}
            onToggle={() => onFavoriteToggle(item.id, favorite)}
            style={styles.favoriteControl}
          />
        </LiquidGlassSurface>

        {cartLine ? (
          <View style={[styles.cartControl, styles.stepper]}>
            <Pressable
              accessibilityLabel={`Decrease ${item.itemName} quantity`}
              accessibilityRole="button"
              accessibilityState={{disabled: busy}}
              disabled={busy}
              hitSlop={CART_CONTROL_HIT_SLOP}
              onPress={() => onDecrease(cartLine)}
              style={({pressed}) => [
                styles.stepperButton,
                pressed && !busy && styles.pressedControl,
                busy && styles.disabled,
              ]}>
              <Text style={styles.stepperSymbol}>−</Text>
            </Pressable>
            <Text accessibilityLabel={`${cartLine.quantity} in cart`} style={styles.stepperCount}>
              {cartLine.quantity}
            </Text>
            <Pressable
              accessibilityLabel={`Increase ${item.itemName} quantity`}
              accessibilityRole="button"
              accessibilityState={{disabled: busy}}
              disabled={busy}
              hitSlop={CART_CONTROL_HIT_SLOP}
              onPress={() => onIncrease(item)}
              style={({pressed}) => [
                styles.stepperButton,
                pressed && !busy && styles.pressedControl,
                busy && styles.disabled,
              ]}>
              <Text style={styles.stepperSymbol}>+</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            accessibilityLabel={`Add ${item.itemName} to cart`}
            accessibilityRole="button"
            accessibilityState={{busy, disabled: busy}}
            disabled={busy}
            hitSlop={CART_CONTROL_HIT_SLOP}
            onPress={() => onIncrease(item)}
            style={({pressed}) => [
              styles.cartControl,
              styles.addButton,
              pressed && !busy && styles.addButtonPressed,
              busy && styles.disabled,
            ]}>
            <Text style={styles.addButtonText}>{busy ? 'Adding…' : 'Add'}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingTop: spacing.md,
    // The cart control hangs half below the photo.
    paddingBottom: spacing.md + CART_CONTROL_HEIGHT / 2,
  },
  copy: {
    flex: 1,
    minWidth: 0,
    paddingTop: spacing.xxs,
  },
  mark: {
    width: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderRadius: 4,
  },
  markDot: {
    width: 7,
    height: 7,
    borderRadius: radius.pill,
  },
  markTriangle: {
    width: 0,
    height: 0,
    borderLeftWidth: 4,
    borderRightWidth: 4,
    borderBottomWidth: 7,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  title: {
    marginTop: spacing.xs,
    color: colors.espressoBrown,
    fontSize: typography.button,
    fontWeight: fontWeight.bold,
    lineHeight: 21,
  },
  price: {
    marginTop: spacing.xxs,
    color: colors.espressoBrown,
    fontSize: typography.button,
    fontWeight: fontWeight.bold,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    marginTop: spacing.xs,
  },
  metaText: {
    flexShrink: 1,
    color: colors.textSecondary,
    fontSize: typography.small,
  },
  media: {
    width: PHOTO_SIZE,
    height: PHOTO_SIZE,
  },
  photo: {
    width: PHOTO_SIZE,
    height: PHOTO_SIZE,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.surfaceMuted,
  },
  photoImage: {
    width: '100%',
    height: '100%',
  },
  photoFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  favoriteGlass: {
    position: 'absolute',
    top: spacing.xs - 2,
    right: spacing.xs - 2,
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  favoriteControl: {
    width: '100%',
    height: '100%',
    backgroundColor: 'transparent',
  },
  cartControl: {
    position: 'absolute',
    alignSelf: 'center',
    bottom: -CART_CONTROL_HEIGHT / 2,
    height: CART_CONTROL_HEIGHT,
    borderRadius: radius.sm,
  },
  addButton: {
    width: 92,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.flameRedAccessible,
    ...elevation.primaryAction,
  },
  addButtonPressed: {
    opacity: 0.88,
    transform: [{scale: 0.985}],
  },
  addButtonText: {
    color: colors.white,
    fontSize: typography.body,
    fontWeight: fontWeight.bold,
  },
  stepper: {
    width: 104,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1.5,
    borderColor: colors.flameRed,
    backgroundColor: colors.white,
    overflow: 'hidden',
    ...elevation.card,
  },
  stepperButton: {
    width: 34,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressedControl: {
    backgroundColor: colors.iconSurface,
  },
  stepperSymbol: {
    color: colors.flameRedAccessible,
    fontSize: typography.heading,
    fontWeight: fontWeight.bold,
  },
  stepperCount: {
    minWidth: 20,
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
