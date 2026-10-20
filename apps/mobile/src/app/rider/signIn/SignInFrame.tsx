import React, {PropsWithChildren, ReactNode, useState} from 'react';
import {ScrollView, StyleSheet, Text, TextInput, TextInputProps, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Icon} from '../../../shared/components';
import {borderWidth, colors, fontWeight, iconSize, radius, spacing, typography} from '../../../design/tokens';
import {Banner} from '../../../features/rider/components/Banner';
import {useStrings} from '../../../features/rider/strings/StringsProvider';

/**
 * Both sign-in steps (docs/riders/SCREENS.md 1): no rider header, the brand row on top,
 * and the no-fee warning pushed down to sit just above the pinned action.
 */
export function SignInFrame({footer, testID, children}: PropsWithChildren<{footer: ReactNode; testID: string}>) {
  const {strings} = useStrings();
  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.screen} testID={testID}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.brand}>
          <View style={styles.logo}>
            <Icon name="moped" size={iconSize.lg} color={colors.white} surface={false} />
          </View>
          <Text style={styles.brandName}>{strings.signIn.brand}</Text>
        </View>
        {children}
        <View style={styles.push} />
        <Banner tone="warning" icon="shield-alert-outline" text={strings.signIn.noFee} />
      </ScrollView>
      <View style={styles.footer}>{footer}</View>
    </SafeAreaView>
  );
}

/** The 56 dp field: a dark 1 dp line while focused, digits at 24 sp bold. */
export function SignInField({
  label,
  prefix,
  error,
  tracking = 6,
  ...input
}: TextInputProps & {label: string; prefix?: string; error?: string; tracking?: number}) {
  const [focused, setFocused] = useState(false);
  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.box, focused && styles.boxFocused]}>
        {prefix ? <Text style={[styles.value, styles.prefix]}>{prefix}</Text> : null}
        <TextInput
          accessibilityLabel={label}
          {...input}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholderTextColor={colors.placeholder}
          style={[styles.value, styles.input, {letterSpacing: tracking}]}
        />
      </View>
      {error ? (
        <Text accessibilityLiveRegion="polite" style={styles.error}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

export const signInStyles = StyleSheet.create({
  line: {marginTop: -spacing.xs, fontSize: typography.body, color: colors.textSecondary},
});

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.white},
  content: {flexGrow: 1, gap: spacing.md, padding: spacing.md, paddingTop: spacing.xxl},
  brand: {flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.xs},
  logo: {
    width: 40,
    height: 40,
    // ≈12 in 01-SignIn.png, between radius.sm and radius.md.
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.flameRedAccessible,
  },
  brandName: {fontSize: typography.heading, fontWeight: fontWeight.bold, color: colors.textPrimary},
  label: {
    marginTop: spacing.xs,
    marginBottom: spacing.xs,
    fontSize: typography.small,
    fontWeight: fontWeight.bold,
    color: colors.textSecondary,
  },
  box: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: borderWidth.standard,
    borderColor: colors.borderStrong,
  },
  boxFocused: {borderColor: colors.textPrimary},
  value: {fontSize: typography.hero, fontWeight: fontWeight.bold, color: colors.textPrimary, fontVariant: ['tabular-nums']},
  prefix: {color: colors.textSecondary},
  input: {flex: 1, paddingVertical: spacing.xs},
  error: {marginTop: spacing.xs, fontSize: typography.body, color: colors.warningText},
  push: {flexGrow: 1},
  footer: {
    padding: spacing.md,
    gap: spacing.xs,
    borderTopWidth: borderWidth.standard,
    borderTopColor: colors.border,
    backgroundColor: colors.white,
  },
});
