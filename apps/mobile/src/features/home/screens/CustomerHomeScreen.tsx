import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import type {BottomTabNavigationProp} from '@react-navigation/bottom-tabs';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useCustomerBottomNavScroll} from '../../../app/navigation/CustomerBottomNavController';
import type {
  CustomerHomeStackParamList,
  CustomerTabParamList,
} from '../../../app/navigation/types';
import {useAppDispatch, useAppSelector} from '../../../app/store/hooks';
import {toAppApiError} from '../../../core/http/apiError';
import {classifyResponsiveWidth, responsiveLayout} from '../../../design/responsive';
import {
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
import {HomeCategoryRail} from '../components/HomeCategoryRail';
import {HomePromoAndKitchens} from '../components/HomePromoAndKitchens';
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
import {CustomerEmptyState} from '../../customerEmptyStates/components/CustomerEmptyState';
import {customerEmptyStateAdapters} from '../../customerEmptyStates/customerEmptyStateAdapters';
import {CustomerHeader} from '../../customerShell/components/CustomerHeader';
import {CustomerLocationSelector} from '../../customerShell/components/CustomerLocationSelector';
import {useCustomerHeaderState} from '../../customerShell/hooks/useCustomerHeaderState';
import {CustomerFavoriteHeartButton} from '../../favorites/components/CustomerFavoriteHeartButton';
import {
  isFavoriteMenuItem,
  useCustomerFavoritesQuery,
  useToggleCustomerFavorite,
} from '../../favorites/query/customerFavoritesQueries';
import {applyHomeDiscoveryFilters} from '../../discoveryFilters/discoveryFilterApplication';
import {
  discoveryFilterActions,
  getActiveDiscoveryFilterCount,
  resolveDiscoveryFilterSession,
} from '../../discoveryFilters/state/discoveryFilterSlice';
import {DiscoverySearchInput} from '../../discoverySearch/components/DiscoverySearchInput';
import {
  canRequestNextSearchPage,
  isDiscoverySearchActive,
} from '../../discoverySearch/discoverySearchOrchestration';
import {useDiscoverySearchSession} from '../../discoverySearch/hooks/useDiscoverySearchSession';
import type {NearbyDish} from '../api/homeFeedApi';
import {
  filterHomeDishes,
  flattenNearbyDishPages,
  formatDishPrice,
  formatDistance,
} from '../homePresentation';
import {useHomeNearbyDishesQuery} from '../query/homeFeedQueries';

const HOME_RADIUS_METERS = 10_000;
const HOME_PAGE_SIZE = 20;
const HOME_CATEGORY_STICKY_HEADER_INDEX = 1;

type HomeFeedListItem =
  | {kind: 'categories'; key: 'categories'}
  | {kind: 'popular-header'; key: 'popular-header'}
  | {kind: 'empty'; key: 'empty'}
  | {kind: 'dish'; key: string; dish: NearbyDish};

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
  favorite: boolean;
  favoritePending: boolean;
  favoriteDisabled: boolean;
  onFavoriteToggle: (dishId: string, favorite: boolean) => void;
  onAdd: (dishId: string) => void;
  onDecrease: (line: CartLine) => void;
  onIncrease: (line: CartLine) => void;
  onOpen: (dishId: string) => void;
}

