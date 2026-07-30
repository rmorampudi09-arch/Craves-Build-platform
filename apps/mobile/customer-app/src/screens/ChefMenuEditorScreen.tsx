import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../auth/AuthProvider';
import { ChefCatalogApiError, listMyMenu, saveMenuItem } from '../chef/kitchen-menu-api';
import type { MobileChefMenuItem, MobileFoodType, MobileMenuStatus } from '../chef/kitchen-menu-contracts';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { theme } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'ChefMenuEditor'>;
type Form = { itemName: string; description: string; category: string; foodType: MobileFoodType; price: string; currency: string; preparationTimeMinutes: string; unitPackageWeightGrams: string; thermoboxRequired: boolean; available: boolean; status: MobileMenuStatus };
const EMPTY: Form = { itemName: '', description: '', category: '', foodType: 'VEG', price: '', currency: 'INR', preparationTimeMinutes: '', unitPackageWeightGrams: '', thermoboxRequired: false, available: false, status: 'DRAFT' };
function fromItem(item: MobileChefMenuItem): Form { return { itemName: item.itemName, description: item.description ?? '', category: item.category, foodType: item.foodType, price: String(item.price), currency: item.currency, preparationTimeMinutes: item.preparationTimeMinutes === null ? '' : String(item.preparationTimeMinutes), unitPackageWeightGrams: String(item.unitPackageWeightGrams), thermoboxRequired: item.thermoboxRequired, available: item.available, status: item.status }; }

export function ChefMenuEditorScreen({ navigation, route }: Props) {
  const { session, signOut } = useAuth();
  const menuItemId = route.params?.menuItemId;
  const [form, setForm] = useState<Form>(EMPTY);
  const [message, setMessage] = useState(menuItemId ? 'Loading dish…' : 'Create a new dish.');

  const load = useCallback(async () => {
    if (!session || !menuItemId) return;
    try { const item = (await listMyMenu(session)).find(value => value.id === menuItemId); if (!item) throw new Error('Dish was not found.'); setForm(fromItem(item)); setMessage(''); }
    catch (error) { if (error instanceof ChefCatalogApiError && error.status === 401) { await signOut(); return; } setMessage(error instanceof Error ? error.message : 'Dish is temporarily unavailable.'); }
  }, [session, menuItemId, signOut]);
  useEffect(() => { void load(); }, [load]);
  function field<K extends keyof Form>(name: K, value: Form[K]) { setForm(current => ({ ...current, [name]: value })); }

  async function save() {
    if (!session) return;
    try {
      await saveMenuItem(session, { id: menuItemId ?? '', itemName: form.itemName, description: form.description || null, category: form.category, foodType: form.foodType, price: Number(form.price), currency: form.currency, preparationTimeMinutes: form.preparationTimeMinutes ? Number(form.preparationTimeMinutes) : null, unitPackageWeightGrams: Number(form.unitPackageWeightGrams), thermoboxRequired: form.thermoboxRequired, available: form.available, status: form.status, spiceLevel: null }, menuItemId);
      navigation.goBack();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Dish could not be saved.'); }
  }

  return <SafeAreaView style={styles.page}><ScrollView contentContainerStyle={styles.content}><Pressable onPress={() => navigation.goBack()}><Text style={styles.back}>← Kitchen and menu</Text></Pressable><View style={styles.card}><Text style={styles.eyebrow}>{menuItemId ? 'EDIT DISH' : 'NEW DISH'}</Text><TextInput placeholder="Item name" value={form.itemName} onChangeText={value => field('itemName', value)} style={styles.input} /><TextInput placeholder="Description" value={form.description} multiline onChangeText={value => field('description', value)} style={[styles.input, styles.multiline]} /><TextInput placeholder="Category" value={form.category} onChangeText={value => field('category', value)} style={styles.input} /><View style={styles.row}>{(['VEG','NON_VEG','EGG'] as MobileFoodType[]).map(value => <Pressable key={value} style={[styles.chip, form.foodType === value && styles.chipActive]} onPress={() => field('foodType', value)}><Text style={form.foodType === value ? styles.chipTextActive : styles.chipText}>{value.replace('_',' ')}</Text></Pressable>)}</View><TextInput placeholder="Price" value={form.price} keyboardType="decimal-pad" onChangeText={value => field('price', value)} style={styles.input} /><TextInput placeholder="Currency" value={form.currency} maxLength={3} onChangeText={value => field('currency', value.toUpperCase())} style={styles.input} /><TextInput placeholder="Preparation minutes" value={form.preparationTimeMinutes} keyboardType="number-pad" onChangeText={value => field('preparationTimeMinutes', value)} style={styles.input} /><TextInput placeholder="Package weight grams" value={form.unitPackageWeightGrams} keyboardType="number-pad" onChangeText={value => field('unitPackageWeightGrams', value)} style={styles.input} /><View style={styles.row}>{(['DRAFT','ACTIVE','INACTIVE'] as MobileMenuStatus[]).map(value => <Pressable key={value} style={[styles.chip, form.status === value && styles.chipActive]} onPress={() => field('status', value)}><Text style={form.status === value ? styles.chipTextActive : styles.chipText}>{value}</Text></Pressable>)}</View><Pressable style={styles.toggle} onPress={() => field('available', !form.available)}><Text style={styles.toggleText}>{form.available ? 'Available' : 'Unavailable'} — tap to change</Text></Pressable><Pressable style={styles.toggle} onPress={() => field('thermoboxRequired', !form.thermoboxRequired)}><Text style={styles.toggleText}>{form.thermoboxRequired ? 'Thermobox required' : 'Thermobox not required'} — tap to change</Text></Pressable><Pressable style={styles.primary} onPress={() => void save()}><Text style={styles.primaryText}>Save dish</Text></Pressable><Text style={styles.message}>{message}</Text></View></ScrollView></SafeAreaView>;
}

const styles = StyleSheet.create({ page: { flex: 1, backgroundColor: theme.colors.background }, content: { padding: 20, paddingBottom: 40 }, back: { color: theme.colors.gold, fontWeight: '800', marginTop: 18, marginBottom: 20 }, card: { backgroundColor: theme.colors.card, borderRadius: theme.radius.card, padding: 22 }, eyebrow: { color: theme.colors.primary, fontWeight: '800', letterSpacing: 1.6, fontSize: 12 }, input: { backgroundColor: theme.colors.white, borderRadius: 14, paddingHorizontal: 14, minHeight: 48, marginTop: 12, color: theme.colors.text }, multiline: { minHeight: 90, textAlignVertical: 'top' }, row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 }, chip: { borderColor: theme.colors.primary, borderWidth: 1, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 9 }, chipActive: { backgroundColor: theme.colors.primary }, chipText: { color: theme.colors.primary, fontWeight: '700' }, chipTextActive: { color: theme.colors.white, fontWeight: '700' }, toggle: { backgroundColor: theme.colors.white, borderRadius: 14, padding: 14, marginTop: 12 }, toggleText: { color: theme.colors.text, fontWeight: '700' }, primary: { backgroundColor: theme.colors.primary, borderRadius: theme.radius.button, minHeight: 50, marginTop: 20, alignItems: 'center', justifyContent: 'center' }, primaryText: { color: theme.colors.white, fontWeight: '800' }, message: { color: theme.colors.muted, lineHeight: 20, marginTop: 14 } });
