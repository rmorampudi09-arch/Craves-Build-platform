import React, {useRef, useState} from 'react';
import {StyleSheet, Text} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import type {RootStackParamList} from '../../../app/navigation/types';
import {toAppApiError} from '../../../core/http/apiError';
import {colors, spacing} from '../../../design/tokens';
import {AuthCard} from '../components/AuthCard';
import {AuthShell} from '../components/AuthShell';
import {InputField} from '../components/InputField';
import {PrimaryButton} from '../components/PrimaryButton';
import {ScreenHeader} from '../components/ScreenHeader';
import {
  createPasswordRecoveryRequestGate,
  createPasswordRecoverySubmission,
  getPasswordRecoveryEmailError,
} from '../domain/passwordRecoveryPolicy';
import {useAuthAttemptRole} from '../hooks/useAuthAttemptRole';
import {authService} from '../state/authService';
import {authTransitionMemory} from '../state/authTransitionMemory';

type Props = NativeStackScreenProps<RootStackParamList, 'ForgotPassword'>;

export function ForgotPasswordScreen({navigation, route}: Props) {
  const {role} = useAuthAttemptRole(route.params.role);
  const [email, setEmail] = useState(
    () => authTransitionMemory.getPasswordRecoveryEmail() ?? '',
  );
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const requestGate = useRef(createPasswordRecoveryRequestGate());
  const emailError = getPasswordRecoveryEmailError(email);
  const valid = !emailError;

  const updateEmail = (value: string) => {
    setEmail(value);
    if (requestError) {
      setRequestError(null);
    }
  };

  const returnToLogin = () => {
    if (busy) {
      return;
    }
    if (navigation.canGoBack()) {
      authTransitionMemory.clearPasswordRecoveryEmail();
      navigation.goBack();
      return;
    }
    if (valid) {
      const submission = createPasswordRecoverySubmission(role, email);
      authTransitionMemory.setEmailPrefill(submission.email);
    } else {
      authTransitionMemory.clearEmailPrefill();
    }
    authTransitionMemory.clearPasswordRecoveryEmail();
    navigation.replace('EmailSignIn', {role});
  };

  const submit = async () => {
    setTouched(true);
    if (!valid || busy || !requestGate.current.tryAcquire()) {
      return;
    }

    const submission = createPasswordRecoverySubmission(role, email);
    let completed = false;
    setBusy(true);
    setRequestError(null);

    try {
      await authService.sendPasswordReset(submission.email);
      completed = true;
    } catch (error) {
      setRequestError(toAppApiError(error).message);
    } finally {
      requestGate.current.release();
      setBusy(false);
    }

    if (completed) {
      authTransitionMemory.setPasswordRecoveryEmail(submission.email);
      navigation.replace('PasswordResetSent', {role: submission.role});
    }
  };

  return (
    <AuthShell>
      <ScreenHeader title="Reset password" onBack={returnToLogin} />
      <AuthCard>
        <Text style={styles.title}>Forgot your password?</Text>
        <Text style={styles.desc}>
          Enter the email you use for Craves. If an account matches, we will send secure reset
          instructions.
        </Text>
        <InputField
          value={email}
          onChangeText={updateEmail}
          onBlur={() => setTouched(true)}
          onSubmitEditing={submit}
          placeholder="Email Address"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="emailAddress"
          importantForAutofill="yes"
          returnKeyType="send"
          leftIcon="mail"
          accessibilityLabel="Password recovery email address"
          disabled={busy}
          error={touched ? emailError : undefined}
        />
        {requestError ? (
          <Text accessibilityRole="alert" style={styles.requestError}>
            {requestError}
          </Text>
        ) : null}
        <PrimaryButton
          label="Send reset link"
          loading={busy}
          disabled={!valid || busy}
          accessibilityHint="Requests password reset instructions without revealing account status"
          onPress={submit}
        />
      </AuthCard>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  title: {fontSize: 21, fontWeight: '700', color: colors.espressoBrown},
  desc: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.mutedText,
    marginTop: 7,
    marginBottom: spacing.lg,
  },
  requestError: {
    color: colors.error,
    fontSize: 13,
    lineHeight: 18,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
});
