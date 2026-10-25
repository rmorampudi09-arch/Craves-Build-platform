import React from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  type ImageSourcePropType,
} from 'react-native';
import {ScrollView} from 'react-native-gesture-handler';
import {
  CUSTOMER_MENU_CATEGORIES,
  menuCategoryLabel,
  type CustomerMenuCategory,
} from '../../../shared/catalog/menuCategories';
import {colors, fontWeight, spacing, typography} from '../../../design/tokens';

declare const require: (path: string) => ImageSourcePropType;

const CATEGORY_IMAGES: Record<CustomerMenuCategory, ImageSourcePropType> = {
  All: require('../../../assets/categories/all.jpg'),
  Biryani: require('../../../assets/categories/biriyani.jpg'),
  Curry: require('../../../assets/categories/curry.jpg'),
  Tiffin: require('../../../assets/categories/tiffin.jpg'),
  Snakes: require('../../../assets/categories/snakes.jpg'),
  'Roti & Chapati': require('../../../assets/categories/roti-chapati.jpg'),
  'Sweet Item': require('../../../assets/categories/sweet-item.jpg'),
  Rice: require('../../../assets/categories/rice.jpg'),
  'Fast Food': require('../../../assets/categories/fast-food.jpg'),
};

const IMAGE_SIZE = 64;
const ITEM_WIDTH = 72;
// Pinned, like Swiggy: 56 dp photos in 64 dp items with 12 dp gaps, so five fit instead of four.
const PINNED_IMAGE_SIZE = 56;
const PINNED_SHIFT = ITEM_WIDTH + spacing.md - (64 + 12);
const IMAGE_LIFT = IMAGE_SIZE - PINNED_IMAGE_SIZE;
/** How much shorter the pinned row looks: the photo shrinks and its name moves up 2 dp closer to it. */
export const CATEGORY_RAIL_PINNED_LIFT = IMAGE_LIFT + 2;

interface HomeCategoryRailProps {
  selectedCategory: string | null;
  onSelect: (category: string | null) => void;
  /** 0 in the page, 1 pinned. Native-driven transforms only, so the row's layout (and the list under it) never moves. */
  pinProgress?: Animated.Value;
  /** Pinned items sit closer; the end of the row is pulled in to match so it can't scroll into blank space. */
  pinned?: boolean;
}

export function HomeCategoryRail({
  selectedCategory,
  onSelect,
  pinProgress,
  pinned = false,
}: HomeCategoryRailProps) {
  const progress = pinProgress ?? new Animated.Value(0);
  const imageMotion = {
    transform: [
      // Shrinks from its top edge, like Swiggy, so the photos stay under the header line.
      {translateY: progress.interpolate({inputRange: [0, 1], outputRange: [0, -IMAGE_LIFT / 2]})},
      {scale: progress.interpolate({inputRange: [0, 1], outputRange: [1, PINNED_IMAGE_SIZE / IMAGE_SIZE]})},
    ],
  };
  const labelMotion = {
    transform: [
      {translateY: progress.interpolate({inputRange: [0, 1], outputRange: [0, -CATEGORY_RAIL_PINNED_LIFT]})},
    ],
  };
  const lastIndex = CUSTOMER_MENU_CATEGORIES.length - 1;

  return (
    <ScrollView
      testID="home-category-scroll"
      horizontal
      nestedScrollEnabled
      directionalLockEnabled
      keyboardShouldPersistTaps="handled"
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      style={styles.rail}>
      {CUSTOMER_MENU_CATEGORIES.map((category, index) => {
        const filterValue = category === 'All' ? null : category;
        const selected = selectedCategory === filterValue;

        return (
          <Animated.View
            key={category}
            style={[
              {
                transform: [
                  {translateX: progress.interpolate({inputRange: [0, 1], outputRange: [0, -index * PINNED_SHIFT]})},
                ],
              },
              pinned && index === lastIndex && {marginRight: -lastIndex * PINNED_SHIFT},
            ]}>
            <Pressable
              accessibilityLabel={`${menuCategoryLabel(category)} category`}
              accessibilityRole="button"
              accessibilityState={{selected}}
              hitSlop={spacing.xxs}
              onPress={() => onSelect(filterValue)}
              style={({pressed}) => [styles.item, pressed && styles.itemPressed]}>
              <Animated.Image
                accessibilityIgnoresInvertColors
                resizeMode="cover"
                source={CATEGORY_IMAGES[category]}
                style={[styles.image, selected && styles.imageSelected, imageMotion]}
              />
              <Animated.Text
                numberOfLines={2}
                style={[styles.label, selected && styles.labelSelected, labelMotion]}>
                {menuCategoryLabel(category)}
              </Animated.Text>
            </Pressable>
          </Animated.View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  rail: {
    flexGrow: 0,
  },
  row: {
    gap: spacing.md,
    paddingLeft: spacing.md,
    paddingRight: spacing.xl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  item: {
    alignItems: 'center',
    width: ITEM_WIDTH,
  },
  itemPressed: {
    opacity: 0.8,
    transform: [{scale: 0.98}],
  },
  image: {
    width: IMAGE_SIZE,
    height: IMAGE_SIZE,
    borderRadius: IMAGE_SIZE / 2,
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: colors.surfaceMuted,
  },
  imageSelected: {
    borderColor: colors.flameRed,
  },
  label: {
    color: colors.textSecondary,
    fontSize: typography.tiny,
    fontWeight: fontWeight.semibold,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  labelSelected: {
    color: colors.flameRedAccessible,
    fontWeight: fontWeight.bold,
  },
});
