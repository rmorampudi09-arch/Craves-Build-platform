import React, {useEffect, useRef, useState} from 'react';
import {
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ImageSourcePropType,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import type {CustomerHomeStackParamList} from '../../../app/navigation/types';
import {
  colors,
  elevation,
  fontWeight,
  radius,
  spacing,
  typography,
} from '../../../design/tokens';
import {useHomeNearbyDishesQuery} from '../query/homeFeedQueries';
import type {NearbyDish} from '../api/homeFeedApi';
import {CustomerChefAvatar} from '../../customerShell/components/CustomerChefAvatar';
import {CustomerFavoriteHeartButton} from '../../favorites/components/CustomerFavoriteHeartButton';

declare const require: (path: string) => ImageSourcePropType;

const HOME_RADIUS_METERS = 10_000;
const TOP_PICKS_PAGE_SIZE = 12;
const MAX_TOP_PICKS = 8;
const PROMO_AUTO_ADVANCE_MS = 5_000;

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

function PromoCarousel({width, onPress}: {width: number; onPress: () => void}) {
  const listRef = useRef<FlatList<PromoBanner>>(null);
  const activeIndexRef = useRef(0);
  const isDraggingRef = useRef(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const updateActiveIndex = (index: number) => {
    activeIndexRef.current = index;
    setActiveIndex(index);
  };

  useEffect(() => {
    if (width <= 0 || HOME_PROMO_BANNERS.length < 2) return undefined;
    const interval = setInterval(() => {
      if (isDraggingRef.current) return;
      const nextIndex = (activeIndexRef.current + 1) % HOME_PROMO_BANNERS.length;
      listRef.current?.scrollToOffset({offset: nextIndex * width, animated: true});
      updateActiveIndex(nextIndex);
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
    updateActiveIndex(nextIndex);
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
        getItemLayout={(_, index) => ({length: width, offset: width * index, index})}
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
            style={[styles.paginationDot, index === activeIndex && styles.paginationDotActive]}
          />
        ))}
      </View>
    </View>
  );
}

function foodTypeLabel(foodType: NearbyDish['foodType']): string {
  if (foodType === 'NON_VEG') return 'Non Veg';
  return foodType === 'VEG' ? 'Veg' : 'Egg';
}

function TopPickCard({dish, onPress}: {dish: NearbyDish; onPress: () => void}) {
  const kitchenName = dish.kitchenDisplayName?.trim() || dish.kitchenName;
  const prepTime = dish.preparationTimeMinutes
    ? `${dish.preparationTimeMinutes} min`
    : null;

  return (
    <Pressable
      accessibilityLabel={`Open ${dish.itemName} from ${kitchenName}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({pressed}) => [styles.pickCard, pressed && styles.pickPressed]}>
      <View style={styles.pickImageWrap}>
        {dish.primaryImageUrl ? (
          <Image
            source={{uri: dish.primaryImageUrl}}
            resizeMode="cover"
            style={styles.pickImage}
          />
        ) : (
          <View style={styles.pickPlaceholder}>
            <CustomerChefAvatar size={44} />
          </View>
        )}
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{foodTypeLabel(dish.foodType)}</Text>
        </View>
        {prepTime ? (
          <View style={styles.etaBadge}>
            <Text style={styles.etaText}>{prepTime}</Text>
          </View>
        ) : null}
        <CustomerFavoriteHeartButton
          favorite={false}
          disabled
          onToggle={() => undefined}
          style={styles.favorite}
        />
      </View>
      <View style={styles.pickBody}>
        <Text numberOfLines={1} style={styles.pickKitchen}>
          {kitchenName}
        </Text>
        <Text numberOfLines={2} style={styles.pickName}>
          {dish.itemName}
        </Text>
        <View style={styles.pickMeta}>
          <Text numberOfLines={1} style={styles.pickCategory}>
            {dish.category}
          </Text>
          <Text style={styles.metaDot}>•</Text>
          <Text style={styles.pickPrice}>
            {dish.currency} {dish.price.toFixed(0)}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

export function HomePromoAndKitchens() {
  const navigation = useNavigation<HomeNavigation>();
  const {width} = useWindowDimensions();
  const discovery = useHomeNearbyDishesQuery({
    radiusMeters: HOME_RADIUS_METERS,
    size: TOP_PICKS_PAGE_SIZE,
  });
  const picks = (discovery.data?.pages.flatMap(page => page.menuItems) ?? []).slice(
    0,
    MAX_TOP_PICKS,
  );
  const bannerWidth = Math.max(280, width - spacing.md * 2);

  return (
    <View>
      <View style={styles.bannerRow}>
        <PromoCarousel
          width={bannerWidth}
          onPress={() => navigation.navigate('CustomerHomeSearch')}
        />
      </View>

      {picks.length > 0 ? (
        <View style={styles.picksSection}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionCopy}>
              <Text accessibilityRole="header" style={styles.sectionTitle}>
                Top Picks for you
              </Text>
              <Text style={styles.sectionCaption}>
                Popular meals available near you
              </Text>
            </View>
            <Pressable
              accessibilityLabel="See all top picks"
              accessibilityRole="button"
              onPress={() => navigation.navigate('CustomerHomeSearch')}
              hitSlop={spacing.xs}>
              <Text style={styles.seeAll}>See all</Text>
            </Pressable>
          </View>
          <ScrollView
            horizontal
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.pickRow}>
            {picks.map(dish => (
              <TopPickCard
                key={dish.id}
                dish={dish}
                onPress={() => navigation.navigate('CustomerDishDetail', {menuItemId: dish.id})}
              />
            ))}
          </ScrollView>
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
  picksSection: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  sectionCopy: {
    flex: 1,
    minWidth: 0,
  },
  sectionTitle: {
    color: colors.espressoBrown,
    fontSize: typography.heading,
    fontWeight: fontWeight.bold,
  },
  sectionCaption: {
    color: colors.textSecondary,
    fontSize: typography.tiny,
    marginTop: spacing.xxs,
  },
  seeAll: {
    color: colors.flameRedAccessible,
    fontSize: typography.tiny,
    fontWeight: fontWeight.bold,
  },
  pickRow: {
    gap: spacing.sm,
    marginHorizontal: -spacing.md,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  pickCard: {
    width: 190,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.white,
    overflow: 'hidden',
    ...elevation.card,
  },
  pickPressed: {
    opacity: 0.88,
    transform: [{scale: 0.99}],
  },
  pickImageWrap: {
    height: 118,
    position: 'relative',
    backgroundColor: '#FFF7F2',
  },
  pickImage: {
    width: '100%',
    height: '100%',
  },
  pickPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    left: spacing.xs,
    bottom: spacing.xs,
    paddingHorizontal: spacing.xs,
    paddingVertical: 3,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(0,0,0,0.58)',
  },
  badgeText: {
    color: colors.white,
    fontSize: typography.tiny,
    fontWeight: fontWeight.bold,
  },
  etaBadge: {
    position: 'absolute',
    top: spacing.xs,
    left: spacing.xs,
    paddingHorizontal: spacing.xs,
    paddingVertical: 3,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(0,0,0,0.58)',
  },
  etaText: {
    color: colors.white,
    fontSize: typography.tiny,
    fontWeight: fontWeight.semibold,
  },
  favorite: {
    position: 'absolute',
    top: 2,
    right: 2,
  },
  pickBody: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  pickKitchen: {
    color: colors.textSecondary,
    fontSize: typography.tiny,
    fontWeight: fontWeight.semibold,
  },
  pickName: {
    marginTop: spacing.xxs,
    color: colors.espressoBrown,
    fontSize: typography.small,
    fontWeight: fontWeight.bold,
    lineHeight: 18,
  },
  pickMeta: {
    marginTop: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  pickCategory: {
    flexShrink: 1,
    color: colors.textSecondary,
    fontSize: typography.tiny,
  },
  metaDot: {
    color: colors.textSecondary,
    fontSize: typography.tiny,
  },
  pickPrice: {
    color: colors.espressoBrown,
    fontSize: typography.tiny,
    fontWeight: fontWeight.bold,
  },
});
