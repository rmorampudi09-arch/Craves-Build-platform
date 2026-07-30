import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../auth/AuthProvider';
import { listCustomerOrders, OrdersApiError } from '../orders/orders-api';
import { orderStatusLabel, type CustomerOrder } from '../orders/contracts';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { theme } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Orders'>;

function money(amount: number, currency: string): string {
  try { return new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(amount); }
  catch { return `${currency} ${amount.toFixed(2)}`; }
}

export function OrdersScreen({ navigation }: Props) {
  const { session, signOut } = useAuth();
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [message, setMessage] = useState('Loading orders…');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!session) return;
    try {
      const result = await listCustomerOrders(session);
      setOrders(result);
      setMessage(result.length ? '' : 'You do not have any orders yet.');
    } catch (error) {
      if (error instanceof OrdersApiError && error.code === 'SESSION_EXPIRED') await signOut();
      setMessage(error instanceof Error ? error.message : 'Orders are unavailable.');
    }
  }, [session, signOut]);

  useEffect(() => { void load(); }, [load]);

  async function refresh() { setRefreshing(true); await load(); setRefreshing(false); }

  return <SafeAreaView style={styles.page}>
    <View style={styles.header}><Pressable onPress={() => navigation.goBack()}><Text style={styles.back}>‹ Home</Text></Pressable><Text style={styles.title}>My orders</Text><Text style={styles.subtitle}>Chef-specific orders and their current Craves state.</Text></View>
    {message ? <View style={styles.message}>{orders.length === 0 && message.startsWith('Loading') ? <ActivityIndicator color={theme.colors.gold} /> : null}<Text style={styles.messageText}>{message}</Text></View> : null}
    <FlatList data={orders} keyExtractor={item => item.id} refreshing={refreshing} onRefresh={() => void refresh()} contentContainerStyle={styles.list} renderItem={({ item }) => <Pressable style={styles.card} onPress={() => navigation.navigate('OrderDetails', { orderId: item.id })}>
      <View style={styles.row}><View style={styles.grow}><Text style={styles.kitchen}>{item.kitchenName}</Text><Text style={styles.orderId}>Order {item.id.slice(0, 8)}</Text></View><Text style={styles.amount}>{money(item.grandTotal, item.currency)}</Text></View>
      <Text style={styles.status}>{orderStatusLabel(item.status)}</Text>
      <Text style={styles.meta}>{item.items.length} item{item.items.length === 1 ? '' : 's'} · {new Date(item.createdAt).toLocaleString('en-IN')}</Text>
    </Pressable>} />
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: theme.colors.background }, header: { padding: 20, paddingBottom: 10 }, back: { color: theme.colors.gold, fontWeight: '800', fontSize: 16 }, title: { color: theme.colors.white, fontSize: 34, fontWeight: '900', marginTop: 18 }, subtitle: { color: '#CBD5E1', marginTop: 8, lineHeight: 21 }, list: { padding: 20, paddingTop: 10, gap: 14 }, card: { backgroundColor: theme.colors.card, borderRadius: 24, padding: 20 }, row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 }, grow: { flex: 1 }, kitchen: { color: theme.colors.primary, fontSize: 12, fontWeight: '900', letterSpacing: 1 }, orderId: { color: theme.colors.text, fontSize: 20, fontWeight: '800', marginTop: 6 }, amount: { color: theme.colors.text, fontWeight: '900' }, status: { color: theme.colors.text, fontWeight: '800', marginTop: 16 }, meta: { color: theme.colors.muted, marginTop: 6, fontSize: 13 }, message: { paddingHorizontal: 20, paddingVertical: 12, alignItems: 'center', gap: 8 }, messageText: { color: '#CBD5E1', textAlign: 'center' }
});
