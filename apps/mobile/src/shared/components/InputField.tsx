import React, {useState} from 'react';
import {
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import {
  borderWidth,
  colors,
  fontWeight,
  iconSize,
  radius,
  spacing,
  textDefaults,
  touchTarget,
  typography,
} from '../../design/tokens';
import {Icon, IconName} from './Icon';
import {IconButton} from './IconButton';

export interface InputFieldProps extends TextInputProps {
  label?: string;
  icon?: IconName;
  leftIcon?: IconName;
  rightIcon?: IconName;
  rightIconAccessibilityLabel?: string;
  onRightIconPress?: () => void;
  prefix?: string;
  error?: string;
  helperText?: string;
  disabled?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
}

export function InputField({
  label,
  icon,
  leftIcon,
  rightIcon,
  rightIconAccessibilityLabel,
  onRightIconPress,
  prefix,
  error,
  helperText,
  disabled = false,
  containerStyle,
  inputStyle,
  onFocus,
  onBlur,
  editable,
  accessibilityLabel,
  ...props
}: InputFieldProps) {
  const [focused, setFocused] = useState(false);
  const shownIcon = leftIcon ?? icon;
  const rightLabel =
    rightIconAccessibilityLabel ??
    (rightIcon === 'eye'
      ? 'Show password'
      : rightIcon === 'eye-off'
        ? 'Hide password'
        : 'Input action');

  return (
    <View style={containerStyle}>
      {label ? (
        <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.label}>
          {label}
        </Text>
      ) : null}
      <View
        style={[
          styles.field,
          focused && styles.focused,
          Boolean(error) && styles.errorBorder,
          disabled && styles.disabled,
        ]}>
        {shownIcon ? (
          <Icon
            name={shownIcon}
            size={iconSize.sm}
            color={focused ? colors.flameRed : colors.textSecondary}
          />
        ) : null}
        {prefix ? (
          <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.prefix}>
            {prefix}
          </Text>
        ) : null}
        <TextInput
          {...props}
          accessibilityLabel={accessibilityLabel ?? label}
          accessibilityState={{disabled}}
          allowFontScaling={textDefaults.allowFontScaling}
          editable={editable ?? !disabled}
          placeholderTextColor={colors.placeholder}
          style={[styles.input, inputStyle]}
          onFocus={event => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={event => {
            setFocused(false);
            onBlur?.(event);
          }}
        />
        {rightIcon && onRightIconPress ? (
          <IconButton
            accessibilityLabel={rightLabel}
            icon={rightIcon}
            onPress={onRightIconPress}
            disabled={disabled}
          />
        ) : rightIcon ? (
          <Icon name={rightIcon} size={iconSize.sm} color={colors.textSecondary} />
        ) : null}
      </View>
      {error ? (
        <Text
          accessibilityLiveRegion="assertive"
          accessibilityRole="alert"
          allowFontScaling={textDefaults.allowFontScaling}
          style={styles.errorText}>
          {error}
        </Text>
      ) : helperText ? (
        <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.helperText}>
          {helperText}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    marginBottom: spacing.xs,
    color: colors.textPrimary,
    fontSize: typography.small,
    fontWeight: fontWeight.semibold,
  },
  field: {
    minHeight: touchTarget.comfortable,
    borderWidth: borderWidth.standard,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: spacing.md,
    paddingRight: spacing.xxs,
    gap: spacing.sm,
    backgroundColor: colors.surfaceBase,
  },
  focused: {
    borderColor: colors.flameRed,
    borderWidth: borderWidth.focus,
  },
  errorBorder: {borderColor: colors.error},
  disabled: {opacity: 0.56, backgroundColor: colors.surfaceMuted},
  input: {
    flex: 1,
    minHeight: touchTarget.minimum,
    color: colors.ink,
    fontSize: typography.body,
    paddingVertical: spacing.none,
  },
  prefix: {
    fontSize: typography.body,
    fontWeight: fontWeight.semibold,
    color: colors.ink,
  },
  errorText: {
    color: colors.error,
    fontSize: typography.small,
    marginTop: spacing.xs,
    marginLeft: spacing.xxs,
  },
  helperText: {
    color: colors.textSecondary,
    fontSize: typography.small,
    marginTop: spacing.xs,
    marginLeft: spacing.xxs,
  },
});
