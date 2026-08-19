import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import MaterialDesignIcons from '@react-native-vector-icons/material-design-icons';
import {
  useNavigation,
  useRoute,
  type NavigationProp,
  type RouteProp,
} from '@react-navigation/native';
import type {CustomerDishDetailStackParamList} from '../../../app/navigation/types';
import {useAppDispatch, useAppSelector} from '../../../app/store/hooks';
import {toAppApiError} from '../../../core/http/apiError';
import {shouldStackCriticalActions} from '../../../design/responsive';
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
import {Icon} from '../../../shared/components/Icon';
import {
  OfflineNotice,
  RecoverableErrorBanner,
  TerminalState,
} from '../../../shared/components/LifecycleStates';
import {ScreenShell} from '../../../shared/components/ScreenShell';
import type {CartLine} from '../../cart/domain/cartTypes';
import {
  addCartItem,
  removeCartItem,
  setCartItemQuantity,
  type CartMutationOutcome,
} from '../../cart/state/cartMutations';
import {
  isFavoriteMenuItem,
  useCustomerFavoritesQuery,
  useToggleCustomerFavorite,
} from '../../favorites/query/customerFavoritesQueries';
import type {CustomerDishDetailImage} from '../api/dishDetailApi';
import {
  evaluateDishCartRevalidation,
  formatDishDetailPrice,
} from '../dishDetailPurchase';
import {useCustomerDishDetailQuery} from '../query/dishDetailQueries';

type DishDetailRoute = RouteProp<
  CustomerDishDetailStackParamList,
  'CustomerDishDetail'
>;

type DishDetailNavigation = NavigationProp<
  CustomerDishDetailStackParamList,
  'CustomerDishDetail'
>;

function DetailSkeleton() {
  return (
    <View
      accessibilityLabel="Loading dish details"
      accessibilityRole="progressbar"
      style={styles.skeletonWrap}>
      <View style={styles.skeletonMedia} />
      <View style={styles.skeletonTitle} />
      <View style={styles.skeletonLine} />
      <View style={styles.skeletonCard} />
      <View style={styles.skeletonCard} />
    </View>
  );
}

function foodTypeLabel(foodType: 'VEG' | 'NON_VEG' | 'EGG'): string {
  if (foodType === 'NON_VEG') return 'Non-veg';
  if (foodType === 'EGG') return 'Egg';
  return 'Veg';
}

function spiceLabel(spiceLevel: 'MILD' | 'MEDIUM' | 'SPICY' | null): string | null {
  if (!spiceLevel) return null;
  return spiceLevel.charAt(0) + spiceLevel.slice(1).toLowerCase();
}

