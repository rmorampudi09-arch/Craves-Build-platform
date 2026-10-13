import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {borderWidth, colors, fontWeight, iconSize, spacing, textDefaults, typography} from '../../../design/tokens';
import {Icon} from '../../../shared/components/Icon';
import {LoadingIndicator} from '../../../shared/components/LoadingIndicator';
import {
  ChefActionButton,
  ChefCard,
  ChefScreen,
  ChefTopBar,
  ConfirmDialog,
  StatusChip,
} from '../../chefShell/components/ui';
import {useChefSubScreenBack, useHardwareBack} from '../../chefPayout/state/useChefSubScreenBack';
import type {ChefBankState, ChefBankStatus} from '../api/chefBankOnboardingApi';
import {BankAccountFields, BankAccountSubmit} from '../components/BankAccountForm';
import {useBankAccountForm} from '../state/useBankAccountForm';
import {useChefApplicantName} from '../state/useChefApplicantName';
import {useChefBankStatus} from '../state/useChefBankStatus';

const CHECKING_STATES = new Set<ChefBankState>(['QUEUED', 'SUBMITTING', 'VALIDATING', 'UNKNOWN', 'WAITING_APPROVAL']);
/** Why the bank refused the account, in the chef's words. */
const REFUSED: Partial<Record<ChefBankState, string>> = {
  VALIDATION_FAILED: "We couldn't verify this account. Check the account number and IFSC, then try again.",
  NAME_MISMATCH: "The name on this account doesn't match your application. Use an account in your own name.",
  APPLICANT_ACTION_REQUIRED: 'Craves needs you to check your bank details. Please enter them again.',
};

function Row({label, value}: {label: string; value: string}) {
  return (
    <View style={styles.row}>
      <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.muted}>
        {label}
      </Text>
      <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.value}>
        {value}
      </Text>
    </View>
  );
}

function AccountCard({bank}: {bank: ChefBankStatus}) {
  const place = [bank.branchName ? `${bank.branchName} branch` : null, bank.ifsc].filter(Boolean).join(' · ');
  return (
    <ChefCard style={[styles.card, styles.verified]}>
      <View style={styles.row}>
        <Icon color={colors.successText} name="bank" size={iconSize.xl} surface={false} />
        <StatusChip label="Verified" tone="ready" />
      </View>
      <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.bankName}>
        {bank.bankName ?? 'Bank account'}
      </Text>
      {place ? (
        <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.muted}>
          {place}
        </Text>
      ) : null}
      <View style={styles.rule} />
      <Row label="Account number" value={`•••• •••• ${bank.lastFour ?? ''}`} />
      {bank.accountHolderName ? <Row label="Account holder" value={bank.accountHolderName} /> : null}
    </ChefCard>
  );
}

function Note({title, message, tone}: {title: string; message: string; tone: 'info' | 'error'}) {
  return (
    <ChefCard style={[styles.card, tone === 'error' && styles.refused]}>
      <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.title}>
        {title}
      </Text>
      <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.muted}>
        {message}
      </Text>
    </ChefCard>
  );
}

function LoadError({title, onRetry}: {title: string; onRetry: () => void}) {
  return (
    <ChefCard style={styles.card}>
      <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.title}>
        {title}
      </Text>
      <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.muted}>
        Check your connection and try again.
      </Text>
      <ChefActionButton label="Try again" onPress={onRetry} tone="neutral" />
    </ChefCard>
  );
}

/** The chef's payout account: a verified account as a card; otherwise the form to add or change one. */
export function ChefBankAccountScreen() {
  const {goBack} = useChefSubScreenBack();
  const {bank, status, isFetching, refetch, setBank} = useChefBankStatus();
  const applicant = useChefApplicantName();
  const [changing, setChanging] = React.useState(false);
  const [confirmingDiscard, setConfirmingDiscard] = React.useState(false);
  const form = useBankAccountForm({
    holderName: applicant.name,
    currentId: bank?.id ?? null,
    onSaved: result => {
      setBank(result);
      setChanging(false);
    },
  });
  const refresh = () => {
    refetch().catch(() => undefined);
  };

  const state = bank?.state;
  const verified = state === 'VERIFIED';
  const checking = state !== undefined && CHECKING_STATES.has(state);
  const refused = state ? REFUSED[state] : undefined;
  const formWanted = bank !== null && !checking && (!verified || changing);
  const canAdd = Boolean(bank?.automaticActivation) && applicant.eligible;
  const formShown = formWanted && canAdd;

  // Leaving the form with something typed asks first; the arrow and the phone's Back both come through here.
  const leave = () => (changing ? setChanging(false) : goBack());
  const exit = () => (formShown && form.dirty ? setConfirmingDiscard(true) : leave());
  useHardwareBack(exit);

  return (
    <ChefScreen
      footer={formShown ? <BankAccountSubmit form={form} /> : undefined}
      header={<ChefTopBar onBack={exit} showBell={false} title={changing ? 'Change bank account' : 'Bank account'} />}
      onRefresh={refresh}
      refreshing={isFetching}
      withTabBar>
      {bank === null ? (
        status === 'error' ? (
          <LoadError onRetry={refresh} title="We couldn't load your bank account." />
        ) : (
          <LoadingIndicator label="Loading your bank account" />
        )
      ) : (
        <>
          {verified && !changing ? (
            <>
              <AccountCard bank={bank} />
              <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.muted}>
                All your payouts go to this account.
              </Text>
              <ChefActionButton label="Change bank account" onPress={() => setChanging(true)} tone="neutral" />
            </>
          ) : null}
          {checking ? (
            <Note
              message="This takes a little while. This page updates by itself when it's done."
              title="Checking your account"
              tone="info"
            />
          ) : null}
          {refused ? <Note message={refused} title="This account was not verified" tone="error" /> : null}
          {formWanted ? (
            !bank.automaticActivation ? (
              <Note message="Bank accounts can't be added right now. Please try again later." title="Bank account" tone="info" />
            ) : applicant.status === 'pending' ? (
              <LoadingIndicator label="Loading your details" />
            ) : applicant.status === 'error' && !applicant.name ? (
              <LoadError
                onRetry={() => {
                  applicant.refetch().catch(() => undefined);
                }}
                title="We couldn't load your details."
              />
            ) : !applicant.eligible ? (
              <Note
                message="Finish your chef application first. Then you can add a bank account."
                title="Bank account"
                tone="info"
              />
            ) : (
              <BankAccountFields form={form} />
            )
          ) : null}
        </>
      )}
      <ConfirmDialog
        cancelLabel="Keep editing"
        confirmLabel="Discard"
        message="What you typed won't be saved."
        onCancel={() => setConfirmingDiscard(false)}
        onConfirm={() => {
          setConfirmingDiscard(false);
          form.reset();
          leave();
        }}
        title="Discard changes?"
        tone="danger"
        visible={confirmingDiscard}
      />
    </ChefScreen>
  );
}

const styles = StyleSheet.create({
  card: {gap: spacing.xs},
  verified: {borderColor: colors.success, borderWidth: borderWidth.focus},
  refused: {borderColor: colors.error},
  row: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm},
  rule: {height: borderWidth.standard, marginVertical: spacing.xs, backgroundColor: colors.border},
  bankName: {color: colors.textPrimary, fontSize: typography.heading, fontWeight: fontWeight.bold},
  title: {color: colors.textPrimary, fontSize: typography.body, fontWeight: fontWeight.bold},
  muted: {color: colors.textSecondary, fontSize: typography.small},
  value: {flexShrink: 1, color: colors.textPrimary, fontSize: typography.small, fontWeight: fontWeight.bold, textAlign: 'right'},
});
