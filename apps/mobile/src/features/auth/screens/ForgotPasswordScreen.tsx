import React, {useState} from 'react';
import {StyleSheet, Text} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import type {RootStackParamList} from '../../../app/navigation/types';
import {toAppApiError} from '../../../core/http/apiError';
import {colors, spacing} from '../../../design/tokens';
import {emailSchema} from '../../../utils/validation';
import {AuthCard} from '../components/AuthCard';
import {AuthShell} from '../components/AuthShell';
import {InputField} from '../components/InputField';
import {PrimaryButton} from '../components/PrimaryButton';
import {ScreenHeader} from '../components/ScreenHeader';
import {useAuthAttemptRole} from '../hooks/useAuthAttemptRole';
import {authService} from '../state/authService';

type Props = NativeStackScreenProps<RootStackParamList, 'ForgotPassword'>;

export function ForgotPasswordScreen({navigation, route}: Props) {
  useAuthAttemptRole(route.params.role);
  const [email, setEmail] = useState(route.params.email ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = emailSchema.safeParse(email).success;

  const submit = async () => {
    if (!valid || busy) {
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await authService.sendPasswordReset(email);
      navigation.replace('PasswordResetSent', {
        role: route.params.role,
        email: email.trim().toLowerCase(),
      });
    } catch (e) {
      setError(toAppApiError(e).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell>
      <ScreenHeader title="Reset password" onBack={() => navigation.goBack()} />
      <AuthCard>
        <Text style={styles.title}>Forgot your password?</Text>
        <Text style={styles.desc}>
          Enter the email linked to your Craves account. Firebase will send a secure reset link.
        </Text>
        <InputField
          value={email}
          onChangeText={setEmail}
          placeholder="Email Address"
          keyboardType="email-address"
          autoCapitalize="none"
          leftIcon="mail"
          error={error ?? undefined}
        />
        <PrimaryButton
          label="Send reset link"
          loading={busy}
          disabled={!valid || busy}
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
});
