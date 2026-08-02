import React from 'react';
import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { theme } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'SubscriptionEnrollment'>;

export function SubscriptionEnrollmentPendingScreen({ navigation }: Props) {
  return <SafeAreaView style={styles.page}><View style={styles.card}><Text style={styles.eyebrow}>MEAL SUBSCRIPTIONS</Text><Text style={styles.title}>Plan selected</Text><Text style={styles.description}>Authenticated enrollment is delivered in the next stacked module. No subscription has been created.</Text><Pressable style={styles.button} onPress={() => navigation.goBack()}><Text style={styles.buttonText}>Back to plans</Text></Pressable></View></SafeAreaView>;
}

const styles = StyleSheet.create({ page: { flex: 1, backgroundColor: theme.colors.background, padding: 20, justifyContent: 'center' }, card: { backgroundColor: theme.colors.card, borderRadius: theme.radius.card, padding: 24 }, eyebrow: { color: theme.colors.primary, fontWeight: '900', letterSpacing: 1.6, fontSize: 12 }, title: { color: theme.colors.text, fontWeight: '900', fontSize: 30, marginTop: 10 }, description: { color: theme.colors.muted, lineHeight: 22, marginTop: 12 }, button: { borderColor: theme.colors.primary, borderWidth: 1, borderRadius: theme.radius.button, minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: 22 }, buttonText: { color: theme.colors.primary, fontWeight: '900' } });
