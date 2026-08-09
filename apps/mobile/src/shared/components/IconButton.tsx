import React from 'react';
import {Pressable, StyleProp, StyleSheet, ViewStyle} from 'react-native';
import {
  borderWidth,
  colors,
  iconSize,
  radius,
  touchTarget,
} from '../../design/tokens';
import {useReducedMotionPreference} from '../../design/reducedMotion';
import {Icon, IconName} from './Icon';
import {LoadingIndicator} from './LoadingIndicator';

export interface IconButtonProps {
  icon: IconName;
  accessibilityLabel: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'plain' | 'surface' | 'primary';
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function IconButton({
  icon,
  accessibilityLabel,
  onPress,
  disabled = false,
  loading = false,
  variant = 'plain',
  style,
  testID,
}: IconButtonProps) {
  const reduceMotion = useReducedMotionPreference();
  const blocked = disabled || loading;
  const foreground = variant === 'primary' ? colors.white : colors.espressoBrown;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{disabled: blocked, busy: loading}}
      disabled={blocked}
      onPress={onPress}
      testID={testID}
      style={({pressed}) => [
        styles.base,
        variant === 'surface' && styles.surface,
        variant === 'primary' && styles.primary,
        blocked && styles.disabled,
        pressed && !blocked && styles.pressed,
        pressed && !blocked && !reduceMotion && styles.pressedMotion,
        style,
      ]}>
      {loading ? (
        <LoadingIndicator
          accessible={false}
          accessibilityLabel={`${accessibilityLabel} in progress`}
          color={foreground}
        />
      ) : (
        <Icon name={icon} size={iconSize.md} color={foreground} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    width: touchTarget.minimum,
    height: touchTarget.minimum,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  surface: {
    backgroundColor: colors.surfaceBase,
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
  },
  primary: {backgroundColor: colors.flameRed},
  disabled: {opacity: 0.48},
  pressed: {opacity: 0.82},
  pressedMotion: {transform: [{scale: 0.96}]},
});
