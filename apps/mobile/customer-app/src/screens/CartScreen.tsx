import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, FlatList, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../auth/AuthProvider';
import { addCartItem, CartApiError, clearCart, getCart, removeCartItem, updateCartItem, validateCart } from '../cart/cart-api';
import type { CustomerCart } from '../cart/contracts';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { theme } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Cart'>;
function money(amount: number, currency: string): string { try { return new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(amount); } catch { return `${currency} ${amount.toFixed(2)}`; } }

export function CartScreen({ route, navigation }: Props) {
  const { session, signOut } = useAuth();
  const [cart, setCart] = useState<CustomerCart | null>(null);
  const [message, setMessage] = useState('Loading your cart…');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const addedNavigationItem = useRef(false);

  const handleError = useCallback(async (error: unknown) => {
    if (error instanceof CartApiError && error.code === 'SESSION_EXPIRED') await signOut();
    setMessage(error instanceof Error ? error.message : 'The cart is unavailable.');
  }, [signOut]);

  const load = useCallback(async () => {
    if (!session) return;
    try { const result = await getCart(session); setCart(result); setMessage(result.items.length ? '' : 'Your cart is empty.'); }
    catch (error) { await handleError(error); }
  }, [handleError, session]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const menuItemId = route.params?.menuItemId;
    if (!session || !menuItemId || addedNavigationItem.current) return;
    addedNavigationItem.current = true;
    setBusyId(menuItemId);
    addCartItem(session, menuItemId, route.params?.quantity ?? 1)
      .then(result => { setCart(result); setMessage('Item added to your cart.'); })
      .catch(error => void handleError(error))
      .finally(() => setBusyId(null));
  }, [handleError, route.params?.menuItemId, route.params?.quantity, session]);

  async function refresh() { setRefreshing(true); await load(); setRefreshing(false); }
  async function update(itemId: string, quantity: number) {
    if (!session) return;
    setBusyId(itemId);
    try { setCart(await updateCartItem(session, itemId, quantity)); setMessage('Cart updated.'); }
    catch (error) { await handleError(error); }
    finally { setBusyId(null); }
  }
  async function remove(itemId: string) {
    if (!session) return;
    setBusyId(itemId);
    try { setCart(await removeCartItem(session, itemId)); setMessage('Item removed.'); }
    catch (error) { await handleError(error); }
    finally { setBusyId(null); }
  }
  async function validate() {
    if (!session) return;
    setBusyId('validate');
    try { setCart(await validateCart(session)); setMessage('Cart availability validated by Order Service.'); }
    catch (error) { await handleError(error); }
    finally { setBusyId(null); }
  }
  function confirmClear() {
    Alert.alert('Clear cart?', 'Remove every item from your cart?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: () => void performClear() }
    ]);
  }
  async function performClear() {
    if (!session) return;
    setBusyId('clear');
    try { setCart(await clearCart(session)); setMessage('Cart cleared.'); }
    catch (error) { await handleError(error); }
    finally { setBusyId(null); }
  }

  return <SafeAreaView style={styles.page}>
    <View style={styles.header}><Pressable onPress={() => navigation.goBack()}><Text style={styles.back}>‹ Home</Text></Pressable><Text style={styles.title}>Your cart</Text><Text style={styles.subtitle}>Prices and food subtotal come only from Order Service.</Text></View>
    {message ? <Text style={styles.message}>{message}</Text> : null}
    <FlatList
      data={cart?.items ?? []}
      keyExtractor={item => item.id}
      refreshing={refreshing}
      onRefresh={() => void refresh()}
      contentContainerStyle={styles.list}
      ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyText}>Your mobile cart is empty. A future discovery screen can navigate here with a selected menu item.</Text></View>}
      renderItem={({ item }) => <View style={styles.card}><View style={styles.row}><View style={styles.grow}><Text style={styles.kitchen}>{item.kitchenName}</Text><Text style={styles.item}>{item.itemName}</Text><Text style={styles.muted}>{money(item.unitPrice, item.currency)} each</Text></View><Text style={styles.amount}>{money(item.lineTotal, item.currency)}</Text></View><View style={styles.actions}><Pressable disabled={busyId === item.id || item.quantity <= 1} onPress={() => void update(item.id, item.quantity - 1)} style={styles.quantity}><Text style={styles.quantityText}>−</Text></Pressable><Text style={styles.count}>{item.quantity}</Text><Pressable disabled={busyId === item.id || item.quantity >= 100} onPress={() => void update(item.id, item.quantity + 1)} style={styles.quantity}><Text style={styles.quantityText}>+</Text></Pressable><Pressable disabled={busyId === item.id} onPress={() => void remove(item.id)} style={styles.remove}><Text style={styles.removeText}>Remove</Text></Pressable></View></View>}
      ListFooterComponent={cart ? <View style={styles.summary}><View style={styles.row}><Text style={styles.summaryLabel}>Food subtotal</Text><Text style={styles.summaryAmount}>{money(cart.foodSubtotal, cart.currency)}</Text></View><Text style={styles.note}>Platform fee, tax and delivery fee are calculated only when Order Service creates checkout.</Text><Pressable disabled={!cart.items.length || busyId !== null} onPress={() => void validate()} style={styles.outline}><Text style={styles.outlineText}>Validate availability</Text></Pressable><Pressable disabled={!cart.items.length || busyId !== null} onPress={() => navigation.navigate('MobileCheckout')} style={styles.primary}><Text style={styles.primaryText}>Continue to checkout</Text></Pressable><Pressable disabled={!cart.items.length || busyId !== null} onPress={confirmClear} style={styles.clear}><Text style={styles.clearText}>Clear cart</Text></Pressable></View> : null}
    />
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: theme.colors.background }, header: { padding: 20, paddingBottom: 10 }, back: { color: theme.colors.gold, fontSize: 16, fontWeight: '800' }, title: { color: theme.colors.white, fontSize: 34, fontWeight: '900', marginTop: 18 }, subtitle: { color: '#CBD5E1', lineHeight: 21, marginTop: 8 }, message: { color: '#CBD5E1', paddingHorizontal: 20, paddingVertical: 8, textAlign: 'center' }, list: { gap: 14, padding: 20, paddingTop: 10, paddingBottom: 40 }, card: { backgroundColor: theme.colors.card, borderRadius: 24, padding: 20 }, row: { alignItems: 'flex-start', flexDirection: 'row', gap: 12, justifyContent: 'space-between' }, grow: { flex: 1 }, kitchen: { color: theme.colors.primary, fontSize: 11, fontWeight: '900', letterSpacing: 1 }, item: { color: theme.colors.text, fontSize: 20, fontWeight: '900', marginTop: 6 }, muted: { color: theme.colors.muted, marginTop: 5 }, amount: { color: theme.colors.text, fontWeight: '900' }, actions: { alignItems: 'center', flexDirection: 'row', gap: 10, marginTop: 18 }, quantity: { alignItems: 'center', borderColor: theme.colors.primary, borderRadius: 18, borderWidth: 1, height: 36, justifyContent: 'center', width: 36 }, quantityText: { color: theme.colors.primary, fontSize: 22, fontWeight: '900' }, count: { color: theme.colors.text, fontWeight: '900', minWidth: 24, textAlign: 'center' }, remove: { marginLeft: 'auto', paddingHorizontal: 10, paddingVertical: 8 }, removeText: { color: '#B91C1C', fontWeight: '800' }, empty: { backgroundColor: theme.colors.card, borderRadius: 24, padding: 24 }, emptyText: { color: theme.colors.muted, lineHeight: 22, textAlign: 'center' }, summary: { backgroundColor: theme.colors.card, borderRadius: 24, marginTop: 4, padding: 20 }, summaryLabel: { color: theme.colors.text, fontSize: 18 }, summaryAmount: { color: theme.colors.text, fontSize: 18, fontWeight: '900' }, note: { color: theme.colors.muted, lineHeight: 21, marginTop: 14 }, outline: { alignItems: 'center', borderColor: theme.colors.primary, borderRadius: theme.radius.button, borderWidth: 1, justifyContent: 'center', marginTop: 18, minHeight: 48 }, outlineText: { color: theme.colors.primary, fontWeight: '900' }, primary: { alignItems: 'center', backgroundColor: theme.colors.primary, borderRadius: theme.radius.button, justifyContent: 'center', marginTop: 10, minHeight: 50 }, primaryText: { color: theme.colors.white, fontWeight: '900' }, clear: { alignItems: 'center', marginTop: 8, padding: 10 }, clearText: { color: '#B91C1C', fontWeight: '800' }
});
