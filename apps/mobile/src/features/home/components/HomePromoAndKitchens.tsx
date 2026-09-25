import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ImageSourcePropType,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import {BlurView} from 'expo-blur';
import {
  useNavigation,
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
import {Icon} from '../../../shared/components/Icon';
import {useNearbyChefDiscoveryQuery} from '../../chefDiscovery/query/nearbyChefDiscoveryQueries';
import type {NearbyKitchen} from '../../chefDiscovery/api/nearbyChefDiscoveryApi';
import {CustomerChefAvatar} from '../../customerShell/components/CustomerChefAvatar';
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
import {formatDishPrice} from '../homePresentation';

declare const require: (path: string) => ImageSourcePropType;

const HOME_RADIUS_METERS = 10_000;
const TOP_KITCHENS_PAGE_SIZE = 12;
const TOP_KITCHEN_DISH_PAGE_SIZE = 100;
const MAX_TOP_KITCHENS = 8;
const PROMO_AUTO_ADVANCE_MS = 5_000;
const KITCHEN_IMAGE_AUTO_ADVANCE_MS = 2_000;

const HOME_PROMO_BANNERS = [
  {
    id: 'home-kitchen-picks',
    label: 'Fresh meals from home chefs, up to 30 percent off',
    image: require('../../../assets/home/home-kitchen-picks.jpg'),
  },
  {
    id: 'daily-home-feasts',
    label: 'Healthy dinners from trusted home cooks, starting at 199 rupees',
    image: require('../../../assets/home/daily-home-feasts.jpg'),
  },
  {
    id: 'local-chef-specials',
    label: 'Tasty lunches from neighborhood kitchens, flat 25 percent off',
    image: require('../../../assets/home/local-chef-specials.jpg'),
  },
] as const;

type PromoBanner = (typeof HOME_PROMO_BANNERS)[number];
type HomeNavigation = NativeStackNavigationProp<
  CustomerHomeStackParamList,
  'CustomerHomeRoot'
>;

interface TopKitchenCardModel {
  kitchenId: string;
  kitchenName: string;
  biography: string;
  imageUrls: string[];
  preparationTimeLabel: string | null;
  startingPriceLabel: string;
}

function PromoCarousel({
  width,
  onPress,
}: {
  width: number;
  onPress: () => void;
}) {
  const listRef = useRef<FlatList<PromoBanner>>(null);
  const activeIndexRef = useRef(0);
  const isDraggingRef = useRef(false);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (width <= 0 || HOME_PROMO_BANNERS.length < 2) return undefined;
    const interval = setInterval(() => {
      if (isDraggingRef.current) return;
      const nextIndex =
        (activeIndexRef.current + 1) % HOME_PROMO_BANNERS.length;
      listRef.current?.scrollToOffset({
        offset: nextIndex * width,
        animated: true,
      });
      activeIndexRef.current = nextIndex;
      setActiveIndex(nextIndex);
    }, PROMO_AUTO_ADVANCE_MS);
    return () => clearInterval(interval);
  }, [width]);

  const handleMomentumScrollEnd = (
    event: NativeSyntheticEvent<NativeScrollEvent>,
  ) => {
    if (width <= 0) return;
    const nextIndex = Math.max(
      0,
      Math.min(
        HOME_PROMO_BANNERS.length - 1,
        Math.round(event.nativeEvent.contentOffset.x / width),
      ),
    );
    isDraggingRef.current = false;
    activeIndexRef.current = nextIndex;
    setActiveIndex(nextIndex);
  };

  return (
    <View style={styles.promoCarousel}>
      <FlatList
        ref={listRef}
        data={HOME_PROMO_BANNERS}
        horizontal
        pagingEnabled
        nestedScrollEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={item => item.id}
        getItemLayout={(_, index) => ({
          length: width,
          offset: width * index,
          index,
        })}
        onScrollBeginDrag={() => {
          isDraggingRef.current = true;
        }}
        onMomentumScrollEnd={handleMomentumScrollEnd}
        renderItem={({item}) => (
          <Pressable
            accessibilityLabel={item.label}
            accessibilityRole="button"
            onPress={onPress}
            style={[styles.bannerSlide, {width}]}>
            <Image
              accessible
              accessibilityIgnoresInvertColors
              source={item.image}
              resizeMode="cover"
              style={styles.bannerImage}
            />
          </Pressable>
        )}
      />
      <View
        accessibilityLabel={`Banner ${activeIndex + 1} of ${HOME_PROMO_BANNERS.length}`}
        accessibilityRole="text"
        pointerEvents="none"
        style={styles.pagination}>
        {HOME_PROMO_BANNERS.map((banner, index) => (
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

function KitchenImageCarousel({
  imageUrls,
  width,
  height,
  kitchenName,
  onPress,
}: {
  imageUrls: readonly string[];
  width: number;
  height: number;
  kitchenName: string;
  onPress: () => void;
}) {
  const slides = useMemo(
    () =>
      imageUrls.length > 0
        ? imageUrls.map((url, index) => ({
            key: `${index}:${url}`,
            url,
          }))
        : [{key: 'placeholder', url: null}],
    [imageUrls],
  );
  const listRef = useRef<FlatList<(typeof slides)[number]>>(null);
  const activeIndexRef = useRef(0);
  const isDraggingRef = useRef(false);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    activeIndexRef.current = 0;
    setActiveIndex(0);
    listRef.current?.scrollToOffset({offset: 0, animated: false});
  }, [slides.length, width]);

  useEffect(() => {
    if (width <= 0 || slides.length < 2) return undefined;
    const interval = setInterval(() => {
      if (isDraggingRef.current) return;
      const nextIndex = (activeIndexRef.current + 1) % slides.length;
      listRef.current?.scrollToOffset({
        offset: nextIndex * width,
        animated: true,
      });
      activeIndexRef.current = nextIndex;
      setActiveIndex(nextIndex);
    }, KITCHEN_IMAGE_AUTO_ADVANCE_MS);
    return () => clearInterval(interval);
  }, [slides.length, width]);

  const handleMomentumScrollEnd = (
    event: NativeSyntheticEvent<NativeScrollEvent>,
  ) => {
    if (width <= 0) return;
    const nextIndex = Math.max(
      0,
      Math.min(
        slides.length - 1,
        Math.round(event.nativeEvent.contentOffset.x / width),
      ),
    );
    isDraggingRef.current = false;
    activeIndexRef.current = nextIndex;
    setActiveIndex(nextIndex);
  };

  return (
    <View style={[styles.kitchenImageCarousel, {width, height}]}>
      <FlatList
        ref={listRef}
        data={slides}
        horizontal
        pagingEnabled
        nestedScrollEnabled
        scrollEnabled={slides.length > 1}
        showsHorizontalScrollIndicator={false}
        keyExtractor={item => item.key}
        getItemLayout={(_, index) => ({
          length: width,
          offset: width * index,
          index,
        })}
        onScrollBeginDrag={() => {
          isDraggingRef.current = true;
        }}
        onMomentumScrollEnd={handleMomentumScrollEnd}
        renderItem={({item}) => (
          <Pressable
            accessibilityLabel={`Open ${kitchenName}`}
            accessibilityRole="button"
            onPress={onPress}
            style={{width, height}}>
            {item.url ? (
              <Image
                accessibilityIgnoresInvertColors
                source={{uri: item.url}}
                resizeMode="cover"
                style={styles.kitchenImage}
              />
            ) : (
              <View style={styles.kitchenImagePlaceholder}>
                <Icon
                  name="chef"
                  size={34}
                  color={colors.flameRedAccessible}
                  surface={false}
                />
              </View>
            )}
          </Pressable>
        )}
      />

      <View
        pointerEvents="none"
        style={styles.kitchenPagination}>
        {slides.map((slide, index) => (
          <View
            key={slide.key}
            style={[
              styles.kitchenPaginationDot,
              index === activeIndex && styles.kitchenPaginationDotActive,
            ]}
          />
        ))}
      </View>
    </View>
  );
}

function formatPreparationTime(dishes: readonly NearbyDish[]): string | null {
  const times = dishes
    .map(dish => dish.preparationTimeMinutes)
    .filter((value): value is number => typeof value === 'number');

  if (times.length === 0) return null;
  const minimum = Math.min(...times);
  const maximum = Math.max(...times);
  return minimum === maximum
    ? `${minimum} min`
    : `${minimum}–${maximum} min`;
}

function buildTopKitchenCards(
  kitchens: readonly NearbyKitchen[],
  dishes: readonly NearbyDish[],
): TopKitchenCardModel[] {
  const dishesByKitchen = new Map<string, NearbyDish[]>();
  for (const dish of dishes) {
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
      kitchenName: kitchen.displayName?.trim() || kitchen.kitchenName,
      biography:
        kitchen.description?.trim() ||
        'Home-cooked meals prepared with care.',
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
  onFavorite,
  onPress,
}: {
  kitchen: TopKitchenCardModel;
  width: number;
  favorite: boolean;
  favoritePending: boolean;
  rating: number | null;
  onFavorite: () => void;
  onPress: () => void;
}) {
  const imageHeight = Math.round(width * 0.63);
  const ratingLabel = rating === null ? 'New' : rating.toFixed(1);

  return (
    <View style={[styles.kitchenCard, {width}]}>
      <View style={styles.kitchenImageWrap}>
        <KitchenImageCarousel
          imageUrls={kitchen.imageUrls}
          width={width}
          height={imageHeight}
          kitchenName={kitchen.kitchenName}
          onPress={onPress}
        />

        {kitchen.preparationTimeLabel ? (
          <BlurView
            experimentalBlurMethod="dimezisBlurView"
            intensity={70}
            pointerEvents="none"
            tint="light"
            style={styles.timeGlass}>
            <Icon
              name="clock"
              size={18}
              color={colors.espressoBrown}
              surface={false}
            />
            <Text style={styles.timeGlassText}>
              {kitchen.preparationTimeLabel}
            </Text>
          </BlurView>
        ) : null}

        <View style={styles.favoriteGlass}>
          <BlurView
            experimentalBlurMethod="dimezisBlurView"
            intensity={72}
            pointerEvents="none"
            tint="light"
            style={StyleSheet.absoluteFill}
          />
          <CustomerFavoriteHeartButton
            favorite={favorite}
            pending={favoritePending}
            onToggle={onFavorite}
            itemLabel={kitchen.kitchenName}
            style={styles.favoriteControl}
          />
        </View>

        <BlurView
          experimentalBlurMethod="dimezisBlurView"
          intensity={72}
          pointerEvents="none"
          tint="dark"
          style={styles.ratingGlass}>
          <Icon name="star" size={18} color="#FFC928" surface={false} />
          <Text style={styles.ratingGlassText}>{ratingLabel}</Text>
        </BlurView>

        <View pointerEvents="none" style={styles.chefAvatarShell}>
          <CustomerChefAvatar size={64} />
          <View style={styles.chefAvatarIcon}>
            <Icon
              name="chef"
              size={26}
              color={colors.espressoBrown}
              surface={false}
            />
          </View>
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

export function HomePromoAndKitchens() {
  const navigation = useNavigation<HomeNavigation>();
  const tabNavigation =
    navigation.getParent<NavigationProp<CustomerTabParamList>>();
  const {width} = useWindowDimensions();

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
    return buildTopKitchenCards(nearbyKitchens, nearbyDishes);
  }, [kitchenDiscovery.data?.pages, menuDiscovery.data?.pages]);

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
      <View style={styles.bannerRow}>
        <PromoCarousel
          width={bannerWidth}
          onPress={() => navigation.navigate('CustomerHomeSearch')}
        />
      </View>

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
            renderItem={({item}) => (
              <TopKitchenCard
                kitchen={item}
                width={kitchenCardWidth}
                favorite={favoriteKitchenIds.has(item.kitchenId)}
                favoritePending={toggleFavoriteKitchen.isPending}
                rating={ratingByKitchenId.get(item.kitchenId) ?? null}
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
  kitchenImageCarousel: {
    overflow: 'hidden',
    backgroundColor: colors.surfaceMuted,
  },
  kitchenImage: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.surfaceMuted,
  },
  kitchenImagePlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  kitchenPagination: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  kitchenPaginationDot: {
    width: 7,
    height: 7,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.75)',
    backgroundColor: 'rgba(255,255,255,0.42)',
  },
  kitchenPaginationDotActive: {
    backgroundColor: colors.white,
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
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.68)',
    backgroundColor: 'rgba(255,255,255,0.10)',
    overflow: 'hidden',
  },
  timeGlassText: {
    color: colors.espressoBrown,
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
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.68)',
    backgroundColor: 'rgba(255,255,255,0.10)',
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
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.62)',
    backgroundColor: 'rgba(30,20,16,0.18)',
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
    borderWidth: 3,
    borderColor: colors.white,
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
    minHeight: 38,
    marginTop: spacing.xxs,
    color: colors.textSecondary,
    fontSize: typography.small,
    lineHeight: 19,
  },
  kitchenStartingPrice: {
    marginTop: spacing.sm,
    color: colors.flameRedAccessible,
    fontSize: typography.small,
    fontWeight: fontWeight.bold,
  },
});
