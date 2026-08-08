import React, {useEffect, useMemo, useState} from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {useCustomerBottomNavScroll} from '../../../app/navigation/CustomerBottomNavController';
import {useAppDispatch, useAppSelector} from '../../../app/store/hooks';
import {toAppApiError} from '../../../core/http/apiError';
import {
  colors,
  elevation,
  fontWeight,
  radius,
  spacing,
  typography,
} from '../../../design/tokens';
import {Button} from '../../../shared/components/Button';
import {Chip} from '../../../shared/components/Chip';
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
import {CustomerHeader} from '../../customerShell/components/CustomerHeader';
import {CustomerLocationSelector} from '../../customerShell/components/CustomerLocationSelector';
import {useCustomerHeaderState} from '../../customerShell/hooks/useCustomerHeaderState';
import type {NearbyDish} from '../api/homeFeedApi';
import {
  filterHomeDishes,
  flattenNearbyDishPages,
  formatDishPrice,
  formatDistance,
  getHomeCategories,
} from '../homePresentation';
import {useHomeNearbyDishesQuery} from '../query/homeFeedQueries';

const HOME_RADIUS_METERS = 10_000;
const HOME_PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 250;

function HomeFeedSkeleton() {
  return (
    <View
      accessibilityLabel="Loading meals near you"
      accessibilityRole="progressbar"
      style={styles.skeletonWrap}>
      <View style={styles.skeletonHero} />
      <View style={styles.skeletonLineWide} />
      <View style={styles.skeletonLine} />
      <View style={styles.skeletonCard} />
      <View style={styles.skeletonCard} />
    </View>
  );
}

interface DishCardProps {
  dish: NearbyDish;
  adding: boolean;
  cartLine: CartLine | null;
  changingQuantity: boolean;
  onAdd: (dishId: string) => void;
  onDecrease: (line: CartLine) => void;
  onIncrease: (line: CartLine) => void;
}

function DishCard({
  dish,
  adding,
  cartLine,
  changingQuantity,
  onAdd,
  onDecrease,
  onIncrease,
}: DishCardProps) {
  const kitchenName = dish.kitchenDisplayName ?? dish.kitchenName;
  const location = [dish.areaName, dish.city].filter(Boolean).join(', ');
  const quantity = cartLine?.quantity ?? 0;

  return (
    <View style={styles.dishCard}>
      {dish.primaryImageUrl ? (
        <Image
          accessibilityIgnoresInvertColors
          source={{uri: dish.primaryImageUrl}}
          resizeMode="cover"
          style={styles.dishImage}
        />
      ) : (
        <View style={styles.imageFallback}>
          <Text style={styles.imageFallbackText}>{dish.category}</Text>
        </View>
      )}
      <View style={styles.dishBody}>
        <View style={styles.dishTitleRow}>
          <View style={styles.dishTitleCopy}>
            <Text numberOfLines={2} style={styles.dishName}>
              {dish.itemName}
            </Text>
            <Text numberOfLines={1} style={styles.kitchenName}>
              {kitchenName}
            </Text>
          </View>
          <Text style={styles.price}>{formatDishPrice(dish.price, dish.currency)}</Text>
        </View>
        <Text numberOfLines={1} style={styles.metadata}>
          {[formatDistance(dish.distanceMeters), location].filter(Boolean).join(' • ')}
        </Text>
        <View style={styles.dishFooter}>
          <View style={styles.foodTypePill}>
            <Text style={styles.foodTypeText}>
              {dish.foodType === 'NON_VEG' ? 'Non-veg' : dish.foodType === 'EGG' ? 'Egg' : 'Veg'}
            </Text>
          </View>
          {cartLine && quantity > 0 ? (
            <View
              accessibilityLabel={`${dish.itemName} quantity ${quantity}`}
              style={styles.quantitySelector}>
              <Pressable
                accessibilityLabel={`Decrease ${dish.itemName} quantity`}
                accessibilityRole="button"
                accessibilityState={{disabled: changingQuantity}}
                disabled={changingQuantity}
                onPress={() => onDecrease(cartLine)}
                style={({pressed}) => [
                  styles.quantityButton,
                  pressed && styles.quantityButtonPressed,
                  changingQuantity && styles.quantityButtonDisabled,
                ]}>
                <Text style={styles.quantityButtonText}>−</Text>
              </Pressable>
              <Text accessibilityLiveRegion="polite" style={styles.quantityText}>
                {quantity}
              </Text>
              <Pressable
                accessibilityLabel={`Increase ${dish.itemName} quantity`}
                accessibilityRole="button"
                accessibilityState={{disabled: changingQuantity}}
                disabled={changingQuantity}
                onPress={() => onIncrease(cartLine)}
                style={({pressed}) => [
                  styles.quantityButton,
                  pressed && styles.quantityButtonPressed,
                  changingQuantity && styles.quantityButtonDisabled,
                ]}>
                <Text style={styles.quantityButtonText}>+</Text>
              </Pressable>
            </View>
          ) : (
            <Button
              label="Add"
              accessibilityLabel={`Add ${dish.itemName} to cart`}
              loading={adding}
              onPress={() => onAdd(dish.id)}
              style={styles.addButton}
            />
          )}
        </View>
      </View>
    </View>
  );
}

