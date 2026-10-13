import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {borderWidth, colors, fontWeight, iconSize, spacing, textDefaults, touchTarget, typography} from '../../../design/tokens';
import {Icon} from '../../../shared/components/Icon';
import {InputField} from '../../../shared/components/InputField';
import {ChefActionButton, ChefCard} from '../../chefShell/components/ui';
import type {BankAccountForm} from '../state/useBankAccountForm';

/** The form's fields. The Verify and save button is `BankAccountSubmit`, which the screen puts in its dock. */
export function BankAccountFields({form}: {form: BankAccountForm}) {
  return (
    <View style={styles.form}>
      <InputField
        editable={false}
        helperText="Must match the name on your application."
        label="Account holder"
        rightIcon="lock"
        value={form.holderName}
      />
      <InputField
        autoComplete="off"
        autoCorrect={false}
        importantForAutofill="no"
        keyboardType="number-pad"
        label="Account number"
        maxLength={24}
        onChangeText={form.setAccount}
        onRightIconPress={form.toggleShowAccount}
        rightIcon={form.showAccount ? 'eye-off' : 'eye'}
        rightIconAccessibilityLabel={form.showAccount ? 'Hide account number' : 'Show account number'}
        secureTextEntry={!form.showAccount}
        value={form.account}
      />
      <InputField
        autoComplete="off"
        autoCorrect={false}
        contextMenuHidden
        error={form.mismatch ? "The account numbers don't match." : undefined}
        helperText={form.matches ? '✓ Numbers match' : undefined}
        importantForAutofill="no"
        keyboardType="number-pad"
        label="Re-enter account number"
        maxLength={24}
        onChangeText={form.setConfirmation}
        secureTextEntry
        value={form.confirmation}
      />
      <View style={styles.ifsc}>
        <InputField
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect={false}
          error={form.lookup === 'failed' ? form.lookupError : undefined}
          helperText={form.lookup === 'loading' ? 'Finding your bank…' : undefined}
          label="IFSC"
          maxLength={11}
          onChangeText={form.setIfsc}
          value={form.ifsc}
        />
        {form.lookup === 'failed' && !form.lookupError.startsWith('IFSC not found') ? (
          <ChefActionButton label="Try again" onPress={form.retryLookup} tone="neutral" />
        ) : null}
        {form.branch ? (
          <ChefCard style={styles.branch}>
            <Icon color={colors.textPrimary} name="bank" size={iconSize.sm} surface={false} />
            <View style={styles.branchText}>
              <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.branchName}>
                {form.branch.bankName}
              </Text>
              <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.muted}>
                {form.branch.branchName}
              </Text>
            </View>
          </ChefCard>
        ) : null}
      </View>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{checked: form.consent, disabled: form.busy}}
        disabled={form.busy}
        onPress={form.toggleConsent}
        style={styles.consent}>
        <View style={[styles.box, form.consent && styles.boxOn]}>
          {form.consent ? <Icon color={colors.white} name="check" size={iconSize.xs} surface={false} /> : null}
        </View>
        <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.consentText}>
          This is my own bank account. I agree that Craves may share these details and my contact information with
          Razorpay to validate the account and pay my earnings.
        </Text>
      </Pressable>
    </View>
  );
}

/** The save error and the Verify and save button: the contents of the screen's sticky dock. */
export function BankAccountSubmit({form}: {form: BankAccountForm}) {
  return (
    <>
      {form.error ? (
        <Text accessibilityLiveRegion="polite" accessibilityRole="alert" style={styles.error}>
          {form.error}
        </Text>
      ) : null}
      <ChefActionButton
        disabled={!form.valid || form.busy}
        label={form.busy ? 'Checking your account…' : 'Verify and save'}
        onPress={() => {
          form.save().catch(() => undefined);
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  form: {gap: spacing.md},
  ifsc: {gap: spacing.xs},
  branch: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm},
  branchText: {flex: 1, minWidth: 0},
  branchName: {color: colors.textPrimary, fontSize: typography.small, fontWeight: fontWeight.bold},
  muted: {color: colors.textSecondary, fontSize: typography.small},
  consent: {minHeight: touchTarget.minimum, flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm},
  box: {
    width: iconSize.lg,
    height: iconSize.lg,
    marginTop: spacing.xxs,
    borderRadius: spacing.xxs,
    borderWidth: borderWidth.strong,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
  },
  boxOn: {borderColor: colors.flameRedAccessible, backgroundColor: colors.flameRedAccessible},
  consentText: {flex: 1, color: colors.textPrimary, fontSize: typography.small},
  error: {color: colors.error, fontSize: typography.small},
});
