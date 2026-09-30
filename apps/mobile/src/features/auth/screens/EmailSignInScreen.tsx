import React, { useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../../app/navigation/types';
import { useAppDispatch } from '../../../app/store/hooks';
import { toAppApiError } from '../../../core/http/apiError';
import { VideoAuthLayout } from '../components/VideoAuthLayout';
import { AuthTextField } from '../components/AuthTextField';
import { AuthActionButton } from '../components/AuthActionButton';
import { AuthRoleCards } from '../components/AuthRoleCards';
import { loginStyles as styles } from '../components/loginStyles';
import {
  createEmailAuthRoleContext,
  createEmailRequestGate,
  createEmailSignInSubmission,
  getEmailSignInFieldErrors,
  getPasswordRecoveryEmail,
} from '../domain/emailSignInPolicy';
import { useAuthAttemptRole } from '../hooks/useAuthAttemptRole';
import { authService } from '../state/authService';
import { authActions } from '../state/authSlice';
import { authTransitionMemory } from '../state/authTransitionMemory';

type Props = NativeStackScreenProps<RootStackParamList, 'EmailSignIn'>;

type TouchedFields = {
  email: boolean;
  password: boolean;
};

export function EmailSignInScreen({ navigation, route }: Props) {
  const dispatch = useAppDispatch();
  const { role, selectRole } = useAuthAttemptRole(route.params.role);
  const [email, setEmail] = useState(
    () => authTransitionMemory.takeEmailPrefill() ?? '',
  );
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [touched, setTouched] = useState<TouchedFields>({
    email: false,
    password: false,
  });
  const requestGate = useRef(createEmailRequestGate());

  const fieldErrors = getEmailSignInFieldErrors(email, password);
  const valid = !fieldErrors.email && !fieldErrors.password;

  const clearRequestError = () => {
    if (requestError) {
      setRequestError(null);
    }
  };

  const updateEmail = (value: string) => {
    setEmail(value);
    clearRequestError();
  };

  const updatePassword = (value: string) => {
    setPassword(value);
    clearRequestError();
  };

  const submit = async () => {
    setTouched({ email: true, password: true });
    if (!valid || busy || !requestGate.current.tryAcquire()) {
      return;
    }

    setBusy(true);
    setRequestError(null);
    const submission = createEmailSignInSubmission(role, email, password);

    try {
      const tokens = await authService.emailLogin(
        submission.email,
        submission.password,
      );
      dispatch(authActions.authenticated(tokens.identity));
    } catch (error) {
      const mapped = toAppApiError(error);
      if (mapped.code === 'PHONE_VERIFICATION_REQUIRED') {
        navigation.replace(
          'PhoneSignIn',
          createEmailAuthRoleContext(submission.role),
        );
        return;
      }
      setRequestError(mapped.message);
    } finally {
      requestGate.current.release();
      setBusy(false);
    }
  };

  const openPasswordRecovery = () => {
    if (busy) {
      return;
    }
    const recoveryEmail = getPasswordRecoveryEmail(email);
    if (recoveryEmail) {
      authTransitionMemory.setPasswordRecoveryEmail(recoveryEmail);
    } else {
      authTransitionMemory.clearPasswordRecoveryEmail();
    }
    navigation.navigate('ForgotPassword', { role });
  };

  const openPhoneSignIn = () => {
    if (busy) {
      return;
    }
    navigation.navigate('PhoneSignIn', createEmailAuthRoleContext(role));
  };

  return (
    <VideoAuthLayout onBack={() => navigation.goBack()} backDisabled={busy}>
      <AuthRoleCards value={role} onChange={selectRole} disabled={busy} />
      <View style={styles.heading}>
        <Text style={styles.title}>Welcome back</Text>
        <Text style={styles.description}>
          Log in with your email and password.
        </Text>
      </View>
      <AuthTextField
        label="Email address"
        value={email}
        onChangeText={updateEmail}
        onBlur={() => setTouched(current => ({ ...current, email: true }))}
        placeholder="Email Address"
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="emailAddress"
        importantForAutofill="yes"
        leftIcon="mail"
        accessibilityLabel="Email address"
        disabled={busy}
        error={touched.email ? fieldErrors.email : undefined}
      />
      <AuthTextField
        label="Password"
        value={password}
        onChangeText={updatePassword}
        onBlur={() => setTouched(current => ({ ...current, password: true }))}
        placeholder="Password"
        secureTextEntry={!passwordVisible}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="current-password"
        textContentType="password"
        importantForAutofill="yes"
        returnKeyType="done"
        leftIcon="lock"
        rightIcon={passwordVisible ? 'eye-off' : 'eye'}
        rightIconAccessibilityLabel={
          passwordVisible ? 'Hide password' : 'Show password'
        }
        onRightIconPress={() => setPasswordVisible(value => !value)}
        accessibilityLabel="Password"
        disabled={busy}
        error={touched.password ? fieldErrors.password : undefined}
        onSubmitEditing={submit}
      />
      {requestError ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {requestError}
        </Text>
      ) : null}
      <Pressable
        accessibilityRole="link"
        accessibilityState={{ disabled: busy }}
        disabled={busy}
        style={styles.rightLinkTouch}
        onPress={openPasswordRecovery}
      >
        <Text style={[styles.link, busy && styles.disabled]}>
          Forgot password?
        </Text>
      </Pressable>
      <AuthActionButton
        label={role === 'CHEF' ? 'Log in as Chef' : 'Log in as Customer'}
        loading={busy}
        disabled={!valid || busy}
        accessibilityHint="Signs in to the selected Craves account"
        onPress={submit}
      />
      <AuthActionButton
        outline
        label="Use phone OTP instead"
        disabled={busy}
        onPress={openPhoneSignIn}
      />
    </VideoAuthLayout>
  );
}
