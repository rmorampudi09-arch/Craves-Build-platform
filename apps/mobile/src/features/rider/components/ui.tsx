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

/** White, 1 dp border, radius 14, no shadow. Never put a card inside a card. */
export function Card({children, style}: PropsWithChildren<{style?: StyleProp<ViewStyle>}>) {
  return <View style={[styles.card, style]}>{children}</View>;
}

/** At most one per screen, for the thing the rider came for: the order code, the money to withdraw, a person to talk to. */
export function HeroCard({children, style}: PropsWithChildren<{style?: StyleProp<ViewStyle>}>) {
  return <View style={[styles.card, styles.hero, style]}>{children}</View>;
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

/** Label on the left, bold value on the right (may wrap). `divider` draws a line above it; `total` is the closing bold row. */
export function RateRow({label, value, divider, total}: {label: string; value: string; divider?: boolean; total?: boolean}) {
  return (
    <View style={[styles.row, (divider || total) && styles.rowDivider]}>
      <Text style={[styles.body, styles.rowLabel, total && styles.rowTotal]}>{label}</Text>
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
  hero: {borderRadius: radius.lg, borderColor: colors.textPrimary},
  title: {fontSize: typography.hero, fontWeight: fontWeight.bold, color: colors.textPrimary},
  label: {fontSize: typography.small, color: colors.textSecondary},
  value: {fontSize: typography.heading, fontWeight: fontWeight.semibold, color: colors.textPrimary},
  body: {fontSize: typography.body, color: colors.textPrimary},
  money: {fontSize: typography.title, fontWeight: fontWeight.bold, color: colors.textPrimary, fontVariant: ['tabular-nums']},
  row: {flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm},
  rowDivider: {paddingTop: spacing.xs, borderTopWidth: borderWidth.standard, borderTopColor: colors.border},
  rowLabel: {flex: 1, color: colors.textSecondary},
  rowTotal: {color: colors.textPrimary, fontWeight: fontWeight.bold},
  rowValue: {flexShrink: 1, fontWeight: fontWeight.bold, textAlign: 'right'},
});
