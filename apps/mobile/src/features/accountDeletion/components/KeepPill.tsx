import React from 'react';
import {Pressable, StyleSheet, Text} from 'react-native';
import {colors, fontWeight, radius, spacing, typography} from '../../../design/tokens';
import {deletionCopy} from '../domain/deletionCopy';

/** The white Keep my account pill, shared by the strip above every screen and the paused-order notice. */
export function KeepPill({keeping, onPress}: {keeping: boolean; onPress: () => void}) {
  return (
    <Pressable
      accessibilityLabel={deletionCopy.banner.keep}
      accessibilityRole="button"
      accessibilityState={{disabled: keeping, busy: keeping}}
      disabled={keeping}
      hitSlop={{top: 8, bottom: 8, left: 4, right: 4}}
      onPress={onPress}
      style={[styles.pill, keeping && styles.pillBusy]}>
      <Text style={styles.pillText}>{deletionCopy.banner.keep}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    backgroundColor: colors.white,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs + 2,
  },
  pillBusy: {opacity: 0.6},
  pillText: {
    color: colors.flameRedAccessible,
    fontSize: typography.small,
    fontWeight: fontWeight.semibold,
  },
});
