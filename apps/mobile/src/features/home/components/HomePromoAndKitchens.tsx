import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  Animated,
  Easing,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import {BlurTargetView} from 'expo-blur';
import {
  useNavigation,
  useIsFocused,
  type NavigationProp,
} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {useQueries} from '@tanstack/react-query';
import type {
  CustomerHomeStackParamList,
  CustomerTabParamList,
} from '../../../app/navigation/types';
import {
  colors,
  elevation,
  fontWeight,
  radius,
  spacing,
  touchTarget,
  typography,
} from '../../../design/tokens';
import {useReducedMotionPreference} from '../../../design/reducedMotion';
import {Icon} from '../../../shared/components/Icon';
import {LiquidGlassSurface} from '../../../shared/components/LiquidGlassSurface';
import {KitchenImageCarousel} from './KitchenImageCarousel';
import {useNearbyChefDiscoveryQuery} from '../../chefDiscovery/query/nearbyChefDiscoveryQueries';
import type {NearbyKitchen} from '../../chefDiscovery/api/nearbyChefDiscoveryApi';
import {formatPreparationTime} from '../../chefDiscovery/chefDiscoveryPresentation';
import {CustomerChefAvatar} from '../../customerShell/components/CustomerChefAvatar';
import {CustomerChefFace} from '../../customerShell/components/CustomerChefFace';
import {CustomerFavoriteHeartButton} from '../../favorites/components/CustomerFavoriteHeartButton';
import {
  useFavoriteKitchensQuery,
  useToggleFavoriteKitchen,
} from '../../favorites/query/homeFavoriteQueries';
import {
  PUBLIC_KITCHEN_REVIEWS_AVAILABLE,
  publicKitchenReviewApi,
} from '../../kitchenProfile/api/publicKitchenReviewApi';
import {useHomeNearbyDishesQuery} from '../query/homeFeedQueries';
import type {NearbyDish} from '../api/homeFeedApi';
import type {DiscoveryDietOption} from '../../discoveryFilters/state/discoveryFilterSlice';
import {formatDishPrice} from '../homePresentation';
import {useHomeBannersQuery} from '../query/homeBannerQueries';
import type {HomeBanner} from '../api/homeBannerApi';

const HOME_RADIUS_METERS = 10_000;
export const TOP_KITCHENS_PAGE_SIZE = 12;
const TOP_KITCHEN_DISH_PAGE_SIZE = 100;
const MAX_TOP_KITCHENS = 8;
export const PROMO_AUTO_ADVANCE_MS = 4_000;
const PROMO_SLIDE_MS = 650;
/** Kitchen cards change photos this far apart so the row never flips at once. */
const KITCHEN_PHOTO_STAGGER_MS = 800;

type HomeNavigation = NativeStackNavigationProp<
  CustomerHomeStackParamList,
  'CustomerHomeRoot'
>;

interface TopKitchenCardModel {
  kitchenId: string;
  kitchenName: string;
  biography: string;
  chefPhotoUrl: string | null;
  imageUrls: string[];
  preparationTimeLabel: string | null;
  startingPriceLabel: string;
}

