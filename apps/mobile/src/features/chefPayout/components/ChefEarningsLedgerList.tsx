import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  colors,
  fontWeight,
  radius,
  spacing,
  touchTarget,
  typography,
} from '../../../design/tokens';
import {toAppApiError} from '../../../core/http/apiError';
import {
  chefPayoutApi,
  type ChefEarningLedgerEntry,
  type ChefEarningStatus,
} from '../api/chefPayoutApi';

type LedgerView = 'ALL' | ChefEarningStatus;

const LEDGER_FILTERS: ReadonlyArray<{id: LedgerView; label: string}> = [
  {id: 'ALL', label: 'All'},
  {id: 'DRAFT', label: 'Draft'},
  {id: 'APPROVED', label: 'Approved'},
  {id: 'SETTLEMENT_PENDING', label: 'Settlement pending'},
  {id: 'SETTLED', label: 'Settled'},
  {id: 'REVERSED', label: 'Reversed'},
];

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
  const [entries, setEntries] = React.useState<ChefEarningLedgerEntry[] | null>(
    null,
  );
  const [view, setView] = React.useState<LedgerView>('ALL');
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = React.useState<Date | null>(null);

  const acceptEntries = React.useCallback((next: ChefEarningLedgerEntry[]) => {
    setEntries(
      [...next].sort(
        (left, right) =>
          new Date(right.createdAt).getTime() -
          new Date(left.createdAt).getTime(),
      ),
    );
    setLastUpdatedAt(new Date());
    setError(null);
  }, []);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      acceptEntries(await chefPayoutApi.listEarnings(200));
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
  }, [acceptEntries]);

  React.useEffect(() => {
    let active = true;
    const controller = new AbortController();
    (async () => {
      setLoading(true);
      try {
        const next = await chefPayoutApi.listEarnings(200, controller.signal);
        if (active) acceptEntries(next);
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
  }, [acceptEntries]);

  const visibleEntries = React.useMemo(
    () =>
      view === 'ALL'
        ? entries ?? []
        : (entries ?? []).filter(entry => entry.status === view),
    [entries, view],
  );

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
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            load().catch(() => undefined);
          }}
          style={styles.retry}>
          <Text style={styles.retryText}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  if (!entries?.length) {
    return (
      <View style={styles.state}>
        <Text style={styles.stateText}>
          No earning ledger entries are available yet.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.list}>
      <Text style={styles.boundaryText}>
        These are recorded earning entries, not your withdrawable balance.
      </Text>

      <View accessibilityRole="tablist" style={styles.filters}>
        {LEDGER_FILTERS.map(filter => {
          const selected = view === filter.id;
          return (
            <Pressable
              key={filter.id}
              accessibilityRole="tab"
              accessibilityState={{selected}}
              onPress={() => setView(filter.id)}
              style={({pressed}) => [
                styles.filter,
                selected && styles.filterSelected,
                pressed && styles.pressed,
              ]}>
              <Text
                style={[
                  styles.filterText,
                  selected && styles.filterTextSelected,
                ]}>
                {filter.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}

      {visibleEntries.length === 0 ? (
        <View style={styles.state}>
          <Text style={styles.stateText}>
            No ledger entries match this status.
          </Text>
        </View>
      ) : (
        visibleEntries.map(entry => (
          <View key={entry.id} style={styles.row}>
            <View style={styles.rowHeader}>
              <View style={styles.copy}>
                <Text style={styles.amount}>
                  {money(entry.currency, entry.netPayable)}
                </Text>
                <Text style={styles.meta}>
                  {entry.orderSource === 'SUBSCRIPTION'
                    ? 'Subscription order'
                    : 'On-demand order'}
                </Text>
              </View>
              <View style={styles.statusPill}>
                <Text style={styles.statusText}>
                  {entry.status.replace(/_/g, ' ')}
                </Text>
              </View>
            </View>
            <Text style={styles.detail}>
              Gross {money(entry.currency, entry.grossAmount)} · Total service
              fee {money(entry.currency, entry.commissionAmount)}
            </Text>
            <Text style={styles.detail}>
              Tax withheld {money(entry.currency, entry.taxWithheldAmount)} ·
              Adjustment {money(entry.currency, entry.adjustmentAmount)}
            </Text>
            <Text style={styles.detail}>
              Recorded {dateTime(entry.updatedAt)}
            </Text>
            <Text numberOfLines={2} style={styles.reason}>
              {entry.reason}
            </Text>
          </View>
        ))
      )}

      {lastUpdatedAt ? (
        <Text style={styles.lastUpdated}>
          Last refreshed {lastUpdatedAt.toLocaleTimeString()}
        </Text>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityState={{busy: loading}}
        disabled={loading}
        onPress={() => {
          load().catch(() => undefined);
        }}
        style={({pressed}) => [
          styles.retry,
          pressed && !loading && styles.pressed,
          loading && styles.disabled,
        ]}>
        <Text style={styles.retryText}>
          {loading ? 'Refreshing…' : 'Refresh earnings'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  list: {gap: spacing.sm},
  state: {
    paddingVertical: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
  },
  stateText: {
    color: colors.textSecondary,
    fontSize: typography.small,
    textAlign: 'center',
  },
  boundaryText: {
    color: colors.textSecondary,
    fontSize: typography.tiny,
  },
  filters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  filter: {
    minHeight: touchTarget.minimum,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
  },
  filterSelected: {backgroundColor: colors.flameRed},
  filterText: {
    color: colors.textSecondary,
    fontSize: typography.tiny,
    fontWeight: fontWeight.semibold,
  },
  filterTextSelected: {color: colors.white},
  error: {
    color: colors.error,
    fontSize: typography.small,
    textAlign: 'center',
  },
  retry: {
    minHeight: touchTarget.minimum,
    justifyContent: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
  },
  retryText: {
    color: colors.flameRedAccessible,
    fontSize: typography.small,
    fontWeight: fontWeight.bold,
  },
  row: {
    padding: spacing.md,
    gap: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
  },
  rowHeader: {
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  copy: {flex: 1, minWidth: 0},
  amount: {
    color: colors.espressoBrown,
    fontSize: typography.heading,
    fontWeight: fontWeight.extrabold,
  },
  meta: {color: colors.textSecondary, fontSize: typography.tiny},
  statusPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radius.pill,
    backgroundColor: colors.white,
  },
  statusText: {
    color: colors.espressoBrown,
    fontSize: typography.tiny,
    fontWeight: fontWeight.bold,
  },
  detail: {color: colors.textSecondary, fontSize: typography.tiny},
  reason: {color: colors.textPrimary, fontSize: typography.small},
  lastUpdated: {color: colors.textSecondary, fontSize: typography.tiny},
  pressed: {opacity: 0.72},
  disabled: {opacity: 0.48},
});
