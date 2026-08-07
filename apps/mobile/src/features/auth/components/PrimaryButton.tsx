import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import {
  borderWidth,
  colors,
  elevation,
  iconSize,
  radius,
  spacing,
  textDefaults,
  touchTarget,
  typography,
} from '../../../design/tokens';
import {Icon, IconName} from '../../../shared/components/Icon';

interface Props {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'outline';
  style?: ViewStyle;
  leftIcon?: IconName;
  rightIcon?: IconName;
}

export function PrimaryButton({
  label,
  onPress,
  loading = false,
  disabled = false,
  variant = 'primary',
  style,
  leftIcon,
  rightIcon,
}: Props) {
  const off = disabled || loading;
  const foreground = variant === 'primary' ? colors.white : colors.flameRed;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{disabled: off, busy: loading}}
      disabled={off}
      onPress={onPress}
      style={({pressed}) => [
        styles.base,
        variant === 'primary' ? styles.primary : styles.outline,
        off && styles.disabled,
        pressed && !off && styles.pressed,
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={foreground} />
      ) : (
        <View style={styles.row}>
          {leftIcon ? (
            <Icon name={leftIcon} size={iconSize.sm} color={foreground} />
          ) : null}
          <Text
            allowFontScaling={textDefaults.allowFontScaling}
            style={[
              styles.label,
              variant === 'outline' && styles.outlineLabel,
            ]}>
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
    marginTop: spacing.md,
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
  disabled: {opacity: 0.48},
  pressed: {transform: [{scale: 0.985}], opacity: 0.92},
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    width: '100%',
  },
  label: {
    fontSize: typography.button,
    fontWeight: '600',
    color: colors.white,
  },
  outlineLabel: {color: colors.flameRed},
});
