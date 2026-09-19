import React from 'react';
import {ActivityIndicator, Pressable, StyleSheet, Text, View} from 'react-native';
import {colors, fontWeight, radius, spacing, typography} from '../../../design/tokens';
import {toAppApiError} from '../../../core/http/apiError';
import {chefPayoutApi, type ChefEarningLedgerEntry} from '../api/chefPayoutApi';

function money(currency: string, amount: string): string {
  const value = Number(amount);
  if (!Number.isFinite(value)) return `${currency} ${amount}`;
  return `${currency === 'INR' ? '₹' : currency + ' '}${value.toFixed(2)}`;
}

function dateTime(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

export function ChefEarningsLedgerList() {
  const [entries, setEntries] = React.useState<ChefEarningLedgerEntry[] | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    try {
      setEntries(await chefPayoutApi.listEarnings(100, controller.signal));
    } catch (caught) {
      const failure = toAppApiError(caught);
      setError(
        failure.code === 'UNKNOWN_ERROR'
          ? 'Craves returned an earnings response the app could not verify.'
          : failure.message,
      );
    } finally {
      setLoading(false);
    }
    return () => controller.abort();
  }, []);

  React.useEffect(() => {
    let active = true;
    const controller = new AbortController();
    (async () => {
      setLoading(true);
      try {
        const next = await chefPayoutApi.listEarnings(100, controller.signal);
        if (active) {
          setEntries(next);
          setError(null);
        }
      } catch (caught) {
        if (active) {
          const failure = toAppApiError(caught);
          setError(
            failure.code === 'UNKNOWN_ERROR'
              ? 'Craves returned an earnings response the app could not verify.'
              : failure.message,
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  if (loading && !entries) {
    return (
      <View accessibilityRole="progressbar" style={styles.state}>
        <ActivityIndicator color={colors.flameRed} />
        <Text style={styles.stateText}>Loading your earnings ledger…</Text>
      </View>
    );
  }

  if (error && !entries) {
    return (
      <View accessibilityRole="alert" style={styles.state}>
        <Text style={styles.error}>{error}</Text>
        <Pressable accessibilityRole="button" onPress={() => { load().catch(() => undefined); }} style={styles.retry}>
          <Text style={styles.retryText}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  if (!entries?.length) {
    return (
      <View style={styles.state}>
        <Text style={styles.stateText}>No earning ledger entries are available yet.</Text>
      </View>
    );
  }

  return (
    <View style={styles.list}>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      {entries.map(entry => (
        <View key={entry.id} style={styles.row}>
          <View style={styles.rowHeader}>
            <View style={styles.copy}>
              <Text style={styles.amount}>{money(entry.currency, entry.netPayable)}</Text>
              <Text style={styles.meta}>{entry.orderSource === 'SUBSCRIPTION' ? 'Subscription order' : 'On-demand order'}</Text>
            </View>
            <View style={styles.statusPill}>
              <Text style={styles.statusText}>{entry.status.replace(/_/g, ' ')}</Text>
            </View>
          </View>
          <Text style={styles.detail}>Gross {money(entry.currency, entry.grossAmount)} · Craves commission {money(entry.currency, entry.commissionAmount)}</Text>
          <Text style={styles.detail}>Tax withheld {money(entry.currency, entry.taxWithheldAmount)} · Adjustment {money(entry.currency, entry.adjustmentAmount)}</Text>
          <Text style={styles.detail}>Recorded {dateTime(entry.updatedAt)}</Text>
          <Text numberOfLines={2} style={styles.reason}>{entry.reason}</Text>
        </View>
      ))}
      <Pressable accessibilityRole="button" onPress={() => void load()} style={styles.retry}>
        <Text style={styles.retryText}>{loading ? 'Refreshing…' : 'Refresh earnings'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  list: {gap: spacing.sm},
  state: {paddingVertical: spacing.lg, alignItems: 'center', gap: spacing.sm},
  stateText: {color: colors.textSecondary, fontSize: typography.small, textAlign: 'center'},
  error: {color: colors.error, fontSize: typography.small, textAlign: 'center'},
  retry: {minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.md},
  retryText: {color: colors.flameRedAccessible, fontSize: typography.small, fontWeight: fontWeight.bold},
  row: {padding: spacing.md, gap: spacing.xs, borderRadius: radius.md, backgroundColor: colors.surfaceMuted},
  rowHeader: {flexDirection: 'row', gap: spacing.sm, justifyContent: 'space-between', alignItems: 'flex-start'},
  copy: {flex: 1, minWidth: 0},
  amount: {color: colors.espressoBrown, fontSize: typography.heading, fontWeight: fontWeight.extrabold},
  meta: {color: colors.textSecondary, fontSize: typography.tiny},
  statusPill: {paddingHorizontal: spacing.sm, paddingVertical: spacing.xxs, borderRadius: radius.pill, backgroundColor: colors.white},
  statusText: {color: colors.espressoBrown, fontSize: typography.tiny, fontWeight: fontWeight.bold},
  detail: {color: colors.textSecondary, fontSize: typography.tiny},
  reason: {color: colors.textPrimary, fontSize: typography.small},
});