export function PromoCarousel({
  banners,
  active,
  width,
  onPress,
}: {
  banners: HomeBanner[];
  active: boolean;
  width: number;
  onPress: () => void;
}) {
  const listRef = useRef<FlatList<HomeBanner>>(null);
  const activeIndexRef = useRef(0);
  const isDraggingRef = useRef(false);
  // A manual swipe gets a full interval on its slide before auto-advance resumes.
  const lastSwipeAtRef = useRef(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const reduceMotion = useReducedMotionPreference();
  // Drives the list offset frame by frame: a slower, eased slide than the default scroll.
  const offset = useRef(new Animated.Value(0)).current;
  // The first banner repeats at the end, so the last one slides forward into it.
  const slides = useMemo(
    () => (banners.length > 1 ? [...banners, banners[0]] : banners),
    [banners],
  );

  useEffect(() => {
    const id = offset.addListener(({value}) =>
      listRef.current?.scrollToOffset({offset: value, animated: false}),
    );
    return () => offset.removeListener(id);
  }, [offset]);

  useEffect(() => {
    if (!active || width <= 0 || banners.length < 2) return undefined;
    const interval = setInterval(() => {
      if (
        isDraggingRef.current ||
        Date.now() - lastSwipeAtRef.current < PROMO_AUTO_ADVANCE_MS
      ) {
        return;
      }
      const from = activeIndexRef.current;
      const nextIndex = (from + 1) % banners.length;
      activeIndexRef.current = nextIndex;
      setActiveIndex(nextIndex);
      offset.setValue(from * width);
      Animated.timing(offset, {
        toValue: (from + 1) * width,
        duration: reduceMotion ? 0 : PROMO_SLIDE_MS,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: false,
      }).start(({finished}) => {
        if (finished && nextIndex === 0) offset.setValue(0);
      });
    }, PROMO_AUTO_ADVANCE_MS);
    return () => {
      clearInterval(interval);
      offset.stopAnimation();
      offset.setValue(activeIndexRef.current * width);
    };
  }, [active, banners.length, offset, reduceMotion, width]);

  const handleMomentumScrollEnd = (
    event: NativeSyntheticEvent<NativeScrollEvent>,
  ) => {
    // Auto-advance tracks its own position; only a drag moves the dots here.
    if (width <= 0 || !isDraggingRef.current) return;
    const landed = Math.max(
      0,
      Math.round(event.nativeEvent.contentOffset.x / width),
    );
    const nextIndex = landed >= banners.length ? 0 : landed;
    if (landed >= banners.length) {
      listRef.current?.scrollToOffset({offset: 0, animated: false});
    }
    lastSwipeAtRef.current = Date.now();
    isDraggingRef.current = false;
    activeIndexRef.current = nextIndex;
    setActiveIndex(nextIndex);
  };

  return (
    <View style={styles.promoCarousel}>
      <FlatList
        ref={listRef}
        data={slides}
        horizontal
        pagingEnabled
        nestedScrollEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item, index) =>
          index === banners.length ? `${item.id}:loop` : item.id
        }
        getItemLayout={(_, index) => ({
          length: width,
          offset: width * index,
          index,
        })}
        onScrollBeginDrag={() => {
          offset.stopAnimation();
          isDraggingRef.current = true;
        }}
        onMomentumScrollEnd={handleMomentumScrollEnd}
        renderItem={({item, index}) => (
          <Pressable
            accessibilityLabel={item.label}
            accessibilityRole="button"
            accessibilityElementsHidden={index === banners.length}
            importantForAccessibility={
              index === banners.length ? 'no-hide-descendants' : 'auto'
            }
            onPress={onPress}
            style={[styles.bannerSlide, {width}]}>
            <Image
              accessible
              accessibilityIgnoresInvertColors
              source={{uri: item.imageUrl}}
              resizeMode="cover"
              style={styles.bannerImage}
            />
          </Pressable>
        )}
      />
      <View
        accessibilityLabel={`Banner ${activeIndex + 1} of ${banners.length}`}
        accessibilityRole="text"
        pointerEvents="none"
        style={styles.pagination}>
        {banners.map((banner, index) => (
          <View
            key={banner.id}
            style={[
              styles.paginationDot,
              index === activeIndex && styles.paginationDotActive,
            ]}
          />
        ))}
      </View>
    </View>
  );
}

