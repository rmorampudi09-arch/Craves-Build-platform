import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { CFEnvironment, CFSession } from 'cashfree-pg-api-contract';
import { CFPaymentGatewayService, type CFErrorResponse } from 'react-native-cashfree-pg-sdk';
import { useAuth } from '../auth/AuthProvider';
import { CheckoutApiError, createPaymentSession, getCheckout, verifyPayment } from '../checkout/checkout-api';
import type { MobileCheckout, MobilePaymentSession } from '../checkout/contracts';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { theme } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'MobilePayment'>;
function money(amount: number, currency: string): string { try { return new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(amount); } catch { return `${currency} ${amount.toFixed(2)}`; } }

export function MobilePaymentScreen({ route, navigation }: Props) {
  const { session, signOut } = useAuth();
  const [checkout, setCheckout] = useState<MobileCheckout | null>(null);
  const [payment, setPayment] = useState<MobilePaymentSession | null>(null);
  const [message, setMessage] = useState('Loading checkout…');
  const [busy, setBusy] = useState(false);
  const paymentRef = useRef<MobilePaymentSession | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    if (!session) return;
    getCheckout(session, route.params.checkoutId)
      .then(result => { if (mounted.current) { setCheckout(result); setMessage(result.status === 'PAID' ? 'This checkout is already paid.' : 'Ready for Cashfree sandbox checkout.'); } })
      .catch(async error => { if (error instanceof CheckoutApiError && error.code === 'SESSION_EXPIRED') await signOut(); if (mounted.current) setMessage(error instanceof Error ? error.message : 'Checkout is unavailable.'); });
  }, [route.params.checkoutId, session, signOut]);

  useEffect(() => {
    if (!session) return;
    CFPaymentGatewayService.setCallback({
      onVerify: (cashfreeOrderId: string) => {
        const current = paymentRef.current;
        if (!current || current.cashfreeOrderId !== cashfreeOrderId) {
          if (mounted.current) setMessage('Cashfree returned an unexpected order reference. Payment was not accepted by Craves.');
          return;
        }
        void verifyOwnedPayment(current.paymentOrderId);
      },
      onError: (_error: CFErrorResponse, cashfreeOrderId: string) => {
        const current = paymentRef.current;
        if (mounted.current) setMessage(current?.cashfreeOrderId === cashfreeOrderId ? 'Cashfree checkout did not complete. No payment is marked successful until backend verification.' : 'Cashfree checkout returned an unexpected order reference.');
      }
    });
    return () => { CFPaymentGatewayService.removeCallback(); };
  }, [session]);

  async function verifyOwnedPayment(paymentOrderId: string) {
    if (!session) return;
    if (mounted.current) { setBusy(true); setMessage('Verifying payment with Craves backend…'); }
    try {
      const verification = await verifyPayment(session, paymentOrderId);
      if (mounted.current) setMessage(verification.status === 'PAID' ? 'Payment verified successfully.' : `Payment is not confirmed yet: ${verification.status.replaceAll('_', ' ')}.`);
    } catch (error) {
      if (error instanceof CheckoutApiError && error.code === 'SESSION_EXPIRED') await signOut();
      if (mounted.current) setMessage(error instanceof Error ? error.message : 'Payment verification is unavailable.');
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  async function startPayment() {
    if (!session || !checkout || checkout.status === 'PAID') return;
    setBusy(true);
    setMessage('Creating a secure Cashfree payment session…');
    try {
      const nextPayment = payment ?? await createPaymentSession(session, checkout.id);
      paymentRef.current = nextPayment;
      setPayment(nextPayment);
      if (nextPayment.status === 'PAID') {
        setMessage('Payment is already verified.');
        return;
      }
      const cfSession = new CFSession(nextPayment.paymentSessionId, nextPayment.cashfreeOrderId, CFEnvironment.SANDBOX);
      setMessage('Opening Cashfree sandbox. Craves will verify the payment on the backend after the SDK callback.');
      CFPaymentGatewayService.doWebPayment(cfSession);
    } catch (error) {
      if (error instanceof CheckoutApiError && error.code === 'SESSION_EXPIRED') await signOut();
      setMessage(error instanceof Error ? error.message : 'Cashfree checkout could not be started.');
    } finally {
      setBusy(false);
    }
  }

  const paid = checkout?.status === 'PAID' || payment?.status === 'PAID' || message === 'Payment verified successfully.';

  return (
    <SafeAreaView style={styles.page}>
      <Pressable onPress={() => navigation.goBack()}><Text style={styles.back}>‹ Checkout</Text></Pressable>
      <View style={styles.card}>
        <Text style={styles.eyebrow}>CASHFREE HOSTED CHECKOUT</Text>
        <Text style={styles.title}>Secure payment</Text>
        {checkout && <><Text style={styles.meta}>Checkout {checkout.id.slice(0, 8)} · {checkout.status.replaceAll('_', ' ')}</Text><View style={styles.total}><Text style={styles.totalLabel}>Amount from Order Service</Text><Text style={styles.totalAmount}>{money(checkout.grandTotal, checkout.currency)}</Text></View></>}
        <Text style={styles.body}>Card, UPI and banking details are collected by Cashfree. Craves treats the SDK callback only as a signal and confirms payment using its ownership-protected backend verification endpoint.</Text>
        <Pressable disabled={busy || !checkout || paid} onPress={() => void startPayment()} style={styles.primary}>{busy ? <ActivityIndicator color={theme.colors.white} /> : <Text style={styles.primaryText}>{paid ? 'Payment verified' : 'Pay with Cashfree sandbox'}</Text>}</Pressable>
        {payment && !paid && <Pressable disabled={busy} onPress={() => void verifyOwnedPayment(payment.paymentOrderId)} style={styles.outline}><Text style={styles.outlineText}>Verify payment again</Text></Pressable>}
        <Text style={styles.message}>{message}</Text>
        {paid && <Pressable onPress={() => navigation.navigate('Orders')} style={styles.outline}><Text style={styles.outlineText}>View my orders</Text></Pressable>}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: theme.colors.background, padding: 20 },
  back: { color: theme.colors.gold, fontSize: 16, fontWeight: '800' },
  card: { backgroundColor: theme.colors.card, borderRadius: 28, marginTop: 28, padding: 24 },
  eyebrow: { color: theme.colors.primary, fontSize: 11, fontWeight: '900', letterSpacing: 1.2 },
  title: { color: theme.colors.text, fontSize: 30, fontWeight: '900', marginTop: 10 },
  meta: { color: theme.colors.muted, marginTop: 8 },
  total: { borderBottomColor: '#CBD5E1', borderBottomWidth: 1, borderTopColor: '#CBD5E1', borderTopWidth: 1, marginTop: 22, paddingVertical: 16 },
  totalLabel: { color: theme.colors.muted },
  totalAmount: { color: theme.colors.text, fontSize: 24, fontWeight: '900', marginTop: 5 },
  body: { color: theme.colors.muted, lineHeight: 22, marginTop: 20 },
  primary: { alignItems: 'center', backgroundColor: theme.colors.primary, borderRadius: theme.radius.button, justifyContent: 'center', marginTop: 24, minHeight: 52 },
  primaryText: { color: theme.colors.white, fontWeight: '900' },
  outline: { alignItems: 'center', borderColor: theme.colors.primary, borderRadius: theme.radius.button, borderWidth: 1, justifyContent: 'center', marginTop: 10, minHeight: 48 },
  outlineText: { color: theme.colors.primary, fontWeight: '900' },
  message: { color: theme.colors.muted, lineHeight: 20, marginTop: 16, textAlign: 'center' }
});
