import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {uuid} from 'expo-modules-core';
import {toAppApiError} from '../../../core/http/apiError';
import {colors, fontWeight, iconSize, spacing, textDefaults, touchTarget, typography} from '../../../design/tokens';
import {Icon} from '../../../shared/components/Icon';
import {InputField} from '../../../shared/components/InputField';
import {chefOnboardingApi} from '../../chefOnboarding/api/chefOnboardingApi';
import {ChefActionButton, ChefCard} from '../../chefShell/components/ui';
import {
  buildChefBankSubmission,
  chefBankOnboardingApi,
  type ChefBankStatus,
  type ChefBankSubmission,
} from '../api/chefBankOnboardingApi';

const IFSC_PATTERN = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const ACCOUNT_PATTERN = /^[0-9]{6,24}$/;

function saveFailure(error: unknown): string {
  const {status} = toAppApiError(error);
  if (status === 409) return 'Your bank details changed or a payout is pending. Pull down to refresh, then try again.';
  if (status === 429) return "You've reached the limit for bank changes. Try again in 24 hours.";
  if (status) return "We couldn't save your bank account. Check the details and try again.";
  // No answer at all: pressing again sends the same request, so it never saves twice.
  return "We couldn't tell if it was saved. Press Verify and save again; it won't be saved twice.";
}

export interface BankAccountFormProps {
  /** The name on the application. Locked: the account has to be in this name. */
  holderName: string;
  /** The bank record this replaces (null for the first account), so the server can spot a stale screen. */
  currentId: string | null;
  onSaved: (bank: ChefBankStatus) => void;
}

