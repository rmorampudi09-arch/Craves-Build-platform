import React, { forwardRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { Icon, type IconName } from '../../../shared/components/Icon';
import { colors, spacing, touchTarget } from '../../../design/tokens';

interface Props extends TextInputProps {
  label: string;
  prefix?: string;
  leftIcon?: IconName;
  rightIcon?: IconName;
  rightIconAccessibilityLabel?: string;
  onRightIconPress?: () => void;
  error?: string;
  disabled?: boolean;
}

export const AuthTextField = forwardRef<TextInput, Props>(
  function AuthTextFieldInput(
    {
      label,
      prefix,
      leftIcon,
      rightIcon,
      rightIconAccessibilityLabel,
      onRightIconPress,
      error,
      disabled,
      onFocus,
      onBlur,
      style,
      ...props
    },
    ref,
  ) {
    const [focused, setFocused] = useState(false);
    return (
      <View>
        <Text style={styles.label}>{label}</Text>
        <View
          style={[
            styles.field,
            focused && styles.focused,
            Boolean(error) && styles.errorBorder,
            disabled && styles.disabled,
          ]}
        >
          {leftIcon ? (
            <Icon
              name={leftIcon}
              size={20}
              surface={false}
              color={colors.textSecondary}
            />
          ) : null}
          {prefix ? <Text style={styles.prefix}>{prefix}</Text> : null}
          <TextInput
            {...props}
            ref={ref}
            editable={!disabled && props.editable !== false}
            accessibilityLabel={props.accessibilityLabel ?? label}
            accessibilityState={{ disabled: Boolean(disabled) }}
            placeholderTextColor={colors.placeholder}
            selectionColor={colors.flameRedAccessible}
            style={[styles.input, style]}
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
            <Pressable
              onPress={onRightIconPress}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityLabel={rightIconAccessibilityLabel}
              style={styles.rightIcon}
            >
              <Icon
                name={rightIcon}
                size={22}
                surface={false}
                color={colors.textSecondary}
              />
            </Pressable>
          ) : null}
        </View>
        {error ? (
          <Text
            accessibilityRole="alert"
            accessibilityLiveRegion="assertive"
            style={styles.error}
          >
            {error}
          </Text>
        ) : null}
      </View>
    );
  },
);

const styles = StyleSheet.create({
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.ink,
    marginBottom: 6,
  },
  field: {
    minHeight: touchTarget.minimum,
    backgroundColor: '#F8F9FB',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#DDE0E6',
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: spacing.md,
    paddingRight: 4,
    gap: spacing.sm,
  },
  focused: { borderColor: colors.flameRedAccessible },
  errorBorder: { borderColor: colors.error },
  prefix: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.ink,
    paddingRight: spacing.sm,
    borderRightWidth: 1,
    borderRightColor: '#DDE0E6',
  },
  input: {
    flex: 1,
    minWidth: 0,
    minHeight: touchTarget.minimum,
    color: colors.ink,
    fontSize: 16,
    paddingVertical: spacing.xs,
  },
  rightIcon: {
    width: touchTarget.minimum,
    height: touchTarget.minimum,
    alignItems: 'center',
    justifyContent: 'center',
  },
  error: { color: colors.error, fontSize: 13, marginTop: 6 },
  disabled: { opacity: 0.56 },
});
