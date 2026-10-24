import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StatusBar,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import MaterialDesignIcons from '@react-native-vector-icons/material-design-icons';
import {BlurTargetView} from 'expo-blur';
import {useFocusEffect, useNavigation} from '@react-navigation/native';
import Svg, {Defs, LinearGradient, Rect, Stop} from 'react-native-svg';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useCustomerBottomNavScroll} from '../../../app/navigation/CustomerBottomNavController';
import type {CustomerHomeStackParamList} from '../../../app/navigation/types';
import {useAppDispatch, useAppSelector} from '../../../app/store/hooks';
import {toAppApiError} from '../../../core/http/apiError';
import {classifyResponsiveWidth, responsiveLayout} from '../../../design/responsive';
import {
  colors,
  elevation,
  fontWeight,
  homeTop,
  radius,
  spacing,
  touchTarget,
  typography,
  iconSize,
} from '../../../design/tokens';
import {Button} from '../../../shared/components/Button';
import {EmptyIllustration} from '../../../shared/components/EmptyIllustration';
import {comingSoonTitle} from '../../customerEmptyStates/domain/customerEmptyStateModel';
import {Icon} from '../../../shared/components/Icon';
import {LiquidGlassSurface} from '../../../shared/components/LiquidGlassSurface';
import {CLOUD_FILL_MS, CloudFill} from '../components/CloudFill';
import {HomeCategoryRail} from '../components/HomeCategoryRail';
import {HomeFoodTypeMenu} from '../components/HomeFoodTypeMenu';
import {HomePromoAndKitchens} from '../components/HomePromoAndKitchens';
import {
  OfflineNotice,
  RecoverableErrorBanner,
  TerminalState,
} from '../../../shared/components/LifecycleStates';
import {ScreenShell} from '../../../shared/components/ScreenShell';
import {launchCartFlight} from '../../cart/cartFlight';
import {VegMark} from '../../chefShell/components/ui/VegMark';
import {askKitchenSwitch} from '../../cart/components/KitchenSwitchDialog';
import type {CartLine} from '../../cart/domain/cartTypes';
import {
  addCartItem,
  removeCartItem,
  setCartItemQuantity,
  switchCartKitchen,
  type CartMutationOutcome,
} from '../../cart/state/cartMutations';
import {formatDishDetailPrice} from '../../dishDetail/dishDetailPurchase';
import {CustomerEmptyState} from '../../customerEmptyStates/components/CustomerEmptyState';
import {customerEmptyStateAdapters} from '../../customerEmptyStates/customerEmptyStateAdapters';
import {CustomerHeader} from '../../customerShell/components/CustomerHeader';
import {
  CustomerLocationSelector,
  DeliveryAddressEditor,
  type DeliveryAddressEditorTarget,
} from '../../customerShell/components/CustomerLocationSelector';
import {
  browsingLocationLabel,
  useCustomerHeaderState,
} from '../../customerShell/hooks/useCustomerHeaderState';
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
  type DiscoveryDietOption,
} from '../../discoveryFilters/state/discoveryFilterSlice';
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
} from '../homePresentation';
import {useHomeNearbyDishesQuery} from '../query/homeFeedQueries';
import {launchAlertErrorText, useLaunchAlert} from '../api/launchAlertApi';
import {HomeComingSoonPage} from '../components/HomeComingSoonPage';
import {TOP_KITCHENS_PAGE_SIZE} from '../components/HomePromoAndKitchens';
import {useNearbyChefDiscoveryQuery} from '../../chefDiscovery/query/nearbyChefDiscoveryQueries';
import {useQueryClient} from '@tanstack/react-query';
import {homeBannerQueryKey} from '../query/homeBannerQueries';
import {menuCategoryLabel} from '../../../shared/catalog/menuCategories';

