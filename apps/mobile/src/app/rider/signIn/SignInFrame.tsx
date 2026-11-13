import React, {PropsWithChildren, ReactNode, useState} from 'react';
import {ScrollView, Text, TextInput, TextInputProps, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {borderWidth, colors, font, radius, spacing, themedStyles, typography} from '../../../features/rider/theme';
import {Banner} from '../../../features/rider/components/Banner';
import {RiderLogo} from '../../../features/rider/components/RiderLogo';
import {useStrings} from '../../../features/rider/strings/StringsProvider';

/**
 * Both sign-in steps (docs/riders/SCREENS.md 1): no rider header, the Craves Riders logo on top,
 * and the no-fee warning pushed down to sit just above the pinned action.
 */
export function SignInFrame({footer, testID, children}: PropsWithChildren<{footer: ReactNode; testID: string}>) {
  const {strings} = useStrings();
  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.screen} testID={testID}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.brand}>
          <RiderLogo tile width={72} label={strings.signIn.brand} />
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

export const signInStyles = themedStyles(c => ({
  line: {fontFamily: font.regular, marginTop: -spacing.xs, fontSize: typography.body, color: c.textSecondary},
}));

const styles = themedStyles(c => ({
  screen: {flex: 1, backgroundColor: c.surface},
  content: {flexGrow: 1, gap: spacing.md, padding: spacing.md, paddingTop: spacing.xxl},
  brand: {alignItems: 'flex-start', marginBottom: spacing.xs},
  label: {
    marginTop: spacing.xs,
    marginBottom: spacing.xs,
    fontSize: typography.small,
    fontFamily: font.bold,
    color: c.textSecondary,
  },
  box: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: borderWidth.standard,
    borderColor: c.borderStrong,
  },
  boxFocused: {borderColor: c.textPrimary},
  value: {fontSize: typography.hero, fontFamily: font.bold, color: c.textPrimary, fontVariant: ['tabular-nums']},
  prefix: {color: c.textSecondary},
  input: {flex: 1, paddingVertical: spacing.xs},
  error: {fontFamily: font.regular, marginTop: spacing.xs, fontSize: typography.body, color: c.warningText},
  push: {flexGrow: 1},
  footer: {
    padding: spacing.md,
    gap: spacing.xs,
    borderTopWidth: borderWidth.standard,
    borderTopColor: c.border,
    backgroundColor: c.surface,
  },
}));