export function CustomerDishDetailScreen() {
  const navigation = useNavigation<DishDetailNavigation>();
  const route = useRoute<DishDetailRoute>();
  const dispatch = useAppDispatch();
  const {fontScale, width} = useWindowDimensions();
  const detail = useCustomerDishDetailQuery(route.params.menuItemId);
  const favorites = useCustomerFavoritesQuery();
  const toggleFavorite = useToggleCustomerFavorite();
  const cartSnapshot = useAppSelector(state => state.cart.snapshot);
  const cartMutations = useAppSelector(state => state.cart.mutations);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [revalidating, setRevalidating] = useState(false);
  const [purchaseMessage, setPurchaseMessage] = useState<string | null>(null);
  const [interactionNotice, setInteractionNotice] = useState<string | null>(null);
  const galleryRef = useRef<FlatList<CustomerDishDetailImage>>(null);
  const galleryWidth = Math.max(1, width);
  const stackPurchaseActions = shouldStackCriticalActions(width, fontScale);

  const dish = detail.data;
  const favorite = isFavoriteMenuItem(favorites.data, route.params.menuItemId);
  const cartLine = useMemo<CartLine | null>(
    () =>
      cartSnapshot?.lines.find(line => line.menuItemId === route.params.menuItemId) ??
      null,
    [cartSnapshot?.lines, route.params.menuItemId],
  );
  const queryError = detail.error ? toAppApiError(detail.error) : null;
  const offline = queryError?.code === 'NETWORK_ERROR';
  const addPending =
    cartMutations[`menu:${route.params.menuItemId}`]?.status === 'PENDING';
  const quantityPending = cartLine
    ? cartMutations[`line:${cartLine.lineId}`]?.status === 'PENDING'
    : false;
  const purchaseBusy = revalidating || addPending || quantityPending;
  const favoriteBusy = favorites.sessionRequired || toggleFavorite.isPending;

  useEffect(() => {
    setGalleryIndex(0);
    setDescriptionExpanded(false);
    setPurchaseMessage(null);
    setInteractionNotice(null);
    galleryRef.current?.scrollToOffset({offset: 0, animated: false});
  }, [route.params.menuItemId]);

  useEffect(() => {
    const nextImageUrl = dish?.images[galleryIndex + 1]?.url;
    if (nextImageUrl) Image.prefetch(nextImageUrl).catch(() => undefined);
  }, [dish?.images, galleryIndex]);

  const handleGalleryScrollEnd = (
    event: NativeSyntheticEvent<NativeScrollEvent>,
  ) => {
    const nextIndex = Math.round(event.nativeEvent.contentOffset.x / galleryWidth);
    if (dish?.images.length) {
      setGalleryIndex(Math.max(0, Math.min(nextIndex, dish.images.length - 1)));
    }
  };

  const selectGalleryImage = (index: number) => {
    setGalleryIndex(index);
    galleryRef.current?.scrollToOffset({
      offset: index * galleryWidth,
      animated: true,
    });
  };

  const handleFavorite = () => {
    if (favoriteBusy) return;
    setInteractionNotice(null);
    toggleFavorite.mutate(
      {menuItemId: route.params.menuItemId, favorite},
      {
        onError: () =>
          setInteractionNotice('Favorite could not be updated. Please try again.'),
      },
    );
  };

  const handleShare = async () => {
    if (!dish || sharing) return;
    setInteractionNotice(null);
    setSharing(true);
    try {
      await Share.share({
        message: `${dish.itemName} from ${
          dish.kitchen.displayName ?? dish.kitchen.kitchenName
        } on Craves`,
      });
    } catch (error) {
      setInteractionNotice(toAppApiError(error).message);
    } finally {
      setSharing(false);
    }
  };

  const handleCartOutcome = (
    outcome: CartMutationOutcome,
    refreshedPrice: number,
  ) => {
    if (outcome.status === 'FAILED') {
      setPurchaseMessage(outcome.error.message);
      return;
    }
    if (outcome.status !== 'APPLIED') return;

    const line = outcome.snapshot.lines.find(
      item => item.menuItemId === route.params.menuItemId,
    );
    if (line && Number(line.unitPrice.amount) !== refreshedPrice) {
      setPurchaseMessage(
        'Your cart was updated with the latest price returned by Craves.',
      );
      return;
    }
    setPurchaseMessage(null);
  };

  const revalidateAndIncrease = async () => {
    if (!dish || purchaseBusy) return;

    setPurchaseMessage(null);
    setRevalidating(true);
    try {
      const refreshed = await detail.refetch();
      if (refreshed.isError || !refreshed.data) {
        setPurchaseMessage(toAppApiError(refreshed.error).message);
        return;
      }

      const decision = evaluateDishCartRevalidation(dish, refreshed.data);
      if (decision.status !== 'READY') {
        setPurchaseMessage(decision.message);
        return;
      }

      const outcome = cartLine
        ? await dispatch(
            setCartItemQuantity({
              lineId: cartLine.lineId,
              quantity: cartLine.quantity + 1,
            }),
          )
        : await dispatch(
            addCartItem({menuItemId: refreshed.data.id, quantity: 1}),
          );
      handleCartOutcome(outcome, refreshed.data.price.amount);
    } finally {
      setRevalidating(false);
    }
  };

  const decreaseQuantity = async () => {
    if (!cartLine || purchaseBusy) return;
    setPurchaseMessage(null);
    const outcome =
      cartLine.quantity <= 1
        ? await dispatch(removeCartItem({lineId: cartLine.lineId}))
        : await dispatch(
            setCartItemQuantity({
              lineId: cartLine.lineId,
              quantity: cartLine.quantity - 1,
            }),
          );
    if (outcome.status === 'FAILED') setPurchaseMessage(outcome.error.message);
  };

  if (detail.invalidMenuItemId) {
    return (
      <ScreenShell keyboardAvoiding={false} testID="customer-dish-detail-invalid">
        <TerminalState
          title="Dish unavailable"
          description="This dish link is invalid."
          actionLabel="Go back"
          onAction={() => navigation.goBack()}
        />
      </ScreenShell>
    );
  }

  if (detail.sessionRequired) {
    return (
      <ScreenShell keyboardAvoiding={false} testID="customer-dish-detail-session-required">
        <TerminalState
          title="Sign in required"
          description="Your customer session is required to view this dish."
          actionLabel="Go back"
          onAction={() => navigation.goBack()}
        />
      </ScreenShell>
    );
  }

  if (detail.isPending && !dish) {
    return (
      <ScreenShell keyboardAvoiding={false} testID="customer-dish-detail-loading">
        <DetailSkeleton />
      </ScreenShell>
    );
  }

  if (!dish) {
    return (
      <ScreenShell keyboardAvoiding={false} testID="customer-dish-detail-error">
        <TerminalState
          title={offline ? 'You appear to be offline' : 'Dish details could not be loaded'}
          description={queryError?.message ?? 'Try again to load this dish.'}
          actionLabel="Try again"
          onAction={() => detail.refetch()}
          secondaryActionLabel="Go back"
          onSecondaryAction={() => navigation.goBack()}
        />
      </ScreenShell>
    );
  }

  const kitchenName = dish.kitchen.displayName ?? dish.kitchen.kitchenName;
  const kitchenLocation = [dish.kitchen.areaName, dish.kitchen.city]
    .filter(Boolean)
    .join(', ');
  const showDescriptionToggle = (dish.description?.length ?? 0) > 180;
  const spice = spiceLabel(dish.spiceLevel);

  return (
    <ScreenShell
      edges={['top', 'bottom']}
      keyboardAvoiding={false}
      testID="customer-dish-detail">
      <View style={styles.screen}>
        <View style={styles.header}>
          <Pressable
            accessibilityLabel="Back"
            accessibilityRole="button"
            onPress={() => navigation.goBack()}
            style={({pressed}) => [styles.headerAction, pressed && styles.pressed]}>
            <Icon name="arrow-left" surface={false} />
          </Pressable>
        </View>

        <ScrollView
          keyboardDismissMode="on-drag"
          refreshControl={
            <RefreshControl
              colors={[colors.flameRed]}
              onRefresh={() => detail.refetch()}
              refreshing={detail.isRefetching && !revalidating}
              tintColor={colors.flameRed}
            />
          }
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}>
          <View style={styles.heroFrame}>
            {dish.images.length > 0 ? (
              <View>
                <FlatList
                  ref={galleryRef}
                  data={dish.images}
                  getItemLayout={(_, index) => ({
                    length: galleryWidth,
                    offset: galleryWidth * index,
                    index,
                  })}
                  horizontal
                  initialNumToRender={1}
                  keyExtractor={image => image.id}
                  maxToRenderPerBatch={2}
                  onMomentumScrollEnd={handleGalleryScrollEnd}
                  pagingEnabled
                  renderItem={({item: image, index}) => (
                    <Image
                      accessibilityIgnoresInvertColors
                      accessibilityLabel={`${dish.itemName} image ${index + 1}`}
                      source={{uri: image.url}}
                      resizeMethod="resize"
                      resizeMode="cover"
                      style={[styles.heroImage, {width: galleryWidth}]}
                    />
                  )}
                  showsHorizontalScrollIndicator={false}
                  windowSize={3}
                />
                {dish.images.length > 1 ? (
                  <FlatList
                    contentContainerStyle={styles.thumbnailRow}
                    data={dish.images}
                    horizontal
                    initialNumToRender={6}
                    keyExtractor={image => image.id}
                    maxToRenderPerBatch={6}
                    renderItem={({item: image, index}) => (
                      <Pressable
                        accessibilityLabel={`Show image ${index + 1}`}
                        accessibilityRole="button"
                        accessibilityState={{selected: galleryIndex === index}}
                        onPress={() => selectGalleryImage(index)}
                        style={[
                          styles.thumbnailFrame,
                          galleryIndex === index && styles.thumbnailFrameSelected,
                        ]}>
                        <Image
                          accessibilityIgnoresInvertColors
                          source={{uri: image.url}}
                          resizeMethod="resize"
                          resizeMode="cover"
                          style={styles.thumbnail}
                        />
                      </Pressable>
                    )}
                    showsHorizontalScrollIndicator={false}
                    windowSize={5}
                  />
                ) : null}
              </View>
            ) : (
              <View style={styles.heroFallback}>
                <Text style={styles.heroFallbackCategory}>{dish.category}</Text>
                <Text style={styles.heroFallbackTitle}>{dish.itemName}</Text>
              </View>
            )}

            <View style={styles.heroActions}>
              <Pressable
                accessibilityLabel={favorite ? 'Remove dish from favorites' : 'Save dish to favorites'}
                accessibilityRole="button"
                accessibilityState={{selected: favorite, disabled: favoriteBusy}}
                disabled={favoriteBusy}
                hitSlop={spacing.xs}
                onPress={handleFavorite}
                style={({pressed}) => [
                  styles.heroActionButton,
                  pressed && !favoriteBusy && styles.heroActionPressed,
                  favoriteBusy && styles.disabled,
                ]}>
                <MaterialDesignIcons
                  name={favorite ? 'heart' : 'heart-outline'}
                  size={24}
                  color={favorite ? colors.flameRed : colors.espressoBrown}
                />
              </Pressable>
              <Pressable
                accessibilityLabel="Share dish"
                accessibilityRole="button"
                accessibilityState={{busy: sharing}}
                disabled={sharing}
                hitSlop={spacing.xs}
                onPress={handleShare}
                style={({pressed}) => [
                  styles.heroActionButton,
                  pressed && !sharing && styles.heroActionPressed,
                  sharing && styles.disabled,
                ]}>
                <MaterialDesignIcons
                  name="share-variant-outline"
                  size={23}
                  color={colors.espressoBrown}
                />
              </Pressable>
            </View>
          </View>

          <View style={styles.content}>
            {interactionNotice ? (
              <RecoverableErrorBanner message={interactionNotice} style={styles.notice} />
            ) : null}
            {queryError ? (
              offline ? (
                <OfflineNotice
                  message={queryError.message}
                  onRetry={() => detail.refetch()}
                  style={styles.notice}
                />
              ) : (
                <RecoverableErrorBanner
                  message={queryError.message}
                  onRetry={() => detail.refetch()}
                  style={styles.notice}
                />
              )
            ) : null}

            <View
              style={[
                styles.titleRow,
                stackPurchaseActions && styles.titleRowStacked,
              ]}>
              <View
                style={[
                  styles.titleCopy,
                  stackPurchaseActions && styles.titleCopyStacked,
                ]}>
                <Text accessibilityRole="header" style={styles.title}>
                  {dish.itemName}
                </Text>
                <Text style={styles.categoryLine}>
                  {dish.category} • {foodTypeLabel(dish.foodType)}
                </Text>
              </View>
              <Text style={styles.inlinePrice}>
                {formatDishDetailPrice(dish.price.amount, dish.price.currency)}
              </Text>
            </View>

            <View style={styles.kitchenCard}>
              <View style={styles.kitchenBadge}>
                <Icon name="chef" color={colors.flameRed} />
              </View>
              <View style={styles.kitchenCopy}>
                <Text style={styles.kitchenLabel}>Prepared by</Text>
                <Text style={styles.kitchenName}>{kitchenName}</Text>
                {kitchenLocation ? (
                  <Text style={styles.kitchenMeta}>{kitchenLocation}</Text>
                ) : null}
                {dish.kitchen.description ? (
                  <Text numberOfLines={2} style={styles.kitchenMeta}>
                    {dish.kitchen.description}
                  </Text>
                ) : null}
              </View>
            </View>

            <View style={styles.factGrid}>
              {dish.preparationTimeMinutes ? (
                <View style={styles.factCard}>
                  <Text style={styles.factLabel}>Preparation</Text>
                  <Text style={styles.factValue}>{dish.preparationTimeMinutes} min</Text>
                </View>
              ) : null}
              {dish.servesCount ? (
                <View style={styles.factCard}>
                  <Text style={styles.factLabel}>Serves</Text>
                  <Text style={styles.factValue}>{dish.servesCount}</Text>
                </View>
              ) : null}
              {spice ? (
                <View style={styles.factCard}>
                  <Text style={styles.factLabel}>Spice</Text>
                  <Text style={styles.factValue}>{spice}</Text>
                </View>
              ) : null}
              {dish.unitPackageWeightGrams ? (
                <View style={styles.factCard}>
                  <Text style={styles.factLabel}>Pack weight</Text>
                  <Text style={styles.factValue}>{dish.unitPackageWeightGrams} g</Text>
                </View>
              ) : null}
            </View>

            {dish.description ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>About this dish</Text>
                <Text
                  numberOfLines={descriptionExpanded ? undefined : 4}
                  style={styles.bodyText}>
                  {dish.description}
                </Text>
                {showDescriptionToggle ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setDescriptionExpanded(value => !value)}
                    style={({pressed}) => [styles.inlineAction, pressed && styles.pressed]}>
                    <Text style={styles.inlineActionText}>
                      {descriptionExpanded ? 'Show less' : 'Read more'}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Ingredients & allergens</Text>
              <Text style={styles.bodyText}>
                Ingredient and allergen details are not available from the current catalog contract.
              </Text>
              <Pressable
                accessibilityHint="Opens the focused ingredient details screen"
                accessibilityLabel={`View ingredients for ${dish.itemName}`}
                accessibilityRole="button"
                onPress={() =>
                  navigation.navigate('CustomerDishIngredients', {
                    menuItemId: dish.id,
                  })
                }
                style={({pressed}) => [styles.inlineAction, pressed && styles.pressed]}>
                <Text style={styles.inlineActionText}>View ingredients</Text>
              </Pressable>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Reviews</Text>
              <Text style={styles.bodyText}>
                A verified review summary is not available from the current customer contract.
              </Text>
            </View>
          </View>
        </ScrollView>

        <View style={styles.purchaseBar}>
          {purchaseMessage ? (
            <Text accessibilityLiveRegion="polite" style={styles.purchaseMessage}>
              {purchaseMessage}
            </Text>
          ) : null}
          <View
            style={[
              styles.purchaseMain,
              stackPurchaseActions && styles.purchaseMainStacked,
            ]}>
            <View style={styles.purchaseCopy}>
              <Text style={styles.purchaseLabel}>Current price</Text>
              <Text style={styles.purchasePrice}>
                {formatDishDetailPrice(dish.price.amount, dish.price.currency)}
              </Text>
            </View>

            {cartLine ? (
              <View
                accessibilityLabel={`${dish.itemName} quantity ${cartLine.quantity}`}
                style={[
                  styles.quantitySelector,
                  stackPurchaseActions && styles.quantitySelectorStacked,
                ]}>
                <Pressable
                  accessibilityLabel={`Decrease ${dish.itemName} quantity`}
                  accessibilityRole="button"
                  accessibilityState={{disabled: purchaseBusy}}
                  disabled={purchaseBusy}
                  onPress={decreaseQuantity}
                  style={({pressed}) => [
                    styles.quantityButton,
                    pressed && !purchaseBusy && styles.quantityButtonPressed,
                  ]}>
                  <Text style={styles.quantityButtonText}>−</Text>
                </Pressable>
                <Text accessibilityLiveRegion="polite" style={styles.quantityText}>
                  {cartLine.quantity}
                </Text>
                <Pressable
                  accessibilityLabel={`Increase ${dish.itemName} quantity`}
                  accessibilityRole="button"
                  accessibilityState={{disabled: purchaseBusy}}
                  disabled={purchaseBusy}
                  onPress={revalidateAndIncrease}
                  style={({pressed}) => [
                    styles.quantityButton,
                    pressed && !purchaseBusy && styles.quantityButtonPressed,
                  ]}>
                  <Text style={styles.quantityButtonText}>+</Text>
                </Pressable>
              </View>
            ) : (
              <Button
                label="Add to Cart"
                accessibilityHint="Checks the latest availability and price before adding"
                loading={purchaseBusy}
                onPress={revalidateAndIncrease}
                style={[
                  styles.purchaseAction,
                  stackPurchaseActions && styles.purchaseActionStacked,
                ]}
              />
            )}
          </View>
          {revalidating ? (
            <View style={styles.revalidatingRow}>
              <ActivityIndicator color={colors.flameRed} size="small" />
              <Text style={styles.revalidatingText}>Checking latest details…</Text>
            </View>
          ) : null}
        </View>
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.surfaceBase},
  header: {
    minHeight: touchTarget.comfortable,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    backgroundColor: colors.white,
  },
  headerAction: {
    width: touchTarget.minimum,
    height: touchTarget.minimum,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {opacity: 0.72},
  disabled: {opacity: 0.45},
  scrollContent: {paddingBottom: spacing.lg},
  heroFrame: {position: 'relative'},
  heroImage: {height: 280, backgroundColor: colors.surfaceMuted},
  heroFallback: {
    minHeight: 250,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    backgroundColor: colors.white,
  },
  heroFallbackCategory: {
    color: colors.flameRed,
    fontSize: typography.small,
    fontWeight: fontWeight.bold,
  },
  heroFallbackTitle: {
    marginTop: spacing.sm,
    color: colors.espressoBrown,
    fontSize: typography.hero,
    fontWeight: fontWeight.extrabold,
    textAlign: 'center',
  },
  heroActions: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.md,
    flexDirection: 'row',
    gap: spacing.xs,
    zIndex: 10,
  },
  heroActionButton: {
    width: touchTarget.minimum,
    height: touchTarget.minimum,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.90)',
  },
  heroActionPressed: {
    backgroundColor: colors.white,
    transform: [{scale: 0.96}],
  },
  thumbnailRow: {
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  thumbnailFrame: {
    width: 58,
    height: 58,
    borderRadius: radius.sm,
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  thumbnailFrameSelected: {
    borderWidth: borderWidth.strong,
    borderColor: colors.flameRed,
  },
  thumbnail: {width: '100%', height: '100%'},
  content: {paddingHorizontal: spacing.md},
  notice: {marginTop: spacing.sm},
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingTop: spacing.md,
  },
  titleRowStacked: {flexDirection: 'column', gap: spacing.xs},
  titleCopy: {flex: 1, minWidth: 0},
  titleCopyStacked: {flex: 0, width: '100%'},
  title: {
    color: colors.espressoBrown,
    fontSize: typography.hero,
    fontWeight: fontWeight.extrabold,
  },
  categoryLine: {
    marginTop: spacing.xxs,
    color: colors.textSecondary,
    fontSize: typography.small,
  },
  inlinePrice: {
    color: colors.textPrimary,
    fontSize: typography.heading,
    fontWeight: fontWeight.bold,
  },
  kitchenCard: {
    marginTop: spacing.md,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
    backgroundColor: colors.white,
    ...elevation.card,
  },
  kitchenBadge: {
    width: touchTarget.minimum,
    height: touchTarget.minimum,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kitchenCopy: {flex: 1, minWidth: 0},
  kitchenLabel: {
    color: colors.textSecondary,
    fontSize: typography.tiny,
    fontWeight: fontWeight.semibold,
  },
  kitchenName: {
    marginTop: spacing.xxs,
    color: colors.espressoBrown,
    fontSize: typography.body,
    fontWeight: fontWeight.bold,
  },
  kitchenMeta: {
    marginTop: spacing.xxs,
    color: colors.textSecondary,
    fontSize: typography.small,
  },
  factGrid: {
    marginTop: spacing.md,
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: spacing.sm,
    rowGap: spacing.xs,
  },
  factCard: {
    flexGrow: 1,
    flexBasis: '46%',
    minWidth: 132,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: colors.white,
  },
  factLabel: {color: colors.textSecondary, fontSize: typography.tiny},
  factValue: {
    marginTop: spacing.xxs,
    color: colors.espressoBrown,
    fontSize: typography.body,
    fontWeight: fontWeight.bold,
  },
  section: {
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: borderWidth.standard,
    borderTopColor: colors.border,
  },
  sectionTitle: {
    color: colors.espressoBrown,
    fontSize: typography.heading,
    fontWeight: fontWeight.bold,
  },
  bodyText: {
    marginTop: spacing.xs,
    color: colors.textSecondary,
    fontSize: typography.body,
  },
  inlineAction: {
    alignSelf: 'flex-start',
    minHeight: touchTarget.minimum,
    justifyContent: 'center',
    marginTop: spacing.xs,
  },
  inlineActionText: {
    color: colors.flameRed,
    fontSize: typography.small,
    fontWeight: fontWeight.bold,
  },
  purchaseBar: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xs,
    borderTopWidth: borderWidth.standard,
    borderTopColor: colors.border,
    backgroundColor: colors.white,
    ...elevation.card,
  },
  purchaseMessage: {
    marginBottom: spacing.xs,
    color: colors.error,
    fontSize: typography.small,
  },
  purchaseMain: {
    minHeight: touchTarget.comfortable,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  purchaseMainStacked: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: spacing.xs,
  },
  purchaseCopy: {flexShrink: 0},
  purchaseLabel: {color: colors.textSecondary, fontSize: typography.tiny},
  purchasePrice: {
    marginTop: spacing.xxs,
    color: colors.espressoBrown,
    fontSize: typography.heading,
    fontWeight: fontWeight.extrabold,
  },
  purchaseAction: {width: 190, maxWidth: '58%'},
  purchaseActionStacked: {width: '100%', maxWidth: '100%'},
  quantitySelector: {
    width: 190,
    minHeight: touchTarget.minimum,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: borderWidth.standard,
    borderColor: colors.flameRed,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.white,
  },
  quantitySelectorStacked: {width: '100%'},
  quantityButton: {
    width: touchTarget.minimum,
    minHeight: touchTarget.minimum,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quantityButtonPressed: {backgroundColor: colors.surfaceMuted},
  quantityButtonText: {
    color: colors.flameRed,
    fontSize: typography.heading,
    fontWeight: fontWeight.bold,
  },
  quantityText: {
    minWidth: 30,
    textAlign: 'center',
    color: colors.espressoBrown,
    fontSize: typography.body,
    fontWeight: fontWeight.bold,
  },
  revalidatingRow: {
    marginTop: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  revalidatingText: {color: colors.textSecondary, fontSize: typography.tiny},
  skeletonWrap: {flex: 1, padding: spacing.md, gap: spacing.md},
  skeletonMedia: {
    height: 280,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceMuted,
  },
  skeletonTitle: {
    width: '72%',
    height: 28,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceMuted,
  },
  skeletonLine: {
    width: '46%',
    height: 16,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceMuted,
  },
  skeletonCard: {
    height: 100,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceMuted,
  },
});
