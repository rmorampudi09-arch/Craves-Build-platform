import React from 'react';
import {StyleProp, StyleSheet, Text, View, ViewStyle} from 'react-native';
import {
  colors,
  fontWeight,
  radius,
  spacing,
  textDefaults,
  typography,
} from '../../design/tokens';

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'error' | 'info';

export interface BadgeProps {
  label: string;
  tone?: BadgeTone;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function Badge({
  label,
  tone = 'neutral',
  accessibilityLabel,
  style,
  testID,
}: BadgeProps) {
  return (
    <View
      accessible
      accessibilityLabel={accessibilityLabel ?? label}
      style={[styles.base, toneStyles[tone], style]}
      testID={testID}>
      <Text
        allowFontScaling={textDefaults.allowFontScaling}
        style={[styles.label, toneTextStyles[tone]]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignSelf: 'flex-start',
    minHeight: 28,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: typography.small,
    fontWeight: fontWeight.semibold,
  },
});

const toneStyles = StyleSheet.create({
  neutral: {backgroundColor: colors.surfaceMuted},
  success: {backgroundColor: '#E8F7F1'},
  warning: {backgroundColor: '#FFF4DF'},
  error: {backgroundColor: '#FDEAE8'},
  info: {backgroundColor: '#EAF0FF'},
});

const toneTextStyles = StyleSheet.create({
  neutral: {color: colors.textPrimary},
  success: {color: colors.success},
  warning: {color: colors.warning},
  error: {color: colors.error},
  info: {color: colors.info},
});