/** Kitchens with no dish of the chosen food types drop out; photos and prices use only matching dishes. */
export function buildTopKitchenCards(
  kitchens: readonly NearbyKitchen[],
  dishes: readonly NearbyDish[],
  diets: readonly DiscoveryDietOption[] = [],
): TopKitchenCardModel[] {
  const dishesByKitchen = new Map<string, NearbyDish[]>();
  for (const dish of dishes) {
    if (diets.length > 0 && !diets.includes(dish.foodType)) continue;
    const current = dishesByKitchen.get(dish.kitchenId) ?? [];
    current.push(dish);
    dishesByKitchen.set(dish.kitchenId, current);
  }

  const cards: TopKitchenCardModel[] = [];
  for (const kitchen of kitchens) {
    const kitchenDishes = dishesByKitchen.get(kitchen.id) ?? [];
    if (kitchenDishes.length === 0) continue;

    const cheapestDish = kitchenDishes.reduce((cheapest, dish) =>
      dish.price < cheapest.price ? dish : cheapest,
    );
    const imageUrls = Array.from(
      new Set(
        kitchenDishes
          .map(dish => dish.primaryImageUrl?.trim() || null)
          .filter((url): url is string => Boolean(url)),
      ),
    );

    cards.push({
      kitchenId: kitchen.id,
      kitchenName: kitchen.kitchenName.trim() || kitchen.displayName?.trim() || kitchen.kitchenName,
      biography:
        kitchen.description?.trim() ||
        'Home-cooked meals prepared with care.',
      chefPhotoUrl: kitchen.chefPhotoUrl ?? null,
      imageUrls,
      preparationTimeLabel: formatPreparationTime(kitchenDishes),
      startingPriceLabel: `Starts from ${formatDishPrice(
        cheapestDish.price,
        cheapestDish.currency,
      )}`,
    });

    if (cards.length >= MAX_TOP_KITCHENS) break;
  }

  return cards;
}

function TopKitchenCard({
  kitchen,
  width,
  favorite,
  favoritePending,
  rating,
  active,
  startDelayMs,
  onFavorite,
  onPress,
}: {
  kitchen: TopKitchenCardModel;
  width: number;
  favorite: boolean;
  favoritePending: boolean;
  rating: number | null;
  active: boolean;
  startDelayMs: number;
  onFavorite: () => void;
  onPress: () => void;
}) {
  const imageHeight = Math.round(width * 0.63);
  const imageTarget = useRef<View | null>(null);
  const ratingLabel = rating === null ? 'New' : rating.toFixed(1);

  return (
    <View style={[styles.kitchenCard, {width}]}>
      <View style={styles.kitchenImageWrap}>
        <BlurTargetView ref={imageTarget} style={{width, height: imageHeight}}>
          <KitchenImageCarousel
            imageUrls={kitchen.imageUrls}
            width={width}
            height={imageHeight}
            kitchenName={kitchen.kitchenName}
            active={active}
            startDelayMs={startDelayMs}
            onPress={onPress}
          />
        </BlurTargetView>

        {kitchen.preparationTimeLabel ? (
          <LiquidGlassSurface
            appearance="home"
            blurTarget={imageTarget}
            pointerEvents="none"
            style={styles.timeGlass}>
            <Icon
              name="clock"
              size={18}
              color={colors.white}
              surface={false}
            />
            <Text style={styles.timeGlassText}>
              {kitchen.preparationTimeLabel}
            </Text>
          </LiquidGlassSurface>
        ) : null}

        <LiquidGlassSurface
          appearance="home"
          blurTarget={imageTarget}
          style={styles.favoriteGlass}>
          <CustomerFavoriteHeartButton
            favorite={favorite}
            pending={favoritePending}
            onToggle={onFavorite}
            itemLabel={kitchen.kitchenName}
            inactiveColor={colors.white}
            style={styles.favoriteControl}
          />
        </LiquidGlassSurface>

        <LiquidGlassSurface
          appearance="home"
          blurTarget={imageTarget}
          pointerEvents="none"
          style={styles.ratingGlass}>
          <Icon name="star" size={18} color="#FFC928" surface={false} />
          <Text style={styles.ratingGlassText}>{ratingLabel}</Text>
        </LiquidGlassSurface>

        <View pointerEvents="none" style={styles.chefAvatarShell}>
          <CustomerChefFace
            url={kitchen.chefPhotoUrl}
            fallback={
              <>
                <CustomerChefAvatar size={64} />
                <View style={styles.chefAvatarIcon}>
                  <Icon
                    name="chef"
                    size={26}
                    color={colors.espressoBrown}
                    surface={false}
                  />
                </View>
              </>
            }
          />
        </View>
      </View>

      <Pressable
        accessibilityLabel={`Open ${kitchen.kitchenName}`}
        accessibilityRole="button"
        onPress={onPress}
        style={({pressed}) => [
          styles.kitchenBody,
          pressed && styles.kitchenPressed,
        ]}>
        <Text numberOfLines={1} style={styles.kitchenName}>
          {kitchen.kitchenName}
        </Text>
        <Text numberOfLines={2} style={styles.kitchenBio}>
          {kitchen.biography}
        </Text>
        <Text numberOfLines={1} style={styles.kitchenStartingPrice}>
          {kitchen.startingPriceLabel}
        </Text>
      </Pressable>
    </View>
  );
}

