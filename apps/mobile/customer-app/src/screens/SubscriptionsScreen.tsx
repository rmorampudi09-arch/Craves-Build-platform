import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, RefreshControl, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../auth/AuthProvider';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { changeSubscription, listMySubscriptions, SubscriptionApiError } from '../subscriptions/api';
import type { MobileSubscription } from '../subscriptions/contracts';
import { theme } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Subscriptions'>;
const ACTIONABLE = new Set(['ACTIVE', 'PENDING_PAYMENT', 'PAYMENT_FAILED']);

export function SubscriptionsScreen({ navigation }: Props) {
  const { session, signOut } = useAuth();
  const [items, setItems] = useState<MobileSubscription[]>([]);
  const [message, setMessage] = useState('Loading subscriptions…');
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    try {
      const result = await listMySubscriptions(session);
      setItems(result); setMessage(result.length ? '' : 'You do not have a meal subscription yet.');
    } catch (error) {
      if (error instanceof SubscriptionApiError && error.status === 401) { await signOut(); return; }
      setMessage(error instanceof Error ? error.message : 'Subscriptions are unavailable.');
    } finally { setRefreshing(false); }
  }, [session, signOut]);

  useEffect(() => { void load(); }, [load]);

  function confirm(item: MobileSubscription, action: 'pause' | 'cancel') {
    Alert.alert(action === 'pause' ? 'Pause subscription?' : 'Cancel subscription?', 'Subscription Service will validate whether this transition is allowed.', [
      { text: 'Keep subscription', style: 'cancel' },
      { text: action === 'pause' ? 'Pause' : 'Cancel', style: action === 'cancel' ? 'destructive' : 'default', onPress: () => void change(item.id, action) }
    ]);
  }

  async function change(subscriptionId: string, action: 'pause' | 'cancel') {
    if (!session) return;
    setBusyId(subscriptionId);
    try {
      await changeSubscription(session, subscriptionId, action, null);
      await load();
    } catch (error) {
      if (error instanceof SubscriptionApiError && error.status === 401) { await signOut(); return; }
      setMessage(error instanceof Error ? error.message : 'Subscription update failed.');
    } finally { setBusyId(null); }
  }

  return <SafeAreaView style={styles.page}><ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} />}>
    <Pressable onPress={() => navigation.goBack()}><Text style={styles.back}>← Customer home</Text></Pressable>
    <Text style={styles.eyebrow}>MY SUBSCRIPTIONS</Text><Text style={styles.title}>Meal plan lifecycle</Text><Text style={styles.description}>Subscription Service owns status and service dates. The app exposes only pause and cancel.</Text>
    <Pressable style={styles.primary} onPress={() => navigation.navigate('SubscriptionPlans')}><Text style={styles.primaryText}>Browse active plans</Text></Pressable>
    {message ? <View style={styles.card}><Text style={styles.message}>{message}</Text></View> : null}
    {items.map(item => <View key={item.id} style={styles.card}><Text style={styles.status}>{item.status.replaceAll('_', ' ')}</Text><Text style={styles.plan}>Meal subscription</Text><View style={styles.row}><Text style={styles.key}>Start date</Text><Text style={styles.value}>{item.startDate}</Text></View><View style={styles.row}><Text style={styles.key}>Next service</Text><Text style={styles.value}>{item.nextServiceDate ?? 'Not scheduled'}</Text></View><View style={styles.row}><Text style={styles.key}>Delivery address</Text><Text style={styles.value}>{item.deliveryAddressId ? 'Saved address selected' : 'Not selected'}</Text></View>{item.notes ? <Text style={styles.notes}>{item.notes}</Text> : null}{ACTIONABLE.has(item.status) ? <View style={styles.actions}><Pressable disabled={busyId === item.id} style={styles.outline} onPress={() => confirm(item, 'pause')}><Text style={styles.outlineText}>Pause</Text></Pressable><Pressable disabled={busyId === item.id} style={styles.danger} onPress={() => confirm(item, 'cancel')}><Text style={styles.dangerText}>Cancel</Text></Pressable></View> : null}</View>)}
  </ScrollView></SafeAreaView>;
}

const styles = StyleSheet.create({ page: { flex: 1, backgroundColor: theme.colors.background }, content: { padding: 20, paddingBottom: 40 }, back: { color: theme.colors.gold, fontWeight: '800', marginTop: 18, marginBottom: 24 }, eyebrow: { color: theme.colors.gold, fontWeight: '900', letterSpacing: 1.8, fontSize: 12 }, title: { color: theme.colors.white, fontWeight: '900', fontSize: 34, marginTop: 10 }, description: { color: '#CBD5E1', lineHeight: 22, marginTop: 10 }, primary: { backgroundColor: theme.colors.primary, borderRadius: theme.radius.button, minHeight: 50, alignItems: 'center', justifyContent: 'center', marginTop: 20 }, primaryText: { color: theme.colors.white, fontWeight: '900' }, card: { backgroundColor: theme.colors.card, borderRadius: theme.radius.card, padding: 22, marginTop: 18 }, message: { color: theme.colors.text, lineHeight: 22 }, status: { color: theme.colors.primary, fontWeight: '900', fontSize: 12 }, plan: { color: theme.colors.text, fontWeight: '900', fontSize: 23, marginTop: 8 }, row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginTop: 14 }, key: { color: theme.colors.muted, flex: 1 }, value: { color: theme.colors.text, fontWeight: '800', flex: 1, textAlign: 'right' }, notes: { backgroundColor: theme.colors.white, color: theme.colors.text, borderRadius: 14, lineHeight: 20, padding: 13, marginTop: 15 }, actions: { flexDirection: 'row', gap: 10, marginTop: 18 }, outline: { borderColor: theme.colors.primary, borderWidth: 1, borderRadius: 20, paddingHorizontal: 18, paddingVertical: 10 }, outlineText: { color: theme.colors.primary, fontWeight: '900' }, danger: { borderColor: '#DC2626', borderWidth: 1, borderRadius: 20, paddingHorizontal: 18, paddingVertical: 10 }, dangerText: { color: '#B91C1C', fontWeight: '900' } });
