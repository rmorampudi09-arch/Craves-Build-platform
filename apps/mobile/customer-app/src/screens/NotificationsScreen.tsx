import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../auth/AuthProvider';
import { markNotificationRead, listNotifications, NotificationsApiError } from '../notifications/notifications-api';
import { unreadCount, type AppNotification } from '../notifications/contracts';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { theme } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Notifications'>;

export function NotificationsScreen({ navigation }: Props) {
  const { session, signOut } = useAuth();
  const [notices, setNotices] = useState<AppNotification[]>([]);
  const [message, setMessage] = useState('Loading notifications…');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!session) return;
    try { const result = await listNotifications(session); setNotices(result); setMessage(result.length ? '' : 'No notifications yet.'); }
    catch (error) { if (error instanceof NotificationsApiError && error.code === 'SESSION_EXPIRED') await signOut(); setMessage(error instanceof Error ? error.message : 'Notifications are unavailable.'); }
  }, [session, signOut]);
  useEffect(() => { void load(); }, [load]);
  async function refresh() { setRefreshing(true); await load(); setRefreshing(false); }

  async function openNotice(notice: AppNotification) {
    if (!session) return;
    if (!notice.readAt) {
      try { await markNotificationRead(session, notice.id); setNotices(current => current.map(item => item.id === notice.id ? { ...item, readAt: new Date().toISOString() } : item)); }
      catch (error) { if (error instanceof NotificationsApiError && error.code === 'SESSION_EXPIRED') await signOut(); }
    }
    if (notice.targetId && notice.targetType.toUpperCase().includes('DELIVERY')) navigation.navigate('DeliveryTracking', { orderId: notice.targetId });
    else if (notice.targetId && notice.targetType.toUpperCase().includes('ORDER')) navigation.navigate('OrderDetails', { orderId: notice.targetId });
  }

  return <SafeAreaView style={styles.page}><View style={styles.header}><Pressable onPress={() => navigation.goBack()}><Text style={styles.back}>‹ Home</Text></Pressable><Text style={styles.title}>Notifications</Text><Text style={styles.subtitle}>{unreadCount(notices)} unread</Text></View>{message ? <Text style={styles.message}>{message}</Text> : null}<FlatList data={notices} keyExtractor={item => item.id} refreshing={refreshing} onRefresh={() => void refresh()} contentContainerStyle={styles.list} renderItem={({ item }) => <Pressable onPress={() => void openNotice(item)} style={[styles.card, item.readAt ? styles.read : styles.unread]}><View style={styles.row}><Text style={styles.noticeType}>{item.noticeType.replaceAll('_', ' ')}</Text>{!item.readAt && <View style={styles.dot} />}</View><Text style={styles.noticeTitle}>{item.title}</Text><Text style={styles.body}>{item.body}</Text><Text style={styles.time}>{new Date(item.createdAt).toLocaleString('en-IN')}</Text></Pressable>} /></SafeAreaView>;
}

const styles = StyleSheet.create({ page: { flex: 1, backgroundColor: theme.colors.background }, header: { padding: 20, paddingBottom: 10 }, back: { color: theme.colors.gold, fontSize: 16, fontWeight: '800' }, title: { color: theme.colors.white, fontSize: 34, fontWeight: '900', marginTop: 18 }, subtitle: { color: '#CBD5E1', marginTop: 6 }, message: { color: '#CBD5E1', textAlign: 'center', padding: 20 }, list: { padding: 20, paddingTop: 10, gap: 14 }, card: { borderRadius: 24, padding: 20 }, unread: { backgroundColor: theme.colors.card }, read: { backgroundColor: '#E2E8F0' }, row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, noticeType: { color: theme.colors.primary, fontSize: 11, fontWeight: '900', letterSpacing: 1 }, dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: theme.colors.primary }, noticeTitle: { color: theme.colors.text, fontSize: 19, fontWeight: '900', marginTop: 10 }, body: { color: theme.colors.muted, lineHeight: 21, marginTop: 8 }, time: { color: theme.colors.muted, fontSize: 12, marginTop: 12 } });
