import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Pressable, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../../app/navigation/types';
import { useAppDispatch } from '../../../app/store/hooks';
import { toAppApiError } from '../../../core/http/apiError';
import { VideoAuthLayout } from '../components/VideoAuthLayout';
import { AuthOtpInput } from '../components/AuthOtpInput';
import { AuthActionButton } from '../components/AuthActionButton';
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
  remainingOtpCooldownSeconds,
  sanitizeOtpCode,
} from '../domain/otpVerificationPolicy';
import { useAuthAttemptRole } from '../hooks/useAuthAttemptRole';
import { listenForOtpSms } from '../sms/otpSmsConsent';
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
    authService.otpResendAvailableAt(),
  );
  const [rateLimitUntil, setRateLimitUntil] = useState(0);
  const [requiresResend, setRequiresResend] = useState(false);
  const [requiresRestart, setRequiresRestart] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestGate = useRef(createOtpRequestGate());
  const mounted = useRef(true);
  const resendAvailabilityAnnounced = useRef(false);
  // Bumped after each resend so the next SMS can be read too.
  const [smsRound, setSmsRound] = useState(0);

  const resendSeconds = remainingOtpCooldownSeconds(resendAvailableAt, clockMs);
  const rateLimitSeconds = remainingOtpCooldownSeconds(rateLimitUntil, clockMs);
  const rateLimited = rateLimitSeconds > 0;
  const verifyBlocked =
    !phone || busy || requiresResend || requiresRestart || rateLimited;
  const canVerify = isOtpCodeComplete(code) && !verifyBlocked;
  const canResend =
    Boolean(phone) &&
    resendSeconds === 0 &&
    !busy &&
    !rateLimited &&
    !requiresRestart;

  useEffect(() => {
    const id = setInterval(() => setClockMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      authService.cancelPhoneVerification();
      authTransitionMemory.clearPendingPhone();
    };
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
    if (
      ['OTP_RESTART', 'OTP_RESEND_LIMIT', 'OTP_CANCELLED'].includes(
        apiError.code,
      )
    ) {
      setRequiresRestart(true);
      setCode('');
    }
    setResendAvailableAt(authService.otpResendAvailableAt());

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

  const finish = async (value: string = code) => {
    if (
      !isOtpCodeComplete(value) ||
      verifyBlocked ||
      !requestGate.current.tryAcquire()
    ) {
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const tokens = await authService.confirmOtp(value);
      if (!mounted.current) {
        return;
      }
      authTransitionMemory.clearPendingPhone();
      dispatch(authActions.authenticated(tokens.identity));
    } catch (caught) {
      if (mounted.current) {
        applyFailureRecovery(caught);
      }
    } finally {
      requestGate.current.release();
      if (mounted.current) {
        setBusy(false);
      }
    }
  };

  const resend = async () => {
    if (!phone || !canResend || !requestGate.current.tryAcquire()) {
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await authService.resendOtp(phone);
      if (!mounted.current) {
        return;
      }
      const now = Date.now();
      setClockMs(now);
      setCode('');
      setRequiresResend(false);
      setRateLimitUntil(0);
      setSmsRound(round => round + 1);
      setResendAvailableAt(authService.otpResendAvailableAt());
      AccessibilityInfo.announceForAccessibility(
        'A new verification code was sent.',
      );
    } catch (caught) {
      if (mounted.current) {
        applyFailureRecovery(caught);
      }
    } finally {
      requestGate.current.release();
      if (mounted.current) {
        setBusy(false);
      }
    }
  };

  const finishRef = useRef(finish);
  finishRef.current = finish;

  useEffect(() => {
    if (!phone) {
      return undefined;
    }
    // Fill and verify straight from the SMS once the user taps Allow.
    return listenForOtpSms(otp => {
      setCode(otp);
      finishRef.current(otp);
    });
  }, [phone, smsRound]);

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
    <VideoAuthLayout onBack={() => navigation.goBack()} backDisabled={busy}>
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
        maxLength={OTP_CODE_LENGTH}
        disabled={busy || requiresResend || rateLimited || !phone}
        accessibilityLabel="Verification code"
        accessibilityHint="Enter the six digit code sent to your phone"
        error={error ?? undefined}
        onSubmitEditing={() => finish()}
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
        onPress={() => finish()}
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
