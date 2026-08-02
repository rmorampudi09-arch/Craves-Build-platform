import React, { useState } from 'react';
import { Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { theme } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'TrackingLookup'>;

export function TrackingLookupScreen({ navigation }: Props) {
  const [orderId, setOrderId] = useState('');
  const [message, setMessage] = useState('Enter the chef-specific order ID shown in your Craves order details.');

  function continueToTracking() {
    const normalized = orderId.trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)) {
      setMessage('Enter a valid order ID.');
      return;
    }
    navigation.navigate('DeliveryTracking', { orderId: normalized });
  }

  return (
    <SafeAreaView style={styles.page}>
      <View style={styles.card}>
        <Text style={styles.eyebrow}>LIVE ORDER STATUS</Text>
        <Text style={styles.title}>Track your delivery</Text>
        <Text style={styles.description}>The backend verifies that the order belongs to your signed-in customer account.</Text>
        <Text style={styles.label}>Order ID</Text>
        <TextInput
          value={orderId}
          onChangeText={setOrderId}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
          placeholder="11111111-2222-4333-8444-555555555555"
          placeholderTextColor="#94A3B8"
        />
        <Pressable style={styles.primaryButton} onPress={continueToTracking}>
          <Text style={styles.primaryText}>Continue</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={() => navigation.goBack()}>
          <Text style={styles.secondaryText}>Back</Text>
        </Pressable>
        <Text accessibilityLiveRegion="polite" style={styles.message}>{message}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: theme.colors.background, justifyContent: 'center', padding: 20 },
  card: { backgroundColor: theme.colors.card, borderRadius: theme.radius.card, padding: 24 },
  eyebrow: { color: theme.colors.primary, fontSize: 12, fontWeight: '800', letterSpacing: 1.8 },
  title: { color: theme.colors.text, fontSize: 30, fontWeight: '800', marginTop: 10 },
  description: { color: theme.colors.muted, fontSize: 15, lineHeight: 22, marginTop: 12 },
  label: { color: theme.colors.text, fontSize: 14, fontWeight: '700', marginTop: 24, marginBottom: 8 },
  input: { backgroundColor: theme.colors.white, borderColor: '#CBD5E1', borderRadius: 16, borderWidth: 1, color: theme.colors.text, paddingHorizontal: 14, paddingVertical: 13 },
  primaryButton: { backgroundColor: theme.colors.primary, borderRadius: theme.radius.button, alignItems: 'center', justifyContent: 'center', minHeight: 50, marginTop: 18 },
  primaryText: { color: theme.colors.white, fontWeight: '800', fontSize: 16 },
  secondaryButton: { borderColor: theme.colors.primary, borderRadius: theme.radius.button, borderWidth: 1, alignItems: 'center', justifyContent: 'center', minHeight: 48, marginTop: 12 },
  secondaryText: { color: theme.colors.primary, fontWeight: '800' },
  message: { backgroundColor: theme.colors.white, borderRadius: 16, color: theme.colors.muted, fontSize: 13, lineHeight: 19, marginTop: 18, padding: 14 }
});
