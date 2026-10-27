// How the trip ended (docs/riders/SCREENS.md 14): delivered, or failed / cancelled in the same layout.
import React, {useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {Icon} from '../../../../shared/components';
import {colors, iconSize, radius, spacing} from '../../../../design/tokens';
import type {Trip, TripStep} from '../../api/contract';
import {BottomAction} from '../../components/BottomAction';
import {RefusalNotices} from '../../components/RefusalNotices';
import {Card, Label, Money, RateRow, RiderScreen} from '../../components/ui';
import {formatClock, formatRupees} from '../../domain/format';
import {useRiderHome} from '../../state/riderQueries';
import {useStrings} from '../../strings/StringsProvider';
import {SyncNote, text, TripHeader} from './parts';

export function TripEnd({
  trip,
  step,
  syncing,
  photoDelivery,
  onReport,
  onBack,
}: {
  trip: Trip;
  step: Extract<TripStep, 'DELIVERED' | 'FAILED' | 'CANCELLED'>;
  syncing: boolean;
  photoDelivery: boolean;
  onReport: () => void;
  onBack: () => Promise<unknown> | void;
}) {
  const t = useStrings().strings.trip;
  const home = useRiderHome().data;
  // shortcut: the contract has no delivery time, so this is when the phone showed the end; use the server's once Trip has one.
  const [endedAt] = useState(Date.now);
  const delivered = step === 'DELIVERED';
  const reason = trip.cancelReason ? (t.failReasons as Record<string, string>)[trip.cancelReason] ?? trip.cancelReason : undefined;
  const lines = trip.payLines ?? [];
  // Pay is credited only once the server has the delivery; a photo or a failed delivery waits for ops.
  const note = !delivered ? t.failedNote : photoDelivery ? t.photoHeld : syncing ? null : t.creditedNote;

  return (
    <RiderScreen
      header={<TripHeader trip={trip} />}
      testID="rider-trip-end"
      footer={<BottomAction label={t.backToWaiting} onPress={onBack} testID="rider-back-to-waiting" />}>
      <View style={styles.top}>
        <View style={[styles.circle, delivered ? styles.done : styles.notDone]}>
          <Icon name={delivered ? 'check' : 'close'} size={iconSize.xl} color={delivered ? colors.white : colors.textPrimary} surface={false} />
        </View>
        <Text accessibilityRole="header" style={[text.name, text.center]}>
          {delivered ? t.completeTitle : step === 'FAILED' ? t.failedTitle : t.cancelledTitle}
        </Text>
        <Text style={[text.body, text.secondary, text.center]}>
          {delivered ? t.deliveredTo(trip.orderCode, trip.customer.firstName, formatClock(endedAt)) : reason}
        </Text>
        <SyncNote show={syncing} />
      </View>
      <RefusalNotices tripId={trip.tripId} />
      {step !== 'CANCELLED' || lines.length > 0 ? (
        <Card>
          <Label>{t.youEarned}</Label>
          {/* A cancelled trip shows only the lines the server paid; the app never adds them up. */}
          {step === 'CANCELLED' ? null : <Money paise={trip.payPaise} testID="rider-earned" />}
          {lines.map((line, i) => (
            <RateRow key={line.label} label={line.label} value={formatRupees(line.amountPaise)} divider={i === 0} />
          ))}
          {trip.payLines === undefined ? <Text style={text.small}>{t.linesPending}</Text> : null}
          {note ? <Text style={text.small}>{note}</Text> : null}
        </Card>
      ) : null}
      {home && !syncing ? (
        <Card style={styles.today}>
          <View style={styles.todayLeft}>
            <Label>{t.today}</Label>
            <Text style={[text.name, styles.tabular]}>{formatRupees(home.todayEarningsPaise)}</Text>
          </View>
          <Text style={[text.body, text.secondary]}>{t.todayTrips(home.todayTrips)}</Text>
        </Card>
      ) : null}
      <BottomAction label={t.report} variant="ghost" onPress={onReport} testID="rider-report" />
    </RiderScreen>
  );
}

const styles = StyleSheet.create({
  todayLeft: {flex: 1, gap: spacing.xxs},
  top: {alignItems: 'center', gap: spacing.xs, paddingTop: spacing.xs},
  circle: {width: 64, height: 64, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center'},
  done: {backgroundColor: colors.success},
  notDone: {backgroundColor: colors.muted},
  today: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm},
  tabular: {fontVariant: ['tabular-nums']},
});
