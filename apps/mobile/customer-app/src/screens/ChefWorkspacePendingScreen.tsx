import React from 'react';
import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { theme } from '../theme';

type RouteName = 'ChefKitchen' | 'ChefOrders';
type Props = NativeStackScreenProps<RootStackParamList, RouteName>;

export function ChefWorkspacePendingScreen({ navigation, route }: Props) {
  const kitchen = route.name === 'ChefKitchen';
  return <SafeAreaView style={styles.page}><View style={styles.card}><Text style={styles.eyebrow}>CHEF MODE</Text><Text style={styles.title}>{kitchen ? 'Kitchen and menu' : 'Chef orders'}</Text><Text style={styles.description}>{kitchen ? 'The secure chef shell is active. Kitchen and menu management is delivered by the next stacked module.' : 'The secure chef shell is active. Chef order workflow is delivered by the final stacked module.'}</Text><Pressable style={styles.secondary} onPress={() => navigation.goBack()}><Text style={styles.secondaryText}>Back to chef mode</Text></Pressable></View></SafeAreaView>;
}

const styles = StyleSheet.create({ page: { flex: 1, backgroundColor: theme.colors.background, justifyContent: 'center', padding: 20 }, card: { backgroundColor: theme.colors.card, borderRadius: theme.radius.card, padding: 24 }, eyebrow: { color: theme.colors.primary, fontWeight: '800', letterSpacing: 1.8, fontSize: 12 }, title: { color: theme.colors.text, fontSize: 30, fontWeight: '900', marginTop: 10 }, description: { color: theme.colors.muted, fontSize: 15, lineHeight: 22, marginTop: 14 }, secondary: { borderColor: theme.colors.primary, borderRadius: theme.radius.button, borderWidth: 1, minHeight: 48, marginTop: 24, alignItems: 'center', justifyContent: 'center' }, secondaryText: { color: theme.colors.primary, fontWeight: '800' } });
