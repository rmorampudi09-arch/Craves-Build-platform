import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../auth/AuthProvider';
import { ChefOrderApiError, listChefOrders } from '../chef/chef-order-api';
import type { MobileChefOrder } from '../chef/chef-order-contracts';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { theme } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'ChefOrders'>;
function money(value: number, currency: string): string { try { return new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(value); } catch { return `${currency} ${value.toFixed(2)}`; } }
function statusText(value: string): string { return value.toLowerCase().split('_').map(part => `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`).join(' '); }

export function ChefOrdersScreen({ navigation }: Props) {
  const { session, signOut } = useAuth();
  const [orders, setOrders] = useState<MobileChefOrder[]>([]);
  const [message, setMessage] = useState('Loading chef orders…');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    try { const result = await listChefOrders(session); setOrders(result); setMessage(result.length ? '' : 'No chef-owned orders are available yet.'); }
    catch (error) { if (error instanceof ChefOrderApiError && error.status === 401) { await signOut(); return; } setMessage(error instanceof Error ? error.message : 'Chef orders are temporarily unavailable.'); }
    finally { setLoading(false); }
  }, [session, signOut]);

  useEffect(() => { void load(); }, [load]);
  return <SafeAreaView style={styles.page}><ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}><Pressable onPress={() => navigation.goBack()}><Text style={styles.back}>← Chef mode</Text></Pressable><View style={styles.card}><Text style={styles.eyebrow}>CHEF ORDERS</Text><Text style={styles.title}>Order inbox</Text>{loading && !orders.length ? <ActivityIndicator color={theme.colors.primary} style={styles.loader} /> : null}<Text style={styles.message}>{message}</Text>{orders.map(order => <Pressable key={order.id} style={styles.order} onPress={() => navigation.navigate('ChefOrderDetails', { orderId: order.id })}><View style={styles.row}><View style={styles.flex}><Text style={styles.status}>{statusText(order.status)}</Text><Text style={styles.itemTitle}>{order.items.map(item => `${item.quantity}× ${item.itemName}`).join(', ')}</Text><Text style={styles.meta}>{new Date(order.createdAt).toLocaleString('en-IN')}</Text></View><Text style={styles.amount}>{money(order.foodSubtotal, order.currency)}</Text></View></Pressable>)}</View></ScrollView></SafeAreaView>;
}

const styles = StyleSheet.create({ page: { flex: 1, backgroundColor: theme.colors.background }, content: { padding: 20, paddingBottom: 40 }, back: { color: theme.colors.gold, fontWeight: '800', marginTop: 18, marginBottom: 20 }, card: { backgroundColor: theme.colors.card, borderRadius: theme.radius.card, padding: 22 }, eyebrow: { color: theme.colors.primary, fontWeight: '800', letterSpacing: 1.6, fontSize: 12 }, title: { color: theme.colors.text, fontSize: 30, fontWeight: '900', marginTop: 8 }, loader: { margin: 20 }, message: { color: theme.colors.muted, marginTop: 12, lineHeight: 20 }, order: { backgroundColor: theme.colors.white, borderRadius: 16, padding: 14, marginTop: 14 }, row: { flexDirection: 'row', gap: 12 }, flex: { flex: 1 }, status: { color: theme.colors.primary, fontSize: 12, fontWeight: '800' }, itemTitle: { color: theme.colors.text, fontWeight: '800', marginTop: 5 }, meta: { color: theme.colors.muted, fontSize: 12, marginTop: 6 }, amount: { color: theme.colors.text, fontWeight: '900' } });
