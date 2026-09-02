import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import MaterialDesignIcons from '@react-native-vector-icons/material-design-icons';
import {
  colors,
  fontWeight,
  radius,
  spacing,
  touchTarget,
  typography,
} from '../../../design/tokens';
import type {DiscoveryDietOption} from '../../discoveryFilters/state/discoveryFilterSlice';

export type HomeFoodType = 'ALL' | DiscoveryDietOption;

type FoodTypeOption = {
  value: HomeFoodType;
  label: string;
  icon: string;
  color: string;
};

const FOOD_TYPE_OPTIONS: readonly FoodTypeOption[] = [
  {value: 'ALL', label: 'All', icon: 'silverware-fork-knife', color: '#42A5F5'},
  {value: 'VEG', label: 'Veg', icon: 'leaf', color: '#43A047'},
  {value: 'NON_VEG', label: 'Non Veg', icon: 'food-drumstick', color: '#F04438'},
  {value: 'EGG', label: 'Egg', icon: 'egg', color: '#F4B400'},
];

interface HomeFoodTypeSelectorProps {
  value: HomeFoodType;
  onChange: (value: HomeFoodType) => void;
}

export function HomeFoodTypeSelector({
  value,
  onChange,
}: HomeFoodTypeSelectorProps) {
  return (
    <View
      accessibilityLabel="Food preference"
      accessibilityRole="radiogroup"
      style={styles.container}>
      {FOOD_TYPE_OPTIONS.map(option => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityLabel={option.label}
            accessibilityRole="radio"
            accessibilityState={{selected}}
            onPress={() => onChange(option.value)}
            style={({pressed}) => [
              styles.option,
              selected && styles.optionSelected,
              pressed && styles.optionPressed,
            ]}>
            <View
              style={[
                styles.iconWrap,
                selected && {backgroundColor: option.color},
              ]}>
              <MaterialDesignIcons
                name={option.icon}
                size={16}
                color={selected ? colors.white : option.color}
              />
            </View>
            <Text
              numberOfLines={1}
              style={[styles.label, selected && styles.labelSelected]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: 'stretch',
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 3,
    gap: 3,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  option: {
    flex: 1,
    minWidth: 0,
    minHeight: touchTarget.minimum,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xxs,
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  optionSelected: {
    backgroundColor: colors.espressoBrown,
  },
  optionPressed: {
    opacity: 0.82,
  },
  iconWrap: {
    width: 25,
    height: 25,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    flexShrink: 1,
    color: colors.textSecondary,
    fontSize: typography.tiny,
    fontWeight: fontWeight.semibold,
  },
  labelSelected: {
    color: colors.white,
    fontWeight: fontWeight.bold,
  },
});
