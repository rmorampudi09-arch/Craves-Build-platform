// Small flat building blocks for rider screens: white surfaces, 1 px borders, no shadows.
import React, {PropsWithChildren, ReactNode} from 'react';
import {ScrollView, StyleProp, StyleSheet, Text, View, ViewStyle} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {borderWidth, colors, elevation, fontWeight, radius, spacing, typography} from '../../../design/tokens';
import {formatRupees} from '../domain/format';

/** Header on top, scrolling content, and an optional footer pinned where the thumb rests. */
export function RiderScreen({
  header,
  footer,
  children,
  testID,
}: PropsWithChildren<{header?: ReactNode; footer?: ReactNode; testID?: string}>) {
  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.screen} testID={testID}>
      {header}
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </SafeAreaView>
  );
}

export function Card({children, style}: PropsWithChildren<{style?: StyleProp<ViewStyle>}>) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Title({children}: PropsWithChildren) {
  return (
    <Text accessibilityRole="header" style={styles.title}>
      {children}
    </Text>
  );
}

export function Label({children}: PropsWithChildren) {
  return <Text style={styles.label}>{children}</Text>;
}

export function Value({children}: PropsWithChildren) {
  return <Text style={styles.value}>{children}</Text>;
}

export function Body({children}: PropsWithChildren) {
  return <Text style={styles.body}>{children}</Text>;
}

export function Money({paise, testID}: {paise: number; testID?: string}) {
  return (
    <Text style={styles.money} testID={testID}>
      {formatRupees(paise)}
    </Text>
  );
}

export function Row({label, value}: {label: string; value: string}) {
  return (
    <View style={styles.row}>
      <Text style={[styles.body, styles.rowLabel]}>{label}</Text>
      <Text style={[styles.body, styles.rowValue]}>{value}</Text>
    </View>
  );
}

export const riderStyles = StyleSheet.create({
  gap: {gap: spacing.sm},
  rowGap: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs},
  half: {flex: 1},
});

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.surfaceBase},
  content: {padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl},
  footer: {
    padding: spacing.md,
    gap: spacing.xs,
    borderTopWidth: borderWidth.standard,
    borderTopColor: colors.border,
    backgroundColor: colors.surfaceBase,
  },
  card: {
    padding: spacing.md,
    gap: spacing.xs,
    borderRadius: radius.md,
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
    backgroundColor: colors.surfaceBase,
    ...elevation.none,
  },
  title: {fontSize: typography.hero, fontWeight: fontWeight.bold, color: colors.textPrimary},
  label: {fontSize: typography.small, color: colors.textSecondary},
  value: {fontSize: typography.heading, fontWeight: fontWeight.semibold, color: colors.textPrimary},
  body: {fontSize: typography.body, color: colors.textPrimary},
  money: {fontSize: typography.title, fontWeight: fontWeight.bold, color: colors.textPrimary},
  row: {flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm},
  rowLabel: {flex: 1, color: colors.textSecondary},
  rowValue: {fontWeight: fontWeight.semibold, textAlign: 'right'},
});
