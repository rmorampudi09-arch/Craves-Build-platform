import React from 'react';
import {
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import {
  borderWidth,
  colors,
  elevation,
  fontWeight,
  iconSize,
  radius,
  spacing,
  textDefaults,
  touchTarget,
  typography,
} from '../../design/tokens';
import {useReducedMotionPreference} from '../../design/reducedMotion';
import {Icon, IconName} from './Icon';
import {LoadingIndicator} from './LoadingIndicator';

export type ButtonVariant = 'primary' | 'outline' | 'ghost';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: ButtonVariant;
  style?: StyleProp<ViewStyle>;
  leftIcon?: IconName;
  rightIcon?: IconName;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
}

export function Button({
  label,
  onPress,
  loading = false,
  disabled = false,
  variant = 'primary',
  style,
  leftIcon,
  rightIcon,
  accessibilityLabel,
  accessibilityHint,
  testID,
}: ButtonProps) {
  const reduceMotion = useReducedMotionPreference();
  const blocked = disabled || loading;
  const foreground =
    variant === 'primary' ? colors.white : colors.flameRed;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{disabled: blocked, busy: loading}}
      disabled={blocked}
      testID={testID}
      onPress={onPress}
      style={({pressed}) => [
        styles.base,
        variant === 'primary' && styles.primary,
        variant === 'outline' && styles.outline,
        variant === 'ghost' && styles.ghost,
        blocked && styles.disabled,
        pressed && !blocked && styles.pressed,
        pressed && !blocked && !reduceMotion && styles.pressedMotion,
        style,
      ]}>
      {loading ? (
        <LoadingIndicator
          accessibilityLabel={`${label} in progress`}
          color={foreground}
          size="small"
        />
      ) : (
        <View style={styles.row}>
          {leftIcon ? (
            <Icon name={leftIcon} size={iconSize.sm} color={foreground} />
          ) : null}
          <Text
            allowFontScaling={textDefaults.allowFontScaling}
            style={[styles.label, variant !== 'primary' && styles.altLabel]}>
            {label}
          </Text>
          {rightIcon ? (
            <Icon
              name={rightIcon === 'chevron' ? 'chevron-right' : rightIcon}
              size={iconSize.sm}
              color={foreground}
            />
          ) : null}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: touchTarget.comfortable,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  primary: {
    backgroundColor: colors.flameRed,
    ...elevation.primaryAction,
  },
  outline: {
    backgroundColor: colors.surfaceBase,
    borderWidth: borderWidth.standard,
    borderColor: colors.flameRed,
  },
  ghost: {
    backgroundColor: 'transparent',
  },
  disabled: {
    opacity: 0.48,
  },
  pressed: {
    opacity: 0.9,
  },
  pressedMotion: {
    transform: [{scale: 0.985}],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    width: '100%',
  },
  label: {
    fontSize: typography.button,
    fontWeight: fontWeight.semibold,
    color: colors.white,
  },
  altLabel: {
    color: colors.flameRed,
  },
});