function DishCard({
  dish,
  adding,
  cartLine,
  changingQuantity,
  favorite,
  favoritePending,
  favoriteDisabled,
  onFavoriteToggle,
  onAdd,
  onDecrease,
  onIncrease,
  onOpen,
}: DishCardProps) {
  const kitchenName = dish.kitchenDisplayName ?? dish.kitchenName;
  const location = [dish.areaName, dish.city].filter(Boolean).join(', ');
  const quantity = cartLine?.quantity ?? 0;
  const foodTypeLabel =
    dish.foodType === 'NON_VEG' ? 'Non-veg' : dish.foodType === 'EGG' ? 'Egg' : 'Veg';
  const foodTypeColor =
    dish.foodType === 'VEG'
      ? colors.success
      : dish.foodType === 'EGG'
        ? colors.warning
        : colors.error;
  const spiceLabel = dish.spiceLevel
    ? `${dish.spiceLevel.charAt(0)}${dish.spiceLevel.slice(1).toLowerCase()} spice`
    : null;
  const hasExtraMetadata = Boolean(
    dish.preparationTimeMinutes || dish.servesCount || spiceLabel,
  );

  return (
    <View style={styles.dishCard}>
      <Pressable
        accessibilityHint="Opens full dish information and purchase actions"
        accessibilityLabel={`View details for ${dish.itemName}`}
        accessibilityRole="button"
        onPress={() => onOpen(dish.id)}
        style={({pressed}) => pressed && styles.dishOpenPressed}>
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
      </Pressable>
      <CustomerFavoriteHeartButton
        favorite={favorite}
        pending={favoritePending}
        disabled={favoriteDisabled}
        itemLabel={dish.itemName}
        onToggle={() => onFavoriteToggle(dish.id, favorite)}
        style={styles.favoriteButton}
      />

      <View style={styles.dishBody}>
        <Pressable
          accessibilityLabel={`Open ${dish.itemName}`}
          accessibilityRole="button"
          onPress={() => onOpen(dish.id)}
          style={({pressed}) => pressed && styles.dishOpenPressed}>
          <Text numberOfLines={2} style={styles.dishName}>
            {dish.itemName}
          </Text>
          <Text numberOfLines={1} style={styles.kitchenName}>
            {kitchenName}
          </Text>
        </Pressable>

        <View style={styles.metadataRow}>
          <Icon name="location" size={14} color={colors.textSecondary} />
          <Text numberOfLines={1} style={styles.metadata}>
            {[formatDistance(dish.distanceMeters), location].filter(Boolean).join(' · ')}
          </Text>
        </View>

        {hasExtraMetadata ? (
          <View style={styles.detailRow}>
            {dish.preparationTimeMinutes ? (
              <View style={styles.detailItem}>
                <Icon name="clock" size={14} color={colors.textSecondary} />
                <Text style={styles.detailText}>{dish.preparationTimeMinutes} min</Text>
              </View>
            ) : null}
            {dish.servesCount ? (
              <Text style={styles.detailText}>Serves {dish.servesCount}</Text>
            ) : null}
            {spiceLabel ? <Text style={styles.detailText}>{spiceLabel}</Text> : null}
          </View>
        ) : null}

        <View style={styles.dishFooter}>
          <View style={styles.priceGroup}>
            <Text style={styles.price}>{formatDishPrice(dish.price, dish.currency)}</Text>
            <View style={styles.foodTypePill}>
              <View style={[styles.foodTypeDot, {backgroundColor: foodTypeColor}]} />
              <Text style={styles.foodTypeText}>{foodTypeLabel}</Text>
            </View>
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
              label="+ Add"
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
  const navigation = useNavigation<
    NativeStackNavigationProp<CustomerHomeStackParamList, 'CustomerHomeRoot'>
  >();
  const dispatch = useAppDispatch();
  const identity = useAppSelector(state => state.auth.identity);
  const selectedLocation = useAppSelector(state => state.customerShell.selectedLocation);
  const cartSnapshot = useAppSelector(state => state.cart.snapshot);
  const cartMutations = useAppSelector(state => state.cart.mutations);
  const storedFilters = useAppSelector(state => state.discoveryFilters.sessions.HOME);
  const header = useCustomerHeaderState();
  const favorites = useCustomerFavoritesQuery();
  const toggleFavorite = useToggleCustomerFavorite();
  const bottomNavScroll = useCustomerBottomNavScroll();
  const insets = useSafeAreaInsets();
  const {width, fontScale} = useWindowDimensions();
  const compactLayout =
    classifyResponsiveWidth(width) === 'compact' ||
    fontScale >= responsiveLayout.enlargedFontScale;
  const listBottomPadding = Math.max(
    spacing.xxxl * 3,
    insets.bottom + touchTarget.comfortable + spacing.xxxl,
  );
  const [locationSelectorVisible, setLocationSelectorVisible] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const listRef = useRef<FlatList<HomeFeedListItem>>(null);

  const feed = useHomeNearbyDishesQuery({
    radiusMeters: HOME_RADIUS_METERS,
    size: HOME_PAGE_SIZE,
  });
  const searchScopeKey =
    identity?.id && selectedLocation
      ? `${identity.id}:${selectedLocation.addressId}`
      : null;
  const search = useDiscoverySearchSession('HOME', searchScopeKey);
  const appliedFilters = useMemo(
    () => resolveDiscoveryFilterSession(storedFilters, searchScopeKey).applied,
    [searchScopeKey, storedFilters],
  );
  const restorePendingRef = useRef(search.scrollOffset > 0);

  const dishes = useMemo(
    () => flattenNearbyDishPages(feed.data?.pages),
    [feed.data?.pages],
  );
  const filteredAndSortedDishes = useMemo(
    () => applyHomeDiscoveryFilters(dishes, appliedFilters),
    [appliedFilters, dishes],
  );
  const visibleDishes = useMemo(
    () => filterHomeDishes(filteredAndSortedDishes, search.query, selectedCategory),
    [filteredAndSortedDishes, search.query, selectedCategory],
  );
  const listData = useMemo<HomeFeedListItem[]>(() => {
    const items: HomeFeedListItem[] = [
      {kind: 'categories', key: 'categories'},
      {kind: 'popular-header', key: 'popular-header'},
    ];
    if (visibleDishes.length === 0) {
      items.push({kind: 'empty', key: 'empty'});
    } else {
      items.push(
        ...visibleDishes.map(dish => ({
          kind: 'dish' as const,
          key: `dish:${dish.id}`,
          dish,
        })),
      );
    }
    return items;
  }, [visibleDishes]);
  const activeDiscoveryFilterCount = getActiveDiscoveryFilterCount(appliedFilters);
  const cartLinesByMenuItemId = useMemo(() => {
    const lines = new Map<string, CartLine>();
    for (const line of cartSnapshot?.lines ?? []) {
      lines.set(line.menuItemId, line);
    }
    return lines;
  }, [cartSnapshot?.lines]);

  useEffect(() => {
    restorePendingRef.current = search.scrollOffset > 0;
    if (search.scrollOffset === 0) {
      listRef.current?.scrollToOffset({offset: 0, animated: false});
    }
  }, [search.scrollOffset, searchScopeKey]);

  const firstName = identity?.displayName?.trim().split(/\s+/)[0] ?? null;
  const greeting = firstName ? `Hi ${firstName}` : 'Hello';
  const queryError = feed.error ? toAppApiError(feed.error) : null;
  const offline = queryError?.code === 'NETWORK_ERROR';
  const initialLoading = feed.isPending && dishes.length === 0 && !feed.locationRequired;
  const searchActive = isDiscoverySearchActive(search.query);
  const draftSearchActive = isDiscoverySearchActive(search.draft);
  const hasFilters = Boolean(
    searchActive || selectedCategory || activeDiscoveryFilterCount > 0,
  );

  const retryFeed = () => {
    feed.refetch();
  };

  const loadNextPage = useCallback(() => {
    if (
      canRequestNextSearchPage({
        hasNextPage: feed.hasNextPage,
        isFetchingNextPage: feed.isFetchingNextPage,
        isDebouncing: search.isDebouncing,
      })
    ) {
      feed.fetchNextPage();
    }
  }, [feed, search.isDebouncing]);

  const resetSearchPosition = useCallback(() => {
    restorePendingRef.current = false;
    listRef.current?.scrollToOffset({offset: 0, animated: false});
  }, []);

  const handleSearchChange = useCallback(
    (value: string) => {
      if (feed.isFetchingNextPage) {
        feed.cancelPendingRequest();
      }
      resetSearchPosition();
      search.setDraft(value);
    },
    [feed, resetSearchPosition, search],
  );

  const handleClearSearch = useCallback(() => {
    if (feed.isFetchingNextPage) {
      feed.cancelPendingRequest();
    }
    resetSearchPosition();
    search.clear();
  }, [feed, resetSearchPosition, search]);

  const saveListOffset = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      search.saveScrollOffset(event.nativeEvent.contentOffset.y);
    },
    [search],
  );

  const restoreListOffset = useCallback(() => {
    if (
      restorePendingRef.current &&
      search.scrollOffset > 0 &&
      visibleDishes.length > 0
    ) {
      restorePendingRef.current = false;
      requestAnimationFrame(() => {
        listRef.current?.scrollToOffset({
          offset: search.scrollOffset,
          animated: false,
        });
      });
    }
  }, [search.scrollOffset, visibleDishes.length]);

  const handleMutationOutcome = (outcome: CartMutationOutcome) => {
    if (outcome.status === 'FAILED') {
      setMutationError(outcome.error.message);
    }
  };

  const handleFavoriteToggle = useCallback(
    (menuItemId: string, favorite: boolean) => {
      if (favorites.sessionRequired || toggleFavorite.isPending) return;
      setMutationError(null);
      toggleFavorite.mutate(
        {menuItemId, favorite},
        {onError: () => setMutationError('Favorite could not be updated. Please try again.')},
      );
    },
    [favorites.sessionRequired, toggleFavorite],
  );

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

  const openDishDetail = useCallback(
    (dishId: string) => {
      navigation.navigate('CustomerDishDetail', {menuItemId: dishId});
    },
    [navigation],
  );

  const openSubscription = useCallback(() => {
    const tabs = navigation.getParent<BottomTabNavigationProp<CustomerTabParamList>>();
    tabs?.navigate('Profile', {screen: 'CustomerSettingsSubscription'});
  }, [navigation]);

  const openFilters = () => {
    navigation.navigate('CustomerFilterSort', {origin: 'HOME'});
  };

  const clearFilters = () => {
    handleClearSearch();
    setSelectedCategory(null);
    dispatch(
      discoveryFilterActions.filtersCleared({
        surface: 'HOME',
        scopeKey: searchScopeKey,
      }),
    );
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
      if (offline) {
        return (
          <CustomerEmptyState
            actionPending={feed.isFetching}
            connectivity="OFFLINE"
            model={customerEmptyStateAdapters.noInternet()}
            onAction={actionId => {
              if (actionId === 'RETRY') {
                retryFeed();
              }
            }}
            testID="customer-home-offline"
          />
        );
      }
      return (
        <TerminalState
          title="Meals could not be loaded"
          description={queryError.message}
          actionLabel="Try again"
          onAction={retryFeed}
        />
      );
    }
    if (search.isDebouncing && draftSearchActive) {
      return (
        <View accessibilityLiveRegion="polite" style={styles.searchUpdating}>
          <ActivityIndicator color={colors.flameRed} />
          <Text style={styles.searchUpdatingText}>Updating search results…</Text>
        </View>
      );
    }
    if (hasFilters && dishes.length > 0) {
      if (searchActive && feed.hasNextPage) {
        return (
          <TerminalState
            title="No match in the loaded results yet"
            description="More live nearby results are available. Search the next page or clear your search."
            actionLabel="Search next page"
            onAction={loadNextPage}
            secondaryActionLabel="Clear search"
            onSecondaryAction={handleClearSearch}
          />
        );
      }
      if (searchActive) {
        return (
          <CustomerEmptyState
            model={customerEmptyStateAdapters.noSearchResults(search.query)}
            onAction={actionId => {
              if (actionId === 'CLEAR_SEARCH') {
                handleClearSearch();
              } else if (actionId === 'BROWSE_MEALS') {
                clearFilters();
              }
            }}
            testID="customer-home-no-search-results"
          />
        );
      }
      return (
        <TerminalState
          title="No matching meals"
          description="Try a different category or filter."
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
      <View style={[styles.heroCopy, compactLayout && styles.heroCopyCompact]}>
        <Text style={styles.greeting}>{greeting}</Text>
        <Text accessibilityRole="header" style={styles.heading}>
          What are you craving today?
        </Text>
        <Text style={styles.subheading}>
          Fresh meals from active home kitchens around your selected location.
        </Text>
      </View>
      <View style={[styles.searchRow, compactLayout && styles.searchRowCompact]}>
        <DiscoverySearchInput
          accessibilityLabel="Search nearby meals"
          onChangeText={handleSearchChange}
          onClear={handleClearSearch}
          placeholder="Search nearby dishes or kitchens"
          style={styles.searchField}
          value={search.draft}
        />
        <Pressable
          accessibilityHint="Open filter and sort options"
          accessibilityLabel="Filters"
          accessibilityRole="button"
          onPress={openFilters}
          style={({pressed}) => [
            styles.filterButton,
            activeDiscoveryFilterCount > 0 && styles.filterButtonActive,
            pressed && styles.filterButtonPressed,
          ]}>
          <Text style={styles.filterButtonText}>
            {activeDiscoveryFilterCount > 0
              ? `Filters (${activeDiscoveryFilterCount})`
              : 'Filters'}
          </Text>
        </Pressable>
      </View>

      <HomePromoAndKitchens />

      <View style={styles.mindHeadingRow}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>
          What's on your mind
        </Text>
      </View>
    </View>
  );

  return (
    <ScreenShell edges={['top']} keyboardAvoiding={false} testID="customer-home">
      <View style={styles.fixedHeader}>
        <CustomerHeader
          onPressLocation={() => setLocationSelectorVisible(true)}
          onPressNotifications={header.openNotifications}
          onPressSubscription={openSubscription}
        />
      </View>
      <FlatList
        ref={listRef}
        data={listData}
        keyExtractor={item => item.key}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
        removeClippedSubviews={false}
        style={styles.feedList}
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
        onContentSizeChange={restoreListOffset}
        onEndReached={loadNextPage}
        onEndReachedThreshold={0.6}
        onMomentumScrollEnd={saveListOffset}
        onScroll={bottomNavScroll.onScroll}
        onScrollEndDrag={saveListOffset}
        refreshControl={
          <RefreshControl
            colors={[colors.flameRed]}
            onRefresh={retryFeed}
            refreshing={feed.isRefetching && !feed.isFetchingNextPage}
            tintColor={colors.flameRed}
          />
        }
        renderItem={({item}) => {
          if (item.kind === 'categories') {
            return (
              <View collapsable={false} style={styles.stickyCategoryWrap}>
                <HomeCategoryRail
                  selectedCategory={selectedCategory}
                  onSelect={setSelectedCategory}
                />
              </View>
            );
          }

          if (item.kind === 'popular-header') {
            return (
              <View>
                <View style={styles.sectionHeadingRow}>
                  <Text style={styles.sectionTitle}>Popular near you</Text>
                  <Text style={styles.sectionCaption}>
                    Available meals ordered by distance
                  </Text>
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
          }

          if (item.kind === 'empty') {
            return emptyState;
          }

          const cartLine = cartLinesByMenuItemId.get(item.dish.id) ?? null;
          return (
            <DishCard
              dish={item.dish}
              adding={cartMutations[`menu:${item.dish.id}`]?.status === 'PENDING'}
              cartLine={cartLine}
              changingQuantity={
                cartLine
                  ? cartMutations[`line:${cartLine.lineId}`]?.status === 'PENDING'
                  : false
              }
              favorite={isFavoriteMenuItem(favorites.data, item.dish.id)}
              favoritePending={toggleFavorite.isPending}
              favoriteDisabled={favorites.sessionRequired}
              onFavoriteToggle={handleFavoriteToggle}
              onAdd={handleAdd}
              onDecrease={handleDecrease}
              onIncrease={handleIncrease}
              onOpen={openDishDetail}
            />
          );
        }}
        scrollEventThrottle={bottomNavScroll.scrollEventThrottle}
        showsVerticalScrollIndicator={false}
        stickyHeaderIndices={[HOME_CATEGORY_STICKY_HEADER_INDEX]}
        contentContainerStyle={[
          styles.listContent,
          {paddingBottom: listBottomPadding},
        ]}
      />
      <CustomerLocationSelector
        visible={locationSelectorVisible}
        onClose={() => setLocationSelectorVisible(false)}
      />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  fixedHeader: {
    backgroundColor: colors.white,
  },
  feedList: {
    flex: 1,
  },
  listContent: {
    flexGrow: 1,
    backgroundColor: colors.surfaceBase,
  },
  heroCopy: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
  },
  heroCopyCompact: {
    paddingTop: spacing.xxs,
  },
  greeting: {
    color: colors.flameRedAccessible,
    fontSize: typography.small,
    fontWeight: fontWeight.semibold,
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
  searchRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  searchRowCompact: {
    gap: spacing.xs,
  },
  searchField: {
    minWidth: 0,
    flex: 1,
  },
  filterButton: {
    minHeight: touchTarget.minimum,
    minWidth: 78,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterButtonActive: {
    borderColor: colors.flameRed,
    backgroundColor: colors.iconSurface,
  },
  filterButtonPressed: {
    backgroundColor: colors.surfaceMuted,
    transform: [{scale: 0.98}],
  },
  filterButtonText: {
    color: colors.flameRedAccessible,
    fontSize: typography.small,
    fontWeight: fontWeight.semibold,
  },
  mindHeadingRow: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxs,
  },
  stickyCategoryWrap: {
    backgroundColor: colors.surfaceBase,
    zIndex: 10,
  },
  sectionHeadingRow: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
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
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.white,
    overflow: 'hidden',
    ...elevation.card,
  },
  dishOpenPressed: {
    opacity: 0.88,
  },
  dishImage: {
    width: '100%',
    aspectRatio: 1.75,
    backgroundColor: colors.surfaceMuted,
  },
  imageFallback: {
    width: '100%',
    aspectRatio: 1.75,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  imageFallbackText: {
    color: colors.espressoBrown,
    fontSize: typography.body,
    fontWeight: fontWeight.semibold,
  },
  favoriteButton: {position: 'absolute', top: spacing.sm, right: spacing.sm, zIndex: 4},
  dishBody: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  dishName: {
    color: colors.espressoBrown,
    fontSize: typography.heading,
    fontWeight: fontWeight.bold,
  },
  kitchenName: {
    color: colors.textSecondary,
    fontSize: typography.small,
    fontWeight: fontWeight.medium,
    marginTop: spacing.xxs,
  },
  metadataRow: {
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    marginTop: spacing.xs,
  },
  metadata: {
    minWidth: 0,
    flex: 1,
    color: colors.textSecondary,
    fontSize: typography.small,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
  },
  detailText: {
    color: colors.textSecondary,
    fontSize: typography.tiny,
    fontWeight: fontWeight.medium,
  },
  dishFooter: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  priceGroup: {
    minWidth: 0,
    flex: 1,
    alignItems: 'flex-start',
    gap: spacing.xxs,
  },
  price: {
    color: colors.flameRedAccessible,
    fontSize: typography.heading,
    fontWeight: fontWeight.extrabold,
  },
  foodTypePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xxs,
  },
  foodTypeDot: {
    width: 7,
    height: 7,
    borderRadius: radius.pill,
  },
  foodTypeText: {
    color: colors.espressoBrown,
    fontSize: typography.tiny,
    fontWeight: fontWeight.semibold,
  },
  addButton: {
    minHeight: touchTarget.minimum,
    minWidth: 88,
    paddingHorizontal: spacing.sm,
  },
  quantitySelector: {
    minHeight: touchTarget.minimum,
    minWidth: 120,
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
    width: touchTarget.minimum,
    minHeight: touchTarget.minimum,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quantityButtonPressed: {
    backgroundColor: colors.iconSurface,
  },
  quantityButtonDisabled: {
    opacity: 0.45,
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
  searchUpdating: {
    minHeight: 120,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  searchUpdatingText: {
    color: colors.textSecondary,
    fontSize: typography.small,
  },
  footerLoader: {
    paddingVertical: spacing.lg,
  },
  skeletonWrap: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  skeletonHero: {
    height: 88,
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
    aspectRatio: 1.25,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceMuted,
  },
});