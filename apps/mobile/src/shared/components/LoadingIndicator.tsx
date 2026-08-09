import React from 'react';
import {
  ActivityIndicator,
  ActivityIndicatorProps,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import {useReducedMotionPreference} from '../../design/reducedMotion';
import {
  borderWidth,
  colors,
  fontWeight,
  radius,
  spacing,
  textDefaults,
  typography,
} from '../../design/tokens';

export interface LoadingIndicatorProps {
  accessible?: boolean;
  accessibilityLabel?: string;
  label?: string;
  color?: string;
  size?: ActivityIndicatorProps['size'];
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function LoadingIndicator({
  accessible = true,
  accessibilityLabel = 'Loading',
  label,
  color = colors.flameRed,
  size = 'small',
  style,
  testID,
}: LoadingIndicatorProps) {
  const reduceMotionEnabled = useReducedMotionPreference();
  const staticIndicatorSize =
    typeof size === 'number'
      ? size
      : size === 'large'
        ? spacing.xl
        : spacing.lg;

  return (
    <View
      accessible={accessible}
      accessibilityElementsHidden={!accessible}
      accessibilityRole={accessible ? 'progressbar' : undefined}
      accessibilityLabel={accessible ? accessibilityLabel : undefined}
      accessibilityLiveRegion={accessible ? 'polite' : 'none'}
      accessibilityState={accessible ? {busy: true} : undefined}
      importantForAccessibility={accessible ? 'yes' : 'no-hide-descendants'}
      style={[styles.row, style]}
      testID={testID}>
      {reduceMotionEnabled ? (
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[
            styles.staticIndicator,
            {
              borderColor: color,
              height: staticIndicatorSize,
              width: staticIndicatorSize,
            },
          ]}
        />
      ) : (
        <ActivityIndicator
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          color={color}
          size={size}
        />
      )}
      {label ? (
        <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.label}>
          {label}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  staticIndicator: {
    borderRadius: radius.pill,
    borderWidth: borderWidth.emphasis,
    opacity: 0.72,
  },
  label: {
    color: colors.textSecondary,
    fontSize: typography.small,
    fontWeight: fontWeight.medium,
  },
});
