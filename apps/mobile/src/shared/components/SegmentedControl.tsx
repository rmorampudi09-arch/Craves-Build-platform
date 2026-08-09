import React from 'react';
import {Pressable, StyleProp, StyleSheet, Text, View, ViewStyle} from 'react-native';
import {
  borderWidth,
  colors,
  fontWeight,
  radius,
  spacing,
  textDefaults,
  touchTarget,
  typography,
} from '../../design/tokens';

export interface SegmentedControlOption<T extends string> {
  value: T;
  label: string;
  accessibilityLabel?: string;
}

export interface SegmentedControlProps<T extends string> {
  value: T;
  options: ReadonlyArray<SegmentedControlOption<T>>;
  onChange: (value: T) => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  accessibilityOptionRole?: 'tab' | 'radio';
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  disabled = false,
  accessibilityLabel,
  accessibilityOptionRole = 'tab',
  style,
  testID,
}: SegmentedControlProps<T>) {
  const groupRole = accessibilityOptionRole === 'radio' ? 'radiogroup' : 'tablist';

  return (
    <View
      accessible={false}
      accessibilityRole={groupRole}
      accessibilityLabel={accessibilityLabel}
      style={[styles.wrapper, style]}
      testID={testID}>
      {options.map(option => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole={accessibilityOptionRole}
            accessibilityLabel={option.accessibilityLabel ?? option.label}
            accessibilityState={
              accessibilityOptionRole === 'radio'
                ? {disabled, checked: selected}
                : {disabled, selected}
            }
            disabled={disabled}
            onPress={() => onChange(option.value)}
            style={({pressed}) => [
              styles.segment,
              selected && styles.selected,
              disabled && styles.disabled,
              pressed && !disabled && styles.pressed,
            ]}>
            <Text
              allowFontScaling={textDefaults.allowFontScaling}
              style={[styles.label, selected && styles.selectedLabel]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    minHeight: touchTarget.comfortable,
    flexDirection: 'row',
    padding: spacing.xxs,
    borderRadius: radius.lg,
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
    backgroundColor: colors.surfaceBase,
    gap: spacing.xxs,
  },
  segment: {
    flex: 1,
    minHeight: touchTarget.minimum,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  selected: {backgroundColor: colors.flameRedAccessible},
  disabled: {opacity: 0.48},
  pressed: {opacity: 0.82},
  label: {
    color: colors.textPrimary,
    fontSize: typography.button,
    fontWeight: fontWeight.semibold,
    textAlign: 'center',
  },
  selectedLabel: {color: colors.white},
});
