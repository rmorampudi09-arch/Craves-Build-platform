import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../auth/AuthProvider';
import { ChefCatalogApiError, getMyKitchen, listMyMenu, saveMyKitchen, setMenuAvailability } from '../chef/kitchen-menu-api';
import type { MobileChefKitchen, MobileChefMenuItem } from '../chef/kitchen-menu-contracts';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { theme } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'ChefKitchen'>;
type Form = { kitchenName: string; displayName: string; addressLine1: string; city: string; state: string; postalCode: string; latitude: string; longitude: string; status: 'DRAFT' | 'ACTIVE' | 'INACTIVE' };
const EMPTY: Form = { kitchenName: '', displayName: '', addressLine1: '', city: '', state: '', postalCode: '', latitude: '', longitude: '', status: 'DRAFT' };

function formFrom(kitchen: MobileChefKitchen | null): Form {
  if (!kitchen) return EMPTY;
  return { kitchenName: kitchen.kitchenName, displayName: kitchen.displayName ?? '', addressLine1: kitchen.addressLine1, city: kitchen.city, state: kitchen.state, postalCode: kitchen.postalCode ?? '', latitude: kitchen.latitude === null ? '' : String(kitchen.latitude), longitude: kitchen.longitude === null ? '' : String(kitchen.longitude), status: kitchen.status === 'SUSPENDED' ? 'INACTIVE' : kitchen.status };
}

