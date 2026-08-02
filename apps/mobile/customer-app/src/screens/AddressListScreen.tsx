import React, { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../auth/AuthProvider';
import { AddressesApiError, deleteAddress, listAddresses } from '../addresses/addresses-api';
import type { CustomerAddress } from '../addresses/contracts';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { theme } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Addresses'>;

export function AddressListScreen({ navigation }: Props) {
  const { session, signOut } = useAuth();
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [message, setMessage] = useState('Loading saved addresses…');
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    try {
      const result = await listAddresses(session);
      setAddresses(result);
      setMessage(result.length ? '' : 'No saved addresses yet.');
    } catch (error) {
      if (error instanceof AddressesApiError && error.code === 'SESSION_EXPIRED') await signOut();
      setMessage(error instanceof Error ? error.message : 'Saved addresses are unavailable.');
    }
  }, [session, signOut]);

  useEffect(() => { void load(); }, [load]);

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  function confirmDelete(address: CustomerAddress) {
    Alert.alert('Delete saved address?', `${address.addressLabel}: ${address.addressLine1}`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void remove(address.id) }
    ]);
  }

  async function remove(addressId: string) {
    if (!session) return;
    setBusyId(addressId);
    try {
      await deleteAddress(session, addressId);
      setAddresses(current => current.filter(address => address.id !== addressId));
      setMessage('Address deleted.');
    } catch (error) {
      if (error instanceof AddressesApiError && error.code === 'SESSION_EXPIRED') await signOut();
      setMessage(error instanceof Error ? error.message : 'Address could not be deleted.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <SafeAreaView style={styles.page}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()}><Text style={styles.back}>‹ Home</Text></Pressable>
        <Text style={styles.title}>Saved addresses</Text>
        <Text style={styles.subtitle}>Customer-owned delivery addresses and exact checkout coordinates.</Text>
        <Pressable style={styles.primary} onPress={() => navigation.navigate('AddressForm', {})}>
          <Text style={styles.primaryText}>Add address</Text>
        </Pressable>
      </View>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      <FlatList
        data={addresses}
        keyExtractor={item => item.id}
        refreshing={refreshing}
        onRefresh={() => void refresh()}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.row}>
              <View style={styles.grow}>
                <Text style={styles.label}>{item.addressLabel}{item.isDefault ? ' · DEFAULT' : ''}</Text>
                <Text style={styles.name}>{item.recipientName}</Text>
              </View>
              <Text style={styles.phone}>{item.contactPhoneNumber}</Text>
            </View>
            <Text style={styles.address}>{item.addressLine1}{item.addressLine2 ? `, ${item.addressLine2}` : ''}{item.landmark ? `, ${item.landmark}` : ''}, {item.areaName}, {item.city}, {item.state} {item.postalCode}</Text>
            <Text style={styles.coords}>{item.latitude.toFixed(6)}, {item.longitude.toFixed(6)}</Text>
            <View style={styles.actions}>
              <Pressable style={styles.outline} onPress={() => navigation.navigate('AddressForm', { addressId: item.id })}><Text style={styles.outlineText}>Edit</Text></Pressable>
              <Pressable disabled={busyId === item.id} style={styles.delete} onPress={() => confirmDelete(item)}><Text style={styles.deleteText}>{busyId === item.id ? 'Deleting…' : 'Delete'}</Text></Pressable>
            </View>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: theme.colors.background },
  header: { padding: 20, paddingBottom: 10 },
  back: { color: theme.colors.gold, fontSize: 16, fontWeight: '800' },
  title: { color: theme.colors.white, fontSize: 34, fontWeight: '900', marginTop: 18 },
  subtitle: { color: '#CBD5E1', lineHeight: 21, marginTop: 8 },
  primary: { alignItems: 'center', backgroundColor: theme.colors.primary, borderRadius: theme.radius.button, justifyContent: 'center', marginTop: 18, minHeight: 48 },
  primaryText: { color: theme.colors.white, fontWeight: '900' },
  message: { color: '#CBD5E1', paddingHorizontal: 20, paddingVertical: 10, textAlign: 'center' },
  list: { gap: 14, padding: 20, paddingTop: 10 },
  card: { backgroundColor: theme.colors.card, borderRadius: 24, padding: 20 },
  row: { alignItems: 'flex-start', flexDirection: 'row', gap: 12 },
  grow: { flex: 1 },
  label: { color: theme.colors.primary, fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  name: { color: theme.colors.text, fontSize: 20, fontWeight: '900', marginTop: 6 },
  phone: { color: theme.colors.muted, fontSize: 12 },
  address: { color: theme.colors.text, lineHeight: 22, marginTop: 14 },
  coords: { color: theme.colors.muted, fontSize: 12, marginTop: 8 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 18 },
  outline: { borderColor: theme.colors.primary, borderRadius: 20, borderWidth: 1, paddingHorizontal: 18, paddingVertical: 9 },
  outlineText: { color: theme.colors.primary, fontWeight: '800' },
  delete: { borderColor: '#FCA5A5', borderRadius: 20, borderWidth: 1, paddingHorizontal: 18, paddingVertical: 9 },
  deleteText: { color: '#B91C1C', fontWeight: '800' }
});
