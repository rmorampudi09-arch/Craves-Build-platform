import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {colors, fontWeight, radius, spacing, typography} from '../../../design/tokens';
import {Button} from '../../../shared/components/Button';
import {InputField} from '../../../shared/components/InputField';
import {emailDeliveryMessage, emailVerificationApi, type EmailVerificationState} from '../api/emailVerificationApi';
import {emailVerificationErrorMessage} from '../presentation/emailVerificationFeedback';

type Props = {
  email: string;
  disabled?: boolean;
  onVerified?: (email: string) => void;
};

function createRequestId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, token => {
    const value = Math.floor(Math.random() * 16);
    const nibble = token === 'x' ? value : (value & 0x3) | 0x8;
    return nibble.toString(16);
  });
}

export function EmailVerificationPanel({email, disabled = false, onVerified}: Props) {
  const mounted = useRef(true);
  const [state, setState] = useState<EmailVerificationState | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => () => {
    mounted.current = false;
  }, []);

  const run = useCallback(async (
    action: 'read' | 'issue' | 'verify' | 'resend',
  ) => {
    if (busy || (action !== 'read' && disabled)) return;
    setBusy(true);
    setError(null);
    try {
      let next: EmailVerificationState;
      if (action === 'issue') {
        next = await emailVerificationApi.issue(email, createRequestId());
      } else if (action === 'verify' && state?.pending) {
        next = await emailVerificationApi.verify(state.pending.challengeId, code);
      } else if (action === 'resend' && state?.pending) {
        next = await emailVerificationApi.resend(state.pending.challengeId, createRequestId());
      } else {
        next = await emailVerificationApi.read();
      }
      if (!mounted.current) return;
      setState(next);
      setNow(Date.now());
      if (action !== 'read') setCode('');
      if (next.emailVerified && next.email) onVerified?.(next.email);
    } catch (caught) {
      if (mounted.current) setError(emailVerificationErrorMessage(caught, action));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }, [busy, code, disabled, email, onVerified, state?.pending]);

  useEffect(() => {
    void run('read');
    // Initial server read only; user actions refresh explicitly after this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!state?.pending) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [state?.pending]);

  const resendWait = useMemo(() => {
    if (!state?.pending) return 0;
    return Math.max(0, Math.ceil((Date.parse(state.pending.resendAvailableAt) - now) / 1000));
  }, [now, state?.pending]);

  const expired = Boolean(state?.pending && Date.parse(state.pending.expiresAt) <= now);
  const normalizedEmail = email.trim().toLowerCase();
  const matches = Boolean(
    state?.emailVerified && state.email?.trim().toLowerCase() === normalizedEmail,
  );

  return (
    <View style={styles.panel} testID="email-verification-panel">
      <Text style={styles.title}>{matches ? 'Email verified' : 'Verify email'}</Text>
      <Text accessibilityLiveRegion="polite" style={styles.copy}>
        {error ?? (state ? emailDeliveryMessage(state) : busy ? 'Checking your email status…' : 'Email verification status is unavailable.')}
      </Text>

      {state?.emailVerified && state.email ? (
        <Text style={styles.verified}>Verified email: {state.email}</Text>
      ) : null}

      {state?.pending ? (
        <>
          <InputField
            label={`Verification code for ${state.pending.maskedEmail}`}
            value={code}
            onChangeText={value => setCode(value.replace(/\D/g, '').slice(0, 6))}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            maxLength={6}
            disabled={busy || disabled || expired}
            helperText={expired ? 'This code has expired. Request another when available.' : 'Enter the six-digit code from your email.'}
          />
          <Button
            label={busy ? 'Verifying…' : 'Verify email'}
            loading={busy}
            disabled={disabled || expired || !/^\d{6}$/.test(code)}
            onPress={() => void run('verify')}
          />
          <Button
            variant="ghost"
            label={resendWait > 0 ? `Resend available in ${resendWait}s` : 'Resend code'}
            disabled={busy || disabled || resendWait > 0}
            onPress={() => void run('resend')}
          />
        </>
      ) : null}

      {!matches ? (
        <Button
          variant="outline"
          label={busy && !state?.pending ? 'Please wait…' : 'Send verification code'}
          loading={busy && !state?.pending}
          disabled={disabled || busy || !normalizedEmail.includes('@')}
          onPress={() => void run('issue')}
        />
      ) : null}

      <Button
        variant="ghost"
        label={busy ? 'Checking…' : 'Check email status'}
        loading={busy}
        disabled={disabled || busy}
        onPress={() => void run('read')}
      />

      <Text style={styles.copy}>
        Requesting a code does not change your email. The email changes only after Craves verifies the six-digit code.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    marginTop: spacing.md,
    padding: spacing.md,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.white,
  },
  title: {
    fontSize: typography.body,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  copy: {fontSize: typography.small, color: colors.textSecondary},
  verified: {fontSize: typography.small, color: colors.successText},
});
