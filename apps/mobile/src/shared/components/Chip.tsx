import React from 'react';
import {Pressable, StyleProp, StyleSheet, Text, ViewStyle} from 'react-native';
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
import {useReducedMotionPreference} from '../../design/reducedMotion';

export interface ChipProps {
  label: string;
  selected?: boolean;
  disabled?: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function Chip({
  label,
  selected = false,
  disabled = false,
  onPress,
  accessibilityLabel,
  style,
  testID,
}: ChipProps) {
  const reduceMotion = useReducedMotionPreference();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{disabled, selected}}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={({pressed}) => [
        styles.base,
        selected && styles.selected,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
        pressed && !disabled && !reduceMotion && styles.pressedMotion,
        style,
      ]}>
      <Text
        allowFontScaling={textDefaults.allowFontScaling}
        style={[styles.label, selected && styles.selectedLabel]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: touchTarget.minimum,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: borderWidth.standard,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceBase,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selected: {
    borderColor: colors.flameRed,
    backgroundColor: colors.flameRed,
  },
  disabled: {opacity: 0.48},
  pressed: {opacity: 0.84},
  pressedMotion: {transform: [{scale: 0.98}]},
  label: {
    color: colors.textPrimary,
    fontSize: typography.small,
    fontWeight: fontWeight.semibold,
  },
  selectedLabel: {color: colors.white},
});
