import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {
  colors,
  fontWeight,
  radius,
  spacing,
  touchTarget,
  typography,
} from '../../../design/tokens';
import {
  CHEF_MENU_CATEGORIES,
  type ChefMenuCategory,
} from '../../../shared/catalog/menuCategories';

interface ChefMenuCategorySelectorProps {
  value: string;
  error?: string;
  disabled?: boolean;
  onChange: (category: ChefMenuCategory) => void;
}

export function ChefMenuCategorySelector({
  value,
  error,
  disabled = false,
  onChange,
}: ChefMenuCategorySelectorProps) {
  return (
    <View style={styles.fieldBlock}>
      <Text style={styles.fieldLabel}>Category</Text>
      <View style={styles.options}>
        {CHEF_MENU_CATEGORIES.map(category => {
          const selected = value === category;
          return (
            <Pressable
              key={category}
              accessibilityRole="radio"
              accessibilityState={{checked: selected, disabled}}
              disabled={disabled}
              onPress={() => onChange(category)}
              style={({pressed}) => [
                styles.option,
                selected && styles.optionSelected,
                (pressed || disabled) && styles.optionMuted,
              ]}>
              <Text
                style={[
                  styles.optionText,
                  selected && styles.optionTextSelected,
                ]}>
                {category}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {error ? (
        <Text style={styles.fieldError}>{error}</Text>
      ) : (
        <Text style={styles.fieldHelper}>Select one category for this item.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fieldBlock: {marginBottom: spacing.md},
  fieldLabel: {
    color: colors.textPrimary,
    fontSize: typography.small,
    fontWeight: fontWeight.semibold,
    marginBottom: spacing.xs,
  },
  options: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  option: {
    alignItems: 'center',
    backgroundColor: colors.white,
    borderColor: colors.borderStrong,
    borderRadius: radius.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: touchTarget.minimum,
    paddingHorizontal: spacing.md,
  },
  optionSelected: {backgroundColor: colors.flameRed, borderColor: colors.flameRed},
  optionMuted: {opacity: 0.72},
  optionText: {
    color: colors.textPrimary,
    fontSize: typography.small,
    fontWeight: fontWeight.semibold,
  },
  optionTextSelected: {color: colors.white},
  fieldError: {color: colors.error, fontSize: typography.small, marginTop: spacing.xxs},
  fieldHelper: {color: colors.textSecondary, fontSize: typography.tiny, marginTop: spacing.xxs},
});
