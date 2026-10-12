import React from 'react';
import {Pressable, StyleProp, StyleSheet, View, ViewStyle} from 'react-native';
import {borderWidth, colors, radius, spacing} from '../../../../design/tokens';

export interface ChefCardProps {
  children?: React.ReactNode;
  onPress?: () => void;
  /** Red outline for the card that needs the chef's attention. */
  highlighted?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

/** White card with a 1 px line; a Pressable button only when it has onPress. */
export function ChefCard({children, onPress, highlighted, accessibilityLabel, style}: ChefCardProps) {
  // The line turns red and a second red line is drawn inside it, so `highlighted` never moves the content.
  const outline = highlighted ? <View pointerEvents="none" style={styles.outline} /> : null;
  if (!onPress) {
    return (
      <View style={[styles.card, highlighted && styles.highlighted, style]}>
        {children}
        {outline}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      onPress={onPress}
      style={({pressed}) => [styles.card, highlighted && styles.highlighted, pressed && styles.pressed, style]}>
      {children}
      {outline}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  highlighted: {borderColor: colors.flameRed},
  pressed: {opacity: 0.85},
  outline: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderRadius: radius.md - borderWidth.standard,
    borderWidth: borderWidth.standard,
    borderColor: colors.flameRed,
  },
});