export function CustomerHomeScreen() {
  const dispatch = useAppDispatch();
  const identity = useAppSelector(state => state.auth.identity);
  const cartSnapshot = useAppSelector(state => state.cart.snapshot);
  const cartMutations = useAppSelector(state => state.cart.mutations);
  const header = useCustomerHeaderState();
  const bottomNavScroll = useCustomerBottomNavScroll();
  const [locationSelectorVisible, setLocationSelectorVisible] = useState(false);
  const [searchDraft, setSearchDraft] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);

  const feed = useHomeNearbyDishesQuery({
    radiusMeters: HOME_RADIUS_METERS,
    size: HOME_PAGE_SIZE,
  });

  useEffect(() => {
    const timer = setTimeout(() => setSearchQuery(searchDraft), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchDraft]);

  const dishes = useMemo(
    () => flattenNearbyDishPages(feed.data?.pages),
    [feed.data?.pages],
  );
  const categories = useMemo(() => getHomeCategories(dishes), [dishes]);
  const visibleDishes = useMemo(
    () => filterHomeDishes(dishes, searchQuery, selectedCategory),
    [dishes, searchQuery, selectedCategory],
  );
  const cartLinesByMenuItemId = useMemo(() => {
    const lines = new Map<string, CartLine>();
    for (const line of cartSnapshot?.lines ?? []) {
      lines.set(line.menuItemId, line);
    }
    return lines;
  }, [cartSnapshot?.lines]);

  const firstName = identity?.displayName?.trim().split(/\s+/)[0] ?? null;
  const greeting = firstName ? `Hi ${firstName}` : 'Hello';
  const queryError = feed.error ? toAppApiError(feed.error) : null;
  const offline = queryError?.code === 'NETWORK_ERROR';
  const initialLoading = feed.isPending && dishes.length === 0 && !feed.locationRequired;
  const hasFilters = Boolean(searchQuery.trim() || selectedCategory);

  const retryFeed = () => {
    feed.refetch();
  };

  const handleMutationOutcome = (outcome: CartMutationOutcome) => {
    if (outcome.status === 'FAILED') {
      setMutationError(outcome.error.message);
    }
  };

  const handleAdd = (dishId: string) => {
    setMutationError(null);
    dispatch(addCartItem({menuItemId: dishId, quantity: 1})).then(handleMutationOutcome);
  };

  const handleIncrease = (line: CartLine) => {
    setMutationError(null);
    dispatch(
      setCartItemQuantity({
        lineId: line.lineId,
        quantity: line.quantity + 1,
      }),
    ).then(handleMutationOutcome);
  };

  const handleDecrease = (line: CartLine) => {
    setMutationError(null);
    if (line.quantity <= 1) {
      dispatch(removeCartItem({lineId: line.lineId})).then(handleMutationOutcome);
      return;
    }
    dispatch(
      setCartItemQuantity({
        lineId: line.lineId,
        quantity: line.quantity - 1,
      }),
    ).then(handleMutationOutcome);
  };

  const clearFilters = () => {
    setSearchDraft('');
    setSearchQuery('');
    setSelectedCategory(null);
  };

  const emptyState = (() => {
    if (feed.locationRequired) {
      return (
        <TerminalState
          title="Choose where to deliver"
          description="Select a saved address to see available home-cooked meals nearby."
          actionLabel="Choose location"
          onAction={() => setLocationSelectorVisible(true)}
        />
      );
    }
    if (initialLoading) {
      return <HomeFeedSkeleton />;
    }
    if (queryError && dishes.length === 0) {
      return (
        <TerminalState
          title={offline ? 'You appear to be offline' : 'Meals could not be loaded'}
          description={queryError.message}
          actionLabel="Try again"
          onAction={retryFeed}
        />
      );
    }
    if (hasFilters && dishes.length > 0) {
      return (
        <TerminalState
          title="No matching meals"
          description="Try a different search or category from the nearby meals already loaded."
          actionLabel="Clear filters"
          onAction={clearFilters}
        />
      );
    }
    return (
      <TerminalState
        title="No meals nearby yet"
        description="Pull to refresh or choose another saved location."
        actionLabel="Refresh"
        onAction={retryFeed}
        secondaryActionLabel="Change location"
        onSecondaryAction={() => setLocationSelectorVisible(true)}
      />
    );
  })();

  const headerContent = (
    <View>
      <CustomerHeader
        onPressLocation={() => setLocationSelectorVisible(true)}
        onPressNotifications={() => {
          header.refreshNotifications();
        }}
      />
      <View style={styles.heroCopy}>
        <Text style={styles.greeting}>{greeting}</Text>
        <Text style={styles.heading}>What are you craving today?</Text>
        <Text style={styles.subheading}>
          Fresh meals from active home kitchens around your selected location.
        </Text>
      </View>
      <View style={styles.searchWrap}>
        <TextInput
          accessibilityLabel="Search loaded nearby meals"
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={setSearchDraft}
          placeholder="Search nearby dishes or kitchens"
          placeholderTextColor={colors.placeholder}
          returnKeyType="search"
          style={styles.searchInput}
          value={searchDraft}
        />
      </View>
      {categories.length > 0 ? (
        <ScrollView
          horizontal
          contentContainerStyle={styles.categoryRow}
          keyboardShouldPersistTaps="handled"
          showsHorizontalScrollIndicator={false}>
          <Chip
            label="All"
            selected={selectedCategory === null}
            onPress={() => setSelectedCategory(null)}
          />
          {categories.map(category => (
            <Chip
              key={category}
              label={category}
              selected={selectedCategory === category}
              onPress={() => setSelectedCategory(category)}
            />
          ))}
        </ScrollView>
      ) : null}
      <View style={styles.sectionHeadingRow}>
        <View>
          <Text style={styles.sectionTitle}>Popular near you</Text>
          <Text style={styles.sectionCaption}>Available meals ordered by distance</Text>
        </View>
      </View>
      {mutationError ? (
        <RecoverableErrorBanner
          message={mutationError}
          style={styles.inlineNotice}
        />
      ) : null}
      {queryError && dishes.length > 0 ? (
        offline ? (
          <OfflineNotice
            message={queryError.message}
            onRetry={retryFeed}
            style={styles.inlineNotice}
          />
        ) : (
          <RecoverableErrorBanner
            message={queryError.message}
            onRetry={retryFeed}
            style={styles.inlineNotice}
          />
        )
      ) : null}
    </View>
  );

  return (
    <ScreenShell edges={['top']} keyboardAvoiding={false} testID="customer-home">
      <FlatList
        data={visibleDishes}
        keyExtractor={item => item.id}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={emptyState}
        ListFooterComponent={
          feed.isFetchingNextPage ? (
            <ActivityIndicator
              accessibilityLabel="Loading more meals"
              color={colors.flameRed}
              style={styles.footerLoader}
            />
          ) : null
        }
        ListHeaderComponent={headerContent}
        onEndReached={() => {
          if (feed.hasNextPage && !feed.isFetchingNextPage && !hasFilters) {
            feed.fetchNextPage();
          }
        }}
        onEndReachedThreshold={0.6}
        onScroll={bottomNavScroll.onScroll}
        refreshControl={
          <RefreshControl
            colors={[colors.flameRed]}
            onRefresh={retryFeed}
            refreshing={feed.isRefetching && !feed.isFetchingNextPage}
            tintColor={colors.flameRed}
          />
        }
        renderItem={({item}) => {
          const cartLine = cartLinesByMenuItemId.get(item.id) ?? null;
          return (
            <DishCard
              dish={item}
              adding={cartMutations[`menu:${item.id}`]?.status === 'PENDING'}
              cartLine={cartLine}
              changingQuantity={
                cartLine ? cartMutations[`line:${cartLine.lineId}`]?.status === 'PENDING' : false
              }
              onAdd={handleAdd}
              onDecrease={handleDecrease}
              onIncrease={handleIncrease}
            />
          );
        }}
        scrollEventThrottle={bottomNavScroll.scrollEventThrottle}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
      />
      <CustomerLocationSelector
        visible={locationSelectorVisible}
        onClose={() => setLocationSelectorVisible(false)}
      />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  listContent: {
    flexGrow: 1,
    paddingBottom: spacing.xxl,
    backgroundColor: colors.surfaceBase,
  },
  heroCopy: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  greeting: {
    color: colors.flameRed,
    fontSize: typography.small,
    fontWeight: fontWeight.bold,
  },
  heading: {
    color: colors.espressoBrown,
    fontSize: typography.hero,
    fontWeight: fontWeight.extrabold,
    marginTop: spacing.xxs,
  },
  subheading: {
    color: colors.textSecondary,
    fontSize: typography.small,
    marginTop: spacing.xs,
  },
  searchWrap: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  searchInput: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    color: colors.textPrimary,
    paddingHorizontal: spacing.md,
    fontSize: typography.body,
  },
  categoryRow: {
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  sectionHeadingRow: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xl,
    paddingBottom: spacing.sm,
  },
  sectionTitle: {
    color: colors.espressoBrown,
    fontSize: typography.heading,
    fontWeight: fontWeight.bold,
  },
  sectionCaption: {
    color: colors.textSecondary,
    fontSize: typography.small,
    marginTop: spacing.xxs,
  },
  inlineNotice: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  dishCard: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    overflow: 'hidden',
    ...elevation.card,
  },
  dishImage: {
    width: '100%',
    height: 176,
    backgroundColor: colors.surfaceMuted,
  },
  imageFallback: {
    height: 132,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceWarm,
  },
  imageFallbackText: {
    color: colors.espressoBrown,
    fontSize: typography.body,
    fontWeight: fontWeight.semibold,
  },
  dishBody: {
    padding: spacing.md,
  },
  dishTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  dishTitleCopy: {
    minWidth: 0,
    flex: 1,
  },
  dishName: {
    color: colors.espressoBrown,
    fontSize: typography.heading,
    fontWeight: fontWeight.bold,
  },
  kitchenName: {
    color: colors.textSecondary,
    fontSize: typography.small,
    marginTop: spacing.xxs,
  },
  price: {
    color: colors.flameRed,
    fontSize: typography.body,
    fontWeight: fontWeight.bold,
  },
  metadata: {
    color: colors.textSecondary,
    fontSize: typography.small,
    marginTop: spacing.xs,
  },
  dishFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  foodTypePill: {
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceWarm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  foodTypeText: {
    color: colors.espressoBrown,
    fontSize: typography.tiny,
    fontWeight: fontWeight.semibold,
  },
  addButton: {
    minHeight: 48,
    minWidth: 104,
  },
  quantitySelector: {
    minHeight: 48,
    minWidth: 128,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.flameRed,
    borderRadius: radius.pill,
    backgroundColor: colors.white,
    overflow: 'hidden',
  },
  quantityButton: {
    width: 44,
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quantityButtonPressed: {
    backgroundColor: colors.surfaceWarm,
  },
  quantityButtonDisabled: {
    opacity: 0.45,
  },
  quantityButtonText: {
    color: colors.flameRed,
    fontSize: typography.heading,
    fontWeight: fontWeight.bold,
  },
  quantityText: {
    minWidth: 28,
    textAlign: 'center',
    color: colors.espressoBrown,
    fontSize: typography.body,
    fontWeight: fontWeight.bold,
  },
  footerLoader: {
    paddingVertical: spacing.lg,
  },
  skeletonWrap: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  skeletonHero: {
    height: 96,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceMuted,
  },
  skeletonLineWide: {
    width: '72%',
    height: 20,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceMuted,
  },
  skeletonLine: {
    width: '44%',
    height: 14,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceMuted,
  },
  skeletonCard: {
    height: 220,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceMuted,
  },
});