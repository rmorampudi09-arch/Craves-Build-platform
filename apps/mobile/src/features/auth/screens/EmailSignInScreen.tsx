import React, {useRef, useState} from 'react';
import {StyleSheet, Text} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import type {RootStackParamList} from '../../../app/navigation/types';
import {useAppDispatch} from '../../../app/store/hooks';
import {toAppApiError} from '../../../core/http/apiError';
import {colors, spacing} from '../../../design/tokens';
import {AuthCard} from '../components/AuthCard';
import {AuthHero} from '../components/AuthHero';
import {AuthShell} from '../components/AuthShell';
import {InputField} from '../components/InputField';
import {PrimaryButton} from '../components/PrimaryButton';
import {RoleSelector} from '../components/RoleSelector';
import {SecurityNote} from '../components/SecurityNote';
import {
  createEmailAuthRoleContext,
  createEmailPasswordRecoveryContext,
  createEmailRequestGate,
  createEmailSignInSubmission,
  getEmailSignInFieldErrors,
} from '../domain/emailSignInPolicy';
import {useAuthAttemptRole} from '../hooks/useAuthAttemptRole';
import {authService} from '../state/authService';
import {authActions} from '../state/authSlice';

type Props = NativeStackScreenProps<RootStackParamList, 'EmailSignIn'>;

type TouchedFields = {
  email: boolean;
  password: boolean;
};

export function EmailSignInScreen({navigation, route}: Props) {
  const dispatch = useAppDispatch();
  const {role, selectRole} = useAuthAttemptRole(route.params.role);
  const [email, setEmail] = useState(route.params.email ?? '');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [touched, setTouched] = useState<TouchedFields>({email: false, password: false});
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
    setTouched({email: true, password: true});
    if (!valid || busy || !requestGate.current.tryAcquire()) {
      return;
    }

    setBusy(true);
    setRequestError(null);
    const submission = createEmailSignInSubmission(role, email, password);

    try {
      const tokens = await authService.emailLogin(submission.email, submission.password);
      dispatch(authActions.authenticated(tokens.identity));
    } catch (error) {
      const mapped = toAppApiError(error);
      if (mapped.code === 'PHONE_VERIFICATION_REQUIRED') {
        navigation.replace('PhoneSignIn', createEmailAuthRoleContext(submission.role));
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
    navigation.navigate('ForgotPassword', createEmailPasswordRecoveryContext(role, email));
  };

  const openPhoneSignIn = () => {
    if (busy) {
      return;
    }
    navigation.navigate('PhoneSignIn', createEmailAuthRoleContext(role));
  };

  return (
    <AuthShell>
      <AuthHero role={role} />
      <RoleSelector value={role} onChange={selectRole} disabled={busy} />
      <AuthCard>
        <Text style={styles.title}>Login with email/password</Text>
        <Text style={styles.desc}>
          Securely sign in to your {role === 'CHEF' ? 'approved chef' : 'Craves'} account.
        </Text>
        <InputField
          value={email}
          onChangeText={updateEmail}
          onBlur={() => setTouched(current => ({...current, email: true}))}
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
        <InputField
          value={password}
          onChangeText={updatePassword}
          onBlur={() => setTouched(current => ({...current, password: true}))}
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
          rightIconAccessibilityLabel={passwordVisible ? 'Hide password' : 'Show password'}
          onRightIconPress={() => setPasswordVisible(value => !value)}
          accessibilityLabel="Password"
          disabled={busy}
          error={touched.password ? fieldErrors.password : undefined}
          onSubmitEditing={submit}
        />
        {requestError ? (
          <Text accessibilityRole="alert" style={styles.requestError}>
            {requestError}
          </Text>
        ) : null}
        <Text
          accessibilityRole="link"
          accessibilityState={{disabled: busy}}
          style={[styles.forgot, busy && styles.disabledLink]}
          onPress={openPasswordRecovery}>
          Forgot password?
        </Text>
        <PrimaryButton
          label="Login"
          loading={busy}
          disabled={!valid || busy}
          accessibilityHint="Signs in to the selected Craves account"
          onPress={submit}
        />
        <PrimaryButton
          variant="outline"
          label="Continue with phone number"
          leftIcon="phone"
          disabled={busy}
          onPress={openPhoneSignIn}
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
  forgot: {
    alignSelf: 'flex-end',
    fontSize: 12,
    fontWeight: '600',
    color: colors.flameRed,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  disabledLink: {opacity: 0.56},
});
