import React from 'react';
import {
  ActivityIndicator,
  AppState,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {toAppApiError} from '../../../core/http/apiError';
import {
  borderWidth,
  colors,
  fontWeight,
  radius,
  spacing,
  touchTarget,
  typography,
} from '../../../design/tokens';
import {Button} from '../../../shared/components/Button';
import {Icon} from '../../../shared/components/Icon';
import {InputField} from '../../../shared/components/InputField';
import {chefBusinessInformationApi} from '../../chefBusinessInformation/api/chefBusinessInformationApi';
import {
  buildChefBankSubmission,
  chefBankOnboardingApi,
  type ChefBankStatus,
  type ChefBankSubmission,
} from '../api/chefBankOnboardingApi';

const POLLING_STATES = new Set<ChefBankStatus['state']>([
  'QUEUED',
  'SUBMITTING',
  'VALIDATING',
  'UNKNOWN',
  'WAITING_APPROVAL',
]);

function createRequestKey(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, token => {
    const value = Math.floor(Math.random() * 16);
    const nibble = token === 'x' ? value : 8 + (value % 4);
    return nibble.toString(16);
  });
}

function stateLabel(state: ChefBankStatus['state']): string {
  return state.replace(/_/g, ' ');
}

function statusColor(status: ChefBankStatus): string {
  if (status.state === 'VERIFIED') return colors.success;
  if (
    status.state === 'VALIDATION_FAILED' ||
    status.state === 'NAME_MISMATCH' ||
    status.state === 'APPLICANT_ACTION_REQUIRED'
  ) {
    return colors.error;
  }
  return colors.textSecondary;
}

