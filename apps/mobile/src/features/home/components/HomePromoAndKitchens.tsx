import React, {useEffect, useMemo, useRef, useState} from 'react';
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
import type {NearbyKitchen} from '../../chefDiscovery/api/nearbyChefDiscoveryApi';
import {
  flattenNearbyKitchenPages,
  formatKitchenDistance,
} from '../../chefDiscovery/chefDiscoveryPresentation';
import {useNearbyChefDiscoveryQuery} from '../../chefDiscovery/query/nearbyChefDiscoveryQueries';
import {CustomerChefAvatar} from '../../customerShell/components/CustomerChefAvatar';

declare const require: (path: string) => ImageSourcePropType;

const HOME_RADIUS_METERS = 10_000;
const TOP_KITCHEN_PAGE_SIZE = 12;
const MAX_TOP_KITCHENS = 8;
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

function PromoCarousel({width}: {width: number}) {
  const listRef = useRef<FlatList<PromoBanner>>(null);
  const activeIndexRef = useRef(0);
  const isDraggingRef = useRef(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const updateActiveIndex = (index: number) => {
    activeIndexRef.current = index;
    setActiveIndex(index);
  };

  useEffect(() => {
    if (width <= 0) {
      return undefined;
    }

    listRef.current?.scrollToOffset({
      offset: activeIndexRef.current * width,
      animated: false,
    });

    return undefined;
  }, [width]);

  useEffect(() => {
    if (HOME_PROMO_BANNERS.length < 2 || width <= 0) {
      return undefined;
    }

    const interval = setInterval(() => {
      if (isDraggingRef.current) {
        return;
      }

      const nextIndex =
        (activeIndexRef.current + 1) % HOME_PROMO_BANNERS.length;

      listRef.current?.scrollToOffset({
        offset: nextIndex * width,
        animated: true,
      });
      updateActiveIndex(nextIndex);
    }, PROMO_AUTO_ADVANCE_MS);

    return () => clearInterval(interval);
  }, [width]);

  const handleMomentumScrollEnd = (
    event: NativeSyntheticEvent<NativeScrollEvent>,
  ) => {
    if (width <= 0) {
      return;
    }

    const nextIndex = Math.round(event.nativeEvent.contentOffset.x / width);
    const safeIndex = Math.max(
      0,
      Math.min(HOME_PROMO_BANNERS.length - 1, nextIndex),
    );

    isDraggingRef.current = false;
    updateActiveIndex(safeIndex);
  };

  return (
    <View style={styles.promoCarousel}>
      <FlatList
        ref={listRef}
        data={HOME_PROMO_BANNERS}
        horizontal
        pagingEnabled
        nestedScrollEnabled
        decelerationRate="fast"
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
        onScrollEndDrag={() => {
          isDraggingRef.current = false;
        }}
        onMomentumScrollEnd={handleMomentumScrollEnd}
        renderItem={({item}) => (
          <View style={[styles.bannerSlide, {width}]}>
            <Image
              accessible
              accessibilityIgnoresInvertColors
              accessibilityLabel={item.label}
              source={item.image}
              resizeMode="cover"
              style={styles.bannerImage}
            />
          </View>
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

function KitchenPreviewCard({
  kitchen,
  onPress,
}: {
  kitchen: NearbyKitchen;
  onPress: (kitchen: NearbyKitchen) => void;
}) {
  const title = kitchen.displayName?.trim() || kitchen.kitchenName.trim();
  const location = [kitchen.areaName, kitchen.city].filter(Boolean).join(', ');

  return (
    <Pressable
      accessibilityHint="Opens this kitchen's public profile"
      accessibilityLabel={`Open ${title}`}
      accessibilityRole="button"
      onPress={() => onPress(kitchen)}
      style={({pressed}) => [styles.kitchenCard, pressed && styles.pressed]}>
      <View style={styles.kitchenBody}>
        <View style={styles.kitchenHeader}>
          <CustomerChefAvatar size={46} />
          <View style={styles.kitchenHeaderCopy}>
            <Text style={styles.kitchenEyebrow}>HOME KITCHEN</Text>
            <Text numberOfLines={2} style={styles.kitchenTitle}>
              {title}
            </Text>
          </View>
        </View>
        <Text numberOfLines={2} style={styles.kitchenSubtitle}>
          {kitchen.description || location || 'Home-cooked meals'}
        </Text>
        <View style={styles.kitchenMetaRow}>
          <Text numberOfLines={1} style={styles.kitchenMeta}>
            {formatKitchenDistance(kitchen.distanceMeters)}
          </Text>
          <Text style={styles.metaDot}>•</Text>
          <Text numberOfLines={1} style={styles.kitchenMeta}>
            {kitchen.activeMenuItemCount}{' '}
            {kitchen.activeMenuItemCount === 1 ? 'dish' : 'dishes'}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

export function HomePromoAndKitchens() {
  const navigation = useNavigation<
    NativeStackNavigationProp<CustomerHomeStackParamList, 'CustomerHomeRoot'>
  >();
  const {width} = useWindowDimensions();
  const discovery = useNearbyChefDiscoveryQuery({
    radiusMeters: HOME_RADIUS_METERS,
    size: TOP_KITCHEN_PAGE_SIZE,
  });
  const kitchens = useMemo(
    () =>
      flattenNearbyKitchenPages(discovery.data?.pages).slice(
        0,
        MAX_TOP_KITCHENS,
      ),
    [discovery.data?.pages],
  );
  const bannerWidth = Math.max(280, width - spacing.md * 2);

  const openKitchen = (kitchen: NearbyKitchen) => {
    navigation.navigate('CustomerKitchenProfile', {kitchenId: kitchen.id});
  };

  return (
    <View>
      <View style={styles.bannerRow}>
        <PromoCarousel width={bannerWidth} />
      </View>

      {kitchens.length > 0 ? (
        <View style={styles.kitchensSection}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>
            Top kitchens near you
          </Text>
          <Text style={styles.sectionCaption}>
            Active home kitchens closest to you
          </Text>
          <ScrollView
            horizontal
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.kitchenRow}>
            {kitchens.map(kitchen => (
              <KitchenPreviewCard
                key={kitchen.id}
                kitchen={kitchen}
                onPress={openKitchen}
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
  kitchensSection: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
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
  kitchenRow: {
    gap: spacing.sm,
    marginHorizontal: -spacing.md,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  kitchenCard: {
    width: 208,
    minHeight: 142,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.white,
    overflow: 'hidden',
    ...elevation.card,
  },
  pressed: {
    opacity: 0.88,
    transform: [{scale: 0.99}],
  },
  kitchenBody: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.md,
  },
  kitchenHeader: {
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  kitchenHeaderCopy: {
    minWidth: 0,
    flex: 1,
  },
  kitchenEyebrow: {
    color: colors.flameRedAccessible,
    fontSize: typography.tiny,
    fontWeight: fontWeight.bold,
    letterSpacing: 0.5,
  },
  kitchenTitle: {
    marginTop: spacing.xxs,
    color: colors.espressoBrown,
    fontSize: typography.small,
    fontWeight: fontWeight.bold,
  },
  kitchenSubtitle: {
    color: colors.textSecondary,
    fontSize: typography.tiny,
    marginTop: spacing.sm,
  },
  kitchenMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.xs,
  },
  kitchenMeta: {
    flexShrink: 1,
    color: colors.textSecondary,
    fontSize: typography.tiny,
  },
  metaDot: {
    color: colors.textSecondary,
    fontSize: typography.tiny,
  },
});
