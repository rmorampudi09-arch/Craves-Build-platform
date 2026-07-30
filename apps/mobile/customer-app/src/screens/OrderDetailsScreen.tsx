import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../auth/AuthProvider';
import { getCustomerOrder, OrdersApiError } from '../orders/orders-api';
import { orderStatusLabel, type CustomerOrder } from '../orders/contracts';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { theme } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'OrderDetails'>;
function money(amount: number, currency: string): string { try { return new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(amount); } catch { return `${currency} ${amount.toFixed(2)}`; } }

export function OrderDetailsScreen({ route, navigation }: Props) {
  const { session, signOut } = useAuth();
  const [order, setOrder] = useState<CustomerOrder | null>(null);
  const [message, setMessage] = useState('Loading order…');
  const load = useCallback(async () => {
    if (!session) return;
    try { const result = await getCustomerOrder(session, route.params.orderId); setOrder(result); setMessage(''); }
    catch (error) { if (error instanceof OrdersApiError && error.code === 'SESSION_EXPIRED') await signOut(); setMessage(error instanceof Error ? error.message : 'Order is unavailable.'); }
  }, [route.params.orderId, session, signOut]);
  useEffect(() => { void load(); }, [load]);

  if (!order) return <SafeAreaView style={styles.page}><Pressable onPress={() => navigation.goBack()}><Text style={styles.back}>‹ Orders</Text></Pressable><View style={styles.loading}><ActivityIndicator color={theme.colors.gold} /><Text style={styles.light}>{message}</Text></View></SafeAreaView>;
  return <SafeAreaView style={styles.page}><ScrollView contentContainerStyle={styles.content}><Pressable onPress={() => navigation.goBack()}><Text style={styles.back}>‹ Orders</Text></Pressable><View style={styles.card}><Text style={styles.eyebrow}>{orderStatusLabel(order.status)}</Text><Text style={styles.title}>{order.kitchenName}</Text><Text style={styles.meta}>Order {order.id.slice(0, 8)} · {new Date(order.createdAt).toLocaleString('en-IN')}</Text><View style={styles.items}>{order.items.map(item => <View key={item.id} style={styles.row}><Text style={styles.grow}>{item.quantity} × {item.itemName}</Text><Text style={styles.bold}>{money(item.lineTotal, order.currency)}</Text></View>)}</View><View style={styles.totals}>{[['Food subtotal', order.foodSubtotal], ['Platform fee', order.platformFee], ['Tax', order.taxAmount], ['Delivery fee', order.deliveryFee], ['Grand total', order.grandTotal]].map(([label, amount]) => <View key={String(label)} style={styles.row}><Text style={label === 'Grand total' ? styles.bold : styles.muted}>{label}</Text><Text style={styles.bold}>{money(Number(amount), order.currency)}</Text></View>)}</View>{order.deliveryAddress && <View style={styles.address}><Text style={styles.bold}>Delivery address</Text><Text style={styles.muted}>{order.deliveryAddress.recipientName}</Text><Text style={styles.muted}>{order.deliveryAddress.addressLine1}{order.deliveryAddress.addressLine2 ? `, ${order.deliveryAddress.addressLine2}` : ''}, {order.deliveryAddress.areaName ? `${order.deliveryAddress.areaName}, ` : ''}{order.deliveryAddress.city}, {order.deliveryAddress.state} {order.deliveryAddress.postalCode}</Text></View>}<Pressable style={styles.primary} onPress={() => navigation.navigate('DeliveryTracking', { orderId: order.id })}><Text style={styles.primaryText}>Track delivery</Text></Pressable></View></ScrollView></SafeAreaView>;
}

const styles = StyleSheet.create({ page: { flex: 1, backgroundColor: theme.colors.background, padding: 20 }, content: { paddingBottom: 32 }, back: { color: theme.colors.gold, fontWeight: '800', fontSize: 16 }, loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }, light: { color: '#CBD5E1' }, card: { backgroundColor: theme.colors.card, borderRadius: 28, padding: 22, marginTop: 22 }, eyebrow: { color: theme.colors.primary, fontSize: 12, fontWeight: '900', letterSpacing: 1 }, title: { color: theme.colors.text, fontSize: 28, fontWeight: '900', marginTop: 8 }, meta: { color: theme.colors.muted, marginTop: 8 }, items: { marginTop: 24, gap: 14 }, totals: { borderTopWidth: 1, borderTopColor: '#E2E8F0', marginTop: 22, paddingTop: 16, gap: 12 }, row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 }, grow: { flex: 1, color: theme.colors.text }, bold: { color: theme.colors.text, fontWeight: '800' }, muted: { color: theme.colors.muted, lineHeight: 21 }, address: { backgroundColor: '#FFFFFF', borderRadius: 18, marginTop: 22, padding: 16, gap: 5 }, primary: { backgroundColor: theme.colors.primary, borderRadius: theme.radius.button, minHeight: 50, marginTop: 22, alignItems: 'center', justifyContent: 'center' }, primaryText: { color: theme.colors.white, fontWeight: '900' } });
