import React from 'react';
import {Alert} from 'react-native';
import {useQueryClient} from '@tanstack/react-query';
import {SectionSkeleton, TerminalState} from '../../../shared/components';
import {idempotencyKey, riderApi} from '../api/riderApi';
import {BottomAction} from '../components/BottomAction';
import {RiderHeader} from '../components/RiderHeader';
import {StatusBadge} from '../components/StatusBadge';
import {Body, Card, Label, RateRow, RiderScreen, Value} from '../components/ui';
import {formatDay, formatRupees} from '../domain/format';
import {useRiderShell} from '../navigation';
import {riderKeys, usePayouts, useRiderMe} from '../state/riderQueries';
import {useStrings} from '../strings/StringsProvider';
import {ReportProblem} from './TripDetailScreen';

export function PayoutsScreen() {
  const {strings} = useStrings();
  const p = strings.payouts;
  const {riderId} = useRiderShell();
  const queryClient = useQueryClient();
  const me = useRiderMe();
  const payouts = usePayouts();
  const features = me.data?.features;
  const withdrawable = payouts.data?.withdrawablePaise ?? 0;

  function withdraw() {
    Alert.alert(p.withdraw(formatRupees(withdrawable)), p.withdrawConfirm, [
      {text: strings.common.cancel, style: 'cancel'},
      {
        text: p.withdraw(formatRupees(withdrawable)),
        onPress: async () => {
          try {
            // One withdrawal a day: the key repeats within a day, so a double tap can't pay twice.
            const day = new Date().toISOString().slice(0, 10);
            await riderApi.requestWithdrawal(withdrawable, idempotencyKey('withdraw', day, riderId));
            Alert.alert(p.withdrawDone);
          } catch (error) {
            Alert.alert(error instanceof Error ? error.message : strings.common.error);
          } finally {
            queryClient.invalidateQueries({queryKey: riderKeys.payouts});
          }
        },
      },
    ]);
  }

  return (
    <RiderScreen
      header={<RiderHeader title={p.title} back />}
      testID="rider-payouts"
      footer={
        features?.withdrawEnabled && withdrawable > 0 ? (
          <BottomAction label={p.withdraw(formatRupees(withdrawable))} onPress={withdraw} testID="rider-withdraw" />
        ) : null
      }>
      {features && !features.payoutsEnabled ? (
        <Body>{p.notStarted}</Body>
      ) : payouts.data ? (
        <>
          {payouts.data.nextPayoutOn ? <Value>{p.next(formatDay(payouts.data.nextPayoutOn))}</Value> : null}
          {payouts.data.payouts.length === 0 ? <Body>{p.empty}</Body> : null}
          {payouts.data.payouts.map(payout => (
            <Card key={payout.payoutId}>
              <RateRow label={payout.periodLabel} value={formatRupees(payout.amountPaise)} />
              <StatusBadge status={payout.status} label={p.status[payout.status]} compact />
              {payout.utr ? <Label>{`${p.utr}: ${payout.utr}`}</Label> : null}
              {payout.paidAt ? <Label>{formatDay(payout.paidAt)}</Label> : null}
              <ReportProblem issue={{payoutId: payout.payoutId}} categories={['PAYOUT_NOT_RECEIVED', 'WRONG_DEDUCTION', 'OTHER']} />
            </Card>
          ))}
        </>
      ) : payouts.isError ? (
        <TerminalState title={strings.common.error} actionLabel={strings.common.retry} onAction={() => payouts.refetch()} />
      ) : (
        <SectionSkeleton />
      )}
    </RiderScreen>
  );
}