export function ChefBankOnboardingPanel() {
  const [bank, setBank] = React.useState<ChefBankStatus | null>(null);
  const [accountHolderName, setAccountHolderName] = React.useState('');
  const [applicationEligible, setApplicationEligible] = React.useState(false);
  const [accountNumber, setAccountNumber] = React.useState('');
  const [confirmation, setConfirmation] = React.useState('');
  const [ifsc, setIfsc] = React.useState('');
  const [consent, setConsent] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [availabilityError, setAvailabilityError] = React.useState(false);
  const pending = React.useRef<ChefBankSubmission | null>(null);
  const mounted = React.useRef(true);

  React.useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );

  const refresh = React.useCallback(async () => {
    const controller = new AbortController();
    setLoading(true);
    try {
      const [application, status] = await Promise.all([
        chefBusinessInformationApi.getVerificationRecord(controller.signal),
        chefBankOnboardingApi.getStatus(controller.signal),
      ]);
      if (!mounted.current) return;

      const name = [application.firstName, application.lastName]
        .filter((part): part is string => Boolean(part?.trim()))
        .join(' ')
        .trim();

      setAccountHolderName(name);
      setApplicationEligible(
        (application.status === 'PENDING' ||
          application.status === 'APPROVED') &&
          name.length >= 2,
      );
      setBank(status);
      setAvailabilityError(false);
      setMessage(null);
    } catch (caught) {
      if (!mounted.current) return;
      const failure = toAppApiError(caught);
      setAvailabilityError(true);
      setMessage(failure.message);
    } finally {
      if (mounted.current) setLoading(false);
    }
    return () => controller.abort();
  }, []);

  React.useEffect(() => {
    refresh().catch(() => undefined);
  }, [refresh]);

  React.useEffect(() => {
    if (!bank || !POLLING_STATES.has(bank.state)) return undefined;

    const timer = setInterval(() => {
      if (AppState.currentState === 'active' && !busy) {
        refresh().catch(() => undefined);
      }
    }, 15_000);

    return () => clearInterval(timer);
  }, [bank, busy, refresh]);

  const edit = React.useCallback((action: () => void) => {
    pending.current = null;
    setMessage(null);
    action();
  }, []);

  const submit = React.useCallback(async () => {
    if (
      busy ||
      !bank ||
      !bank.automaticActivation ||
      !applicationEligible ||
      !accountHolderName
    ) {
      return;
    }

    let submission = pending.current;
    if (!submission) {
      try {
        submission = buildChefBankSubmission({
          requestKey: createRequestKey(),
          expectedCurrentId: bank.id,
          accountHolderName,
          accountNumber,
          accountNumberConfirmation: confirmation,
          ifsc,
          consent,
        });
      } catch (caught) {
        const code = caught instanceof Error ? caught.message : '';
        setMessage(
          code === 'CHEF_BANK_ACCOUNT_MISMATCH'
            ? 'Enter matching bank account numbers.'
            : code === 'CHEF_BANK_INVALID_IFSC'
              ? 'Enter a valid 11-character IFSC.'
              : code === 'CHEF_BANK_CONSENT_REQUIRED'
                ? 'Confirm the bank-validation consent before continuing.'
                : 'Check the bank details and try again.',
        );
        return;
      }
      pending.current = submission;
    }

    setBusy(true);
    setMessage(null);
    try {
      const result = await chefBankOnboardingApi.submit(submission);
      if (!mounted.current) return;

      setBank(result);
      setAccountNumber('');
      setConfirmation('');
      setIfsc('');
      setConsent(false);
      pending.current = null;
      setMessage(
        result.automaticActivation
          ? 'Bank details were saved securely. Automatic Razorpay validation follows the status shown below.'
          : 'Bank details were saved, but automatic validation is currently unavailable.',
      );
    } catch (caught) {
      if (!mounted.current) return;
      const failure = toAppApiError(caught);
      if (failure.status === 409) {
        setMessage(
          'The bank profile changed or a payout is pending. Refresh before changing details; an existing payout cannot be redirected.',
        );
      } else if (failure.status === 429) {
        setMessage(
          'The bank-change limit has been reached. Retry after the rolling 24-hour window.',
        );
      } else {
        setMessage(
          failure.status
            ? failure.message
            : 'Bank submission was not confirmed. Retry keeps the same request identity until you edit the bank details.',
        );
      }
    } finally {
      if (mounted.current) setBusy(false);
    }
  }, [
    accountHolderName,
    accountNumber,
    applicationEligible,
    bank,
    busy,
    confirmation,
    consent,
    ifsc,
  ]);

  if (loading && !bank) {
    return (
      <View accessibilityRole="progressbar" style={styles.state}>
        <ActivityIndicator color={colors.flameRedAccessible} />
        <Text style={styles.stateText}>Checking bank enrollment…</Text>
      </View>
    );
  }

  return (
    <View style={styles.panel}>
      <View style={styles.heading}>
        <View style={styles.icon}>
          <Icon name="shield" size={20} color={colors.flameRedAccessible} />
        </View>
        <View style={styles.headingCopy}>
          <Text style={styles.eyebrow}>Payout onboarding</Text>
          <Text style={styles.title}>Your payout bank account</Text>
        </View>
      </View>

      {message ? (
        <View style={styles.notice}>
          <Text accessibilityRole="status" style={styles.noticeText}>
            {message}
          </Text>
        </View>
      ) : null}

      {bank ? (
        <View style={styles.statusCard}>
          <Text style={[styles.statusTitle, {color: statusColor(bank)}]}>
            {stateLabel(bank.state)}
            {bank.lastFour ? ` · account ending ${bank.lastFour}` : ''}
          </Text>
          {bank.ifsc ? <Text style={styles.statusMeta}>IFSC {bank.ifsc}</Text> : null}
          <Text style={styles.statusMessage}>{bank.message}</Text>
          <Text style={styles.statusMeta}>
            Bank validation {bank.bankValidated ? 'confirmed' : 'not confirmed'} ·
            Chef application {bank.applicationApproved ? 'approved' : 'not approved'}
          </Text>
        </View>
      ) : null}

      {!bank ? (
        <Text style={styles.stateText}>
          {availabilityError
            ? 'Refresh to confirm bank enrollment availability. No bank submission can be made until it is confirmed.'
            : 'Checking current bank enrollment availability…'}
        </Text>
      ) : !bank.automaticActivation ? (
        <Text style={styles.stateText}>
          Automatic bank enrollment is currently unavailable. Your finance
          balance continues to show your current payout options.
        </Text>
      ) : !applicationEligible ? (
        <Text style={styles.stateText}>
          Submit your Chef application first. Bank enrollment becomes available
          while the application is pending or after it is approved.
        </Text>
      ) : (
        <View style={styles.form}>
          <InputField
            label="Account holder from your saved Chef application"
            value={accountHolderName}
            editable={false}
            disabled
            helperText="Use your own account with this saved applicant name. Different business names, unmatched initials and joint-account names are not guessed as matches."
          />

          <InputField
            label="Account number"
            value={accountNumber}
            keyboardType="number-pad"
            secureTextEntry
            autoCorrect={false}
            maxLength={24}
            disabled={busy}
            onChangeText={value => edit(() => setAccountNumber(value))}
          />

          <InputField
            label="Confirm account number"
            value={confirmation}
            keyboardType="number-pad"
            secureTextEntry
            autoCorrect={false}
            maxLength={24}
            disabled={busy}
            onChangeText={value => edit(() => setConfirmation(value))}
          />

          <InputField
            label="IFSC"
            value={ifsc}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={11}
            disabled={busy}
            onChangeText={value =>
              edit(() => setIfsc(value.toUpperCase().replace(/\s/g, '')))
            }
          />

          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{checked: consent, disabled: busy}}
            disabled={busy}
            onPress={() => edit(() => setConsent(current => !current))}
            style={({pressed}) => [
              styles.consentRow,
              pressed && !busy && styles.pressed,
            ]}>
            <View style={[styles.checkbox, consent && styles.checkboxSelected]}>
              {consent ? <Icon name="check" size={16} color={colors.white} /> : null}
            </View>
            <Text style={styles.consentText}>
              I confirm this is my bank account and consent to Craves sharing
              these details and my saved contact information with Razorpay for
              account validation and eligible Chef payouts.
            </Text>
          </Pressable>

          <Button
            label={
              busy
                ? 'Saving securely…'
                : pending.current
                  ? 'Retry same submission'
                  : 'Save and validate automatically'
            }
            loading={busy}
            disabled={!bank.automaticActivation}
            onPress={() => {
              submit().catch(() => undefined);
            }}
          />
        </View>
      )}

      <Button
        label={loading ? 'Refreshing…' : 'Refresh bank status'}
        variant="outline"
        loading={loading}
        disabled={busy}
        onPress={() => {
          refresh().catch(() => undefined);
        }}
      />

      <Text style={styles.privacy}>
        Full account numbers are never returned by the bank-status API and are
        not stored in mobile state outside this live form. Changing an account
        creates a new backend version. Failed, unmatched or uncertain validation
        cannot authorize a payout.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    gap: spacing.md,
    padding: spacing.md,
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
  },
  heading: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm},
  headingCopy: {flex: 1, minWidth: 0},
  icon: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  eyebrow: {
    color: colors.textSecondary,
    fontSize: typography.tiny,
    fontWeight: fontWeight.bold,
    textTransform: 'uppercase',
  },
  title: {
    marginTop: spacing.xxs,
    color: colors.espressoBrown,
    fontSize: typography.heading,
    fontWeight: fontWeight.bold,
  },
  state: {
    minHeight: 120,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  stateText: {
    color: colors.textSecondary,
    fontSize: typography.small,
    lineHeight: 20,
  },
  notice: {
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
  },
  noticeText: {
    color: colors.textPrimary,
    fontSize: typography.small,
    lineHeight: 20,
  },
  statusCard: {
    gap: spacing.xs,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
  },
  statusTitle: {
    fontSize: typography.body,
    fontWeight: fontWeight.bold,
  },
  statusMeta: {
    color: colors.textSecondary,
    fontSize: typography.tiny,
  },
  statusMessage: {
    color: colors.textPrimary,
    fontSize: typography.small,
    lineHeight: 20,
  },
  form: {gap: spacing.md},
  consentRow: {
    minHeight: touchTarget.minimum,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  checkbox: {
    width: 24,
    height: 24,
    marginTop: 2,
    borderWidth: borderWidth.standard,
    borderColor: colors.borderStrong,
    borderRadius: radius.xs,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
  },
  checkboxSelected: {
    borderColor: colors.flameRedAccessible,
    backgroundColor: colors.flameRedAccessible,
  },
  consentText: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: typography.small,
    lineHeight: 20,
  },
  privacy: {
    color: colors.textSecondary,
    fontSize: typography.tiny,
    lineHeight: 18,
  },
  pressed: {opacity: 0.72},
});
