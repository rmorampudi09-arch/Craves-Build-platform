import React, {useEffect, useMemo, useRef, useState} from 'react';
import {askKitchenSwitch} from '../../cart/components/KitchenSwitchDialog';
import {
  ActivityIndicator,
  Animated,
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
  StackActions,
  useNavigation,
  useRoute,
  type NavigationProp,
  type RouteProp,
} from '@react-navigation/native';
import {BlurTargetView} from 'expo-blur';
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
import {
  OfflineNotice,
  RecoverableErrorBanner,
  TerminalState,
} from '../../../shared/components/LifecycleStates';
import {LiquidGlassSurface} from '../../../shared/components/LiquidGlassSurface';
import {ScreenShell} from '../../../shared/components/ScreenShell';
import type {CartLine} from '../../cart/domain/cartTypes';
import {
  addCartItem,
  removeCartItem,
  setCartItemQuantity,
  switchCartKitchen,
  type CartMutationOutcome,
} from '../../cart/state/cartMutations';
import {getKitchenInitials} from '../../chefDiscovery/chefDiscoveryPresentation';
import {FoodTypePill} from '../../customerSubscription/components/MealPlanUi';
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
import {useCustomerKitchenProfileQuery} from '../../kitchenProfile/query/kitchenProfileQueries';
import {kitchenNavigationAction} from '../dishDetailNavigation';
import {useCustomerDishDetailQuery} from '../query/dishDetailQueries';

type DishDetailRoute = RouteProp<
  CustomerDishDetailStackParamList,
  'CustomerDishDetail'
>;

type DishDetailNavigation = NavigationProp<
  CustomerDishDetailStackParamList,
  'CustomerDishDetail'
>;

const HERO_HEIGHT = 280;
// Show the slim header once the photo has mostly scrolled away.
const COMPACT_HEADER_OFFSET = HERO_HEIGHT - 60;

