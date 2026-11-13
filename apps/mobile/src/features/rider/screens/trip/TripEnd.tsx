// How the trip ended (docs/riders/SCREENS.md 14): delivered, or failed / cancelled in the same layout.
import React, {useState} from 'react';
import {Text, View} from 'react-native';
import {font, radius, spacing, themedStyles, typography} from '../../theme';
import type {Trip, TripStep} from '../../api/contract';
import {BottomAction} from '../../components/BottomAction';
import {RefusalNotices} from '../../components/RefusalNotices';
import {Card, Label, RateRow, RiderScreen} from '../../components/ui';
import {formatClock, formatHoursMinutes, formatRupees} from '../../domain/format';
import {useRiderHome} from '../../state/riderQueries';
import {useStrings} from '../../strings/StringsProvider';
import {payLabel} from '../TripDetailScreen';
import {SyncNote, text, TripHeader} from './parts';

export function TripEnd({
  trip,
  step,
  syncing,
  otpWaiting = false,
  photoDelivery,
  onReport,
  onBack,
}: {
  trip: Trip;
  step: Extract<TripStep, 'DELIVERED' | 'FAILED' | 'CANCELLED'>;
  syncing: boolean;
  /** The customer's OTP is saved and not yet checked by the server: "Delivery saved", not "Trip complete" (P1-05). */
  otpWaiting?: boolean;
  photoDelivery: boolean;
  onReport: () => void;
  onBack: () => Promise<unknown> | void;
}) {
  const {strings, language} = useStrings();
  const t = strings.trip;
  const home = useRiderHome().data;
  // shortcut: the contract has no delivery time, so this is when the phone showed the end; use the server's once Trip has one.
  const [endedAt] = useState(Date.now);
  const delivered = step === 'DELIVERED';
  const reason = trip.cancelReason ? (t.failReasons as Record<string, string>)[trip.cancelReason] ?? trip.cancelReason : undefined;
  const lines = trip.payLines ?? [];

  const endClock = formatClock(trip.finishedAt ?? endedAt);
  return (
    <RiderScreen
      header={<TripHeader trip={trip} />}
      testID="rider-trip-end"
      footer={
        <View style={styles.footer}>
          <BottomAction label={delivered ? t.readyNext : t.backToWaiting} onPress={onBack} testID="rider-back-to-waiting" />
          <BottomAction label={t.report} variant="outline" onPress={onReport} testID="rider-report" />
        </View>
      }>
      <View style={[styles.top, delivered ? styles.done : styles.notDone]}>
        <Text accessibilityRole="header" style={[text.body, delivered ? styles.onGreen : text.secondary]}>
          {delivered ? (otpWaiting ? t.deliverySavedTitle : t.deliveredToAt(trip.customer.firstName, endClock)) : step === 'FAILED' ? t.failedTitle : t.cancelledTitle}
        </Text>
        {step === 'CANCELLED' ? null : (
          <Text style={[styles.pay, delivered && styles.onGreenStrong]} testID="rider-earned" {...{paise: trip.payPaise}}>
            {formatRupees(trip.payPaise)}
          </Text>
        )}
        <Text style={[text.body, delivered ? styles.onGreen : text.secondary]}>
          {!delivered ? reason : otpWaiting ? t.deliverySavedBody : syncing ? t.linesPending : photoDelivery ? t.photoHeld : t.addedToday}
        </Text>
        <SyncNote show={syncing} />
      </View>
      <RefusalNotices tripId={trip.tripId} />
      {step !== 'CANCELLED' || lines.length > 0 ? (
        <View style={styles.lines}>
          {lines.map((line, i) => (
            <RateRow key={`${i}-${line.label}`} label={payLabel(line, strings.pay.final, language)} value={formatRupees(line.amountPaise)} />
          ))}
          {/* A cancelled trip shows only the lines the server paid; the app never adds them up. */}
          {step === 'CANCELLED' ? null : <RateRow label={t.yourPay} value={formatRupees(trip.payPaise)} total />}
          {trip.payLines === undefined ? <Text style={text.small}>{t.linesPending}</Text> : null}
          {trip.rateCardVersion || trip.offerPayPaise !== undefined ? (
            <Text style={text.small}>
              {[trip.rateCardVersion ? t.rateCardNote(trip.rateCardVersion) : null, trip.offerPayPaise !== undefined ? t.offerSaid(formatRupees(trip.offerPayPaise)) : null]
                .filter(Boolean)
                .join(' ')}
            </Text>
          ) : null}
          {!delivered ? <Text style={text.small}>{t.failedNote}</Text> : null}
        </View>
      ) : null}
      {home && !syncing ? (
        <Card style={styles.today}>
          <View style={styles.todayLeft}>
            <Label>{t.today}</Label>
            <Text style={[text.body, text.secondary]}>
              {home.todayOnlineMinutes === undefined ? t.todayTrips(home.todayTrips) : t.todayLine(home.todayTrips, formatHoursMinutes(home.todayOnlineMinutes))}
            </Text>
          </View>
          <Text style={[text.heading, styles.tabular]}>{formatRupees(home.todayEarningsPaise)}</Text>
        </Card>
      ) : null}
    </RiderScreen>
  );
}

const styles = themedStyles(c => ({
  todayLeft: {flex: 1, gap: spacing.xxs},
  // The header block: deep green with white words for a delivery, Day or Night; warm grey for a trip that didn't end with one.
  top: {gap: spacing.xxs, padding: spacing.md, borderRadius: radius.lg},
  done: {backgroundColor: c.doneHead},
  notDone: {backgroundColor: c.surfaceMuted},
  onGreen: {color: c.onDoneHeadSoft},
  onGreenStrong: {color: c.white},
  pay: {fontSize: typography.money, fontFamily: font.display, color: c.textPrimary, fontVariant: ['tabular-nums']},
  lines: {gap: spacing.xs},
  today: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm},
  tabular: {fontVariant: ['tabular-nums']},
  footer: {gap: spacing.xs},
}));
