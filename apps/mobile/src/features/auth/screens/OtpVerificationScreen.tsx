import React, {useEffect, useRef, useState} from 'react';
import {AccessibilityInfo, Pressable, StyleSheet, Text} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import type {RootStackParamList} from '../../../app/navigation/types';
import {useAppDispatch} from '../../../app/store/hooks';
import {toAppApiError} from '../../../core/http/apiError';
import {colors, spacing} from '../../../design/tokens';
import {AuthCard} from '../components/AuthCard';
import {AuthShell} from '../components/AuthShell';
import {InputField} from '../components/InputField';
import {PrimaryButton} from '../components/PrimaryButton';
import {ScreenHeader} from '../components/ScreenHeader';
import {SecurityNote} from '../components/SecurityNote';
import {
  createOtpCooldownDeadline,
  createOtpRequestGate,
  getOtpFailureRecovery,
  isOtpCodeComplete,
  OTP_CODE_LENGTH,
  OTP_RESEND_COOLDOWN_SECONDS,
  remainingOtpCooldownSeconds,
  sanitizeOtpCode,
} from '../domain/otpVerificationPolicy';
import {useAuthAttemptRole} from '../hooks/useAuthAttemptRole';
import {authService} from '../state/authService';
import {authActions} from '../state/authSlice';
import {authTransitionMemory} from '../state/authTransitionMemory';

type Props = NativeStackScreenProps<RootStackParamList, 'OtpVerification'>;

export function OtpVerificationScreen({navigation, route}: Props) {
  const dispatch = useAppDispatch();
  const {role} = useAuthAttemptRole(route.params.role);
  const phone = authTransitionMemory.getPendingPhone();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [clockMs, setClockMs] = useState(() => Date.now());
  const [resendAvailableAt, setResendAvailableAt] = useState(() =>
    createOtpCooldownDeadline(OTP_RESEND_COOLDOWN_SECONDS, clockMs),
  );
  const [rateLimitUntil, setRateLimitUntil] = useState(0);
  const [requiresResend, setRequiresResend] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestGate = useRef(createOtpRequestGate());
  const resendAvailabilityAnnounced = useRef(false);

  const resendSeconds = remainingOtpCooldownSeconds(resendAvailableAt, clockMs);
  const rateLimitSeconds = remainingOtpCooldownSeconds(rateLimitUntil, clockMs);
  const rateLimited = rateLimitSeconds > 0;
  const canVerify =
    Boolean(phone) && isOtpCodeComplete(code) && !busy && !requiresResend && !rateLimited;
  const canResend = Boolean(phone) && resendSeconds === 0 && !busy && !rateLimited;

  useEffect(() => {
    const id = setInterval(() => setClockMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (canResend && !resendAvailabilityAnnounced.current) {
      resendAvailabilityAnnounced.current = true;
      AccessibilityInfo.announceForAccessibility(
        'You can request a new verification code now.',
      );
    } else if (!canResend) {
      resendAvailabilityAnnounced.current = false;
    }
  }, [canResend]);

  const applyFailureRecovery = (caught: unknown) => {
    const apiError = toAppApiError(caught);
    const recovery = getOtpFailureRecovery(apiError.code);
    setError(apiError.message);

    if (recovery.clearCode) {
      setCode('');
    }

    const now = Date.now();
    setClockMs(now);

    if (recovery.requiresResend) {
      setRequiresResend(true);
      setResendAvailableAt(now);
    }

    if (recovery.minimumCooldownSeconds > 0) {
      setRateLimitUntil(
        createOtpCooldownDeadline(recovery.minimumCooldownSeconds, now),
      );
    }
  };

  const finish = async () => {
    if (!canVerify || !requestGate.current.tryAcquire()) {
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const tokens = await authService.confirmOtp(code);
      authTransitionMemory.clearPendingPhone();
      dispatch(authActions.authenticated(tokens.identity));
    } catch (caught) {
      applyFailureRecovery(caught);
    } finally {
      requestGate.current.release();
      setBusy(false);
    }
  };

  const resend = async () => {
    if (!phone || !canResend || !requestGate.current.tryAcquire()) {
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await authService.beginPhone(role, phone);
      const now = Date.now();
      setClockMs(now);
      setCode('');
      setRequiresResend(false);
      setRateLimitUntil(0);
      setResendAvailableAt(
        createOtpCooldownDeadline(OTP_RESEND_COOLDOWN_SECONDS, now),
      );
      AccessibilityInfo.announceForAccessibility('A new verification code was sent.');
    } catch (caught) {
      applyFailureRecovery(caught);
    } finally {
      requestGate.current.release();
      setBusy(false);
    }
  };

  const updateCode = (value: string) => {
    setCode(sanitizeOtpCode(value));
    if (error && !requiresResend && !rateLimited) {
      setError(null);
    }
  };

  const resendLabel = !phone
    ? 'Start phone verification again'
    : rateLimited
      ? `Try again in ${rateLimitSeconds}s`
      : resendSeconds > 0
        ? `Resend code in ${resendSeconds}s`
        : 'Resend verification code';

  return (
    <AuthShell>
      <ScreenHeader title="Verify OTP" onBack={() => navigation.goBack()} />
      <AuthCard>
        <Text style={styles.title}>Enter verification code</Text>
        <Text style={styles.desc}>
          {phone
            ? `We sent a 6-digit code to ${phone}.`
            : 'Your phone verification session expired. Go back and request a new code.'}
        </Text>
        <InputField
          value={code}
          onChangeText={updateCode}
          placeholder="6-digit OTP"
          keyboardType="number-pad"
          returnKeyType="done"
          textContentType="oneTimeCode"
          autoFocus={Boolean(phone)}
          selectTextOnFocus
          maxLength={OTP_CODE_LENGTH}
          disabled={busy || requiresResend || rateLimited || !phone}
          accessibilityLabel="Verification code"
          accessibilityHint="Enter the six digit code sent to your phone"
          error={error ?? undefined}
          onSubmitEditing={finish}
        />
        <PrimaryButton
          label="Verify & Continue"
          loading={busy}
          disabled={!canVerify}
          accessibilityHint="Verifies this phone code and continues sign in"
          onPress={finish}
        />
        <Pressable
          disabled={!canResend}
          onPress={resend}
          accessibilityRole="button"
          accessibilityState={{disabled: !canResend}}
          accessibilityHint="Requests a new verification code for this phone number">
          <Text style={[styles.resend, !canResend && styles.muted]}>{resendLabel}</Text>
        </Pressable>
        <SecurityNote />
      </AuthCard>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  title: {fontSize: 20, fontWeight: '700', color: colors.espressoBrown},
  desc: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.mutedText,
    marginTop: 7,
    marginBottom: spacing.lg,
  },
  resend: {
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '600',
    color: colors.flameRed,
    marginTop: spacing.sm,
  },
  muted: {color: colors.mutedText},
});
