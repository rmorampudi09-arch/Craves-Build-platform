// Small flat building blocks for rider screens: surface cards on the ground colour, no shadows (DESIGN.md).
import React, {PropsWithChildren, ReactNode, useEffect, useState} from 'react';
import {Keyboard, ScrollView, StyleProp, Text, View, ViewStyle} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {borderWidth, font, radius, spacing, themedStyles, typography} from '../theme';
import {elevation} from '../../../design/tokens';
import {formatRupees} from '../domain/format';

/** True while the soft keyboard is up; always false unless `enabled`. */
function useKeyboardShown(enabled: boolean) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!enabled) {
      return undefined;
    }
    const show = Keyboard.addListener('keyboardDidShow', () => setShown(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setShown(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, [enabled]);
  return shown;
}

/**
 * Header on top, scrolling content, and an optional footer pinned where the thumb rests.
 * `keyboardHidesFooter` drops the footer while the keyboard is up, so a form's fields and button keep the room; never
 * set it where the footer holds the step the rider is typing for.
 */
export function RiderScreen({
  header,
  footer,
  keyboardHidesFooter = false,
  children,
  testID,
  style,
}: PropsWithChildren<{header?: ReactNode; footer?: ReactNode; keyboardHidesFooter?: boolean; testID?: string; style?: StyleProp<ViewStyle>}>) {
  const keyboardShown = useKeyboardShown(keyboardHidesFooter);
  return (
    <SafeAreaView edges={['top', 'bottom']} style={[styles.screen, style]} testID={testID}>
      {header}
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
      {footer && !keyboardShown ? <View style={styles.footer}>{footer}</View> : null}
    </SafeAreaView>
  );
}

/** A surface card, radius 20, no line, no shadow. Never put a card inside a card. */
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

export const riderStyles = themedStyles(() => ({
  gap: {gap: spacing.sm},
  rowGap: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs},
  half: {flex: 1},
}));

const styles = themedStyles(c => ({
  // Surface cards on a warm ground, no lines and no shadow: the card itself is the edge.
  screen: {flex: 1, backgroundColor: c.ground},
  content: {padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl},
  footer: {
    padding: spacing.md,
    gap: spacing.xs,
    borderTopWidth: borderWidth.standard,
    borderTopColor: c.border,
    backgroundColor: c.surface,
  },
  card: {
    padding: spacing.md,
    gap: spacing.xs,
    borderRadius: radius.lg,
    backgroundColor: c.surface,
    ...elevation.none,
  },
  hero: {borderRadius: 24, borderWidth: borderWidth.strong, borderColor: c.textPrimary},
  title: {fontSize: typography.hero, fontFamily: font.bold, color: c.textPrimary},
  label: {fontFamily: font.semibold, fontSize: typography.small, color: c.textSecondary},
  value: {fontSize: typography.heading, fontFamily: font.semibold, color: c.textPrimary},
  body: {fontFamily: font.regular, fontSize: typography.body, color: c.textPrimary},
  money: {fontSize: typography.money, fontFamily: font.display, color: c.textPrimary, fontVariant: ['tabular-nums']},
  row: {flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm},
  rowDivider: {paddingTop: spacing.xs, borderTopWidth: borderWidth.standard, borderTopColor: c.border},
  rowLabel: {flex: 1, color: c.textSecondary},
  rowTotal: {color: c.textPrimary, fontFamily: font.bold},
  rowValue: {flexShrink: 1, fontFamily: font.bold, textAlign: 'right', fontVariant: ['tabular-nums']},
}));