/** Account number twice, IFSC with its bank and branch, one tick, one button. */
export function BankAccountForm({holderName, currentId, onSaved}: BankAccountFormProps) {
  const [account, setAccount] = React.useState('');
  const [confirmation, setConfirmation] = React.useState('');
  const [ifsc, setIfsc] = React.useState('');
  const [consent, setConsent] = React.useState(false);
  const [showAccount, setShowAccount] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [branch, setBranch] = React.useState<{ifsc: string; bankName: string; branchName: string} | null>(null);
  const [lookup, setLookup] = React.useState<'idle' | 'loading' | 'failed'>('idle');
  const [lookupError, setLookupError] = React.useState('');
  const [lookupRetry, setLookupRetry] = React.useState(0);
  const pending = React.useRef<ChefBankSubmission | null>(null);
  const inFlight = React.useRef(false);

  // The branch comes from the IFSC as it is typed.
  React.useEffect(() => {
    setBranch(null);
    setLookup('idle');
    if (!IFSC_PATTERN.test(ifsc)) return undefined;
    let live = true;
    setLookup('loading');
    chefOnboardingApi.bankBranch(ifsc).then(
      found => {
        if (!live) return;
        setBranch({ifsc, ...found});
        setLookup('idle');
      },
      failure => {
        if (!live) return;
        setLookup('failed');
        setLookupError(
          toAppApiError(failure).status === 404 ? 'IFSC not found. Check your bank document.' : "We couldn't look up this bank. Try again.",
        );
      },
    );
    return () => {
      live = false;
    };
  }, [ifsc, lookupRetry]);

  // Any edit starts a new request; a retry with nothing changed replays the same one.
  const edit = (change: () => void) => {
    pending.current = null;
    setError(null);
    change();
  };

  const mismatch = confirmation.length > 0 && confirmation.length >= account.length && confirmation !== account;
  const matches = account.length > 0 && confirmation === account;
  const valid =
    ACCOUNT_PATTERN.test(account) && matches && IFSC_PATTERN.test(ifsc) && branch?.ifsc === ifsc && consent && holderName.length >= 2;

  const save = async () => {
    if (!valid || busy || inFlight.current) return;
    let submission = pending.current;
    if (!submission) {
      try {
        submission = buildChefBankSubmission({
          requestKey: uuid.v4(),
          expectedCurrentId: currentId,
          accountHolderName: holderName,
          accountNumber: account,
          accountNumberConfirmation: confirmation,
          ifsc,
          consent,
        });
      } catch {
        setError('Check the bank details and try again.');
        return;
      }
      pending.current = submission;
    }
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await chefBankOnboardingApi.submit(submission);
      pending.current = null;
      setAccount('');
      setConfirmation('');
      setIfsc('');
      setConsent(false);
      onSaved(result);
    } catch (caught) {
      setError(saveFailure(caught));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <View style={styles.form}>
      <InputField
        editable={false}
        helperText="Must match the name on your application."
        label="Account holder"
        rightIcon="lock"
        value={holderName}
      />
      <InputField
        autoComplete="off"
        autoCorrect={false}
        importantForAutofill="no"
        keyboardType="number-pad"
        label="Account number"
        maxLength={24}
        onChangeText={value => edit(() => setAccount(value.replace(/\D/g, '')))}
        onRightIconPress={() => setShowAccount(value => !value)}
        rightIcon={showAccount ? 'eye-off' : 'eye'}
        rightIconAccessibilityLabel={showAccount ? 'Hide account number' : 'Show account number'}
        secureTextEntry={!showAccount}
        value={account}
      />
      <InputField
        autoComplete="off"
        autoCorrect={false}
        contextMenuHidden
        error={mismatch ? "The account numbers don't match." : undefined}
        helperText={matches ? '✓ Numbers match' : undefined}
        importantForAutofill="no"
        keyboardType="number-pad"
        label="Re-enter account number"
        maxLength={24}
        onChangeText={value => edit(() => setConfirmation(value.replace(/\D/g, '')))}
        secureTextEntry
        value={confirmation}
      />
      <View style={styles.ifsc}>
        <InputField
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect={false}
          error={lookup === 'failed' ? lookupError : undefined}
          helperText={lookup === 'loading' ? 'Finding your bank…' : undefined}
          label="IFSC"
          maxLength={11}
          onChangeText={value => edit(() => setIfsc(value.toUpperCase().replace(/[^A-Z0-9]/g, '')))}
          value={ifsc}
        />
        {lookup === 'failed' && !lookupError.startsWith('IFSC not found') ? (
          <ChefActionButton label="Try again" onPress={() => setLookupRetry(count => count + 1)} tone="neutral" />
        ) : null}
        {branch ? (
          <ChefCard style={styles.branch}>
            <Icon color={colors.textPrimary} name="bank" size={iconSize.sm} surface={false} />
            <View style={styles.branchText}>
              <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.branchName}>
                {branch.bankName}
              </Text>
              <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.muted}>
                {branch.branchName}
              </Text>
            </View>
          </ChefCard>
        ) : null}
      </View>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{checked: consent, disabled: busy}}
        disabled={busy}
        onPress={() => edit(() => setConsent(value => !value))}
        style={styles.consent}>
        <View style={[styles.box, consent && styles.boxOn]}>
          {consent ? <Icon color={colors.white} name="check" size={iconSize.xs} surface={false} /> : null}
        </View>
        <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.consentText}>
          This is my own bank account. I agree that Craves may share these details and my contact information with
          Razorpay to validate the account and pay my earnings.
        </Text>
      </Pressable>
      {error ? (
        <Text accessibilityLiveRegion="polite" accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
      <ChefActionButton
        disabled={!valid || busy}
        label={busy ? 'Checking your account…' : 'Verify and save'}
        onPress={() => {
          save().catch(() => undefined);
        }}
      />
    </View>
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
    width: 24,
    height: 24,
    marginTop: spacing.xxs,
    borderRadius: spacing.xxs,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
  },
  boxOn: {borderColor: colors.flameRedAccessible, backgroundColor: colors.flameRedAccessible},
  consentText: {flex: 1, color: colors.textPrimary, fontSize: typography.small},
  error: {color: colors.error, fontSize: typography.small},
});
