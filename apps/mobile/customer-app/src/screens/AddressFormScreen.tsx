import React, { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../auth/AuthProvider';
import { AddressesApiError, createAddress, getAddress, recommendLocation, updateAddress } from '../addresses/addresses-api';
import type { AddressInput, AddressLabel } from '../addresses/contracts';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { theme } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'AddressForm'>;
type FormState = {
  addressLabel: AddressLabel;
  recipientName: string;
  contactPhoneNumber: string;
  addressLine1: string;
  addressLine2: string;
  landmark: string;
  areaName: string;
  city: string;
  state: string;
  postalCode: string;
  latitude: string;
  longitude: string;
  isDefault: boolean;
};

const empty: FormState = {
  addressLabel: 'HOME', recipientName: '', contactPhoneNumber: '', addressLine1: '', addressLine2: '', landmark: '', areaName: '', city: '', state: '', postalCode: '', latitude: '', longitude: '', isDefault: false
};

export function AddressFormScreen({ route, navigation }: Props) {
  const { session, signOut } = useAuth();
  const addressId = route.params?.addressId;
  const [form, setForm] = useState<FormState>(empty);
  const [message, setMessage] = useState(addressId ? 'Loading address…' : 'Enter the postal address and exact coordinates.');
  const [busy, setBusy] = useState(Boolean(addressId));

  useEffect(() => {
    if (!session || !addressId) return;
    getAddress(session, addressId).then(address => {
      setForm({
        addressLabel: address.addressLabel,
        recipientName: address.recipientName,
        contactPhoneNumber: address.contactPhoneNumber,
        addressLine1: address.addressLine1,
        addressLine2: address.addressLine2 ?? '',
        landmark: address.landmark ?? '',
        areaName: address.areaName,
        city: address.city,
        state: address.state,
        postalCode: address.postalCode,
        latitude: String(address.latitude),
        longitude: String(address.longitude),
        isDefault: address.isDefault
      });
      setMessage('Review and update the saved address.');
    }).catch(async error => {
      if (error instanceof AddressesApiError && error.code === 'SESSION_EXPIRED') await signOut();
      setMessage(error instanceof Error ? error.message : 'Address could not be loaded.');
    }).finally(() => setBusy(false));
  }, [addressId, session, signOut]);

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(current => ({ ...current, [key]: value }));
  }

  function input(): AddressInput | null {
    const latitude = Number(form.latitude);
    const longitude = Number(form.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    return {
      addressLabel: form.addressLabel,
      recipientName: form.recipientName.trim(),
      contactPhoneNumber: form.contactPhoneNumber.trim(),
      addressLine1: form.addressLine1.trim(),
      addressLine2: form.addressLine2.trim() || null,
      landmark: form.landmark.trim() || null,
      areaName: form.areaName.trim(),
      city: form.city.trim(),
      state: form.state.trim(),
      postalCode: form.postalCode.trim(),
      latitude,
      longitude,
      isDefault: form.isDefault
    };
  }

  async function checkRecommendation() {
    if (!session) return;
    const value = input();
    if (!value) return setMessage('Enter valid latitude and longitude first.');
    setBusy(true);
    try {
      const recommendation = await recommendLocation(session, value.latitude, value.longitude);
      setMessage(recommendation.selectedSavedAddress
        ? `These coordinates are close to your saved ${recommendation.selectedSavedAddress.addressLabel.toLowerCase()} address (${recommendation.distanceMeters ?? 0} m).`
        : 'No saved address currently matches these coordinates.');
    } catch (error) {
      if (error instanceof AddressesApiError && error.code === 'SESSION_EXPIRED') await signOut();
      setMessage(error instanceof Error ? error.message : 'Location recommendation is unavailable.');
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!session) return;
    const value = input();
    if (!value) return setMessage('Enter a complete valid address and coordinates.');
    setBusy(true);
    setMessage(addressId ? 'Updating address…' : 'Saving address…');
    try {
      if (addressId) await updateAddress(session, addressId, value);
      else await createAddress(session, value);
      navigation.replace('Addresses');
    } catch (error) {
      if (error instanceof AddressesApiError && error.code === 'SESSION_EXPIRED') await signOut();
      setMessage(error instanceof Error ? error.message : 'Address could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  const fields: Array<{ key: keyof FormState; label: string; keyboard?: 'default' | 'phone-pad' | 'number-pad' | 'decimal-pad'; multiline?: boolean }> = [
    { key: 'recipientName', label: 'Recipient name' },
    { key: 'contactPhoneNumber', label: 'Contact phone', keyboard: 'phone-pad' },
    { key: 'addressLine1', label: 'Address line 1' },
    { key: 'addressLine2', label: 'Address line 2' },
    { key: 'landmark', label: 'Landmark' },
    { key: 'areaName', label: 'Area' },
    { key: 'city', label: 'City' },
    { key: 'state', label: 'State' },
    { key: 'postalCode', label: 'Postal code', keyboard: 'number-pad' },
    { key: 'latitude', label: 'Latitude', keyboard: 'decimal-pad' },
    { key: 'longitude', label: 'Longitude', keyboard: 'decimal-pad' }
  ];

  return (
    <SafeAreaView style={styles.page}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Pressable onPress={() => navigation.goBack()}><Text style={styles.back}>‹ Addresses</Text></Pressable>
          <Text style={styles.title}>{addressId ? 'Edit address' : 'Add address'}</Text>
          <Text style={styles.subtitle}>Device GPS capture will be added with the reviewed native location-permission setup. Enter precise coordinates for now.</Text>
          <View style={styles.card}>
            <Text style={styles.fieldLabel}>Address label</Text>
            <View style={styles.labels}>{(['HOME', 'WORK', 'OTHER'] as AddressLabel[]).map(label => <Pressable key={label} onPress={() => setField('addressLabel', label)} style={[styles.labelButton, form.addressLabel === label && styles.labelButtonActive]}><Text style={[styles.labelText, form.addressLabel === label && styles.labelTextActive]}>{label}</Text></Pressable>)}</View>
            {fields.map(field => <View key={field.key} style={styles.field}><Text style={styles.fieldLabel}>{field.label}</Text><TextInput value={String(form[field.key])} onChangeText={value => setField(field.key, value as never)} keyboardType={field.keyboard ?? 'default'} autoCapitalize={field.key === 'contactPhoneNumber' || field.key === 'postalCode' || field.key === 'latitude' || field.key === 'longitude' ? 'none' : 'sentences'} style={styles.input} /></View>)}
            <View style={styles.switchRow}><Text style={styles.fieldLabel}>Use as default address</Text><Switch value={form.isDefault} onValueChange={value => setField('isDefault', value)} trackColor={{ true: theme.colors.primary }} /></View>
            <Pressable disabled={busy} onPress={() => void checkRecommendation()} style={styles.outline}><Text style={styles.outlineText}>Check coordinate recommendation</Text></Pressable>
            <Pressable disabled={busy} onPress={() => void save()} style={styles.primary}>{busy ? <ActivityIndicator color={theme.colors.white} /> : <Text style={styles.primaryText}>{addressId ? 'Update address' : 'Save address'}</Text>}</Pressable>
            <Text style={styles.message}>{message}</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: theme.colors.background },
  flex: { flex: 1 },
  content: { padding: 20, paddingBottom: 40 },
  back: { color: theme.colors.gold, fontSize: 16, fontWeight: '800' },
  title: { color: theme.colors.white, fontSize: 34, fontWeight: '900', marginTop: 18 },
  subtitle: { color: '#CBD5E1', lineHeight: 21, marginTop: 8 },
  card: { backgroundColor: theme.colors.card, borderRadius: 28, marginTop: 22, padding: 22 },
  labels: { flexDirection: 'row', gap: 8, marginTop: 8 },
  labelButton: { borderColor: theme.colors.primary, borderRadius: 20, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 8 },
  labelButtonActive: { backgroundColor: theme.colors.primary },
  labelText: { color: theme.colors.primary, fontWeight: '800' },
  labelTextActive: { color: theme.colors.white },
  field: { marginTop: 16 },
  fieldLabel: { color: theme.colors.text, fontSize: 13, fontWeight: '800' },
  input: { backgroundColor: theme.colors.white, borderColor: '#CBD5E1', borderRadius: 16, borderWidth: 1, color: theme.colors.text, marginTop: 7, minHeight: 48, paddingHorizontal: 14 },
  switchRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: 20 },
  outline: { alignItems: 'center', borderColor: theme.colors.primary, borderRadius: theme.radius.button, borderWidth: 1, justifyContent: 'center', marginTop: 22, minHeight: 48 },
  outlineText: { color: theme.colors.primary, fontWeight: '800' },
  primary: { alignItems: 'center', backgroundColor: theme.colors.primary, borderRadius: theme.radius.button, justifyContent: 'center', marginTop: 12, minHeight: 50 },
  primaryText: { color: theme.colors.white, fontWeight: '900' },
  message: { color: theme.colors.muted, lineHeight: 20, marginTop: 16, textAlign: 'center' }
});
