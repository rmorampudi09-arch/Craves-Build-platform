import React from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../auth/AuthProvider';
import { hasChefRole } from '../chef/chef-mode';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { theme } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'ChefMode'>;

export function ChefModeScreen({ navigation }: Props) {
  const { session } = useAuth();
  const approved = hasChefRole(session?.identity);
  return <SafeAreaView style={styles.page}><ScrollView contentContainerStyle={styles.content}><Pressable onPress={() => navigation.goBack()}><Text style={styles.back}>← Customer mode</Text></Pressable><View style={styles.card}><Text style={styles.eyebrow}>CHEF MODE</Text><Text style={styles.title}>{approved ? 'Manage your kitchen' : 'Chef access is not enabled'}</Text><Text style={styles.description}>{approved ? 'Every kitchen, menu and order request is still authorized by the owning backend service.' : 'Review your current application status. Approval remains with the Craves admin process.'}</Text>{approved ? <><Pressable style={styles.primary} onPress={() => navigation.navigate('ChefKitchen')}><Text style={styles.primaryText}>Kitchen and menu</Text></Pressable><Pressable style={styles.secondary} onPress={() => navigation.navigate('ChefOrders')}><Text style={styles.secondaryText}>Chef orders</Text></Pressable></> : <Pressable style={styles.primary} onPress={() => navigation.navigate('ChefApplicationStatus')}><Text style={styles.primaryText}>Application status</Text></Pressable>}</View></ScrollView></SafeAreaView>;
}

const styles = StyleSheet.create({ page: { flex: 1, backgroundColor: theme.colors.background }, content: { padding: 20, paddingBottom: 36 }, back: { color: theme.colors.gold, fontWeight: '800', marginTop: 18, marginBottom: 24 }, card: { backgroundColor: theme.colors.card, borderRadius: theme.radius.card, padding: 24 }, eyebrow: { color: theme.colors.primary, fontWeight: '800', letterSpacing: 1.8, fontSize: 12 }, title: { color: theme.colors.text, fontSize: 30, fontWeight: '900', marginTop: 10 }, description: { color: theme.colors.muted, fontSize: 15, lineHeight: 22, marginTop: 12 }, primary: { backgroundColor: theme.colors.primary, borderRadius: theme.radius.button, minHeight: 50, marginTop: 24, alignItems: 'center', justifyContent: 'center' }, primaryText: { color: theme.colors.white, fontWeight: '800' }, secondary: { borderColor: theme.colors.primary, borderRadius: theme.radius.button, borderWidth: 1, minHeight: 48, marginTop: 12, alignItems: 'center', justifyContent: 'center' }, secondaryText: { color: theme.colors.primary, fontWeight: '800' } });
