import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { listSubscriptionPlans, SubscriptionApiError } from '../subscriptions/api';
import type { MobileSubscriptionPlan } from '../subscriptions/contracts';
import { theme } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'SubscriptionPlans'>;

function money(value: number, currency: string): string {
  try { return new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(value); }
  catch { return `${currency} ${value.toFixed(2)}`; }
}

export function SubscriptionPlansScreen({ navigation }: Props) {
  const [plans, setPlans] = useState<MobileSubscriptionPlan[]>([]);
  const [message, setMessage] = useState('Loading meal plans…');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const items = await listSubscriptionPlans();
      setPlans(items); setMessage(items.length ? '' : 'No active meal plans are available yet.');
    } catch (error) {
      setMessage(error instanceof SubscriptionApiError ? error.message : 'Meal plans are temporarily unavailable.');
    } finally { setRefreshing(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return <SafeAreaView style={styles.page}><ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} />}>
    <Pressable onPress={() => navigation.goBack()}><Text style={styles.back}>← Customer home</Text></Pressable>
    <Text style={styles.eyebrow}>MEAL SUBSCRIPTIONS</Text><Text style={styles.title}>Active home-food plans</Text><Text style={styles.description}>Amounts and billing periods come from Subscription Service. Renewal, unused meals and refunds are not promised here.</Text>
    {message ? <View style={styles.card}><Text style={styles.message}>{message}</Text></View> : null}
    {plans.map(plan => <View key={plan.id} style={styles.card}><Text style={styles.period}>{plan.billingPeriod}</Text><Text style={styles.planName}>{plan.name}</Text><Text style={styles.description}>{plan.description ?? 'Plan details are provided by the chef.'}</Text><Text style={styles.amount}>{money(plan.amount, plan.currency)}</Text><Text style={styles.code}>Plan code: {plan.planCode}</Text><Pressable style={styles.primary} onPress={() => navigation.navigate('SubscriptionEnrollment', { planId: plan.id })}><Text style={styles.primaryText}>Choose plan</Text></Pressable></View>)}
  </ScrollView></SafeAreaView>;
}

const styles = StyleSheet.create({ page: { flex: 1, backgroundColor: theme.colors.background }, content: { padding: 20, paddingBottom: 40 }, back: { color: theme.colors.gold, fontWeight: '800', marginTop: 18, marginBottom: 24 }, eyebrow: { color: theme.colors.gold, fontWeight: '900', letterSpacing: 1.8, fontSize: 12 }, title: { color: theme.colors.white, fontWeight: '900', fontSize: 34, marginTop: 10 }, description: { color: theme.colors.muted, fontSize: 15, lineHeight: 22, marginTop: 10 }, card: { backgroundColor: theme.colors.card, borderRadius: theme.radius.card, padding: 22, marginTop: 18 }, message: { color: theme.colors.text, lineHeight: 22 }, period: { color: theme.colors.primary, fontWeight: '900', fontSize: 12 }, planName: { color: theme.colors.text, fontWeight: '900', fontSize: 24, marginTop: 8 }, amount: { color: theme.colors.text, fontWeight: '900', fontSize: 24, marginTop: 18 }, code: { color: theme.colors.muted, fontSize: 12, marginTop: 8 }, primary: { backgroundColor: theme.colors.primary, borderRadius: theme.radius.button, minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: 18 }, primaryText: { color: theme.colors.white, fontWeight: '900' } });