export function ChefKitchenScreen({ navigation }: Props) {
  const { session, signOut } = useAuth();
  const [kitchen, setKitchen] = useState<MobileChefKitchen | null>(null);
  const [menu, setMenu] = useState<MobileChefMenuItem[]>([]);
  const [form, setForm] = useState<Form>(EMPTY);
  const [message, setMessage] = useState('Loading chef kitchen…');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    try {
      const nextKitchen = await getMyKitchen(session);
      setKitchen(nextKitchen);
      setForm(formFrom(nextKitchen));
      setMenu(nextKitchen ? await listMyMenu(session) : []);
      setMessage(nextKitchen ? '' : 'Create the kitchen profile owned by your approved chef identity.');
    } catch (error) {
      if (error instanceof ChefCatalogApiError && error.status === 401) { await signOut(); return; }
      setMessage(error instanceof Error ? error.message : 'Chef kitchen is temporarily unavailable.');
    } finally { setLoading(false); }
  }, [session, signOut]);

  useEffect(() => { void load(); }, [load]);
  function field(name: keyof Form, value: string) { setForm(current => ({ ...current, [name]: value })); }

  async function save() {
    if (!session) return;
    try {
      const result = await saveMyKitchen(session, {
        kitchenName: form.kitchenName, displayName: form.displayName || null, description: kitchen?.description ?? null,
        phoneNumber: kitchen?.phoneNumber ?? null, email: kitchen?.email ?? null, addressLine1: form.addressLine1,
        addressLine2: kitchen?.addressLine2 ?? null, landmark: kitchen?.landmark ?? null, areaName: kitchen?.areaName ?? null,
        city: form.city, state: form.state, postalCode: form.postalCode || null,
        latitude: form.latitude ? Number(form.latitude) : null, longitude: form.longitude ? Number(form.longitude) : null, status: form.status
      });
      setKitchen(result); setForm(formFrom(result)); setMessage('Kitchen profile saved by Catalog Service.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Kitchen profile could not be saved.'); }
  }

  async function toggle(item: MobileChefMenuItem) {
    if (!session) return;
    try { await setMenuAvailability(session, item.id, !item.available); await load(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Availability could not be updated.'); }
  }

  const suspended = kitchen?.status === 'SUSPENDED';
  return <SafeAreaView style={styles.page}><ScrollView contentContainerStyle={styles.content}><Pressable onPress={() => navigation.goBack()}><Text style={styles.back}>← Chef mode</Text></Pressable><View style={styles.card}><Text style={styles.eyebrow}>KITCHEN PROFILE</Text>{loading ? <ActivityIndicator color={theme.colors.primary} style={styles.loader} /> : <><TextInput editable={!suspended} placeholder="Kitchen name" value={form.kitchenName} onChangeText={value => field('kitchenName', value)} style={styles.input} /><TextInput editable={!suspended} placeholder="Display name" value={form.displayName} onChangeText={value => field('displayName', value)} style={styles.input} /><TextInput editable={!suspended} placeholder="Address line 1" value={form.addressLine1} onChangeText={value => field('addressLine1', value)} style={styles.input} /><TextInput editable={!suspended} placeholder="City" value={form.city} onChangeText={value => field('city', value)} style={styles.input} /><TextInput editable={!suspended} placeholder="State" value={form.state} onChangeText={value => field('state', value)} style={styles.input} /><TextInput editable={!suspended} placeholder="Postal code" value={form.postalCode} onChangeText={value => field('postalCode', value)} style={styles.input} /><View style={styles.row}><TextInput editable={!suspended} placeholder="Latitude" value={form.latitude} keyboardType="decimal-pad" onChangeText={value => field('latitude', value)} style={[styles.input, styles.flex]} /><TextInput editable={!suspended} placeholder="Longitude" value={form.longitude} keyboardType="decimal-pad" onChangeText={value => field('longitude', value)} style={[styles.input, styles.flex]} /></View><Text style={styles.meta}>Status: {kitchen?.status ?? form.status}</Text><Pressable disabled={suspended} style={[styles.primary, suspended && styles.disabled]} onPress={() => void save()}><Text style={styles.primaryText}>Save kitchen</Text></Pressable></>}<Text style={styles.message}>{message}</Text></View><View style={styles.card}><View style={styles.headerRow}><Text style={styles.title}>Menu</Text><Pressable onPress={() => navigation.navigate('ChefMenuEditor')}><Text style={styles.link}>New dish</Text></Pressable></View>{menu.map(item => <View key={item.id} style={styles.item}><Pressable style={styles.flex} onPress={() => navigation.navigate('ChefMenuEditor', { menuItemId: item.id })}><Text style={styles.itemTitle}>{item.itemName}</Text><Text style={styles.meta}>{item.currency} {item.price.toFixed(2)} · {item.status}</Text></Pressable><Pressable onPress={() => void toggle(item)}><Text style={styles.link}>{item.available ? 'Disable' : 'Enable'}</Text></Pressable></View>)}</View></ScrollView></SafeAreaView>;
}

const styles = StyleSheet.create({ page: { flex: 1, backgroundColor: theme.colors.background }, content: { padding: 20, paddingBottom: 40 }, back: { color: theme.colors.gold, fontWeight: '800', marginTop: 18, marginBottom: 20 }, card: { backgroundColor: theme.colors.card, borderRadius: theme.radius.card, padding: 22, marginBottom: 18 }, eyebrow: { color: theme.colors.primary, fontWeight: '800', letterSpacing: 1.6, fontSize: 12 }, loader: { margin: 24 }, input: { backgroundColor: theme.colors.white, borderRadius: 14, paddingHorizontal: 14, minHeight: 48, marginTop: 12, color: theme.colors.text }, row: { flexDirection: 'row', gap: 10 }, flex: { flex: 1 }, primary: { backgroundColor: theme.colors.primary, borderRadius: theme.radius.button, minHeight: 48, marginTop: 18, alignItems: 'center', justifyContent: 'center' }, disabled: { opacity: 0.45 }, primaryText: { color: theme.colors.white, fontWeight: '800' }, message: { color: theme.colors.muted, marginTop: 14, lineHeight: 20 }, meta: { color: theme.colors.muted, marginTop: 8 }, headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, title: { color: theme.colors.text, fontSize: 25, fontWeight: '900' }, link: { color: theme.colors.primary, fontWeight: '800' }, item: { backgroundColor: theme.colors.white, borderRadius: 16, padding: 14, marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }, itemTitle: { color: theme.colors.text, fontWeight: '800', fontSize: 16 } });