const HOME_RADIUS_METERS = 10_000;
const HOME_PAGE_SIZE = 20;
/** Search pill and filter button height on the Home board. */
const SEARCH_ROW_HEIGHT = 52;
const HEADER_COLLAPSE_START = 10;
const HEADER_COLLAPSE_END = 80;
/** An add tapped on a card longer ago than this (a slow server, a kitchen-switch question) flies no photo. */
const FLIGHT_WINDOW_MS = 8000;
const DISH_SCRIM_HEIGHT = 110;
const PIN_RELEASE_PX = 24;
/** White search, food type and filter controls lift off the red band with a soft shadow. */
const WHITE_CARD_SHADOW = {
  shadowColor: colors.espressoBrown,
  shadowOpacity: 0.14,
  shadowRadius: 8,
  shadowOffset: {width: 0, height: 2},
  elevation: 3,
} as const;

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
  const kitchenName = dish.kitchenDisplayName?.trim() || dish.kitchenName;
  const imageTarget = useRef<View | null>(null);
  const mediaRef = useRef<View | null>(null);
  const quantity = cartLine?.quantity ?? 0;
  const lastQuantity = useRef(quantity);
  const flightAskedAt = useRef(0);
  const spiceLabel = dish.spiceLevel
    ? `${dish.spiceLevel.charAt(0)}${dish.spiceLevel.slice(1).toLowerCase()}`
    : null;
  const facts = [
    dish.preparationTimeMinutes ? `${dish.preparationTimeMinutes} min` : null,
    spiceLabel,
  ]
    .filter(Boolean)
    .join(' · ');

  // The photo flies to the cart only once the add has really landed, and only for a tap made here.
  useEffect(() => {
    if (quantity > lastQuantity.current && Date.now() - flightAskedAt.current < FLIGHT_WINDOW_MS) {
      flightAskedAt.current = 0;
      mediaRef.current?.measureInWindow((x, y, width, height) =>
        launchCartFlight({imageUrl: dish.primaryImageUrl ?? null, x, y, width, height}),
      );
    }
    lastQuantity.current = quantity;
  }, [quantity, dish.primaryImageUrl]);

  const add = () => {
    flightAskedAt.current = Date.now();
    onAdd(dish.id);
  };
  const increase = (line: CartLine) => {
    flightAskedAt.current = Date.now();
    onIncrease(line);
  };

  return (
    <View style={styles.dishCard}>
      <View ref={mediaRef} collapsable={false} style={styles.mediaWrap}>
        <BlurTargetView ref={imageTarget}>
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
                <Text style={styles.imageFallbackText}>{menuCategoryLabel(dish.category)}</Text>
              </View>
            )}
          </Pressable>
        </BlurTargetView>

        {/* A dark fade under the name keeps the white text readable on any photo. */}
        <Svg pointerEvents="none" width="100%" height={DISH_SCRIM_HEIGHT} style={styles.dishScrim}>
          <Defs>
            <LinearGradient id="dishScrim" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={colors.ink} stopOpacity={0} />
              <Stop offset="1" stopColor={colors.ink} stopOpacity={0.62} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height={DISH_SCRIM_HEIGHT} fill="url(#dishScrim)" />
        </Svg>

        <LiquidGlassSurface
          appearance="home"
          blurTarget={imageTarget}
          pointerEvents="none"
          style={styles.availabilityPill}>
          <View style={styles.availabilityDot} />
          <Text style={styles.glassPillText}>Available</Text>
        </LiquidGlassSurface>

        <LiquidGlassSurface
          appearance="home"
          blurTarget={imageTarget}
          style={styles.favoriteGlass}>
          <CustomerFavoriteHeartButton
            favorite={favorite}
            pending={favoritePending}
            disabled={favoriteDisabled}
            itemLabel={dish.itemName}
            inactiveColor={colors.white}
            onToggle={() => onFavoriteToggle(dish.id, favorite)}
            style={styles.favoriteButton}
          />
        </LiquidGlassSurface>

        <View pointerEvents="none" style={styles.photoText}>
          <Text numberOfLines={1} style={styles.photoName}>
            {dish.itemName}
          </Text>
          <Text numberOfLines={1} style={styles.photoKitchen}>
            From {kitchenName}
          </Text>
        </View>
      </View>

      <View style={styles.dishBody}>
        <Pressable
          accessibilityLabel={`Open ${dish.itemName}`}
          accessibilityRole="button"
          onPress={() => onOpen(dish.id)}
          style={({pressed}) => [styles.dishFacts, pressed && styles.dishOpenPressed]}>
          <VegMark type={dish.foodType} />
          <Text style={styles.price}>{formatDishPrice(dish.price, dish.currency)}</Text>
          {facts ? (
            <View style={styles.detailItem}>
              <Icon name="clock" size={iconSize.xs} color={colors.textSecondary} surface={false} />
              <Text numberOfLines={1} style={styles.detailText}>
                {facts}
              </Text>
            </View>
          ) : null}
        </Pressable>

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
              onPress={() => increase(cartLine)}
              style={({pressed}) => [
                styles.quantityButton,
                pressed && styles.quantityButtonPressed,
                changingQuantity && styles.quantityButtonDisabled,
              ]}>
              <Text style={styles.quantityButtonText}>+</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            accessibilityLabel={`Add ${dish.itemName} to cart`}
            accessibilityRole="button"
            accessibilityState={{disabled: adding, busy: adding}}
            disabled={adding}
            onPress={add}
            style={({pressed}) => [styles.addButton, pressed && styles.addButtonPressed]}>
            {adding ? (
              <ActivityIndicator color={colors.flameRed} />
            ) : (
              <Text style={styles.addButtonText}>ADD</Text>
            )}
          </Pressable>
        )}
      </View>
    </View>
  );
}

