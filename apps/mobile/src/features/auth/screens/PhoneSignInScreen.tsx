import React, { useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../../app/navigation/types';
import { toAppApiError } from '../../../core/http/apiError';
import { authService } from '../state/authService';
import { authTransitionMemory } from '../state/authTransitionMemory';
import { VideoAuthLayout } from '../components/VideoAuthLayout';
import { AuthTextField } from '../components/AuthTextField';
import { AuthActionButton } from '../components/AuthActionButton';
import { AuthRoleCards } from '../components/AuthRoleCards';
import { loginStyles as styles } from '../components/loginStyles';
import {
  createPhoneRequestGate,
  createPhoneSignInSubmission,
  DEFAULT_PHONE_COUNTRY,
  getPhoneSignInCopy,
  getPhoneValidationError,
  isSupportedPhoneValid,
  sanitizeNationalPhone,
} from '../domain/phoneSignInPolicy';
import { useAuthAttemptRole } from '../hooks/useAuthAttemptRole';

type Props = NativeStackScreenProps<RootStackParamList, 'PhoneSignIn'>;

export function PhoneSignInScreen({ navigation, route }: Props) {
  const { role, selectRole } = useAuthAttemptRole(route.params.role);
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [chefSignup, setChefSignup] = useState(false);
  const phoneInput = useRef<TextInput>(null);
  const requestGate = useRef(createPhoneRequestGate());
  const phoneValid = isSupportedPhoneValid(phone);
  const validationError = getPhoneValidationError(phone);
  const copy = getPhoneSignInCopy(role);

  const submit = async () => {
    if (!phoneValid || busy || !requestGate.current.tryAcquire()) {
      return;
    }

    setBusy(true);
    setRequestError(null);
    authTransitionMemory.clearPendingPhone();
    const submission = createPhoneSignInSubmission(role, phone);

    try {
      await authService.beginPhone(submission.role, submission.phone);
      authTransitionMemory.setPendingPhone(submission.phone);
      navigation.navigate('OtpVerification', { role: submission.role });
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

  const heading = (
    <View style={styles.heading}>
        <Text style={styles.title}>
          {chefSignup && role === 'CHEF'
            ? 'Create your Chef account'
            : 'Your number, please'}
        </Text>
        <Text style={styles.description}>
          We'll send a one-time code to sign you in.
        </Text>
    </View>
  );

  return (
    <VideoAuthLayout onBack={() => navigation.goBack()} backDisabled={busy}>
      {role === 'CHEF' ? heading : null}
      <AuthRoleCards
        value={role}
        onChange={nextRole => {
          selectRole(nextRole);
          setChefSignup(false);
        }}
        disabled={busy}
      />
      {role === 'CUSTOMER' ? heading : null}
      <AuthTextField
        ref={phoneInput}
        label="Mobile number"
        value={phone}
        onChangeText={updatePhone}
        placeholder="Enter 10-digit number"
        keyboardType="phone-pad"
        returnKeyType="done"
        textContentType="telephoneNumber"
        autoComplete="tel"
        prefix={DEFAULT_PHONE_COUNTRY.dialCode}
        maxLength={DEFAULT_PHONE_COUNTRY.nationalDigits}
        accessibilityLabel="Phone number"
        disabled={busy}
        error={validationError}
        onSubmitEditing={submit}
      />
      {requestError ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {requestError}
        </Text>
      ) : null}
      <AuthActionButton
        label="Send OTP"
        loading={busy}
        disabled={!phoneValid || busy}
        accessibilityHint={copy.continueAccessibilityHint}
        onPress={submit}
      />
      <View style={styles.divider}>
        <View style={styles.line} />
        <Text style={styles.dividerText}>or</Text>
        <View style={styles.line} />
      </View>
      <AuthActionButton
        outline
        label="Use email & password"
        disabled={busy}
        onPress={() => navigation.navigate('EmailSignIn', { role })}
      />
      {role === 'CHEF' ? (
        <Pressable
          disabled={busy}
          accessibilityRole="link"
          accessibilityLabel="New chef sign up"
          accessibilityHint="Enter your number and use phone OTP to create a Chef account"
          onPress={() => {
            setChefSignup(true);
            phoneInput.current?.focus();
          }}
          style={styles.linkTouch}
        >
          <Text style={[styles.link, busy && styles.disabled]}>
            New chef sign up
          </Text>
        </Pressable>
      ) : null}
    </VideoAuthLayout>
  );
}