interface DishFact {
  icon: React.ComponentProps<typeof MaterialDesignIcons>['name'];
  value: string;
  label: string;
}

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
  const [sharing, setSharing] = useState(false);
  const [revalidating, setRevalidating] = useState(false);
  const [purchaseMessage, setPurchaseMessage] = useState<string | null>(null);
  const [interactionNotice, setInteractionNotice] = useState<string | null>(null);
  const galleryRef = useRef<FlatList<CustomerDishDetailImage>>(null);
  const heroTarget = useRef<View | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const scrollY = useRef(new Animated.Value(0)).current;
  const compactHeaderRef = useRef(false);
  const [compactHeader, setCompactHeader] = useState(false);
  const compactHeaderOpacity = scrollY.interpolate({
    inputRange: [COMPACT_HEADER_OFFSET - 40, COMPACT_HEADER_OFFSET],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const handleScroll = useMemo(
    () =>
      Animated.event([{nativeEvent: {contentOffset: {y: scrollY}}}], {
        useNativeDriver: true,
        listener: (event: NativeSyntheticEvent<NativeScrollEvent>) => {
          const next = event.nativeEvent.contentOffset.y > COMPACT_HEADER_OFFSET - 20;
          if (next !== compactHeaderRef.current) {
            compactHeaderRef.current = next;
            setCompactHeader(next);
          }
        },
      }),
    [scrollY],
  );
  const galleryWidth = Math.max(1, width);
  const stackPurchaseActions = shouldStackCriticalActions(width, fontScale);

  const dish = detail.data;
  const kitchenProfile = useCustomerKitchenProfileQuery(dish?.kitchen.id ?? '');
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
    setPurchaseMessage(null);
    setInteractionNotice(null);
    galleryRef.current?.scrollToOffset({offset: 0, animated: false});
    scrollRef.current?.scrollTo({y: 0, animated: false});
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

      const latestDish = refreshed.data;
      const decision = evaluateDishCartRevalidation(dish, latestDish);
      if (decision.status !== 'READY') {
        setPurchaseMessage(decision.message);
        return;
      }

      const otherKitchen =
        cartLine == null
          ? cartSnapshot?.lines.find(
              line => line.kitchenId !== latestDish.kitchen.id,
            ) ?? null
          : null;
      if (otherKitchen && cartSnapshot) {
        const expectedSnapshot = cartSnapshot;
        askKitchenSwitch({
          cartLines: expectedSnapshot.lines,
          newDish: {
            name: latestDish.itemName,
            kitchenName: latestDish.kitchen.displayName ?? latestDish.kitchen.kitchenName,
            priceLabel: formatDishDetailPrice(latestDish.price.amount, latestDish.price.currency),
            imageUrl: (latestDish.images.find(image => image.primary) ?? latestDish.images[0])?.url,
          },
          onReplace: () => {
            dispatch(
              switchCartKitchen({
                expectedSnapshot,
                menuItemId: latestDish.id,
                quantity: 1,
                expectedKitchenId: latestDish.kitchen.id,
              }),
            )
              .then(outcome =>
                handleCartOutcome(outcome, latestDish.price.amount),
              )
              .catch(() =>
                setPurchaseMessage(
                  'We couldn’t confirm the cart change. Check your cart before trying again.',
                ),
              );
          },
        });
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
            addCartItem({menuItemId: latestDish.id, quantity: 1}),
          );
      handleCartOutcome(outcome, latestDish.price.amount);
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
  const spice = spiceLabel(dish.spiceLevel);
  const hasImages = dish.images.length > 0;
  const glassIconColor = hasImages ? colors.white : colors.espressoBrown;
  const facts: DishFact[] = [];
  if (dish.preparationTimeMinutes) {
    facts.push({icon: 'clock-outline', value: `${dish.preparationTimeMinutes} min`, label: 'Prep time'});
  }
  if (dish.servesCount) {
    facts.push({icon: 'account-outline', value: String(dish.servesCount), label: 'Serves'});
  }
  if (spice) {
    facts.push({icon: 'chili-mild', value: spice, label: 'Spice'});
  }
  if (dish.unitPackageWeightGrams) {
    facts.push({icon: 'package-variant-closed', value: `${dish.unitPackageWeightGrams} g`, label: 'Pack'});
  }
  const kitchenMenu = kitchenProfile.data?.menuItems ?? [];
  const moreDishes = kitchenMenu.filter(item => item.id !== dish.id).slice(0, 10);

  const openKitchen = () => {
    const state = navigation.getState();
    if (kitchenNavigationAction(state.routes, state.index, dish.kitchen.id) === 'back') {
      navigation.goBack();
      return;
    }
    navigation.dispatch(
      StackActions.replace('CustomerKitchenProfile', {kitchenId: dish.kitchen.id}),
    );
  };

  const renderPurchaseControl = (compact: boolean) =>
    cartLine ? (
      <View
        accessibilityLabel={`${dish.itemName} quantity ${cartLine.quantity}`}
        style={[styles.quantitySelector, compact && styles.quantitySelectorCompact]}>
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
        label="Add"
        accessibilityLabel={`Add ${dish.itemName} to cart`}
        accessibilityHint="Checks the latest availability and price before adding"
        loading={purchaseBusy}
        onPress={revalidateAndIncrease}
        style={[styles.addButton, compact && styles.addButtonCompact]}
      />
    );

  return (
    <ScreenShell
      edges={['bottom']}
      keyboardAvoiding={false}
      testID="customer-dish-detail">
      <View style={styles.screen}>
        <Animated.ScrollView
          ref={scrollRef}
          keyboardDismissMode="on-drag"
          onScroll={handleScroll}
          scrollEventThrottle={16}
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
            {hasImages ? (
              <BlurTargetView ref={heroTarget} style={{width: galleryWidth, height: HERO_HEIGHT}}>
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
              </BlurTargetView>
            ) : (
              <View style={styles.heroFallback}>
                <Text style={styles.heroFallbackCategory}>{dish.category}</Text>
                <Text style={styles.heroFallbackTitle}>{dish.itemName}</Text>
              </View>
            )}

            {dish.images.length > 1 ? (
              <View
                accessibilityLabel={`Image ${galleryIndex + 1} of ${dish.images.length}`}
                pointerEvents="none"
                style={styles.heroDots}>
                {dish.images.map((image, index) => (
                  <View
                    key={image.id}
                    style={[styles.heroDot, index === galleryIndex && styles.heroDotActive]}
                  />
                ))}
              </View>
            ) : null}

            <LiquidGlassSurface
              appearance="home"
              blurTarget={hasImages ? heroTarget : undefined}
              style={[styles.glassButton, styles.glassClose]}>
              <Pressable
                accessibilityLabel="Close dish details"
                accessibilityRole="button"
                hitSlop={spacing.xs}
                onPress={() => navigation.goBack()}
                style={({pressed}) => [styles.glassPressable, pressed && styles.pressed]}>
                <MaterialDesignIcons name="chevron-down" size={26} color={glassIconColor} />
              </Pressable>
            </LiquidGlassSurface>

            <View style={styles.heroActions}>
              <LiquidGlassSurface
                appearance="home"
                blurTarget={hasImages ? heroTarget : undefined}
                style={styles.glassButton}>
                <Pressable
                  accessibilityLabel={favorite ? 'Remove dish from favorites' : 'Save dish to favorites'}
                  accessibilityRole="button"
                  accessibilityState={{selected: favorite, disabled: favoriteBusy}}
                  disabled={favoriteBusy}
                  hitSlop={spacing.xs}
                  onPress={handleFavorite}
                  style={({pressed}) => [
                    styles.glassPressable,
                    pressed && !favoriteBusy && styles.pressed,
                    favoriteBusy && styles.disabled,
                  ]}>
                  <MaterialDesignIcons
                    name={favorite ? 'heart' : 'heart-outline'}
                    size={23}
                    color={favorite ? colors.flameRed : glassIconColor}
                  />
                </Pressable>
              </LiquidGlassSurface>
              <LiquidGlassSurface
                appearance="home"
                blurTarget={hasImages ? heroTarget : undefined}
                style={styles.glassButton}>
                <Pressable
                  accessibilityLabel="Share dish"
                  accessibilityRole="button"
                  accessibilityState={{busy: sharing}}
                  disabled={sharing}
                  hitSlop={spacing.xs}
                  onPress={handleShare}
                  style={({pressed}) => [
                    styles.glassPressable,
                    pressed && !sharing && styles.pressed,
                    sharing && styles.disabled,
                  ]}>
                  <MaterialDesignIcons name="share-variant-outline" size={22} color={glassIconColor} />
                </Pressable>
              </LiquidGlassSurface>
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

            <View style={styles.tagRow}>
              <FoodTypePill foodType={dish.foodType} />
              <View style={styles.categoryChip}>
                <Text numberOfLines={1} style={styles.categoryChipText}>
                  {dish.category}
                </Text>
              </View>
            </View>

            <View style={[styles.titleRow, stackPurchaseActions && styles.titleRowStacked]}>
              <View style={styles.titleCopy}>
                <Text accessibilityRole="header" style={styles.title}>
                  {dish.itemName}
                </Text>
                <Text style={styles.titlePrice}>
                  {formatDishDetailPrice(dish.price.amount, dish.price.currency)}
                </Text>
              </View>
              {renderPurchaseControl(false)}
            </View>

            {purchaseMessage ? (
              <Text accessibilityLiveRegion="polite" style={styles.purchaseMessage}>
                {purchaseMessage}
              </Text>
            ) : null}
            {revalidating ? (
              <View style={styles.revalidatingRow}>
                <ActivityIndicator color={colors.flameRed} size="small" />
                <Text style={styles.revalidatingText}>Checking latest details…</Text>
              </View>
            ) : null}

            {facts.length > 0 ? (
              <View style={styles.factRow}>
                {facts.map((fact, index) => (
                  <View key={fact.label} style={[styles.fact, index > 0 && styles.factDivider]}>
                    <View style={styles.factIcon}>
                      <MaterialDesignIcons
                        name={fact.icon}
                        size={19}
                        color={colors.flameRedAccessible}
                      />
                    </View>
                    <Text numberOfLines={1} style={styles.factValue}>
                      {fact.value}
                    </Text>
                    <Text style={styles.factLabel}>{fact.label}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            <Pressable
              accessibilityHint="Closes this dish and opens the kitchen page"
              accessibilityLabel={`View ${kitchenName} kitchen`}
              accessibilityRole="button"
              onPress={openKitchen}
              style={({pressed}) => [styles.kitchenCard, pressed && styles.pressed]}>
              <Text style={styles.kitchenLabel}>PREPARED BY</Text>
              <View style={styles.kitchenRow}>
                <View style={styles.kitchenAvatar}>
                  <Text style={styles.kitchenAvatarText}>
                    {getKitchenInitials({kitchenName})}
                  </Text>
                </View>
                <View style={styles.kitchenCopy}>
                  <Text numberOfLines={1} style={styles.kitchenName}>
                    {kitchenName}
                  </Text>
                  {kitchenLocation ? (
                    <Text numberOfLines={1} style={styles.kitchenMeta}>
                      {kitchenLocation}
                    </Text>
                  ) : null}
                </View>
                <View style={styles.kitchenChevron}>
                  <MaterialDesignIcons name="chevron-right" size={22} color={colors.espressoBrown} />
                </View>
              </View>
              {dish.kitchen.description ? (
                <Text numberOfLines={2} style={styles.kitchenTagline}>
                  “{dish.kitchen.description}”
                </Text>
              ) : null}
              <View style={styles.kitchenFooter}>
                <Text style={styles.kitchenFooterMeta}>
                  {kitchenMenu.length > 0
                    ? `${kitchenMenu.length} ${kitchenMenu.length === 1 ? 'dish' : 'dishes'} on the menu`
                    : ''}
                </Text>
                <View style={styles.kitchenFooterAction}>
                  <Text style={styles.kitchenFooterActionText}>View kitchen</Text>
                  <MaterialDesignIcons name="arrow-right" size={16} color={colors.flameRedAccessible} />
                </View>
              </View>
            </Pressable>

            {moreDishes.length > 0 ? (
              <View style={styles.moreSection}>
                <Text accessibilityRole="header" style={styles.sectionTitle}>
                  More from this kitchen
                </Text>
                <ScrollView
                  horizontal
                  nestedScrollEnabled
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.moreRail}>
                  {moreDishes.map(item => {
                    const image = item.images.find(entry => entry.primary) ?? item.images[0];
                    const itemPrice = formatDishDetailPrice(item.price.amount, item.price.currency);
                    return (
                      <Pressable
                        key={item.id}
                        accessibilityHint="Shows this dish"
                        accessibilityLabel={`${item.itemName}, ${itemPrice}`}
                        accessibilityRole="button"
                        onPress={() => navigation.setParams({menuItemId: item.id})}
                        style={({pressed}) => [styles.moreCard, pressed && styles.pressed]}>
                        {image ? (
                          <Image
                            accessibilityIgnoresInvertColors
                            source={{uri: image.url}}
                            resizeMode="cover"
                            style={styles.moreImage}
                          />
                        ) : (
                          <View style={[styles.moreImage, styles.moreImageFallback]}>
                            <MaterialDesignIcons
                              name="silverware-fork-knife"
                              size={24}
                              color={colors.textSecondary}
                            />
                          </View>
                        )}
                        <View style={styles.moreBody}>
                          <Text numberOfLines={1} style={styles.moreName}>
                            {item.itemName}
                          </Text>
                          <Text style={styles.morePrice}>{itemPrice}</Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            ) : null}

            {dish.thermoboxRequired ? (
              <View style={styles.note}>
                <MaterialDesignIcons name="thermometer" size={18} color={colors.espressoBrown} />
                <Text style={styles.noteText}>Packed in a thermobox so it reaches you hot.</Text>
              </View>
            ) : null}
          </View>
        </Animated.ScrollView>

        <Animated.View
          accessibilityElementsHidden={!compactHeader}
          importantForAccessibility={compactHeader ? 'auto' : 'no-hide-descendants'}
          pointerEvents={compactHeader ? 'auto' : 'none'}
          style={[styles.compactHeader, {opacity: compactHeaderOpacity}]}>
          <Pressable
            accessibilityLabel="Close dish details"
            accessibilityRole="button"
            onPress={() => navigation.goBack()}
            style={({pressed}) => [styles.compactClose, pressed && styles.pressed]}>
            <MaterialDesignIcons name="chevron-down" size={24} color={colors.espressoBrown} />
          </Pressable>
          <Text numberOfLines={1} style={styles.compactTitle}>
            {dish.itemName}
          </Text>
          {renderPurchaseControl(true)}
        </Animated.View>
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.surfaceBase},
  pressed: {opacity: 0.72},
  disabled: {opacity: 0.45},
  scrollContent: {paddingBottom: spacing.xl},
  heroFrame: {position: 'relative'},
  heroImage: {height: HERO_HEIGHT, backgroundColor: colors.surfaceMuted},
  heroFallback: {
    height: HERO_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    backgroundColor: colors.cream,
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
  heroDots: {
    position: 'absolute',
    bottom: spacing.sm,
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 5,
  },
  heroDot: {
    width: 6,
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.6)',
  },
  heroDotActive: {width: 16, backgroundColor: colors.white},
  glassButton: {
    width: 42,
    height: 42,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  glassClose: {position: 'absolute', top: spacing.lg, left: spacing.sm},
  glassPressable: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroActions: {
    position: 'absolute',
    top: spacing.lg,
    right: spacing.sm,
    flexDirection: 'row',
    gap: spacing.xs,
  },
  content: {paddingHorizontal: spacing.md, paddingTop: spacing.md},
  notice: {marginBottom: spacing.sm},
  tagRow: {flexDirection: 'row', alignItems: 'center', gap: spacing.xs},
  categoryChip: {
    flexShrink: 1,
    minHeight: 26,
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
  },
  categoryChipText: {
    color: colors.espressoBrown,
    fontSize: typography.small,
    fontWeight: fontWeight.medium,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  titleRowStacked: {flexDirection: 'column', alignItems: 'stretch', gap: spacing.xs},
  titleCopy: {flex: 1, minWidth: 0},
  title: {
    color: colors.espressoBrown,
    fontSize: typography.hero,
    fontWeight: fontWeight.extrabold,
  },
  titlePrice: {
    marginTop: spacing.xxs,
    color: colors.espressoBrown,
    fontSize: typography.heading,
    fontWeight: fontWeight.extrabold,
  },
  addButton: {
    minHeight: touchTarget.minimum,
    minWidth: 96,
    paddingHorizontal: spacing.md,
  },
  addButtonCompact: {minHeight: 40, minWidth: 84},
  quantitySelector: {
    width: 116,
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
  quantitySelectorCompact: {width: 104, minHeight: 40},
  quantityButton: {
    width: 38,
    minHeight: 40,
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
    minWidth: 24,
    textAlign: 'center',
    color: colors.espressoBrown,
    fontSize: typography.body,
    fontWeight: fontWeight.bold,
  },
  purchaseMessage: {
    marginTop: spacing.xs,
    color: colors.error,
    fontSize: typography.small,
  },
  revalidatingRow: {
    marginTop: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  revalidatingText: {color: colors.textSecondary, fontSize: typography.tiny},
  factRow: {
    flexDirection: 'row',
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xxs,
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
    borderRadius: radius.lg,
  },
  fact: {flex: 1, alignItems: 'center', paddingHorizontal: spacing.xxs},
  factDivider: {borderLeftWidth: borderWidth.standard, borderLeftColor: colors.border},
  factIcon: {
    width: 34,
    height: 34,
    marginBottom: spacing.xxs,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cream,
  },
  factValue: {
    color: colors.espressoBrown,
    fontSize: typography.small,
    fontWeight: fontWeight.bold,
  },
  factLabel: {color: colors.textSecondary, fontSize: typography.tiny},
  kitchenCard: {
    marginTop: spacing.md,
    padding: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
    backgroundColor: colors.white,
    ...elevation.card,
  },
  kitchenLabel: {
    color: colors.textSecondary,
    fontSize: typography.tiny,
    fontWeight: fontWeight.bold,
    letterSpacing: 0.8,
  },
  kitchenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  kitchenAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cream,
  },
  kitchenAvatarText: {
    color: colors.flameRed,
    fontSize: typography.heading,
    fontWeight: fontWeight.extrabold,
  },
  kitchenCopy: {flex: 1, minWidth: 0},
  kitchenName: {
    color: colors.espressoBrown,
    fontSize: typography.button,
    fontWeight: fontWeight.bold,
  },
  kitchenMeta: {
    marginTop: 2,
    color: colors.textSecondary,
    fontSize: typography.small,
  },
  kitchenChevron: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  kitchenTagline: {
    marginTop: spacing.xs,
    color: colors.textPrimary,
    fontSize: typography.small,
    fontStyle: 'italic',
  },
  kitchenFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: borderWidth.standard,
    borderTopColor: colors.border,
  },
  kitchenFooterMeta: {flex: 1, color: colors.textSecondary, fontSize: typography.small},
  kitchenFooterAction: {flexDirection: 'row', alignItems: 'center', gap: 2},
  kitchenFooterActionText: {
    color: colors.flameRedAccessible,
    fontSize: typography.small,
    fontWeight: fontWeight.bold,
  },
  moreSection: {marginTop: spacing.lg},
  sectionTitle: {
    color: colors.espressoBrown,
    fontSize: typography.heading,
    fontWeight: fontWeight.bold,
  },
  moreRail: {gap: spacing.xs, paddingTop: spacing.xs, paddingRight: spacing.md},
  moreCard: {
    width: 136,
    overflow: 'hidden',
    borderRadius: radius.md,
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  moreImage: {width: '100%', height: 92, backgroundColor: colors.surfaceMuted},
  moreImageFallback: {alignItems: 'center', justifyContent: 'center'},
  moreBody: {paddingHorizontal: spacing.xs, paddingVertical: spacing.xs},
  moreName: {
    color: colors.espressoBrown,
    fontSize: typography.small,
    fontWeight: fontWeight.semibold,
  },
  morePrice: {
    marginTop: 2,
    color: colors.espressoBrown,
    fontSize: typography.small,
    fontWeight: fontWeight.bold,
  },
  note: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.md,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
  },
  noteText: {flex: 1, color: colors.textSecondary, fontSize: typography.small},
  compactHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderBottomWidth: borderWidth.standard,
    borderBottomColor: colors.border,
    backgroundColor: colors.white,
  },
  compactClose: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  compactTitle: {
    flex: 1,
    color: colors.espressoBrown,
    fontSize: typography.button,
    fontWeight: fontWeight.bold,
  },
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
