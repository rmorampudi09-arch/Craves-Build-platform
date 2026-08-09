import React, {ReactNode} from 'react';
import {Pressable, StyleProp, StyleSheet, ViewStyle} from 'react-native';
import {
  borderWidth,
  colors,
  elevation,
  radius,
  spacing,
  touchTarget,
} from '../../design/tokens';
import {useReducedMotionPreference} from '../../design/reducedMotion';

export interface PressableCardProps {
  children: ReactNode;
  onPress: () => void;
  accessibilityLabel: string;
  accessibilityHint?: string;
  disabled?: boolean;
  selected?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function PressableCard({
  children,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  disabled = false,
  selected,
  style,
  testID,
}: PressableCardProps) {
  const reduceMotion = useReducedMotionPreference();
  const selectable = selected !== undefined;
  const isSelected = selected ?? false;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={
        selectable ? {disabled, selected: isSelected} : {disabled}
      }
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={({pressed}) => [
        styles.base,
        isSelected && styles.selected,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
        pressed && !disabled && !reduceMotion && styles.pressedMotion,
        style,
      ]}>
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: touchTarget.minimum,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
    backgroundColor: colors.surfaceBase,
    ...elevation.card,
  },
  selected: {
    borderColor: colors.flameRed,
    borderWidth: borderWidth.strong,
  },
  disabled: {opacity: 0.48},
  pressed: {opacity: 0.9, backgroundColor: colors.surfaceMuted},
  pressedMotion: {transform: [{scale: 0.99}]},
});
