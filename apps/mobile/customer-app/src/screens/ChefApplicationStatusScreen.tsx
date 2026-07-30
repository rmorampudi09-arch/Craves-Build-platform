import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../auth/AuthProvider';
import { getChefApplicationSummary, ChefModeApiError } from '../chef/chef-application-api';
import type { ChefApplicationSummary } from '../chef/chef-mode';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { theme } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'ChefApplicationStatus'>;

export function ChefApplicationStatusScreen({ navigation }: Props) {
  const { session, signOut } = useAuth();
  const [summary, setSummary] = useState<ChefApplicationSummary | null>(null);
  const [message, setMessage] = useState('Loading application status…');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    try {
      setSummary(await getChefApplicationSummary(session));
      setMessage('');
    } catch (error) {
      if (error instanceof ChefModeApiError && error.status === 401) { await signOut(); return; }
      setMessage(error instanceof Error ? error.message : 'Chef application status is temporarily unavailable.');
    } finally { setLoading(false); }
  }, [session, signOut]);

  useEffect(() => { void load(); }, [load]);

  return <SafeAreaView style={styles.page}><ScrollView contentContainerStyle={styles.content}><Pressable onPress={() => navigation.goBack()}><Text style={styles.back}>← Chef mode</Text></Pressable><View style={styles.card}><Text style={styles.eyebrow}>CHEF APPLICATION</Text>{loading ? <ActivityIndicator color={theme.colors.primary} style={styles.loader} /> : summary ? <><Text style={styles.title}>{summary.status.replaceAll('_', ' ')}</Text>{summary.submittedAt && <Text style={styles.meta}>Submitted {new Date(summary.submittedAt).toLocaleString('en-IN')}</Text>}{summary.reviewedAt && <Text style={styles.meta}>Reviewed {new Date(summary.reviewedAt).toLocaleString('en-IN')}</Text>}{summary.rejectionReason && <View style={styles.note}><Text style={styles.noteText}>Review note: {summary.rejectionReason}</Text></View>}<Text style={styles.label}>Uploaded proof types</Text><Text style={styles.value}>{summary.documentTypes.length ? summary.documentTypes.map(type => type.replaceAll('_', ' ')).join(', ') : 'No proof type recorded'}</Text><Text style={styles.description}>Application submission and proof upload are currently available through the secure Craves web experience. Mobile editing will be added only after native document selection and privacy handling are reviewed.</Text></> : <Text style={styles.description}>{message}</Text>}<Pressable style={styles.secondary} onPress={() => void load()}><Text style={styles.secondaryText}>Refresh</Text></Pressable></View></ScrollView></SafeAreaView>;
}

const styles = StyleSheet.create({ page: { flex: 1, backgroundColor: theme.colors.background }, content: { padding: 20, paddingBottom: 36 }, back: { color: theme.colors.gold, fontWeight: '800', marginTop: 18, marginBottom: 24 }, card: { backgroundColor: theme.colors.card, borderRadius: theme.radius.card, padding: 24 }, eyebrow: { color: theme.colors.primary, fontWeight: '800', letterSpacing: 1.8, fontSize: 12 }, title: { color: theme.colors.text, fontSize: 30, fontWeight: '900', marginTop: 10 }, loader: { marginTop: 24 }, meta: { color: theme.colors.muted, marginTop: 8 }, note: { backgroundColor: '#FDECEC', borderRadius: 16, padding: 14, marginTop: 18 }, noteText: { color: '#8A1C1C', lineHeight: 20 }, label: { color: theme.colors.muted, fontSize: 12, fontWeight: '800', marginTop: 24 }, value: { color: theme.colors.text, fontSize: 16, fontWeight: '700', marginTop: 4 }, description: { color: theme.colors.muted, fontSize: 15, lineHeight: 22, marginTop: 18 }, secondary: { borderColor: theme.colors.primary, borderRadius: theme.radius.button, borderWidth: 1, minHeight: 48, marginTop: 22, alignItems: 'center', justifyContent: 'center' }, secondaryText: { color: theme.colors.primary, fontWeight: '800' } });
