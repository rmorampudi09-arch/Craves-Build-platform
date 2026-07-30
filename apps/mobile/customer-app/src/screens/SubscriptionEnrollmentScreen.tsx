import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../auth/AuthProvider';
import { AddressesApiError, listAddresses } from '../addresses/addresses-api';
import type { CustomerAddress } from '../addresses/contracts';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { createSubscription, listSubscriptionPlans, SubscriptionApiError } from '../subscriptions/api';
import type { MobileSubscriptionPlan } from '../subscriptions/contracts';
import { theme } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'SubscriptionEnrollment'>;

export function SubscriptionEnrollmentScreen({ navigation, route }: Props) {
  const { session, signOut } = useAuth();
  const [plan, setPlan] = useState<MobileSubscriptionPlan | null>(null);
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [addressId, setAddressId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [notes, setNotes] = useState('');
  const [message, setMessage] = useState('Loading plan and saved addresses…');
  const [busy, setBusy] = useState(false);
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const load = useCallback(async () => {
    if (!session) return;
    try {
      const [plans, saved] = await Promise.all([listSubscriptionPlans(), listAddresses(session)]);
      const selected = plans.find(item => item.id === route.params.planId) ?? null;
      if (!selected) throw new Error('This plan is not active.');
      const activeAddresses = saved.filter(item => item.active);
      setPlan(selected); setAddresses(activeAddresses); setStartDate(today);
      const preferred = activeAddresses.find(item => item.isDefault) ?? activeAddresses[0];
      if (preferred) setAddressId(preferred.id);
      setMessage(activeAddresses.length ? '' : 'Create a saved address before subscribing.');
    } catch (error) {
      if ((error instanceof SubscriptionApiError || error instanceof AddressesApiError) && error.status === 401) { await signOut(); return; }
      setMessage(error instanceof Error ? error.message : 'Subscription enrollment is unavailable.');
    }
  }, [session, route.params.planId, signOut, today]);

  useEffect(() => { void load(); }, [load]);

  async function submit() {
    if (!session || !plan || !addressId || !/^\d{4}-\d{2}-\d{2}$/.test(startDate) || startDate < today) {
      setMessage('Choose a saved address and enter a valid non-past date as YYYY-MM-DD.');
      return;
    }
    setBusy(true); setMessage('');
    try {
      await createSubscription(session, { planId: plan.id, startDate, deliveryAddressId: addressId, notes: notes.trim() || null });
      navigation.replace('Subscriptions');
    } catch (error) {
      if (error instanceof SubscriptionApiError && error.status === 401) { await signOut(); return; }
      setMessage(error instanceof Error ? error.message : 'Subscription could not be created.');
    } finally { setBusy(false); }
  }

  return <SafeAreaView style={styles.page}><ScrollView contentContainerStyle={styles.content}>
    <Pressable onPress={() => navigation.goBack()}><Text style={styles.back}>← Meal plans</Text></Pressable>
    <View style={styles.card}><Text style={styles.eyebrow}>START SUBSCRIPTION</Text><Text style={styles.title}>{plan?.name ?? 'Meal plan'}</Text><Text style={styles.description}>Select an active saved address and a start date. Subscription Service owns status and future service dates.</Text>
      <Text style={styles.label}>Delivery address</Text>{addresses.map(address => <Pressable key={address.id} style={[styles.option, addressId === address.id && styles.optionActive]} onPress={() => setAddressId(address.id)}><Text style={addressId === address.id ? styles.optionTextActive : styles.optionText}>{address.addressLabel}: {address.addressLine1}, {address.areaName}</Text></Pressable>)}
      <Text style={styles.label}>Start date (YYYY-MM-DD)</Text><TextInput value={startDate} onChangeText={setStartDate} placeholder="2026-08-01" autoCapitalize="none" style={styles.input} />
      <Text style={styles.label}>Notes</Text><TextInput value={notes} onChangeText={setNotes} maxLength={2000} multiline style={[styles.input, styles.multiline]} />
      <Pressable disabled={busy || !plan || addresses.length === 0} style={[styles.primary, (busy || !plan || addresses.length === 0) && styles.disabled]} onPress={() => void submit()}><Text style={styles.primaryText}>{busy ? 'Creating…' : 'Create subscription'}</Text></Pressable>
      {addresses.length === 0 && <Pressable style={styles.secondary} onPress={() => navigation.navigate('AddressForm', {})}><Text style={styles.secondaryText}>Add saved address</Text></Pressable>}
      {message ? <Text style={styles.message}>{message}</Text> : null}
    </View>
  </ScrollView></SafeAreaView>;
}

const styles = StyleSheet.create({ page: { flex: 1, backgroundColor: theme.colors.background }, content: { padding: 20, paddingBottom: 40 }, back: { color: theme.colors.gold, fontWeight: '800', marginTop: 18, marginBottom: 20 }, card: { backgroundColor: theme.colors.card, borderRadius: theme.radius.card, padding: 22 }, eyebrow: { color: theme.colors.primary, fontWeight: '900', letterSpacing: 1.6, fontSize: 12 }, title: { color: theme.colors.text, fontWeight: '900', fontSize: 30, marginTop: 10 }, description: { color: theme.colors.muted, lineHeight: 22, marginTop: 12 }, label: { color: theme.colors.text, fontWeight: '800', marginTop: 18, marginBottom: 7 }, option: { borderColor: theme.colors.primary, borderWidth: 1, borderRadius: 14, padding: 13, marginTop: 8 }, optionActive: { backgroundColor: theme.colors.primary }, optionText: { color: theme.colors.primary, fontWeight: '700' }, optionTextActive: { color: theme.colors.white, fontWeight: '800' }, input: { backgroundColor: theme.colors.white, color: theme.colors.text, borderRadius: 14, minHeight: 48, paddingHorizontal: 14 }, multiline: { minHeight: 90, textAlignVertical: 'top', paddingTop: 13 }, primary: { backgroundColor: theme.colors.primary, borderRadius: theme.radius.button, minHeight: 50, alignItems: 'center', justifyContent: 'center', marginTop: 22 }, primaryText: { color: theme.colors.white, fontWeight: '900' }, secondary: { borderColor: theme.colors.primary, borderWidth: 1, borderRadius: theme.radius.button, minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: 12 }, secondaryText: { color: theme.colors.primary, fontWeight: '900' }, disabled: { opacity: 0.5 }, message: { color: theme.colors.muted, lineHeight: 20, marginTop: 14 } });
