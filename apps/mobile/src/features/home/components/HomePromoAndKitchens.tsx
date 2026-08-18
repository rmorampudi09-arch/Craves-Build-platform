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

declare const require: (path: string) => ImageSourcePropType;

const HOME_RADIUS_METERS = 10_000;
const TOP_KITCHEN_PAGE_SIZE = 12;
const MAX_TOP_KITCHENS = 8;

const HOME_PROMO = {
  eyebrow: 'HOME-COOKED',
  title: 'Made with love.',
  accent: 'Up to 30% off',
  caption: 'Fresh meals from trusted home kitchens',
  art: require('../../../assets/categories/curry.jpg'),
} as const;

function PromoCard({width}: {width: number}) {
  return (
    <View style={[styles.banner, {width}]}>
      <View style={styles.bannerCopy}>
        <Text style={styles.bannerEyebrow}>{HOME_PROMO.eyebrow}</Text>
        <Text style={styles.bannerTitle}>{HOME_PROMO.title}</Text>
        <Text numberOfLines={2} style={styles.bannerCaption}>
          {HOME_PROMO.caption}
        </Text>
        <View style={styles.offerPill}>
          <Text style={styles.offerPillText}>{HOME_PROMO.accent}</Text>
        </View>
      </View>
      <View style={styles.bannerArtPanel}>
        <View pointerEvents="none" style={styles.steamGroup}>
          <View style={[styles.steam, styles.steamOne]} />
          <View style={[styles.steam, styles.steamTwo]} />
          <View style={[styles.steam, styles.steamThree]} />
        </View>
        <View style={styles.bowlFrame}>
          <Image
            accessibilityIgnoresInvertColors
            source={HOME_PROMO.art}
            resizeMode="cover"
            style={styles.bannerArt}
          />
        </View>
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
        <Text style={styles.kitchenEyebrow}>HOME KITCHEN</Text>
        <Text numberOfLines={2} style={styles.kitchenTitle}>
          {title}
        </Text>
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
        <PromoCard width={bannerWidth} />
      </View>

      {kitchens.length > 0 ? (
        <View style={styles.kitchensSection}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>
            Top kitchens near you
          </Text>
          <Text style={styles.sectionCaption}>Active home kitchens closest to you</Text>
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
  banner: {
    minHeight: 174,
    flexDirection: 'row',
    overflow: 'hidden',
    borderRadius: radius.lg,
    backgroundColor: '#FFF7F2',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  bannerCopy: {
    width: '54%',
    zIndex: 2,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  bannerEyebrow: {
    color: colors.espressoBrown,
    fontSize: typography.tiny,
    fontWeight: fontWeight.extrabold,
    letterSpacing: 0.7,
  },
  bannerTitle: {
    marginTop: 2,
    color: colors.flameRed,
    fontSize: typography.heading,
    fontWeight: fontWeight.extrabold,
  },
  bannerCaption: {
    marginTop: spacing.xs,
    color: colors.espressoBrown,
    fontSize: typography.tiny,
    lineHeight: 17,
  },
  offerPill: {
    alignSelf: 'flex-start',
    marginTop: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.sm,
    backgroundColor: colors.flameRed,
  },
  offerPillText: {
    color: colors.white,
    fontSize: typography.tiny,
    fontWeight: fontWeight.bold,
  },
  bannerArtPanel: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: '52%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.flameRed,
  },
  bowlFrame: {
    width: 132,
    height: 132,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 66,
    padding: 8,
    backgroundColor: colors.espressoBrown,
    ...elevation.card,
  },
  bannerArt: {
    width: 116,
    height: 116,
    borderRadius: 58,
  },
  steamGroup: {
    position: 'absolute',
    top: 10,
    left: 26,
    right: 26,
    height: 42,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    opacity: 0.34,
  },
  steam: {
    width: 5,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.white,
    transform: [{rotate: '10deg'}],
  },
  steamOne: {height: 30, marginTop: 8},
  steamTwo: {height: 40},
  steamThree: {height: 28, marginTop: 10},
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
    width: 184,
    minHeight: 124,
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