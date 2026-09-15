import React, {PropsWithChildren} from 'react';
import {StyleSheet, View} from 'react-native';
import {
  borderWidth,
  colors,
  elevation,
  radius,
  spacing,
} from '../../../design/tokens';

export function AuthCard({children}: PropsWithChildren) {
  return <View style={styles.card}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surfaceBase,
    borderRadius: radius.xl,
    padding: spacing.xl,
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
    ...elevation.card,
  },
});
