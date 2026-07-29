import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import {
  getAuth,
  signInWithPhoneNumber,
  type ConfirmationResult
} from '@react-native-firebase/auth';
import { useAuth } from '../auth/AuthProvider';
import { MobileAuthError } from '../auth/craves-auth';
import { theme } from '../theme';

export function PhoneOtpScreen() {
  const [phone, setPhone] = useState('+91');
  const [otp, setOtp] = useState('');
  const [stage, setStage] = useState<'phone' | 'otp'>('phone');
  const [message, setMessage] = useState('Enter your mobile number with country code.');
  const [busy, setBusy] = useState(false);
  const confirmation = useRef<ConfirmationResult | null>(null);
  const { createSession } = useAuth();

  async function sendOtp() {
    const normalized = phone.replace(/[\s()-]/g, '');
    if (!/^\+[1-9]\d{7,14}$/.test(normalized)) {
      setMessage('Enter a valid mobile number, for example +919876543210.');
      return;
    }
    setBusy(true);
    setMessage('Requesting OTP securely through Firebase…');
    try {
      confirmation.current = await signInWithPhoneNumber(getAuth(), normalized);
      setStage('otp');
      setMessage('OTP sent. Enter the six-digit code.');
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
      setMessage(code.includes('too-many-requests')
        ? 'Too many OTP attempts. Please try again later.'
        : 'OTP could not be sent. Check the number and try again.');
    } finally {
      setBusy(false);
    }
  }

  async function verifyOtp() {
    if (!confirmation.current || !/^\d{6}$/.test(otp)) {
      setMessage('Enter the six-digit OTP.');
      return;
    }
    setBusy(true);
    setMessage('Verifying OTP and creating your Craves session…');
    try {
      const credential = await confirmation.current.confirm(otp);
      if (!credential) throw new Error('OTP verification failed');
      const idToken = await credential.user.getIdToken(true);
      await createSession(idToken);
    } catch (error) {
      if (error instanceof MobileAuthError) {
        setMessage(error.message);
      } else {
        setMessage('The OTP could not be verified. Request a new OTP if it expired.');
      }
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    confirmation.current = null;
    setOtp('');
    setStage('phone');
    setMessage('Request a new OTP.');
  }

  return (
    <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.card}>
        <Text style={styles.eyebrow}>SECURE CUSTOMER ACCESS</Text>
        <Text style={styles.title}>Sign in with mobile OTP</Text>
        <Text style={styles.description}>Firebase verifies the OTP. Your Craves access session is stored only in the phone's secure keychain.</Text>

        {stage === 'phone' ? (
          <>
            <Text style={styles.label}>Mobile number</Text>
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              autoComplete="tel"
              editable={!busy}
              placeholder="+919876543210"
              placeholderTextColor="#94A3B8"
            />
            <Pressable style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]} disabled={busy} onPress={() => void sendOtp()}>
              {busy ? <ActivityIndicator color={theme.colors.white} /> : <Text style={styles.primaryText}>Send OTP</Text>}
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.label}>Six-digit OTP</Text>
            <TextInput
              style={[styles.input, styles.otpInput]}
              value={otp}
              onChangeText={value => setOtp(value.replace(/\D/g, '').slice(0, 6))}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="sms-otp"
              editable={!busy}
              maxLength={6}
              placeholder="123456"
              placeholderTextColor="#94A3B8"
            />
            <Pressable style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]} disabled={busy} onPress={() => void verifyOtp()}>
              {busy ? <ActivityIndicator color={theme.colors.white} /> : <Text style={styles.primaryText}>Verify OTP</Text>}
            </Pressable>
            <Pressable style={styles.secondaryButton} disabled={busy} onPress={reset}>
              <Text style={styles.secondaryText}>Use another number</Text>
            </Pressable>
          </>
        )}

        <Text accessibilityLiveRegion="polite" style={styles.message}>{message}</Text>
        <Text style={styles.disclaimer}>Use Firebase test phone numbers during development to avoid real SMS cost and rate limits.</Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: theme.colors.background, justifyContent: 'center', padding: 20 },
  card: { backgroundColor: theme.colors.card, borderRadius: theme.radius.card, padding: 24 },
  eyebrow: { color: theme.colors.primary, fontSize: 12, fontWeight: '800', letterSpacing: 1.8 },
  title: { color: theme.colors.text, fontSize: 30, fontWeight: '800', marginTop: 10 },
  description: { color: theme.colors.muted, fontSize: 15, lineHeight: 22, marginTop: 12 },
  label: { color: theme.colors.text, fontSize: 14, fontWeight: '700', marginTop: 24, marginBottom: 8 },
  input: { borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 16, backgroundColor: theme.colors.white, color: theme.colors.text, fontSize: 17, paddingHorizontal: 16, paddingVertical: 13 },
  otpInput: { textAlign: 'center', fontSize: 24, letterSpacing: 10 },
  primaryButton: { minHeight: 50, borderRadius: theme.radius.button, backgroundColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center', marginTop: 18 },
  primaryText: { color: theme.colors.white, fontSize: 16, fontWeight: '800' },
  secondaryButton: { minHeight: 48, borderRadius: theme.radius.button, borderWidth: 1, borderColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  secondaryText: { color: theme.colors.primary, fontWeight: '800' },
  pressed: { opacity: 0.86 },
  message: { backgroundColor: theme.colors.white, borderRadius: 16, color: theme.colors.muted, fontSize: 14, lineHeight: 20, marginTop: 18, padding: 14 },
  disclaimer: { color: theme.colors.muted, fontSize: 12, lineHeight: 18, marginTop: 14 }
});
