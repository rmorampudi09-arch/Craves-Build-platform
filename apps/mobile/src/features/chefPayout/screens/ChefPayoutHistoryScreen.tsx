import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {useNavigation, type NavigationProp, type ParamListBase} from '@react-navigation/native';
import {colors, fontWeight, spacing, textDefaults, typography} from '../../../design/tokens';
import type {IconName} from '../../../shared/components/Icon';
import {LoadingIndicator} from '../../../shared/components/LoadingIndicator';
import {UnderlineTabs} from '../../../shared/components/UnderlineTabs';
import {
  ChefActionButton,
  ChefCard,
  ChefScreen,
  ChefSheet,
  ChefTopBar,
  ListGroup,
  ListRow,
  StatusChip,
} from '../../chefShell/components/ui';
import {
  formatDayLabel,
  formatRupees,
  formatTimeOfDay,
  shortOrderNumber,
} from '../../chefShell/domain/chefFormat';
import type {ChefEarningLedgerEntry, ChefPayoutTransaction} from '../api/chefPayoutApi';
import {earningStatusView, groupByMonth, payoutStatusView} from '../domain/chefPayoutPresentation';
import {useChefPayoutData} from '../state/useChefPayoutData';
import {useChefSubScreenBack, useHardwareBack} from '../state/useChefSubScreenBack';

type Tab = 'payouts' | 'earnings';

const STATUS_ICONS: Record<string, {icon: IconName; tone: 'blue' | 'green' | 'red' | 'amber'}> = {
  Paid: {icon: 'check', tone: 'green'},
  "Didn't go through": {icon: 'close', tone: 'red'},
  'Returned by bank': {icon: 'close', tone: 'red'},
  Cancelled: {icon: 'close', tone: 'red'},
  'Craves is checking': {icon: 'info', tone: 'amber'},
};

const timeOf = (iso: string) => Date.parse(iso) || 0;

function Problem({title, onRetry}: {title: string; onRetry: () => void}) {
  return (
    <ChefCard style={styles.card}>
      <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.title}>
        {title}
      </Text>
      <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.muted}>
        Check your connection and try again.
      </Text>
      <ChefActionButton label="Try again" onPress={onRetry} tone="neutral" />
    </ChefCard>
  );
}

function Empty({title, message, action}: {title: string; message: string; action?: {label: string; onPress: () => void}}) {
  return (
    <ChefCard style={styles.card}>
      <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.title}>
        {title}
      </Text>
      <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.muted}>
        {message}
      </Text>
      {action ? <ChefActionButton label={action.label} onPress={action.onPress} tone="neutral" /> : null}
    </ChefCard>
  );
}

function DetailRow({label, value}: {label: string; value: React.ReactNode}) {
  return (
    <View style={styles.detail}>
      <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.muted}>
        {label}
      </Text>
      {typeof value === 'string' ? (
        <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.detailValue}>
          {value}
        </Text>
      ) : (
        value
      )}
    </View>
  );
}

