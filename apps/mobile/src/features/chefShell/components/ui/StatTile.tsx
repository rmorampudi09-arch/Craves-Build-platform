import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {
  borderWidth,
  colors,
  fontWeight,
  radius,
  spacing,
  textDefaults,
  typography,
} from '../../../../design/tokens';

export interface StatTileProps {
  value: string | number;
  label: string;
  trend?: {text: string; direction: 'up' | 'down'};
  onPress?: () => void;
}

/** Big number with a small label and an optional green (up) or red (down) trend line. */
export function StatTile({value, label, trend, onPress}: StatTileProps) {
  const body = (
    <>
      <Text
        adjustsFontSizeToFit
        allowFontScaling={textDefaults.allowFontScaling}
        minimumFontScale={0.7}
        numberOfLines={1}
        style={styles.value}>
        {value}
      </Text>
      <Text allowFontScaling={textDefaults.allowFontScaling} numberOfLines={2} style={styles.label}>
        {label}
      </Text>
      {trend ? (
        <Text
          allowFontScaling={textDefaults.allowFontScaling}
          numberOfLines={1}
          style={[styles.trend, trend.direction === 'up' ? styles.up : styles.down]}>
          {trend.text}
        </Text>
      ) : null}
    </>
  );
  if (!onPress) {
    return <View style={styles.tile}>{body}</View>;
  }
  return (
    <Pressable
      accessibilityLabel={`${value}, ${label}${trend ? `, ${trend.text}` : ''}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({pressed}) => [styles.tile, pressed && styles.pressed]}>
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  pressed: {opacity: 0.85},
  value: {color: colors.textPrimary, fontSize: typography.hero, fontWeight: fontWeight.extrabold},
  label: {color: colors.textSecondary, fontSize: typography.small},
  trend: {marginTop: spacing.xxs, fontSize: typography.small, fontWeight: fontWeight.bold},
  up: {color: colors.successText},
  down: {color: colors.flameRedAccessible},
});
