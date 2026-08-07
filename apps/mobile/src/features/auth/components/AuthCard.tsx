import React, {PropsWithChildren} from 'react';
import {StyleSheet, View} from 'react-native';
import {colors, radius, spacing} from '../../../design/tokens';

export function AuthCard({children}: PropsWithChildren) {
  return <View style={styles.card}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {backgroundColor: colors.white, borderRadius: radius.xl, padding: spacing.xl, borderWidth: 1, borderColor: colors.border, shadowColor: colors.espresso, shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: {width: 0, height: 6}, elevation: 4},
});
