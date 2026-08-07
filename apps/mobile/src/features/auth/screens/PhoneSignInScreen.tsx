import React, {useRef, useState} from 'react';
import {StyleSheet, Text} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import type {RootStackParamList} from '../../../app/navigation/types';
import {toAppApiError} from '../../../core/http/apiError';
import {colors, spacing} from '../../../design/tokens';
import {authService} from '../state/authService';
import {AuthCard} from '../components/AuthCard';
import {AuthHero} from '../components/AuthHero';
import {AuthShell} from '../components/AuthShell';
import {InputField} from '../components/InputField';
import {PrimaryButton} from '../components/PrimaryButton';
import {RoleSelector} from '../components/RoleSelector';
import {SecurityNote} from '../components/SecurityNote';
import {
  createPhoneRequestGate,
  DEFAULT_PHONE_COUNTRY,
  getPhoneValidationError,
  isSupportedPhoneValid,
  sanitizeNationalPhone,
  toSupportedPhoneE164,
} from '../domain/phoneSignInPolicy';
import {useAuthAttemptRole} from '../hooks/useAuthAttemptRole';

type Props = NativeStackScreenProps<RootStackParamList, 'PhoneSignIn'>;

export function PhoneSignInScreen({navigation, route}: Props) {
  const {role, selectRole} = useAuthAttemptRole(route.params.role);
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const requestGate = useRef(createPhoneRequestGate());
  const phoneValid = isSupportedPhoneValid(phone);
  const validationError = getPhoneValidationError(phone);

  const submit = async () => {
    if (!phoneValid || busy || !requestGate.current.tryAcquire()) {
      return;
    }

    setBusy(true);
    setRequestError(null);
    const submissionRole = role;
    const e164 = toSupportedPhoneE164(phone);

    try {
      await authService.beginPhone(submissionRole, e164);
      navigation.navigate('OtpVerification', {
        role: submissionRole,
        phone: e164,
      });
    } catch (error) {
      setRequestError(toAppApiError(error).message);
    } finally {
      requestGate.current.release();
      setBusy(false);
    }
  };

  const updatePhone = (value: string) => {
    setPhone(sanitizeNationalPhone(value));
    if (requestError) {
      setRequestError(null);
    }
  };

  return (
    <AuthShell>
      <AuthHero role={role} />
      <RoleSelector value={role} onChange={selectRole} disabled={busy} />
      <AuthCard>
        <Text style={styles.title}>Verify your phone number</Text>
        <Text style={styles.desc}>
          We use Firebase phone verification to keep your Craves account secure.
        </Text>
        <InputField
          value={phone}
          onChangeText={updatePhone}
          placeholder="Phone Number"
          keyboardType="phone-pad"
          returnKeyType="done"
          textContentType="telephoneNumber"
          autoComplete="tel"
          leftIcon="phone"
          prefix={DEFAULT_PHONE_COUNTRY.dialCode}
          maxLength={DEFAULT_PHONE_COUNTRY.nationalDigits}
          accessibilityLabel="Phone number"
          disabled={busy}
          error={validationError}
          onSubmitEditing={() => {
            void submit();
          }}
        />
        {requestError ? (
          <Text accessibilityRole="alert" style={styles.requestError}>
            {requestError}
          </Text>
        ) : null}
        <PrimaryButton
          label="Continue"
          loading={busy}
          disabled={!phoneValid || busy}
          accessibilityHint="Requests a verification code for this phone number"
          onPress={submit}
        />
        <PrimaryButton
          variant="outline"
          label="Login with email/password"
          leftIcon="mail"
          rightIcon="chevron"
          disabled={busy}
          onPress={() => navigation.navigate('EmailSignIn', {role})}
        />
        <SecurityNote />
      </AuthCard>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  title: {fontSize: 18, fontWeight: '700', color: colors.espressoBrown},
  desc: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.mutedText,
    marginTop: 6,
    marginBottom: spacing.lg,
  },
  requestError: {
    color: colors.error,
    fontSize: 13,
    lineHeight: 18,
    marginTop: spacing.sm,
  },
});
