import React from 'react';
import {StyleSheet, View} from 'react-native';
import {spacing} from '../../../design/tokens';
import {
  CHEF_MENU_CATEGORIES,
  menuCategoryLabel,
  type ChefMenuCategory,
} from '../../../shared/catalog/menuCategories';
import {FieldError, GroupLabel, OptionChip} from './DishFormField';

/** The five most used categories; the rest sit behind "More…" (unless one of them is already chosen). */
const FIRST: readonly ChefMenuCategory[] = ['Biryani', 'Curry', 'Tiffin', 'Snakes', 'Rice'];
const REST = CHEF_MENU_CATEGORIES.filter(category => !FIRST.includes(category));

interface ChefMenuCategorySelectorProps {
  /** The stored value, such as `Snakes`; the chip reads "Snacks". */
  value: string;
  error?: string;
  disabled?: boolean;
  onChange: (category: ChefMenuCategory) => void;
}

export function ChefMenuCategorySelector({value, error, disabled = false, onChange}: ChefMenuCategorySelectorProps) {
  const [more, setMore] = React.useState(false);
  const showAll = more || REST.some(category => category === value);
  const shown = showAll ? CHEF_MENU_CATEGORIES : FIRST;

  return (
    <View style={styles.group}>
      <GroupLabel label="Category" required />
      <View style={styles.options}>
        {shown.map(category => (
          <OptionChip
            disabled={disabled}
            key={category}
            label={menuCategoryLabel(category)}
            onPress={() => onChange(category)}
            selected={value === category}
          />
        ))}
        {showAll ? null : (
          <OptionChip accessibilityLabel="More categories" label="More…" onPress={() => setMore(true)} selected={false} />
        )}
      </View>
      {error ? <FieldError message={error} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  group: {gap: 6},
  options: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs},
});
