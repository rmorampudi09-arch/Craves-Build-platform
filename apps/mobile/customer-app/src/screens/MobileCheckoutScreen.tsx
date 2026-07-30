import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../auth/AuthProvider';
import { listAddresses } from '../addresses/addresses-api';
import type { CustomerAddress } from '../addresses/contracts';
import { getCart, validateCart } from '../cart/cart-api';
import type { CustomerCart } from '../cart/contracts';
import { CheckoutApiError, createCheckout } from '../checkout/checkout-api';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { theme } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'MobileCheckout'>;
function money(amount: number, currency: string): string { try { return new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(amount); } catch { return `${currency} ${amount.toFixed(2)}`; } }

export function MobileCheckoutScreen({ navigation }: Props) {
  const { session, signOut } = useAuth();
  const [cart, setCart] = useState<CustomerCart | null>(null);
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState('');
  const [note, setNote] = useState('');
  const [message, setMessage] = useState('Loading cart and saved addresses…');
  const [busy, setBusy] = useState(false);

  const handleError = useCallback(async (error: unknown) => {
    if (error instanceof CheckoutApiError && error.code === 'SESSION_EXPIRED') await signOut();
    setMessage(error instanceof Error ? error.message : 'Checkout is unavailable.');
  }, [signOut]);

  useEffect(() => {
    if (!session) return;
    Promise.all([getCart(session), listAddresses(session)])
      .then(([nextCart, nextAddresses]) => {
        setCart(nextCart);
        setAddresses(nextAddresses);
        const preferred = nextAddresses.find(address => address.isDefault) ?? nextAddresses[0];
        setSelectedAddressId(preferred?.id ?? '');
        setMessage(!nextCart.items.length ? 'Your cart is empty.' : !nextAddresses.length ? 'Add a saved address before checkout.' : 'Review your address and create checkout.');
      })
      .catch(error => void handleError(error));
  }, [handleError, session]);

  async function submit() {
    if (!session || !cart?.items.length || !selectedAddressId) return;
    setBusy(true);
    setMessage('Validating cart and creating checkout…');
    try {
      await validateCart(session);
      const checkout = await createCheckout(session, selectedAddressId, note);
      navigation.replace('MobilePayment', { checkoutId: checkout.id });
    } catch (error) {
      await handleError(error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.page}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable onPress={() => navigation.goBack()}><Text style={styles.back}>‹ Cart</Text></Pressable>
        <Text style={styles.title}>Checkout</Text>
        <Text style={styles.subtitle}>Order Service validates availability, snapshots the saved address and calculates every final charge.</Text>
        <View style={styles.card}>
          <Text style={styles.eyebrow}>SELECT DELIVERY ADDRESS</Text>
          <View style={styles.addresses}>{addresses.map(address => <Pressable key={address.id} onPress={() => setSelectedAddressId(address.id)} style={[styles.address, selectedAddressId === address.id && styles.addressSelected]}><View style={styles.addressRow}><Text style={styles.addressLabel}>{address.addressLabel}{address.isDefault ? ' · DEFAULT' : ''}</Text><View style={[styles.radio, selectedAddressId === address.id && styles.radioSelected]} /></View><Text style={styles.addressText}>{address.addressLine1}{address.addressLine2 ? `, ${address.addressLine2}` : ''}, {address.areaName}, {address.city}, {address.state} {address.postalCode}</Text></Pressable>)}</View>
          {!addresses.length && <Pressable onPress={() => navigation.navigate('AddressForm', {})} style={styles.outline}><Text style={styles.outlineText}>Add saved address</Text></Pressable>}
          <Text style={styles.fieldLabel}>Order note</Text>
          <TextInput value={note} onChangeText={setNote} maxLength={500} multiline numberOfLines={4} placeholder="Optional instructions for the chef" placeholderTextColor="#64748B" style={styles.noteInput} />
        </View>
        {cart && <View style={styles.summary}><Text style={styles.eyebrow}>CART PREVIEW</Text>{cart.items.map(item => <View key={item.id} style={styles.row}><Text style={styles.grow}>{item.quantity} × {item.itemName}</Text><Text style={styles.bold}>{money(item.lineTotal, item.currency)}</Text></View>)}<View style={styles.totalRow}><Text style={styles.totalLabel}>Food subtotal</Text><Text style={styles.totalLabel}>{money(cart.foodSubtotal, cart.currency)}</Text></View><Text style={styles.help}>Platform fee, tax and delivery fee will appear after backend checkout creation.</Text></View>}
        <Pressable disabled={busy || !cart?.items.length || !selectedAddressId} onPress={() => void submit()} style={styles.primary}>{busy ? <ActivityIndicator color={theme.colors.white} /> : <Text style={styles.primaryText}>Create checkout</Text>}</Pressable>
        <Text style={styles.message}>{message}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({ page: { flex: 1, backgroundColor: theme.colors.background }, content: { padding: 20, paddingBottom: 40 }, back: { color: theme.colors.gold, fontSize: 16, fontWeight: '800' }, title: { color: theme.colors.white, fontSize: 34, fontWeight: '900', marginTop: 18 }, subtitle: { color: '#CBD5E1', lineHeight: 21, marginTop: 8 }, card: { backgroundColor: theme.colors.card, borderRadius: 28, marginTop: 22, padding: 22 }, eyebrow: { color: theme.colors.primary, fontSize: 11, fontWeight: '900', letterSpacing: 1.2 }, addresses: { gap: 10, marginTop: 14 }, address: { backgroundColor: theme.colors.white, borderColor: '#CBD5E1', borderRadius: 18, borderWidth: 1, padding: 15 }, addressSelected: { borderColor: theme.colors.primary, borderWidth: 2 }, addressRow: { flexDirection: 'row', justifyContent: 'space-between' }, addressLabel: { color: theme.colors.primary, fontSize: 11, fontWeight: '900' }, radio: { borderColor: '#94A3B8', borderRadius: 8, borderWidth: 1, height: 16, width: 16 }, radioSelected: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary }, addressText: { color: theme.colors.text, lineHeight: 20, marginTop: 8 }, outline: { alignItems: 'center', borderColor: theme.colors.primary, borderRadius: theme.radius.button, borderWidth: 1, justifyContent: 'center', marginTop: 16, minHeight: 48 }, outlineText: { color: theme.colors.primary, fontWeight: '900' }, fieldLabel: { color: theme.colors.text, fontWeight: '800', marginTop: 20 }, noteInput: { backgroundColor: theme.colors.white, borderColor: '#CBD5E1', borderRadius: 16, borderWidth: 1, color: theme.colors.text, marginTop: 8, minHeight: 100, padding: 14, textAlignVertical: 'top' }, summary: { backgroundColor: theme.colors.card, borderRadius: 28, gap: 12, marginTop: 16, padding: 22 }, row: { flexDirection: 'row', gap: 12, justifyContent: 'space-between' }, grow: { color: theme.colors.text, flex: 1 }, bold: { color: theme.colors.text, fontWeight: '800' }, totalRow: { borderTopColor: '#CBD5E1', borderTopWidth: 1, flexDirection: 'row', justifyContent: 'space-between', paddingTop: 14 }, totalLabel: { color: theme.colors.text, fontSize: 17, fontWeight: '900' }, help: { color: theme.colors.muted, lineHeight: 20 }, primary: { alignItems: 'center', backgroundColor: theme.colors.primary, borderRadius: theme.radius.button, justifyContent: 'center', marginTop: 18, minHeight: 52 }, primaryText: { color: theme.colors.white, fontWeight: '900' }, message: { color: '#CBD5E1', lineHeight: 20, marginTop: 14, textAlign: 'center' } });
