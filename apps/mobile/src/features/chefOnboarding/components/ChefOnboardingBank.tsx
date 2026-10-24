import React, {useEffect, useRef, useState} from 'react';
import {ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View} from 'react-native';
import {uuid} from 'expo-modules-core';
import {toAppApiError} from '../../../core/http/apiError';
import {colors, spacing, touchTarget, typography, iconSize} from '../../../design/tokens';
import {Button} from '../../../shared/components/Button';
import {Icon} from '../../../shared/components/Icon';
import {
  buildChefBankSubmission,
  chefBankOnboardingApi,
  type ChefBankStatus,
  type ChefBankSubmission,
} from '../../chefBankOnboarding/api/chefBankOnboardingApi';
import {chefOnboardingApi} from '../api/chefOnboardingApi';
import {bankCanContinue, sameChefBankName} from '../domain/chefOnboardingFlow';
import {Card, CheckRow, FieldError, FieldShell, LinkButton, Note, Rows, StatusChip, onboardingStyles as ui} from './OnboardingUi';

export type BankFormMode = 'entry' | 'confirm' | 'saved';
type FieldKey = 'account' | 'confirmation' | 'ifsc' | 'consent' | 'form';

/** The website's bank step (chef-onboarding-bank.tsx): enter, check the branch from the IFSC, confirm, save. */
export function ChefOnboardingBank({
  name,
  bank,
  unavailable,
  busy,
  onSaved,
  onBusy,
  onRefresh,
  submitSignal,
  onModeChange,
}: {
  name: string;
  bank: ChefBankStatus | null;
  unavailable: boolean;
  busy: boolean;
  onSaved: (bank: ChefBankStatus) => void;
  onBusy: (busy: boolean) => void;
  onRefresh: () => void;
  /** Bumped by the screen's footer button. */
  submitSignal: number;
  onModeChange: (mode: BankFormMode) => void;
}) {
  const [account, setAccount] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [ifsc, setIfsc] = useState('');
  const [consent, setConsent] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  const [changing, setChanging] = useState(false);
  const [error, setError] = useState<{field: FieldKey; message: string} | null>(null);
  const [branch, setBranch] = useState<{ifsc: string; bankName: string; branchName: string} | null>(null);
  const [lookup, setLookup] = useState<'idle' | 'loading' | 'failed'>('idle');
  const [lookupError, setLookupError] = useState('');
  const [lookupRetry, setLookupRetry] = useState(0);
  const request = useRef<ChefBankSubmission | null>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    setBranch(null);
    setLookupError('');
    setLookup('idle');
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) return;
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
        setLookupError(toAppApiError(failure).status === 404 ? 'IFSC not found. Check your bank document.' : 'Bank branch lookup failed.');
      },
    );
    return () => {
      live = false;
    };
  }, [ifsc, lookupRetry]);

  const editable = Boolean(bank?.automaticActivation);
  const saved = bankCanContinue(bank) && sameChefBankName(bank?.accountHolderName, name);
  const mode: BankFormMode = confirming ? 'confirm' : saved && !changing && !account && !confirmation && !ifsc ? 'saved' : 'entry';
  useEffect(() => onModeChange(mode), [mode, onModeChange]);

  function changed() {
    request.current = null;
    setError(null);
  }
  function confirm() {
    const fail = (field: FieldKey, message: string) => setError({field, message});
    if (!/^[0-9]{6,24}$/.test(account)) return fail('account', 'Enter a bank account number with 6 to 24 digits.');
    if (account !== confirmation) return fail('confirmation', 'The account numbers don’t match.');
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) return fail('ifsc', 'Enter a valid 11-character IFSC code.');
    if (!consent) return fail('consent', 'Confirm this is your account to continue.');
    if (!branch || branch.ifsc !== ifsc) return fail('ifsc', 'Wait for the bank name and branch to load from your IFSC.');
    try {
      request.current = buildChefBankSubmission({
        requestKey: uuid.v4(),
        expectedCurrentId: bank?.id ?? null,
        accountHolderName: name,
        accountNumber: account,
        accountNumberConfirmation: confirmation,
        ifsc,
        consent,
      });
    } catch {
      return fail('form', 'Check your account holder name in Basic details.');
    }
    setConfirming(true);
    setError(null);
  }
  async function save() {
    if (!request.current || busy || inFlight.current || !editable) return;
    inFlight.current = true;
    onBusy(true);
    setError(null);
    try {
      const result = await chefBankOnboardingApi.submit(request.current);
      onSaved(result);
      if (!bankCanContinue(result)) {
        setError({field: 'form', message: result.message});
        return;
      }
      request.current = null;
      setAccount('');
      setConfirmation('');
      setIfsc('');
      setConsent(false);
      setConfirming(false);
      setChanging(false);
    } catch (failure) {
      const status = toAppApiError(failure).status;
      setError({
        field: 'form',
        message:
          status === 409
            ? 'Your bank details changed or a payout is pending. Refresh bank status before trying again.'
            : status === 429
              ? 'The bank-change limit has been reached. Try again after the current limit resets.'
              : 'We could not confirm your bank submission. Retry uses the same request, so it will not create a duplicate.',
      });
    } finally {
      inFlight.current = false;
      onBusy(false);
    }
  }

  // The footer button: keep a saved account, confirm the entry, or save it.
  const firstSignal = useRef(submitSignal);
  useEffect(() => {
    if (submitSignal === firstSignal.current) return;
    if (busy || inFlight.current) return;
    if (mode === 'saved' && bank) onSaved(bank);
    else if (confirming) save().catch(() => undefined);
    else confirm();
    // Runs once per footer press.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitSignal]);

  const showFields = editable && (!bank?.id || changing || !saved);
  const errorFor = (field: FieldKey) => (error?.field === field ? error.message : null);
  const matches = account.length >= 6 && confirmation === account;
  return (
    <View style={ui.stack}>
      {bank?.id ? (
        <Card icon="bank" subtitle={bank.message} title="Saved account">
          <Rows
            rows={[
              ['Account', `•••• ${bank.lastFour ?? ''}`],
              ['Bank', bank.bankName ? `${bank.bankName}${bank.branchName ? `, ${bank.branchName}` : ''}` : ''],
              ['Status', bankCanContinue(bank) ? <StatusChip tone="complete">Saved</StatusChip> : <StatusChip tone="attention">Needs attention</StatusChip>],
            ]}
          />
          {editable && saved && !changing ? <LinkButton label="Use a different account" onPress={() => setChanging(true)} /> : null}
        </Card>
      ) : null}

      {!bank && !unavailable ? (
        <Note tone="neutral">Checking bank account setup…</Note>
      ) : unavailable || !editable ? (
        <Note tone="neutral">
          <Text style={ui.body}>
            {unavailable
              ? 'We couldn’t load your bank details. Your application is still saved.'
              : 'Adding a bank account isn’t open on Craves yet, so this step can’t be finished right now. Everything else you’ve entered is saved.'}
          </Text>
          <LinkButton disabled={busy} icon="renew" label="Refresh bank status" onPress={onRefresh} />
        </Note>
      ) : null}

      {showFields ? (
        <Card icon="bank" subtitle="Where we send your earnings." title="Account details">
          <View style={ui.fields}>
            <FieldShell helper="From your basic details." label="Account holder name">
              <View style={[ui.input, styles.row, styles.locked]}>
                <Text style={[ui.body, styles.flex]}>{name}</Text>
                <Icon color={colors.textSecondary} name="lock" size={iconSize.sm} surface={false} />
              </View>
            </FieldShell>
            <FieldShell error={errorFor('account')} label="Bank account number">
              <View style={[ui.input, styles.row, errorFor('account') && ui.inputError]}>
                <TextInput
                  accessibilityLabel="Bank account number"
                  autoComplete="off"
                  editable={!busy && !confirming}
                  importantForAutofill="no"
                  keyboardType="number-pad"
                  maxLength={24}
                  onChangeText={value => {
                    changed();
                    setAccount(value.replace(/\D/g, ''));
                  }}
                  secureTextEntry={!showAccount}
                  style={[styles.input, ui.mono]}
                  value={account}
                />
                <Pressable
                  accessibilityLabel={showAccount ? 'Hide account number' : 'Show account number'}
                  accessibilityRole="button"
                  hitSlop={spacing.xs}
                  onPress={() => setShowAccount(value => !value)}>
                  <Icon color={colors.textSecondary} name={showAccount ? 'eye-off' : 'eye'} size={iconSize.sm} surface={false} />
                </Pressable>
              </View>
            </FieldShell>
            <FieldShell
              after={matches && !errorFor('confirmation') ? <Text style={styles.match}>✓ Account numbers match</Text> : null}
              error={errorFor('confirmation')}
              label="Confirm bank account number">
              <TextInput
                accessibilityLabel="Confirm bank account number"
                autoComplete="off"
                contextMenuHidden
                editable={!busy && !confirming}
                importantForAutofill="no"
                keyboardType="number-pad"
                maxLength={24}
                onChangeText={value => {
                  changed();
                  setConfirmation(value.replace(/\D/g, ''));
                }}
                style={[ui.input, ui.mono, errorFor('confirmation') && ui.inputError]}
                value={confirmation}
              />
            </FieldShell>
            <FieldShell
              after={lookup === 'failed' ? <LinkButton icon="renew" label="Retry branch lookup" onPress={() => setLookupRetry(value => value + 1)} /> : null}
              error={errorFor('ifsc') ?? (lookup === 'failed' ? lookupError : null)}
              helper={lookup === 'loading' ? 'Finding your bank…' : 'Bank name and branch fill in from your IFSC.'}
              label="IFSC code">
              <View style={[ui.input, styles.row, errorFor('ifsc') && ui.inputError]}>
                <TextInput
                  accessibilityLabel="IFSC code"
                  autoCapitalize="characters"
                  autoComplete="off"
                  editable={!busy && !confirming}
                  maxLength={11}
                  onChangeText={value => {
                    changed();
                    setIfsc(value.toUpperCase().replace(/[^A-Z0-9]/g, ''));
                  }}
                  placeholder="For example, HDFC0001234"
                  placeholderTextColor={colors.placeholder}
                  style={[styles.input, ui.mono]}
                  value={ifsc}
                />
                {lookup === 'loading' ? <ActivityIndicator color={colors.flameRedAccessible} /> : null}
              </View>
            </FieldShell>
            <Rows rows={[['Bank name', branch?.bankName ?? ''], ['Branch', branch?.branchName ?? '']]} />
            <View style={styles.gap}>
              <CheckRow
                checked={consent}
                disabled={busy || confirming}
                onChange={checked => {
                  changed();
                  setConsent(checked);
                }}>
                This is my bank account. I agree that Craves may share these details and my contact information with Razorpay to validate the account and pay my earnings.
              </CheckRow>
              {errorFor('consent') ? <FieldError>{errorFor('consent')}</FieldError> : null}
            </View>
          </View>
        </Card>
      ) : null}

      {confirming ? (
        <Card icon="lock" title="Confirm your bank details">
          <Rows
            rows={[
              ['Account holder', name],
              ['Account number', `•••• ${account.slice(-4)}`],
              ['IFSC', ifsc],
              ['Bank name', branch?.bankName ?? ''],
              ['Branch', branch?.branchName ?? ''],
            ]}
          />
          <Text style={[ui.muted, styles.topGap]}>
            Please check these details carefully. Your earnings will be transferred to this bank account.
          </Text>
          <Button
            disabled={busy}
            label="Re-enter bank details"
            onPress={() => {
              request.current = null;
              setConfirming(false);
            }}
            style={styles.topGap}
            variant="outline"
          />
        </Card>
      ) : null}

      {errorFor('form') ? <Note tone="error">{errorFor('form')!}</Note> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {flex: 1},
  gap: {gap: spacing.xs},
  topGap: {marginTop: spacing.sm},
  row: {flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingVertical: 0},
  locked: {backgroundColor: colors.surfaceMuted, minHeight: touchTarget.minimum},
  input: {flex: 1, minHeight: touchTarget.minimum, color: colors.textPrimary, fontSize: typography.body, padding: 0},
  match: {color: colors.successText, fontSize: typography.small},
});
