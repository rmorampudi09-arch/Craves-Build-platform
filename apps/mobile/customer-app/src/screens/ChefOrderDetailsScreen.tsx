import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../auth/AuthProvider';
import { acceptChefOrder, ChefOrderApiError, getChefOrder, readyChefOrder, rejectChefOrder } from '../chef/chef-order-api';
import { chefOrderAction, type MobileChefOrder } from '../chef/chef-order-contracts';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { theme } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'ChefOrderDetails'>;
function money(value: number, currency: string): string { try { return new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(value); } catch { return `${currency} ${value.toFixed(2)}`; } }
function statusText(value: string): string { return value.toLowerCase().split('_').map(part => `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`).join(' '); }

export function ChefOrderDetailsScreen({ navigation, route }: Props) {
  const { session, signOut } = useAuth();
  const [order, setOrder] = useState<MobileChefOrder | null>(null);
  const [prep, setPrep] = useState('30');
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('Loading chef order…');
  const [busy, setBusy] = useState(false);

  const handle = useCallback(async <T,>(operation: () => Promise<T>): Promise<T | null> => {
    try { return await operation(); }
    catch (error) { if (error instanceof ChefOrderApiError && error.status === 401) { await signOut(); return null; } setMessage(error instanceof Error ? error.message : 'Chef order request failed.'); return null; }
  }, [signOut]);

  const load = useCallback(async () => {
    if (!session) return;
    const result = await handle(() => getChefOrder(session, route.params.orderId));
    if (result) { setOrder(result); setPrep(result.prepTimeMinutes ? String(result.prepTimeMinutes) : '30'); setNote(result.chefResponseNote ?? ''); setMessage(''); }
  }, [session, route.params.orderId, handle]);
  useEffect(() => { void load(); }, [load]);

  async function apply(operation: () => Promise<MobileChefOrder>) {
    setBusy(true); setMessage('Submitting chef action…');
    const result = await handle(operation);
    if (result) { setOrder(result); setMessage('Chef action applied by Order Service.'); }
    setBusy(false);
  }

  if (!order) return <SafeAreaView style={styles.page}><View style={styles.card}><ActivityIndicator color={theme.colors.primary} /><Text style={styles.message}>{message}</Text></View></SafeAreaView>;
  const action = chefOrderAction(order.status);
  return <SafeAreaView style={styles.page}><ScrollView contentContainerStyle={styles.content}><Pressable onPress={() => navigation.goBack()}><Text style={styles.back}>← Chef orders</Text></Pressable><View style={styles.card}><Text style={styles.eyebrow}>{statusText(order.status)}</Text><Text style={styles.title}>{order.items.map(item => `${item.quantity}× ${item.itemName}`).join(', ')}</Text><Text style={styles.amount}>{money(order.foodSubtotal, order.currency)} food subtotal</Text><Text style={styles.meta}>Grand total: {money(order.grandTotal, order.currency)}</Text></View>{action === 'DECIDE' && <View style={styles.card}><Text style={styles.sectionTitle}>Acceptance decision</Text><TextInput placeholder="Preparation minutes" value={prep} onChangeText={setPrep} keyboardType="number-pad" style={styles.input} /><TextInput placeholder="Optional chef note" value={note} onChangeText={setNote} maxLength={500} style={styles.input} /><TextInput placeholder="Optional rejection reason" value={reason} onChangeText={setReason} maxLength={500} style={styles.input} /><Pressable disabled={busy} style={styles.primary} onPress={() => session && void apply(() => acceptChefOrder(session, order.id, Number(prep), note || null))}><Text style={styles.primaryText}>Accept order</Text></Pressable><Pressable disabled={busy} style={styles.danger} onPress={() => session && void apply(() => rejectChefOrder(session, order.id, reason || null))}><Text style={styles.dangerText}>Reject order</Text></Pressable></View>}{action === 'READY' && <View style={styles.card}><Text style={styles.sectionTitle}>Preparation workflow</Text><Text style={styles.description}>Use this only when the complete order is packed and ready for pickup.</Text><Pressable disabled={busy} style={styles.primary} onPress={() => session && void apply(() => readyChefOrder(session, order.id))}><Text style={styles.primaryText}>Mark ready for pickup</Text></Pressable></View>}<View style={styles.card}><Text style={styles.sectionTitle}>Items</Text>{order.items.map(item => <View key={item.id} style={styles.item}><Text style={styles.itemName}>{item.quantity}× {item.itemName}</Text><Text>{money(item.lineTotal, order.currency)}</Text></View>)}</View>{order.deliveryAddress && <View style={styles.card}><Text style={styles.sectionTitle}>Delivery recipient</Text><Text style={styles.itemName}>{order.deliveryAddress.recipientName}</Text><Text style={styles.meta}>{order.deliveryAddress.contactPhoneNumber}</Text><Text style={styles.description}>{order.deliveryAddress.addressLine1}{order.deliveryAddress.addressLine2 ? `, ${order.deliveryAddress.addressLine2}` : ''}{order.deliveryAddress.landmark ? `, ${order.deliveryAddress.landmark}` : ''}{'\n'}{order.deliveryAddress.areaName ? `${order.deliveryAddress.areaName}, ` : ''}{order.deliveryAddress.city}, {order.deliveryAddress.state} {order.deliveryAddress.postalCode}</Text></View>}<Text style={styles.message}>{message}</Text></ScrollView></SafeAreaView>;
}

const styles = StyleSheet.create({ page: { flex: 1, backgroundColor: theme.colors.background }, content: { padding: 20, paddingBottom: 40 }, back: { color: theme.colors.gold, fontWeight: '800', marginTop: 18, marginBottom: 20 }, card: { backgroundColor: theme.colors.card, borderRadius: theme.radius.card, padding: 22, marginBottom: 16 }, eyebrow: { color: theme.colors.primary, fontWeight: '800', letterSpacing: 1.4, fontSize: 12 }, title: { color: theme.colors.text, fontSize: 25, fontWeight: '900', marginTop: 8 }, amount: { color: theme.colors.text, fontWeight: '800', marginTop: 12 }, meta: { color: theme.colors.muted, marginTop: 6 }, sectionTitle: { color: theme.colors.text, fontSize: 21, fontWeight: '900' }, input: { backgroundColor: theme.colors.white, borderRadius: 14, minHeight: 48, paddingHorizontal: 14, marginTop: 12, color: theme.colors.text }, primary: { backgroundColor: theme.colors.primary, borderRadius: theme.radius.button, minHeight: 49, marginTop: 16, alignItems: 'center', justifyContent: 'center' }, primaryText: { color: theme.colors.white, fontWeight: '800' }, danger: { borderColor: '#B42318', borderWidth: 1, borderRadius: theme.radius.button, minHeight: 49, marginTop: 12, alignItems: 'center', justifyContent: 'center' }, dangerText: { color: '#B42318', fontWeight: '800' }, description: { color: theme.colors.muted, lineHeight: 21, marginTop: 10 }, item: { backgroundColor: theme.colors.white, borderRadius: 14, padding: 14, marginTop: 10, flexDirection: 'row', justifyContent: 'space-between', gap: 12 }, itemName: { color: theme.colors.text, fontWeight: '800', flex: 1 }, message: { color: theme.colors.muted, lineHeight: 20, marginVertical: 8 } });
