import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppState,
  type AppStateStatus,
  Linking,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../auth/AuthProvider';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { DeliveryApiError, getDeliveryProjection } from '../delivery/delivery-api';
import {
  deliveryProgress,
  formatDeliveryStatus,
  isTerminalDeliveryStatus,
  type DeliveryProjection
} from '../delivery/contracts';
import { theme } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'DeliveryTracking'>;
const dateTime = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

export function DeliveryTrackingScreen({ route, navigation }: Props) {
  const { orderId } = route.params;
  const { session, signOut } = useAuth();
  const [projection, setProjection] = useState<DeliveryProjection | null>(null);
  const [message, setMessage] = useState('Loading delivery status…');
  const [refreshing, setRefreshing] = useState(false);
  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState);
  const requestId = useRef(0);

  const load = useCallback(async (manual = false) => {
    if (!session) return;
    const id = ++requestId.current;
    if (manual) setRefreshing(true);
    try {
      const next = await getDeliveryProjection(session, orderId);
      if (id !== requestId.current) return;
      setProjection(next);
      setMessage(isTerminalDeliveryStatus(next.status)
        ? 'This delivery has reached a final state.'
        : 'Status refreshes automatically while the app is active.');
    } catch (error) {
      if (id !== requestId.current) return;
      if (error instanceof DeliveryApiError && error.status === 401) {
        await signOut();
        return;
      }
      setMessage(error instanceof Error ? error.message : 'Delivery status is unavailable.');
    } finally {
      if (id === requestId.current) setRefreshing(false);
    }
  }, [orderId, session, signOut]);

  useEffect(() => {
    void load();
    return () => { requestId.current += 1; };
  }, [load]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', setAppState);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (appState !== 'active' || isTerminalDeliveryStatus(projection?.status ?? null)) return;
    const interval = setInterval(() => void load(), 30_000);
    return () => clearInterval(interval);
  }, [appState, projection?.status, load]);

  async function openTrackingLink() {
    if (!projection?.trackingUrl) return;
    const supported = await Linking.canOpenURL(projection.trackingUrl);
    if (supported) await Linking.openURL(projection.trackingUrl);
    else setMessage('The provider tracking link could not be opened safely.');
  }

  const progress = deliveryProgress(projection?.status ?? null);

  return (
    <SafeAreaView style={styles.page}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={theme.colors.gold} colors={[theme.colors.primary]} />}
      >
        <View style={styles.topRow}>
          <Pressable onPress={() => navigation.goBack()}><Text style={styles.back}>← Back</Text></Pressable>
          <Text style={styles.orderId} numberOfLines={1}>{orderId}</Text>
        </View>

        <View style={styles.heroCard}>
          <Text style={styles.eyebrow}>DELIVERY STATUS</Text>
          <Text style={styles.title}>{formatDeliveryStatus(projection?.status ?? null)}</Text>
          <Text style={styles.description}>{projection?.observedAt ? `Updated ${dateTime.format(new Date(projection.observedAt))}` : 'Delivery execution has not started yet.'}</Text>
          <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${progress}%` }]} /></View>
          <Text style={styles.progressText}>{progress}% complete</Text>
          {projection?.trackingUrl && (
            <Pressable style={styles.primaryButton} onPress={() => void openTrackingLink()}>
              <Text style={styles.primaryText}>Open live tracking</Text>
            </Pressable>
          )}
          <Text accessibilityLiveRegion="polite" style={styles.message}>{message}</Text>
        </View>

        <View style={styles.timelineCard}>
          <Text style={styles.sectionTitle}>Timeline</Text>
          {!projection || projection.history.length === 0 ? (
            <Text style={styles.empty}>Delivery updates will appear here after assignment begins.</Text>
          ) : projection.history.map((item, index) => (
            <View key={`${item.recordedAt}-${index}`} style={styles.timelineRow}>
              <View style={styles.timelineMarker}><View style={styles.dot} />{index < projection.history.length - 1 && <View style={styles.line} />}</View>
              <View style={styles.timelineBody}>
                <Text style={styles.timelineTitle}>{formatDeliveryStatus(item.newStatus)}</Text>
                <Text style={styles.timelineTime}>{dateTime.format(new Date(item.observedAt))}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.privacyCard}>
          <Text style={styles.privacyTitle}>Provider-neutral tracking</Text>
          <Text style={styles.privacyText}>Craves shows only customer-safe status and timeline information. Provider credentials, raw callbacks and internal retry data are never displayed.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: 20, paddingBottom: 40 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 20 },
  back: { color: theme.colors.gold, fontSize: 15, fontWeight: '800' },
  orderId: { color: '#94A3B8', flex: 1, fontSize: 11, textAlign: 'right' },
  heroCard: { backgroundColor: theme.colors.card, borderRadius: theme.radius.card, padding: 24 },
  eyebrow: { color: theme.colors.primary, fontSize: 12, fontWeight: '800', letterSpacing: 1.8 },
  title: { color: theme.colors.text, fontSize: 30, fontWeight: '900', marginTop: 10 },
  description: { color: theme.colors.muted, fontSize: 14, lineHeight: 21, marginTop: 8 },
  progressTrack: { backgroundColor: '#E2E8F0', borderRadius: 999, height: 10, marginTop: 24, overflow: 'hidden' },
  progressFill: { backgroundColor: theme.colors.gold, borderRadius: 999, height: 10 },
  progressText: { color: theme.colors.muted, fontSize: 12, fontWeight: '700', marginTop: 8 },
  primaryButton: { backgroundColor: theme.colors.primary, borderRadius: theme.radius.button, alignItems: 'center', justifyContent: 'center', minHeight: 50, marginTop: 20 },
  primaryText: { color: theme.colors.white, fontSize: 16, fontWeight: '800' },
  message: { backgroundColor: theme.colors.white, borderRadius: 16, color: theme.colors.muted, fontSize: 13, lineHeight: 19, marginTop: 18, padding: 14 },
  timelineCard: { backgroundColor: theme.colors.card, borderRadius: theme.radius.card, marginTop: 18, padding: 24 },
  sectionTitle: { color: theme.colors.text, fontSize: 22, fontWeight: '900', marginBottom: 18 },
  empty: { color: theme.colors.muted, fontSize: 14, lineHeight: 21 },
  timelineRow: { flexDirection: 'row', minHeight: 68 },
  timelineMarker: { alignItems: 'center', width: 24 },
  dot: { backgroundColor: theme.colors.primary, borderRadius: 999, height: 12, width: 12 },
  line: { backgroundColor: '#CBD5E1', flex: 1, marginVertical: 4, width: 2 },
  timelineBody: { flex: 1, paddingLeft: 12, paddingBottom: 18 },
  timelineTitle: { color: theme.colors.text, fontSize: 15, fontWeight: '800' },
  timelineTime: { color: theme.colors.muted, fontSize: 12, marginTop: 4 },
  privacyCard: { borderColor: '#334155', borderRadius: theme.radius.card, borderWidth: 1, marginTop: 18, padding: 20 },
  privacyTitle: { color: theme.colors.white, fontSize: 16, fontWeight: '800' },
  privacyText: { color: '#94A3B8', fontSize: 13, lineHeight: 20, marginTop: 8 }
});
