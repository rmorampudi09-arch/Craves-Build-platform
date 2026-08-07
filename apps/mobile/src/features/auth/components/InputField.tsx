import React, {useState} from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
} from 'react-native';
import {
  borderWidth,
  colors,
  iconSize,
  radius,
  spacing,
  textDefaults,
  touchTarget,
  typography,
} from '../../../design/tokens';
import {Icon, IconName} from '../../../shared/components/Icon';

interface Props extends TextInputProps {
  icon?: IconName;
  leftIcon?: IconName;
  rightIcon?: IconName;
  onRightIconPress?: () => void;
  prefix?: string;
  error?: string;
}

export function InputField({
  icon,
  leftIcon,
  rightIcon,
  onRightIconPress,
  prefix,
  error,
  onFocus,
  onBlur,
  ...props
}: Props) {
  const [focused, setFocused] = useState(false);
  const shownIcon = leftIcon ?? icon;

  return (
    <View style={styles.group}>
      <View
        style={[
          styles.field,
          focused && styles.focused,
          Boolean(error) && styles.errorBorder,
        ]}>
        {shownIcon ? (
          <Icon
            name={shownIcon}
            size={iconSize.sm}
            color={focused ? colors.flameRed : colors.textSecondary}
          />
        ) : null}
        {prefix ? <Text style={styles.prefix}>{prefix}</Text> : null}
        <TextInput
          {...props}
          allowFontScaling={textDefaults.allowFontScaling}
          placeholderTextColor={colors.placeholder}
          style={styles.input}
          onFocus={event => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={event => {
            setFocused(false);
            onBlur?.(event);
          }}
        />
        {rightIcon ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              rightIcon === 'eye' ? 'Show password' : 'Hide password'
            }
            hitSlop={spacing.sm}
            onPress={onRightIconPress}>
            <Icon name={rightIcon} />
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <Text accessibilityRole="alert" style={styles.errorText}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  group: {marginTop: spacing.sm},
  field: {
    minHeight: touchTarget.comfortable,
    borderWidth: borderWidth.standard,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
    backgroundColor: colors.surfaceBase,
  },
  focused: {
    borderColor: colors.flameRed,
    borderWidth: borderWidth.focus,
  },
  errorBorder: {borderColor: colors.error},
  input: {
    flex: 1,
    color: colors.ink,
    fontSize: typography.body,
    paddingVertical: spacing.none,
  },
  prefix: {
    fontSize: typography.body,
    fontWeight: '600',
    color: colors.ink,
  },
  errorText: {
    color: colors.error,
    fontSize: typography.small,
    marginTop: spacing.xs,
    marginLeft: spacing.xxs,
  },
});
