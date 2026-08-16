import React from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  type ImageSourcePropType,
} from 'react-native';
import {
  CUSTOMER_MENU_CATEGORIES,
  type CustomerMenuCategory,
} from '../../../shared/catalog/menuCategories';
import {colors, fontWeight, spacing, typography} from '../../../design/tokens';
import {HomePromoAndKitchens} from './HomePromoAndKitchens';

declare const require: (path: string) => ImageSourcePropType;

const CATEGORY_IMAGES: Record<CustomerMenuCategory, ImageSourcePropType> = {
  All: require('../../../assets/categories/all.jpg'),
  Biriyani: require('../../../assets/categories/biriyani.jpg'),
  Curry: require('../../../assets/categories/curry.jpg'),
  Tiffin: require('../../../assets/categories/tiffin.jpg'),
  Snakes: require('../../../assets/categories/snakes.jpg'),
  'Roti & Chapati': require('../../../assets/categories/roti-chapati.jpg'),
  'Sweet Item': require('../../../assets/categories/sweet-item.jpg'),
  Rice: require('../../../assets/categories/rice.jpg'),
  'Fast Food': require('../../../assets/categories/fast-food.jpg'),
};

interface HomeCategoryRailProps {
  selectedCategory: string | null;
  onSelect: (category: string | null) => void;
}

export function HomeCategoryRail({
  selectedCategory,
  onSelect,
}: HomeCategoryRailProps) {
  return (
    <HomePromoAndKitchens>
      <ScrollView
        horizontal
        contentContainerStyle={styles.row}
        keyboardShouldPersistTaps="handled"
        showsHorizontalScrollIndicator={false}>
        {CUSTOMER_MENU_CATEGORIES.map(category => {
          const filterValue = category === 'All' ? null : category;
          const selected = selectedCategory === filterValue;

          return (
            <Pressable
              key={category}
              accessibilityLabel={`${category} category`}
              accessibilityRole="button"
              accessibilityState={{selected}}
              hitSlop={spacing.xxs}
              onPress={() => onSelect(filterValue)}
              style={({pressed}) => [styles.item, pressed && styles.itemPressed]}>
              <Image
                accessibilityIgnoresInvertColors
                resizeMode="cover"
                source={CATEGORY_IMAGES[category]}
                style={[styles.image, selected && styles.imageSelected]}
              />
              <Text
                numberOfLines={2}
                style={[styles.label, selected && styles.labelSelected]}>
                {category}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </HomePromoAndKitchens>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: spacing.md,
    paddingLeft: spacing.md,
    paddingRight: spacing.xl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  item: {
    alignItems: 'center',
    width: 72,
  },
  itemPressed: {
    opacity: 0.8,
    transform: [{scale: 0.98}],
  },
  image: {
    width: 64,
    height: 64,
    borderRadius: 32,
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