/** Money sent to the bank, and what each order added. Opened from Earnings or from Profile. */
export function ChefPayoutHistoryScreen() {
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const {goBack, fromEarnings} = useChefSubScreenBack();
  useHardwareBack(fromEarnings ? goBack : null);
  const data = useChefPayoutData();
  const [tab, setTab] = React.useState<Tab>('payouts');
  const [opened, setOpened] = React.useState<ChefPayoutTransaction | null>(null);
  const now = new Date();

  const asked = (iso: string) => {
    const date = new Date(iso);
    const day = formatDayLabel(date, now);
    return `${day === 'Today' || day === 'Yesterday' ? day.toLowerCase() : day}, ${formatTimeOfDay(date)}`;
  };
  const retry = () => {
    data.refresh().catch(() => undefined);
  };

  const payouts = React.useMemo(
    () => [...(data.balance?.recentPayouts ?? [])].sort((a, b) => timeOf(b.createdAt) - timeOf(a.createdAt)),
    [data.balance],
  );
  const openedView = opened ? payoutStatusView(opened.status) : null;

  return (
    <>
      <ChefScreen
        header={
          <>
            <ChefTopBar onBack={goBack} showBell={false} title="Payout history" />
            <UnderlineTabs
              accessibilityLabel="Show"
              fill
              onSelect={setTab}
              selected={tab}
              tabs={[
                {key: 'payouts', label: 'Payouts'},
                {key: 'earnings', label: 'Order earnings'},
              ]}
            />
          </>
        }
        onRefresh={retry}
        refreshing={data.isRefreshing}
        withTabBar>
        {tab === 'payouts' ? (
          data.balanceStatus === 'pending' ? (
            <LoadingIndicator label="Loading your payouts" />
          ) : data.balanceStatus === 'error' ? (
            <Problem onRetry={retry} title="We couldn't load your payouts." />
          ) : payouts.length === 0 ? (
            <Empty
              action={{label: 'Go to Earnings', onPress: () => navigation.navigate('Earnings')}}
              message="When you withdraw, the money sent to your bank is listed here."
              title="No payouts yet"
            />
          ) : (
            groupByMonth(payouts, payout => payout.createdAt, now).map(group => (
              <View key={group.title} style={styles.group}>
                <Text accessibilityRole="header" allowFontScaling={textDefaults.allowFontScaling} style={styles.groupTitle}>
                  {group.title}
                </Text>
                <ListGroup>
                  {group.items.map(payout => {
                    const view = payoutStatusView(payout.status);
                    const amount = formatRupees(Number(payout.amount), {paise: true});
                    const subtitle = [`Requested ${asked(payout.createdAt)}`, payout.transferReference ? `Bank ref ${payout.transferReference}` : null]
                      .filter(Boolean)
                      .join('\n');
                    const look = STATUS_ICONS[view.label] ?? {icon: 'wallet' as IconName, tone: 'red' as const};
                    return (
                      <ListRow
                        key={payout.id}
                        accessibilityLabel={`${amount}, ${view.label}, Requested ${asked(payout.createdAt)}`}
                        icon={look.icon}
                        iconTone={look.tone}
                        onPress={() => setOpened(payout)}
                        right={<StatusChip label={view.label} tone={view.tone} />}
                        subtitle={subtitle}
                        title={amount}
                      />
                    );
                  })}
                </ListGroup>
              </View>
            ))
          )
        ) : data.ledgerStatus === 'pending' ? (
          <LoadingIndicator label="Loading your earnings" />
        ) : data.ledgerStatus === 'error' ? (
          <Problem onRetry={retry} title="We couldn't load your earnings." />
        ) : data.ledger.length === 0 ? (
          <Empty
            action={{label: 'Go to Orders', onPress: () => navigation.navigate('Orders')}}
            message="Each delivered order adds its earnings here."
            title="No earnings yet"
          />
        ) : (
          groupByMonth<ChefEarningLedgerEntry>(data.ledger, entry => entry.createdAt, now).map(group => (
            <View key={group.title} style={styles.group}>
              <Text accessibilityRole="header" allowFontScaling={textDefaults.allowFontScaling} style={styles.groupTitle}>
                {group.title}
              </Text>
              <ListGroup>
                {group.items.map(entry => {
                  const view = earningStatusView(entry.status);
                  const amount = formatRupees(Number(entry.netPayable), {paise: true});
                  const subtitle = `${shortOrderNumber(entry.orderId)} · ${formatDayLabel(new Date(entry.createdAt), now)}`;
                  return (
                    <ListRow
                      key={entry.id}
                      accessibilityLabel={`${amount}, ${view.label}, ${subtitle}`}
                      icon="receipt"
                      onPress={() => navigation.navigate('ChefOrderDetail', {orderId: entry.orderId})}
                      right={<StatusChip label={view.label} tone={view.tone} />}
                      subtitle={subtitle}
                      title={amount}
                    />
                  );
                })}
              </ListGroup>
            </View>
          ))
        )}
      </ChefScreen>

      <ChefSheet onClose={() => setOpened(null)} title="Payout details" visible={opened !== null}>
        {opened && openedView ? (
          <>
            <ChefCard style={styles.card}>
              <DetailRow label="Amount" value={formatRupees(Number(opened.amount), {paise: true})} />
              <DetailRow label="Status" value={<StatusChip label={openedView.label} tone={openedView.tone} />} />
              <DetailRow label="Requested" value={asked(opened.createdAt)} />
              {opened.transferReference ? <DetailRow label="Bank reference" value={opened.transferReference} /> : null}
            </ChefCard>
            <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.muted}>
              {openedView.note}
            </Text>
          </>
        ) : null}
      </ChefSheet>
    </>
  );
}

const styles = StyleSheet.create({
  card: {gap: spacing.sm},
  group: {gap: spacing.xs},
  groupTitle: {color: colors.textSecondary, fontSize: typography.small, fontWeight: fontWeight.bold, textTransform: 'uppercase'},
  title: {color: colors.textPrimary, fontSize: typography.body, fontWeight: fontWeight.bold},
  muted: {color: colors.textSecondary, fontSize: typography.small},
  detail: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm},
  detailValue: {flexShrink: 1, color: colors.textPrimary, fontSize: typography.body, fontWeight: fontWeight.semibold, textAlign: 'right'},
});
