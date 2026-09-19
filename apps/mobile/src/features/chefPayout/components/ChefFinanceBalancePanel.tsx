import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  borderWidth,
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
  type ChefFinanceBalance,
  type ChefPayoutTransaction,
} from '../api/chefPayoutApi';

function money(amount: string): string {
  const value = Number(amount);
  return Number.isFinite(value) ? `₹${value.toFixed(2)}` : `₹${amount}`;
}

function dateTime(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

function payoutLabel(row: ChefPayoutTransaction): string {
  if (row.payoutChannel === 'CRAVES_MANUAL') return 'Craves manual';
  return row.mode === 'AUTOMATIC' ? 'Automatic bank payout' : 'Bank payout request';
}

function Metric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{money(value)}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

export function ChefFinanceBalancePanel() {
  const [balance, setBalance] = React.useState<ChefFinanceBalance | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const apply = React.useCallback((next: ChefFinanceBalance) => {
    setBalance(next);
    setError(null);
  }, []);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      apply(await chefPayoutApi.getBalance());
    } catch (caught) {
      const failure = toAppApiError(caught);
      setError(
        failure.code === 'UNKNOWN_ERROR'
          ? 'Craves returned finance data the app could not verify.'
          : failure.message,
      );
    } finally {
      setLoading(false);
    }
  }, [apply]);

  React.useEffect(() => {
    let active = true;
    const controller = new AbortController();
    chefPayoutApi
      .getBalance(controller.signal)
      .then(next => {
        if (active) apply(next);
      })
      .catch(caught => {
        if (!active) return;
        const failure = toAppApiError(caught);
        setError(
          failure.code === 'UNKNOWN_ERROR'
            ? 'Craves returned finance data the app could not verify.'
            : failure.message,
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [apply]);

  if (loading && !balance) {
    return (
      <View accessibilityRole="progressbar" style={styles.state}>
        <ActivityIndicator color={colors.flameRed} />
        <Text style={styles.stateText}>Loading payout balance…</Text>
      </View>
    );
  }

  if (error && !balance) {
    return (
      <View accessibilityRole="alert" style={styles.state}>
        <Text style={styles.error}>{error}</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            load().catch(() => undefined);
          }}
          style={styles.refreshButton}>
          <Text style={styles.refreshText}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  if (!balance) return null;

  return (
    <View style={styles.container}>
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}

      <View accessibilityRole="summary" style={styles.balanceCard}>
        <Text style={styles.balanceEyebrow}>Available to request</Text>
        <Text style={styles.balanceValue}>{money(balance.available)}</Text>
        <Text style={styles.balanceDetail}>
          {balance.onHold
            ? 'Your payout balance is currently on hold.'
            : balance.executionEnabled
              ? balance.payoutMode === 'CRAVES_MANUAL'
                ? 'Eligible payouts are currently processed manually by Craves.'
                : 'Bank payouts follow the active payout settings.'
              : 'New payout requests are currently unavailable.'}
        </Text>
        {balance.manualRequestUsedToday ? (
          <Text style={styles.balanceDetail}>
            Today’s accepted manual request has already been used. Next
            eligibility: {dateTime(balance.nextManualRequestAt)}.
          </Text>
        ) : null}
      </View>

      <View style={styles.metrics}>
        <Metric label="Outstanding earnings" value={balance.outstanding} />
        <Metric
          label="Reserved / already paid"
          value={balance.reservedOrPaid}
        />
      </View>

      <View style={styles.accountingCard}>
        <Text style={styles.sectionTitle}>Accounting summary</Text>
        <Text style={styles.rowText}>
          Recorded orders {balance.accounting.recordedOrders}
        </Text>
        <Text style={styles.rowText}>
          Gross food {money(balance.accounting.grossFood)}
        </Text>
        <Text style={styles.rowText}>
          Total service fee {money(balance.accounting.totalServiceFee)}
        </Text>
        <Text style={styles.rowText}>
          Fee before GST {money(balance.accounting.feeBeforeGst)} · Fee GST{' '}
          {money(balance.accounting.feeGst)}
        </Text>
        <Text style={styles.rowText}>
          Withholding {money(balance.accounting.withholding)}
        </Text>
        <Text style={styles.rowText}>
          Original net earnings {money(balance.accounting.originalNetEarnings)}
        </Text>
        <Text style={styles.rowText}>
          Recorded payments {money(balance.accounting.recordedPayments)}
        </Text>
        <Text style={styles.rowText}>
          Other ledger movements {money(balance.accounting.otherLedgerMovements)}
        </Text>
        <Text style={styles.accountingNotice}>
          Outstanding liability is not the same as available-to-request balance.
        </Text>
      </View>

      <View style={styles.historyCard}>
        <Text style={styles.sectionTitle}>Recent payout requests</Text>
        {balance.recentPayouts.length === 0 ? (
          <Text style={styles.stateText}>
            No payout requests are recorded in the new finance ledger yet.
          </Text>
        ) : (
          balance.recentPayouts.map(row => (
            <View key={row.id} style={styles.payoutRow}>
              <View style={styles.rowHeader}>
                <View style={styles.rowCopy}>
                  <Text style={styles.payoutAmount}>{money(row.amount)}</Text>
                  <Text style={styles.rowText}>{payoutLabel(row)}</Text>
                </View>
                <View style={styles.statusPill}>
                  <Text style={styles.statusText}>
                    {row.status.replace(/_/g, ' ')}
                  </Text>
                </View>
              </View>
              <Text style={styles.rowText}>{dateTime(row.createdAt)}</Text>
              <Text style={styles.rowText}>
                Bank reference: {row.transferReference ?? 'Not yet confirmed'}
              </Text>
              {row.status !== 'PAID' ? (
                <Text style={styles.statusNotice}>
                  Bank payment is confirmed only when this request is marked
                  PAID.
                </Text>
              ) : null}
            </View>
          ))
        )}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityState={{busy: loading}}
        disabled={loading}
        onPress={() => {
          load().catch(() => undefined);
        }}
        style={({pressed}) => [
          styles.refreshButton,
          pressed && !loading && styles.pressed,
          loading && styles.disabled,
        ]}>
        <Text style={styles.refreshText}>
          {loading ? 'Refreshing…' : 'Refresh payout data'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {gap: spacing.md},
  state: {
    minHeight: 140,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  stateText: {
    color: colors.textSecondary,
    fontSize: typography.small,
    textAlign: 'center',
  },
  error: {
    color: colors.error,
    fontSize: typography.small,
    textAlign: 'center',
  },
  balanceCard: {
    padding: spacing.lg,
    borderRadius: radius.xl,
    backgroundColor: colors.espressoBrown,
  },
  balanceEyebrow: {
    color: colors.creamDeep,
    fontSize: typography.small,
    fontWeight: fontWeight.semibold,
  },
  balanceValue: {
    marginTop: spacing.xs,
    color: colors.white,
    fontSize: typography.title,
    fontWeight: fontWeight.extrabold,
  },
  balanceDetail: {
    marginTop: spacing.sm,
    color: colors.creamDeep,
    fontSize: typography.small,
  },
  metrics: {flexDirection: 'row', gap: spacing.sm},
  metric: {
    flex: 1,
    minWidth: 0,
    padding: spacing.md,
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
  },
  metricValue: {
    color: colors.espressoBrown,
    fontSize: typography.heading,
    fontWeight: fontWeight.extrabold,
  },
  metricLabel: {
    marginTop: spacing.xxs,
    color: colors.textSecondary,
    fontSize: typography.tiny,
  },
  accountingCard: {
    gap: spacing.xs,
    padding: spacing.md,
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
  },
  historyCard: {
    gap: spacing.sm,
    padding: spacing.md,
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: typography.heading,
    fontWeight: fontWeight.bold,
  },
  rowText: {color: colors.textSecondary, fontSize: typography.tiny},
  accountingNotice: {
    marginTop: spacing.xs,
    color: colors.textSecondary,
    fontSize: typography.tiny,
    fontWeight: fontWeight.semibold,
  },
  payoutRow: {
    gap: spacing.xxs,
    paddingVertical: spacing.sm,
    borderTopWidth: borderWidth.standard,
    borderTopColor: colors.border,
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  rowCopy: {flex: 1, minWidth: 0},
  payoutAmount: {
    color: colors.espressoBrown,
    fontSize: typography.body,
    fontWeight: fontWeight.bold,
  },
  statusPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
  },
  statusText: {
    color: colors.espressoBrown,
    fontSize: typography.tiny,
    fontWeight: fontWeight.bold,
  },
  statusNotice: {
    color: colors.textSecondary,
    fontSize: typography.tiny,
    fontWeight: fontWeight.semibold,
  },
  refreshButton: {
    minHeight: touchTarget.minimum,
    alignSelf: 'flex-start',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  refreshText: {
    color: colors.flameRedAccessible,
    fontSize: typography.small,
    fontWeight: fontWeight.bold,
  },
  pressed: {opacity: 0.72},
  disabled: {opacity: 0.48},
});