export function CustomerHomeScreen() {
  const queryClient = useQueryClient();
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
  const {width, height, fontScale} = useWindowDimensions();
  const compactLayout =
    classifyResponsiveWidth(width) === 'compact' ||
    fontScale >= responsiveLayout.enlargedFontScale;
  const listBottomPadding = Math.max(
    spacing.xxxl * 3,
    insets.bottom + touchTarget.comfortable + spacing.xxxl,
  );
  const [locationSelectorVisible, setLocationSelectorVisible] = useState(false);
  const [addressEditor, setAddressEditor] = useState<DeliveryAddressEditorTarget | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const listRef = useRef<FlatList<HomeFeedListItem>>(null);
  // The search row spans about 12-64 dp of the list; the header morphs while it scrolls under.
  const scrollY = useRef(new Animated.Value(0)).current;
  const headerCollapse = useMemo(
    () =>
      scrollY.interpolate({
        inputRange: [HEADER_COLLAPSE_START, HEADER_COLLAPSE_END],
        outputRange: [0, 1],
        extrapolate: 'clamp',
      }),
    [scrollY],
  );
  const [headerCollapsed, setHeaderCollapsed] = useState(false);
  // The category row pins once the list has scrolled past everything above it (the list header).
  const railOffsetRef = useRef(0);
  const scrollOffsetRef = useRef(0);
  const [railPinned, setRailPinned] = useState(false);
  // White clouds cover the red header while the row is pinned; then the header switches to its white look.
  const [headerWhite, setHeaderWhite] = useState(false);
  // 0 = red look, 1 = white look; runs with the clouds so text and icons fade instead of flipping.
  const headerWhiteness = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(headerWhiteness, {
      toValue: railPinned ? 1 : 0,
      duration: railPinned ? CLOUD_FILL_MS : CLOUD_FILL_MS / 1.6,
      easing: Easing.bezier(0.45, 0, 0.25, 1),
      useNativeDriver: true,
    }).start();
  }, [headerWhiteness, railPinned]);
  const [headerSize, setHeaderSize] = useState({width: 0, height: 0});
  const [listViewportHeight, setListViewportHeight] = useState(0);
  const [railOffset, setRailOffset] = useState(0);
  const onFeedScroll = useMemo(
    () =>
      Animated.event([{nativeEvent: {contentOffset: {y: scrollY}}}], {
        useNativeDriver: true,
        listener: (event: NativeSyntheticEvent<NativeScrollEvent>) => {
          bottomNavScroll.onScroll(event);
          const offset = event.nativeEvent.contentOffset.y;
          scrollOffsetRef.current = offset;
          const next = offset > (HEADER_COLLAPSE_START + HEADER_COLLAPSE_END) / 2;
          setHeaderCollapsed(current => (current === next ? current : next));
          // Unpins a little later than it pins, so resting right at the edge can't flicker the colours.
          setRailPinned(current => {
            const rail = railOffsetRef.current;
            return rail > 0 && offset >= rail - (current ? PIN_RELEASE_PX : 0.5);
          });
        },
      }),
    [bottomNavScroll, scrollY],
  );
  const pinnedCategoryScrollRef = useRef(false);
  // While the row is pinned, a new category starts its list at the first dish under the row.
  const selectCategory = useCallback((category: string | null) => {
    pinnedCategoryScrollRef.current =
      railOffsetRef.current > 0 && scrollOffsetRef.current >= railOffsetRef.current - 0.5;
    setSelectedCategory(category);
  }, []);
  useEffect(() => {
    if (!pinnedCategoryScrollRef.current) return;
    pinnedCategoryScrollRef.current = false;
    listRef.current?.scrollToOffset({offset: railOffsetRef.current, animated: false});
  }, [selectedCategory]);
  const scrollToTop = useCallback(() => {
    listRef.current?.scrollToOffset({offset: 0, animated: true});
  }, []);

  // Status bar icons follow the header (light on red, dark on white) while Home is in front;
  // the entry is popped on blur so other screens keep theirs.
  const statusEntryRef = useRef<ReturnType<typeof StatusBar.pushStackEntry> | null>(null);
  const homeFocusedRef = useRef(false);
  const headerWhiteRef = useRef(headerWhite);
  const applyStatusBar = useCallback((white: boolean) => {
    if (statusEntryRef.current) StatusBar.popStackEntry(statusEntryRef.current);
    statusEntryRef.current = StatusBar.pushStackEntry({barStyle: white ? 'dark-content' : 'light-content'});
  }, []);
  useFocusEffect(
    useCallback(() => {
      homeFocusedRef.current = true;
      applyStatusBar(headerWhiteRef.current);
      return () => {
        homeFocusedRef.current = false;
        if (statusEntryRef.current) StatusBar.popStackEntry(statusEntryRef.current);
        statusEntryRef.current = null;
      };
    }, [applyStatusBar]),
  );

  const searchScopeKey =
    identity?.id && selectedLocation
      ? `${identity.id}:${selectedLocation.addressId}`
      : null;
  const search = useDiscoverySearchSession('HOME', searchScopeKey);
  const appliedFilters = useMemo(
    () => resolveDiscoveryFilterSession(storedFilters, searchScopeKey).applied,
    [searchScopeKey, storedFilters],
  );
  const serverFoodType =
    appliedFilters.diets.length === 1 ? appliedFilters.diets[0] ?? null : null;
  const serverSort =
    appliedFilters.sort === 'PRICE_LOW_TO_HIGH'
      ? 'PRICE_ASC'
      : appliedFilters.sort === 'PRICE_HIGH_TO_LOW'
        ? 'PRICE_DESC'
        : appliedFilters.sort === 'PREPARATION_TIME_ASC'
          ? 'PREPARATION_TIME_ASC'
          : appliedFilters.sort === 'NAME_ASC'
            ? 'NAME_ASC'
            : 'DISTANCE_ASC';
  const feed = useHomeNearbyDishesQuery({
    radiusMeters: HOME_RADIUS_METERS,
    size: HOME_PAGE_SIZE,
    filters: {
      query: search.query || null,
      category: selectedCategory,
      foodType: serverFoodType,
      minPrice: appliedFilters.minPrice,
      maxPrice: appliedFilters.maxPrice,
      maxPreparationTimeMinutes: appliedFilters.maxPreparationTimeMinutes,
      spiceLevel: appliedFilters.spiceLevel,
      sort: serverSort,
    },
  });
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
    if (feed.locationRequired) {
      return [{kind: 'empty', key: 'empty'}];
    }

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
  }, [feed.locationRequired, visibleDishes]);
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

  const queryError = feed.error ? toAppApiError(feed.error) : null;
  const offline = queryError?.code === 'NETWORK_ERROR';
  const initialLoading = feed.isPending && dishes.length === 0 && !feed.locationRequired;
  const searchActive = isDiscoverySearchActive(search.query);
  const draftSearchActive = isDiscoverySearchActive(search.draft);
  const hasFilters = Boolean(
    searchActive || selectedCategory || activeDiscoveryFilterCount > 0,
  );
  // Same query as "Kitchens near you", so the cache is shared. No kitchen at all here = the coming-soon page.
  const kitchenDiscovery = useNearbyChefDiscoveryQuery({
    radiusMeters: HOME_RADIUS_METERS,
    size: TOP_KITCHENS_PAGE_SIZE,
  });
  const noKitchensHere =
    Boolean(selectedLocation) &&
    kitchenDiscovery.isSuccess &&
    (kitchenDiscovery.data.pages[0]?.kitchens.length ?? 0) === 0;
  const launchAlert = useLaunchAlert(selectedLocation, noKitchensHere);

  // The coming-soon page is white, so it takes the dark status bar icons like the white header.
  const darkStatusBar = headerWhite || noKitchensHere;
  headerWhiteRef.current = darkStatusBar;
  useEffect(() => {
    if (homeFocusedRef.current) applyStatusBar(darkStatusBar);
  }, [applyStatusBar, darkStatusBar]);

  const retryFeed = () => {
    feed.refetch();
    kitchenDiscovery.refetch();
    void queryClient.invalidateQueries({queryKey: homeBannerQueryKey});
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

  const handleClearSearch = useCallback(() => {
    if (feed.isFetchingNextPage) {
      feed.cancelPendingRequest();
    }
    resetSearchPosition();
    search.clear();
  }, [feed, resetSearchPosition, search]);

  const openSearch = useCallback(() => {
    handleClearSearch();
    navigation.navigate('CustomerHomeSearch');
  }, [handleClearSearch, navigation]);

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
    const dish = dishes.find(candidate => candidate.id === dishId);
    const otherKitchen =
      dish && cartSnapshot?.lines.find(line => line.kitchenId !== dish.kitchenId);
    if (dish && otherKitchen && cartSnapshot) {
      const expectedSnapshot = cartSnapshot;
      askKitchenSwitch({
        cartLines: expectedSnapshot.lines,
        newDish: {
          name: dish.itemName,
          kitchenName: dish.kitchenDisplayName ?? dish.kitchenName,
          priceLabel: formatDishDetailPrice(dish.price, dish.currency),
          imageUrl: dish.primaryImageUrl,
        },
        onReplace: () => {
          dispatch(
            switchCartKitchen({
              expectedSnapshot,
              menuItemId: dish.id,
              quantity: 1,
              expectedKitchenId: dish.kitchenId,
            }),
          ).then(handleMutationOutcome);
        },
      });
      return;
    }
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

  const openMealPlans = useCallback(() => {
    navigation.navigate('CustomerSettingsSubscription');
  }, [navigation]);

  const openFilters = () => {
    navigation.navigate('CustomerFilterSort', {origin: 'HOME'});
  };

  const setDiets = (diets: DiscoveryDietOption[]) => {
    dispatch(
      discoveryFilterActions.filtersApplied({
        surface: 'HOME',
        scopeKey: searchScopeKey,
        filters: {...appliedFilters, diets},
      }),
    );
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
        <View style={styles.noLocationCard}>
          <EmptyIllustration name="location" />
          <Text accessibilityRole="header" style={styles.noLocationTitle}>
            Where should Craves deliver?
          </Text>
          <Text style={styles.noLocationBody}>
            Home chefs, dishes and delivery times depend on your address.
          </Text>
          <View style={styles.noLocationActions}>
            <Button
              label="Use current location"
              leftIcon="gps"
              onPress={() => setAddressEditor({mode: 'add', start: 'current-location'})}
            />
            <Button
              label="Search area or street"
              leftIcon="search"
              onPress={() => setAddressEditor({mode: 'add', start: 'search'})}
              variant="outline"
            />
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => setLocationSelectorVisible(true)}
            style={({pressed}) => [styles.noLocationLink, pressed && styles.noLocationPressed]}>
            <Text style={styles.noLocationLinkText}>Choose a saved address</Text>
          </Pressable>
        </View>
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
          illustration="loadError"
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
            illustration="search"
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
          illustration="search"
          title="No matching meals"
          description="Try a different category or filter."
          actionLabel="Clear filters"
          onAction={clearFilters}
        />
      );
    }
    if (kitchenDiscovery.isPending) {
      // Wait for the kitchen count so the coming-soon page doesn't follow a flash of this state.
      return <HomeFeedSkeleton />;
    }
    return (
      <TerminalState
        illustration="comingSoonArea"
        title={comingSoonTitle(selectedLocation?.displayName)}
        description="Home chefs don't cook near this address yet. Try another address."
        actionLabel="Change delivery address"
        onAction={() => setLocationSelectorVisible(true)}
      />
    );
  })();

  // The red band fades to white by the bottom of the banner (search row + banner top gap + 2:1 banner).
  const topFadeHeight = SEARCH_ROW_HEIGHT + spacing.sm + spacing.md + Math.max(280, width - spacing.md * 2) / 2;
  const headerContent = (
    <View
      onLayout={event => {
        const headerHeight = event.nativeEvent.layout.height;
        railOffsetRef.current = headerHeight;
        setRailOffset(headerHeight);
      }}>
      {selectedLocation ? (
        <>
          <Svg
            pointerEvents="none"
            width="100%"
            height={topFadeHeight}
            style={[styles.topFade, {height: topFadeHeight}]}>
            <Defs>
              <LinearGradient id="homeTopFade" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={homeTop.background} />
                <Stop offset="0.45" stopColor={homeTop.fadeMiddle} />
                <Stop offset="1" stopColor={colors.white} />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height={topFadeHeight} fill="url(#homeTopFade)" />
          </Svg>
          <View style={[styles.searchRow, compactLayout && styles.searchRowCompact]}>
            {/* Home only opens the search page, so the field is a button. */}
            <Pressable
              accessibilityHint="Opens search"
              accessibilityLabel="Search nearby meals"
              accessibilityRole="search"
              onPress={openSearch}
              style={({pressed}) => [styles.searchField, pressed && styles.searchFieldPressed]}>
              <Icon name="search" size={iconSize.md} color={colors.flameRed} surface={false} />
              <Text numberOfLines={1} style={styles.searchPlaceholder}>
                Search dishes or kitchens
              </Text>
            </Pressable>
            {/* Fades as its round twin rises into the header. */}
            <Animated.View
              style={{
                opacity: headerCollapse.interpolate({
                  inputRange: [0, 0.45],
                  outputRange: [1, 0],
                  extrapolate: 'clamp',
                }),
              }}>
              <HomeFoodTypeMenu
                appearance="card"
                diets={appliedFilters.diets}
                onChange={setDiets}
                style={styles.foodTypeMenuPill}
              />
            </Animated.View>
            <Pressable
              accessibilityHint="Open filter and sort options"
              accessibilityLabel="Filters"
              accessibilityRole="button"
              onPress={openFilters}
              style={({pressed}) => [
                styles.filterButton,
                // The food type pill shows diets itself, so only other filters light this up.
                activeDiscoveryFilterCount - appliedFilters.diets.length > 0 &&
                  styles.filterButtonActive,
                pressed && styles.filterButtonPressed,
              ]}>
              <Icon
                name="filter"
                size={iconSize.md}
                color={colors.flameRed}
                surface={false}
              />
            </Pressable>
          </View>

          <HomePromoAndKitchens diets={appliedFilters.diets} />

          <View style={styles.mindHeadingRow}>
            <Text accessibilityRole="header" style={styles.sectionTitle}>
              What's on your mind
            </Text>
          </View>
        </>
      ) : null}
    </View>
  );

  const locationModals = (
    <>
      <CustomerLocationSelector
        visible={locationSelectorVisible}
        onClose={() => setLocationSelectorVisible(false)}
      />
      {addressEditor ? (
        <DeliveryAddressEditor
          onClose={() => setAddressEditor(null)}
          target={addressEditor}
        />
      ) : null}
    </>
  );

  if (noKitchensHere && selectedLocation) {
    return (
      <ScreenShell edges={[]} keyboardAvoiding={false} testID="customer-home">
        <HomeComingSoonPage
          bottomPadding={listBottomPadding}
          locationLabel={browsingLocationLabel(selectedLocation.label)}
          locationName={selectedLocation.displayName}
          notifyError={launchAlert.error ? launchAlertErrorText(launchAlert.error) : null}
          notifyPending={launchAlert.saving}
          onChangeAddress={() => setLocationSelectorVisible(true)}
          onNotify={launchAlert.subscribe}
          onRefresh={retryFeed}
          refreshing={kitchenDiscovery.isRefetching}
          subscribed={launchAlert.subscribed}
          topInset={insets.top}
        />
        {locationModals}
      </ScreenShell>
    );
  }

  const renderHeader = (tone: 'red' | 'light') => (
    <CustomerHeader
      tone={tone}
      transparent
      onPressLocation={() => setLocationSelectorVisible(true)}
      onPressNotifications={header.openNotifications}
      onPressMealPlans={openMealPlans}
      collapse={selectedLocation ? headerCollapse : undefined}
      collapsed={headerCollapsed}
      collapsedAccessory={
        <HomeFoodTypeMenu
          compact
          appearance={tone === 'light' ? 'default' : 'onRed'}
          diets={appliedFilters.diets}
          onChange={setDiets}
          testID={tone === 'light' ? 'home-food-type-header' : 'home-food-type-header-red'}
        />
      }
    />
  );

  return (
    <ScreenShell edges={[]} keyboardAvoiding={false} testID="customer-home">
      {/* The header pads itself under the status bar, so the clouds can cover the status bar too. */}
      <View
        onLayout={event => {
          const {width: headerWidth, height: headerHeight} = event.nativeEvent.layout;
          setHeaderSize(current =>
            current.width === headerWidth && current.height === headerHeight
              ? current
              : {width: headerWidth, height: headerHeight},
          );
        }}
        style={[styles.fixedHeader, {paddingTop: insets.top}]}>
        <CloudFill
          active={railPinned}
          color={colors.white}
          edge="bottom"
          height={headerSize.height}
          onCoveredChange={setHeaderWhite}
          testID="home-header-cloud"
          width={headerSize.width}
        />
        {/* Both looks stay mounted and crossfade with the clouds, so no colour jumps in one frame. */}
        <Animated.View
          pointerEvents={headerWhite ? 'none' : 'box-none'}
          accessibilityElementsHidden={headerWhite}
          importantForAccessibility={headerWhite ? 'no-hide-descendants' : 'auto'}
          style={{opacity: headerWhiteness.interpolate({inputRange: [0, 1], outputRange: [1, 0]})}}>
          {renderHeader('red')}
        </Animated.View>
        <Animated.View
          pointerEvents={headerWhite ? 'box-none' : 'none'}
          accessibilityElementsHidden={!headerWhite}
          importantForAccessibility={headerWhite ? 'auto' : 'no-hide-descendants'}
          style={[styles.whiteHeader, {top: insets.top, opacity: headerWhiteness}]}>
          {renderHeader('light')}
        </Animated.View>
      </View>
      <View style={styles.feedContainer}>
        <Animated.FlatList
          ref={listRef}
          data={listData}
          keyExtractor={item => item.key}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
          removeClippedSubviews={false}
          style={styles.feedList}
          onLayout={event => setListViewportHeight(event.nativeEvent.layout.height)}
          ListFooterComponent={
            feed.isFetchingNextPage ? (
              <ActivityIndicator
                accessibilityLabel="Loading more meals"
                color={colors.flameRed}
                style={styles.footerLoader}
              />
            ) : !feed.hasNextPage && visibleDishes.length > 0 ? (
              <Pressable
                accessibilityHint="Scrolls back to the top of Home"
                accessibilityLabel="Back to top"
                accessibilityRole="button"
                onPress={scrollToTop}
                style={({pressed}) => [styles.backToTop, pressed && styles.backToTopPressed]}
                testID="home-back-to-top">
                <MaterialDesignIcons color={colors.flameRedAccessible} name="arrow-up" size={iconSize.sm} />
                <Text style={styles.backToTopText}>Back to top</Text>
              </Pressable>
            ) : null
          }
          ListHeaderComponent={headerContent}
          onContentSizeChange={restoreListOffset}
          onEndReached={loadNextPage}
          onEndReachedThreshold={0.6}
          onMomentumScrollEnd={saveListOffset}
          onScroll={onFeedScroll}
          stickyHeaderIndices={feed.locationRequired ? undefined : [1]}
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
                <View style={styles.stickyCategoryWrap}>
                  <HomeCategoryRail
                    selectedCategory={selectedCategory}
                    onSelect={selectCategory}
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
                      Available meals using your current discovery filters
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
              return (
                <View style={[styles.emptyResultSpace, {minHeight: height}]}>
                  {emptyState}
                </View>
              );
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
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.listContent,
            {paddingBottom: listBottomPadding},
            // Always room to keep the category row pinned, even for a category with one dish or none.
            railOffset > 0 && listViewportHeight > 0 && {minHeight: railOffset + listViewportHeight},
          ]}
        />
      </View>
      {locationModals}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  noLocationCard: {
    alignSelf: 'stretch',
    alignItems: 'center',
    gap: spacing.md,
    marginHorizontal: spacing.md,
    marginTop: spacing.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    ...elevation.card,
  },
  noLocationTitle: {
    color: colors.textPrimary,
    fontSize: typography.hero - 2,
    fontWeight: fontWeight.bold,
    textAlign: 'center',
  },
  noLocationBody: {
    color: colors.textSecondary,
    fontSize: typography.body,
    textAlign: 'center',
  },
  noLocationActions: {alignSelf: 'stretch', gap: spacing.sm, marginTop: spacing.xs},
  noLocationLink: {minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.sm},
  noLocationPressed: {opacity: 0.84},
  noLocationLinkText: {
    color: colors.flameRedAccessible,
    fontSize: typography.small + 1,
    fontWeight: fontWeight.semibold,
  },
  fixedHeader: {
    backgroundColor: homeTop.background,
    // Lets the food type circle rise over the list edge into the header.
    zIndex: 2,
  },
  whiteHeader: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  feedContainer: {
    flex: 1,
    backgroundColor: colors.white,
  },
  topFade: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  feedList: {
    flex: 1,
  },
  listContent: {
    flexGrow: 1,
    backgroundColor: colors.surfaceBase,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  searchRowCompact: {
    gap: spacing.xs,
  },
  searchField: {
    minWidth: 0,
    flex: 1,
    height: SEARCH_ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.white,
    backgroundColor: colors.white,
    ...WHITE_CARD_SHADOW,
  },
  searchFieldPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  searchPlaceholder: {
    minWidth: 0,
    flex: 1,
    color: colors.placeholder,
    fontSize: typography.body,
  },
  filterButton: {
    width: SEARCH_ROW_HEIGHT,
    height: SEARCH_ROW_HEIGHT,
    flexShrink: 0,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.white,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...WHITE_CARD_SHADOW,
  },
  filterButtonActive: {
    borderColor: colors.flameRed,
  },
  foodTypeMenuPill: {
    height: SEARCH_ROW_HEIGHT,
  },
  filterButtonPressed: {
    opacity: 0.78,
    transform: [{scale: 0.96}],
  },
  mindHeadingRow: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxs,
  },
  stickyCategoryWrap: {
    backgroundColor: colors.surfaceBase,
  },
  emptyResultSpace: {
    backgroundColor: colors.surfaceBase,
  },
  sectionHeadingRow: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
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
    marginBottom: spacing.lg,
  },
  dishOpenPressed: {
    opacity: 0.88,
  },
  mediaWrap: {
    position: 'relative',
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: colors.surfaceMuted,
  },
  dishImage: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: colors.surfaceMuted,
  },
  imageFallback: {
    width: '100%',
    aspectRatio: 16 / 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  imageFallbackText: {
    color: colors.espressoBrown,
    fontSize: typography.body,
    fontWeight: fontWeight.semibold,
  },
  dishScrim: {
    position: 'absolute',
    left: 0,
    bottom: 0,
  },
  favoriteGlass: {
    position: 'absolute',
    top: spacing.xs,
    right: spacing.xs,
    zIndex: 4,
    width: touchTarget.minimum,
    height: touchTarget.minimum,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  favoriteButton: {
    width: '100%',
    height: '100%',
    backgroundColor: 'transparent',
  },
  availabilityPill: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    zIndex: 3,
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    overflow: 'hidden',
  },
  availabilityDot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.success,
  },
  // The soft shadow keeps white glass text readable on pale photos and the no-photo grey.
  glassPillText: {
    color: colors.white,
    fontSize: typography.small,
    fontWeight: fontWeight.semibold,
    textShadowColor: 'rgba(31,27,25,0.45)',
    textShadowRadius: 4,
    textShadowOffset: {width: 0, height: 1},
  },
  photoText: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.sm,
  },
  photoName: {
    color: colors.white,
    fontSize: typography.heading,
    fontWeight: fontWeight.bold,
  },
  photoKitchen: {
    color: colors.white,
    opacity: 0.92,
    fontSize: typography.small,
    fontWeight: fontWeight.medium,
  },
  dishBody: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingTop: spacing.sm,
  },
  dishFacts: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  price: {
    flexShrink: 0,
    color: colors.espressoBrown,
    fontSize: typography.heading,
    fontWeight: fontWeight.extrabold,
  },
  detailItem: {
    flexShrink: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
  },
  detailText: {
    flexShrink: 1,
    color: colors.textSecondary,
    fontSize: typography.small,
    fontWeight: fontWeight.medium,
  },
  // White, not glass or red: the one solid control on the card is the one that adds to the cart.
  addButton: {
    height: touchTarget.minimum,
    minWidth: 96,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    ...WHITE_CARD_SHADOW,
  },
  addButtonPressed: {
    opacity: 0.86,
    transform: [{scale: 0.96}],
  },
  addButtonText: {
    color: colors.flameRedAccessible,
    fontSize: typography.body,
    fontWeight: fontWeight.bold,
    letterSpacing: 0.6,
  },
  quantitySelector: {
    height: touchTarget.minimum,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.white,
    ...WHITE_CARD_SHADOW,
  },
  quantityButton: {
    width: 40,
    height: touchTarget.minimum,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quantityButtonPressed: {
    opacity: 0.6,
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
    minWidth: 20,
    textAlign: 'center',
    color: colors.flameRedAccessible,
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
  backToTop: {
    alignSelf: 'center',
    minHeight: touchTarget.minimum,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  backToTopPressed: {backgroundColor: colors.surfaceMuted},
  backToTopText: {
    color: colors.textPrimary,
    fontSize: typography.small,
    fontWeight: fontWeight.semibold,
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