export function HomePromoAndKitchens({diets = []}: {diets?: readonly DiscoveryDietOption[]}) {
  const navigation = useNavigation<HomeNavigation>();
  const focused = useIsFocused();
  const tabNavigation =
    navigation.getParent<NavigationProp<CustomerTabParamList>>();
  const {width} = useWindowDimensions();
  const bannerQuery = useHomeBannersQuery(focused);
  const banners = bannerQuery.isError ? [] : bannerQuery.data ?? [];

  const kitchenDiscovery = useNearbyChefDiscoveryQuery({
    radiusMeters: HOME_RADIUS_METERS,
    size: TOP_KITCHENS_PAGE_SIZE,
  });
  const menuDiscovery = useHomeNearbyDishesQuery({
    radiusMeters: HOME_RADIUS_METERS,
    size: TOP_KITCHEN_DISH_PAGE_SIZE,
  });
  const favoriteKitchens = useFavoriteKitchensQuery();
  const toggleFavoriteKitchen = useToggleFavoriteKitchen();

  const topKitchens = useMemo(() => {
    const nearbyKitchens =
      kitchenDiscovery.data?.pages.flatMap(page => page.kitchens) ?? [];
    const nearbyDishes =
      menuDiscovery.data?.pages.flatMap(page => page.menuItems) ?? [];
    return buildTopKitchenCards(nearbyKitchens, nearbyDishes, diets);
  }, [diets, kitchenDiscovery.data?.pages, menuDiscovery.data?.pages]);

  const reviewQueries = useQueries({
    queries: topKitchens.map(kitchen => ({
      queryKey: ['public-kitchen-review-summary', kitchen.kitchenId] as const,
      queryFn: ({signal}: {signal: AbortSignal}) =>
        publicKitchenReviewApi.getSummary(kitchen.kitchenId, signal),
      enabled: PUBLIC_KITCHEN_REVIEWS_AVAILABLE,
      staleTime: 60_000,
      retry: 1,
    })),
  });

  const ratingByKitchenId = new Map<string, number | null>();
  reviewQueries.forEach((query, index) => {
    const kitchen = topKitchens[index];
    if (!kitchen) return;
    const summary = query.data;
    ratingByKitchenId.set(
      kitchen.kitchenId,
      summary && summary.reviewCount > 0 ? summary.overallAverage : null,
    );
  });

  const favoriteKitchenIds = useMemo(
    () => new Set(favoriteKitchens.items.map(item => item.kitchenId)),
    [favoriteKitchens.items],
  );

  const bannerWidth = Math.max(280, width - spacing.md * 2);
  const kitchenCardWidth = Math.min(
    286,
    Math.max(248, Math.round(width * 0.74)),
  );

  const handleFavorite = (kitchenId: string) => {
    if (!favoriteKitchens.identityId || toggleFavoriteKitchen.isPending) return;
    toggleFavoriteKitchen.mutate({
      kitchenId,
      favorite: favoriteKitchenIds.has(kitchenId),
    });
  };

  const openAllKitchens = () => {
    if (tabNavigation) {
      tabNavigation.navigate('Chefs');
      return;
    }
    navigation.navigate('CustomerHomeSearch');
  };

  return (
    <View>
      {banners.length > 0 ? (
        <View style={styles.bannerRow}>
          <PromoCarousel
            key={banners.map(banner => banner.id).join(':')}
            banners={banners}
            active={focused}
            width={bannerWidth}
            onPress={() => navigation.navigate('CustomerHomeSearch')}
          />
        </View>
      ) : null}

      {topKitchens.length > 0 ? (
        <View style={styles.kitchensSection}>
          <View style={styles.sectionHeader}>
            <Text accessibilityRole="header" style={styles.sectionTitle}>
              Top kitchens near you
            </Text>
            <Pressable
              accessibilityLabel="See all nearby kitchens"
              accessibilityRole="button"
              hitSlop={spacing.xs}
              onPress={openAllKitchens}>
              <Text style={styles.seeAll}>See all</Text>
            </Pressable>
          </View>

          <FlatList
            data={topKitchens}
            horizontal
            nestedScrollEnabled
            showsHorizontalScrollIndicator={false}
            keyExtractor={item => item.kitchenId}
            contentContainerStyle={styles.kitchenRow}
            renderItem={({item, index}) => (
              <TopKitchenCard
                kitchen={item}
                width={kitchenCardWidth}
                favorite={favoriteKitchenIds.has(item.kitchenId)}
                favoritePending={toggleFavoriteKitchen.isPending}
                rating={ratingByKitchenId.get(item.kitchenId) ?? null}
                active={focused}
                startDelayMs={index * KITCHEN_PHOTO_STAGGER_MS}
                onFavorite={() => handleFavorite(item.kitchenId)}
                onPress={() =>
                  navigation.navigate('CustomerKitchenProfile', {
                    kitchenId: item.kitchenId,
                  })
                }
              />
            )}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bannerRow: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  promoCarousel: {
    width: '100%',
  },
  bannerSlide: {
    aspectRatio: 2,
    overflow: 'hidden',
    borderRadius: radius.lg,
    backgroundColor: '#FFF7F2',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  bannerImage: {
    width: '100%',
    height: '100%',
  },
  pagination: {
    minHeight: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingTop: spacing.xs,
  },
  paginationDot: {
    width: 6,
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
  },
  paginationDotActive: {
    width: 18,
    backgroundColor: colors.flameRed,
  },

  kitchensSection: {
    paddingTop: spacing.sm,
  },
  sectionHeader: {
    minHeight: touchTarget.minimum,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  sectionTitle: {
    flex: 1,
    color: colors.espressoBrown,
    fontSize: typography.heading,
    fontWeight: fontWeight.bold,
  },
  seeAll: {
    color: colors.flameRedAccessible,
    fontSize: typography.small,
    fontWeight: fontWeight.bold,
  },
  kitchenRow: {
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  kitchenCard: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.white,
    overflow: 'hidden',
    ...elevation.card,
  },
  kitchenPressed: {
    opacity: 0.88,
  },
  kitchenImageWrap: {
    position: 'relative',
    zIndex: 1,
  },
  timeGlass: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  timeGlassText: {
    color: colors.white,
    fontSize: typography.small,
    fontWeight: fontWeight.semibold,
  },

  favoriteGlass: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: touchTarget.minimum,
    height: touchTarget.minimum,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  favoriteControl: {
    width: '100%',
    height: '100%',
    backgroundColor: 'transparent',
  },

  ratingGlass: {
    position: 'absolute',
    right: spacing.sm,
    bottom: spacing.sm,
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  ratingGlassText: {
    color: colors.white,
    fontSize: typography.small,
    fontWeight: fontWeight.bold,
  },

  chefAvatarShell: {
    position: 'absolute',
    left: spacing.sm,
    bottom: -32,
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    ...elevation.card,
  },
  chefAvatarIcon: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },

  kitchenBody: {
    paddingHorizontal: spacing.sm,
    paddingTop: 38,
    paddingBottom: spacing.sm,
  },
  kitchenName: {
    color: colors.espressoBrown,
    fontSize: typography.body,
    fontWeight: fontWeight.bold,
  },
  kitchenBio: {
    marginTop: spacing.xxs,
    color: colors.textSecondary,
    fontSize: typography.small,
    lineHeight: 19,
  },
  kitchenStartingPrice: {
    marginTop: spacing.xs,
    color: colors.flameRedAccessible,
    fontSize: typography.small,
    fontWeight: fontWeight.bold,
  },
});
