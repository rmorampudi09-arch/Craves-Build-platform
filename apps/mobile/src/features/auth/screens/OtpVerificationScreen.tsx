import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Pressable, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../../app/navigation/types';
import { useAppDispatch } from '../../../app/store/hooks';
import { toAppApiError } from '../../../core/http/apiError';
import { VideoAuthLayout } from '../components/VideoAuthLayout';
import { AuthOtpInput } from '../components/AuthOtpInput';
import { AuthActionButton } from '../components/AuthActionButton';
import { AuthRoleCards } from '../components/AuthRoleCards';
import { loginStyles as styles } from '../components/loginStyles';
import {
  formatLoginCountdown,
  maskLoginPhone,
} from '../components/loginPresentation';
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
import { useAuthAttemptRole } from '../hooks/useAuthAttemptRole';
import { authService } from '../state/authService';
import { authActions } from '../state/authSlice';
import { authTransitionMemory } from '../state/authTransitionMemory';

type Props = NativeStackScreenProps<RootStackParamList, 'OtpVerification'>;

export function OtpVerificationScreen({ navigation, route }: Props) {
  const dispatch = useAppDispatch();
  const { role } = useAuthAttemptRole(route.params.role);
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
    Boolean(phone) &&
    isOtpCodeComplete(code) &&
    !busy &&
    !requiresResend &&
    !rateLimited;
  const canResend =
    Boolean(phone) && resendSeconds === 0 && !busy && !rateLimited;

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
      AccessibilityInfo.announceForAccessibility(
        'A new verification code was sent.',
      );
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
    ? `Resend code in ${formatLoginCountdown(resendSeconds)}`
    : 'Resend code';

  return (
    <VideoAuthLayout
      variant="otp"
      onBack={() => navigation.goBack()}
      backDisabled={busy}
    >
      <AuthRoleCards value={role} descriptions={false} />
      <View style={styles.heading}>
        <Text style={styles.title}>Verify your number</Text>
        <Text style={styles.description}>
          {phone
            ? 'Enter the 6-digit code sent to'
            : 'Your phone verification session expired. Go back and request a new code.'}
        </Text>
        {phone ? (
          <View style={styles.destinationRow}>
            <Text style={[styles.description, styles.emphasis]}>
              {maskLoginPhone(phone)}
            </Text>
            <Pressable
              onPress={() => navigation.goBack()}
              disabled={busy}
              accessibilityRole="link"
              accessibilityLabel="Edit phone number"
              style={styles.linkTouch}
            >
              <Text style={styles.link}>Edit</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
      <AuthOtpInput
        value={code}
        onChangeText={updateCode}
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
      <Pressable
        disabled={!canResend}
        onPress={resend}
        accessibilityRole="button"
        accessibilityState={{ disabled: !canResend }}
        accessibilityHint="Requests a new verification code for this phone number"
        accessibilityLabel={resendLabel}
        style={styles.linkTouch}
      >
        <Text style={canResend ? styles.link : styles.description}>
          {phone && !rateLimited && resendSeconds > 0 ? (
            <>
              Resend code in{' '}
              <Text style={styles.emphasis}>
                {formatLoginCountdown(resendSeconds)}
              </Text>
            </>
          ) : (
            resendLabel
          )}
        </Text>
      </Pressable>
      <AuthActionButton
        label="Verify & continue"
        loading={busy}
        disabled={!canVerify}
        accessibilityHint="Verifies this phone code and continues sign in"
        onPress={finish}
      />
      <Text style={styles.description}>
        Signing in as{' '}
        <Text style={styles.emphasis}>
          {role === 'CHEF' ? 'Chef' : 'Customer'}
        </Text>
      </Text>
    </VideoAuthLayout>
  );
}
