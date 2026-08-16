import React, {useMemo} from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ImageSourcePropType,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import type {CustomerHomeStackParamList} from '../../../app/navigation/types';
import {colors, elevation, fontWeight, radius, spacing, typography} from '../../../design/tokens';
import type {NearbyKitchen} from '../../chefDiscovery/api/nearbyChefDiscoveryApi';
import {
  flattenNearbyKitchenPages,
  formatKitchenDistance,
} from '../../chefDiscovery/chefDiscoveryPresentation';
import {useNearbyChefDiscoveryQuery} from '../../chefDiscovery/query/nearbyChefDiscoveryQueries';

declare const require: (path: string) => ImageSourcePropType;

const HOME_RADIUS_METERS = 10_000;
const TOP_KITCHEN_PAGE_SIZE = 12;
const MAX_TOP_KITCHENS = 8;

const PROMO_BANNERS: readonly ImageSourcePropType[] = [
  require('../../../assets/home/home-banner-1.jpg'),
  require('../../../assets/home/home-banner-2.jpg'),
  require('../../../assets/home/home-banner-3.jpg'),
];

const KITCHEN_AVATARS: readonly ImageSourcePropType[] = [
  require('../../../assets/home/kitchen-avatar-1.jpg'),
  require('../../../assets/home/kitchen-avatar-2.jpg'),
  require('../../../assets/home/kitchen-avatar-3.jpg'),
  require('../../../assets/home/kitchen-avatar-4.jpg'),
  require('../../../assets/home/kitchen-avatar-5.jpg'),
  require('../../../assets/home/kitchen-avatar-6.jpg'),
];

function stableAvatarIndex(kitchenId: string): number {
  let hash = 0;
  for (let index = 0; index < kitchenId.length; index += 1) {
    hash = (hash * 31 + kitchenId.charCodeAt(index)) >>> 0;
  }
  return hash % KITCHEN_AVATARS.length;
}

function KitchenPreviewCard({
  kitchen,
  onPress,
}: {
  kitchen: NearbyKitchen;
  onPress: (kitchen: NearbyKitchen) => void;
}) {
  const title = kitchen.displayName ?? kitchen.kitchenName;
  const location = [kitchen.areaName, kitchen.city].filter(Boolean).join(', ');
  const avatar = KITCHEN_AVATARS[stableAvatarIndex(kitchen.id)];

  return (
    <Pressable
      accessibilityHint="Opens this kitchen's public profile"
      accessibilityLabel={`Open ${title}`}
      accessibilityRole="button"
      onPress={() => onPress(kitchen)}
      style={({pressed}) => [styles.kitchenCard, pressed && styles.pressed]}>
      <Image
        accessibilityIgnoresInvertColors
        source={avatar}
        resizeMode="cover"
        style={styles.kitchenImage}
      />
      <View style={styles.kitchenBody}>
        <Text numberOfLines={1} style={styles.kitchenTitle}>
          {title}
        </Text>
        <Text numberOfLines={1} style={styles.kitchenSubtitle}>
          {kitchen.description || location || 'Home-cooked meals'}
        </Text>
        <View style={styles.kitchenMetaRow}>
          <Text numberOfLines={1} style={styles.kitchenMeta}>
            {formatKitchenDistance(kitchen.distanceMeters)}
          </Text>
          <Text style={styles.metaDot}>•</Text>
          <Text numberOfLines={1} style={styles.kitchenMeta}>
            {kitchen.activeMenuItemCount} {kitchen.activeMenuItemCount === 1 ? 'dish' : 'dishes'}
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
    () => flattenNearbyKitchenPages(discovery.data?.pages).slice(0, MAX_TOP_KITCHENS),
    [discovery.data?.pages],
  );
  const bannerWidth = Math.max(280, width - spacing.md * 2);

  const openKitchen = (kitchen: NearbyKitchen) => {
    navigation.navigate('CustomerKitchenProfile', {kitchenId: kitchen.id});
  };

  return (
    <View>
      <ScrollView
        horizontal
        decelerationRate="fast"
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.bannerRow}>
        {PROMO_BANNERS.map((source, index) => (
          <Image
            key={`home-promo-${index + 1}`}
            accessibilityIgnoresInvertColors
            accessibilityLabel={`Craves home food offer ${index + 1}`}
            source={source}
            resizeMode="cover"
            style={[styles.banner, {width: bannerWidth}]}
          />
        ))}
      </ScrollView>

      <View style={styles.categoryHeadingWrap}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>
          What&apos;s on your mind
        </Text>
      </View>

      {kitchens.length > 0 ? (
        <View style={styles.kitchensSection}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>
            Top Kitchens near you
          </Text>
          <Text style={styles.sectionCaption}>Active home kitchens closest to you</Text>
          <ScrollView
            horizontal
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
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  banner: {
    aspectRatio: 900 / 390,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceMuted,
  },
  categoryHeadingWrap: {
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
  kitchensSection: {
    paddingTop: spacing.md,
  },
  kitchenRow: {
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  kitchenCard: {
    width: 184,
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
  kitchenImage: {
    width: '100%',
    height: 116,
    backgroundColor: colors.surfaceMuted,
  },
  kitchenBody: {
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  kitchenTitle: {
    color: colors.espressoBrown,
    fontSize: typography.small,
    fontWeight: fontWeight.bold,
  },
  kitchenSubtitle: {
    color: colors.textSecondary,
    fontSize: typography.tiny,
    marginTop: spacing.xxs,
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
