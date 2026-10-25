import React, {useState} from 'react';
import {Alert, StyleSheet, Text, View} from 'react-native';
import {useQueryClient} from '@tanstack/react-query';
import {Icon, SectionSkeleton} from '../../../shared/components';
import {colors, fontWeight, iconSize, spacing, typography} from '../../../design/tokens';
import type {Payout} from '../api/contract';
import {idempotencyKey, riderApi} from '../api/riderApi';
import {Banner} from '../components/Banner';
import {BottomAction} from '../components/BottomAction';
import {RiderHeader} from '../components/RiderHeader';
import {StatusBadge} from '../components/StatusBadge';
import {Card, HeroCard, Money, RiderScreen} from '../components/ui';
import {formatClock, formatDay, formatRupees, istDay} from '../domain/format';
import {useRiderShell} from '../navigation';
import {riderKeys, usePayouts, useProfile, useRiderHome, useRiderMe} from '../state/riderQueries';
import {useStrings} from '../strings/StringsProvider';
import {LoadFailed, ReportProblem} from './TripDetailScreen';

export function PayoutsScreen() {
  const {strings} = useStrings();
  const p = strings.payouts;
  const {riderId} = useRiderShell();
  const queryClient = useQueryClient();
  const features = useRiderMe().data?.features;
  const payouts = usePayouts();
  const account = useProfile().data?.payoutAccountMasked;
  const todayPaise = useRiderHome().data?.todayEarningsPaise;
  const [withdrawal, setWithdrawal] = useState<{done: true} | {error: string} | null>(null);
  const withdrawable = payouts.data?.withdrawablePaise ?? 0;
  const withWeekday = (value: string) => `${strings.earnings.weekdays[new Date(value).getDay()]} ${formatDay(value)}`;

  async function request() {
    try {
      // One withdrawal a day: the key repeats within a day, so a double tap can't pay twice.
      // One withdrawal per Indian day: the key must turn over at IST midnight, not UTC.
      const day = istDay();
      await riderApi.requestWithdrawal(withdrawable, idempotencyKey('withdraw', day, riderId));
      setWithdrawal({done: true});
    } catch (error) {
      setWithdrawal({error: error instanceof Error ? error.message : strings.common.error});
    } finally {
      queryClient.invalidateQueries({queryKey: riderKeys.payouts});
    }
  }

  function withdraw() {
    Alert.alert(p.withdraw(formatRupees(withdrawable)), p.withdrawConfirm, [
      {text: strings.common.cancel, style: 'cancel'},
      {text: p.withdraw(formatRupees(withdrawable)), onPress: request},
    ]);
  }

  const card = (payout: Payout) => (
    <Card key={payout.payoutId}>
      <View style={styles.titleRow}>
        <Text style={[styles.strong, styles.grow]}>{payout.periodLabel}</Text>
        <Text style={styles.amount}>{formatRupees(payout.amountPaise)}</Text>
      </View>
      <View style={styles.statusRow}>
        <StatusBadge status={payout.status} label={p.status[payout.status]} compact />
        {payout.paidAt ? <Text style={styles.meta}>{`${withWeekday(payout.paidAt)}, ${formatClock(payout.paidAt)}`}</Text> : null}
      </View>
      {payout.utr ? <Text style={styles.meta}>{p.utr(payout.utr)}</Text> : null}
      <ReportProblem issue={{payoutId: payout.payoutId}} categories={['PAYOUT_NOT_RECEIVED', 'WRONG_DEDUCTION', 'OTHER']} inCard />
    </Card>
  );

  const list = payouts.data?.payouts ?? [];
  const paid = list.filter(payout => payout.status === 'PAID');
  const onTheWay = list.filter(payout => payout.status !== 'PAID');

  return (
    <RiderScreen header={<RiderHeader title={p.title} back />} testID="rider-payouts">
      {features && !features.payoutsEnabled ? (
        <Banner tone="info" icon={null} text={p.notStarted} testID="rider-payouts-off" />
      ) : payouts.data ? (
        <>
          <HeroCard>
            <Text style={styles.meta}>{p.canWithdraw}</Text>
            <Money paise={withdrawable} testID="rider-withdrawable" />
            <Text style={styles.note}>{p.withdrawNote(todayPaise ? formatRupees(todayPaise) : undefined)}</Text>
            {!features?.withdrawEnabled ? (
              <Banner tone="info" icon={null} inset text={p.withdrawOff} />
            ) : withdrawal && 'done' in withdrawal ? (
              <Banner tone="success" inset text={p.withdrawDone} testID="rider-withdraw-done" />
            ) : withdrawable > 0 ? (
              <>
                {withdrawal ? <Banner tone="warning" inset text={withdrawal.error} /> : null}
                <BottomAction label={p.withdraw(formatRupees(withdrawable))} onPress={withdraw} style={styles.withdraw} testID="rider-withdraw" />
                <Text style={[styles.meta, styles.centred]}>{p.withdrawFree}</Text>
              </>
            ) : null}
          </HeroCard>
          {payouts.data.nextPayoutOn ? (
            <Card style={styles.iconCard}>
              <Icon name="calendar-blank-outline" size={iconSize.lg} color={colors.textPrimary} surface={false} />
              <View style={styles.iconText}>
                <Text style={styles.strong}>{p.next(withWeekday(payouts.data.nextPayoutOn))}</Text>
                <Text style={styles.note}>{p.nextBody(account)}</Text>
              </View>
            </Card>
          ) : null}
          {onTheWay.length ? <Text accessibilityRole="header" style={styles.heading}>{p.onTheWay}</Text> : null}
          {onTheWay.map(card)}
          <Text accessibilityRole="header" style={styles.heading}>
            {p.paid}
          </Text>
          {paid.length ? paid.map(card) : <Text style={styles.note}>{p.empty}</Text>}
          <Text style={[styles.meta, styles.centred]}>{p.noFees}</Text>
        </>
      ) : payouts.isError ? (
        <LoadFailed error={payouts.error} onRetry={payouts.refetch} />
      ) : (
        <SectionSkeleton lines={5} testID="rider-payouts-loading" />
      )}
    </RiderScreen>
  );
}

const styles = StyleSheet.create({
  meta: {fontSize: typography.small, color: colors.textSecondary},
  note: {fontSize: typography.body, color: colors.textSecondary},
  centred: {textAlign: 'center'},
  withdraw: {marginTop: spacing.xs},
  iconCard: {flexDirection: 'row', alignItems: 'flex-start', gap: 10},
  iconText: {flex: 1, gap: spacing.xxs},
  heading: {fontSize: typography.heading, fontWeight: fontWeight.bold, color: colors.textPrimary, marginTop: spacing.xs},
  titleRow: {flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm},
  strong: {fontSize: typography.body, fontWeight: fontWeight.bold, color: colors.textPrimary},
  grow: {flex: 1},
  amount: {fontSize: typography.heading, fontWeight: fontWeight.bold, color: colors.textPrimary, fontVariant: ['tabular-nums']},
  statusRow: {flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm},
});
