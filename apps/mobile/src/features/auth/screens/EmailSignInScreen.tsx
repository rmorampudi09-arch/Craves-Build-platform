import React, {useState} from 'react';
import {StyleSheet, Text} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import type {RootStackParamList} from '../../../app/navigation/types';
import {toAppApiError} from '../../../core/http/apiError';
import {colors, spacing} from '../../../design/tokens';
import {emailLoginSchema} from '../../../utils/validation';
import {AuthCard} from '../components/AuthCard';
import {AuthHero} from '../components/AuthHero';
import {AuthShell} from '../components/AuthShell';
import {InputField} from '../components/InputField';
import {PrimaryButton} from '../components/PrimaryButton';
import {RoleSelector} from '../components/RoleSelector';
import {SecurityNote} from '../components/SecurityNote';
import {useAuthAttemptRole} from '../hooks/useAuthAttemptRole';
import {authService} from '../state/authService';
import {useAppDispatch} from '../../../app/store/hooks';
import {authActions} from '../state/authSlice';

type Props = NativeStackScreenProps<RootStackParamList, 'EmailSignIn'>;

export function EmailSignInScreen({navigation, route}: Props) {
  const dispatch = useAppDispatch();
  const {role, selectRole} = useAuthAttemptRole(route.params.role);
  const [email, setEmail] = useState(route.params.email ?? '');
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = emailLoginSchema.safeParse({email, password}).success;

  const submit = async () => {
    if (!valid || busy) {
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const tokens = await authService.emailLogin(email, password);
      dispatch(authActions.authenticated(tokens.identity));
    } catch (e) {
      const mapped = toAppApiError(e);
      if (mapped.code === 'PHONE_VERIFICATION_REQUIRED') {
        navigation.replace('PhoneSignIn', {role});
        return;
      }
      setError(mapped.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell>
      <AuthHero role={role} />
      <RoleSelector value={role} onChange={selectRole} />
      <AuthCard>
        <Text style={styles.title}>Login with email/password</Text>
        <Text style={styles.desc}>
          Securely sign in to your {role === 'CHEF' ? 'approved chef' : 'Craves'} account.
        </Text>
        <InputField
          value={email}
          onChangeText={setEmail}
          placeholder="Email Address"
          keyboardType="email-address"
          autoCapitalize="none"
          leftIcon="mail"
        />
        <InputField
          value={password}
          onChangeText={setPassword}
          placeholder="Password"
          secureTextEntry={!visible}
          leftIcon="lock"
          rightIcon={visible ? 'eye-off' : 'eye'}
          onRightIconPress={() => setVisible(value => !value)}
          error={error ?? undefined}
        />
        <Text
          style={styles.forgot}
          onPress={() => navigation.navigate('ForgotPassword', {role, email})}>
          Forgot password?
        </Text>
        <PrimaryButton
          label="Login"
          loading={busy}
          disabled={!valid || busy}
          onPress={submit}
        />
        <PrimaryButton
          variant="outline"
          label="Continue with phone number"
          leftIcon="phone"
          onPress={() => navigation.navigate('PhoneSignIn', {role})}
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
  forgot: {
    alignSelf: 'flex-end',
    fontSize: 12,
    fontWeight: '600',
    color: colors.flameRed,
    marginTop: -8,
    marginBottom: spacing.md,
  },
});
