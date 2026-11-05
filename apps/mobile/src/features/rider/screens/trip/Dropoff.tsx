// Steps 3 and 4 of the trip: ride to the customer, then hand over (docs/riders/SCREENS.md 11 and 12).
import React, {type PropsWithChildren, useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {Icon} from '../../../../shared/components';
import {borderWidth, colors, fontWeight, iconSize, radius, spacing, typography} from '../../../../design/tokens';
import {DEMO_OTP} from '../../api/riderApi.mock';
import {BottomAction} from '../../components/BottomAction';
import {CodeBoxes} from '../../components/CodeBoxes';
import {RefusalNotices} from '../../components/RefusalNotices';
import {Card, RiderScreen} from '../../components/ui';
import {distanceMeters, formatClock, formatKm, formatRupees} from '../../domain/format';
import {riderOnlineService} from '../../native/riderOnlineService';
import {isDemo} from '../../riderConfig';
import {useRiderMe} from '../../state/riderQueries';
import {useStrings} from '../../strings/StringsProvider';
import {call, distanceLine, navigateTo, PlaceCard, SyncNote, text, TripHeader, TripRows, TwoUp, type StepProps} from './parts';

const NEAR_DROP_M = 200;

/** Why the server refused the last OTP; set from the queue, so a code replayed after going offline lands here too. */
export interface OtpError {
  attemptsLeft?: number;
  lockedMessage?: string;
}

export function ToCustomer({trip, run, syncing}: StepProps) {
  const t = useStrings().strings.trip;
  const maskedCalls = useRiderMe().data?.features.maskedCalls === true;
  const distance = distanceLine(trip.dropDistanceM, trip.customer, t);
  const rows: [string, string][] = [
    ...(distance ? [[t.distance, distance] as [string, string]] : []),
    [t.handOver, t.codeFromCustomer],
    [t.payForTrip, t.payPlusWait(formatRupees(trip.payPaise))],
  ];
  return (
    <RiderScreen
      header={<TripHeader title={t.orderTitle(trip.orderCode)} trip={trip} step={3} />}
      testID="rider-to-customer"
      footer={
        <View style={styles.tight}>
          <BottomAction label={t.atDoor} onPress={() => run('arrived-drop')} testID="rider-reached-customer" />
          <Text style={[text.small, text.center]} testID="rider-no-deadline">
            {t.noDeadline}
          </Text>
        </View>
      }>
      <Text style={text.small}>
        {trip.pickedUpAt ? t.lockedWith(formatRupees(trip.payPaise), t.pickedUpAt(formatClock(trip.pickedUpAt))) : t.lockedPay(formatRupees(trip.payPaise))}
      </Text>
      <SyncNote show={syncing} />
      <RefusalNotices tripId={trip.tripId} />
      <PlaceCard label={t.deliverTo} name={trip.customer.firstName} place={trip.customer} />
      <TripRows rows={rows} />
      <View style={styles.tight}>
        <TwoUp
          left={
            <BottomAction
              label={t.navigate}
              variant="outline"
              leftIcon="navigation-variant-outline"
              accessibilityHint={t.navigateNote}
              onPress={() => navigateTo(trip.customer)}
              testID="rider-navigate"
            />
          }
          right={
            <BottomAction
              label={t.callName(trip.customer.firstName)}
              variant="outline"
              leftIcon="phone-outline"
              onPress={() => call(trip.customer.phone)}
              testID="rider-call-customer"
            />
          }
        />
        {maskedCalls ? <Text style={text.small} testID="rider-masked-calls">{t.maskedCalls}</Text> : null}
      </View>
    </RiderScreen>
  );
}

export function Deliver({
  trip,
  run,
  syncing,
  otp,
  setOtp,
  otpError,
  onCall,
  onNotAnswering,
}: StepProps & {
  otp: string;
  setOtp: (otp: string) => void;
  otpError: OtpError | null;
  onCall: () => void;
  onNotAnswering: () => void;
}) {
  const t = useStrings().strings.trip;
  const name = trip.customer.firstName;
  const fix = riderOnlineService.lastFix();
  const distance = fix ? distanceMeters(fix, trip.customer) : null;
  const locked = otpError?.lockedMessage !== undefined;

  async function deliver() {
    if (!(await run('delivered', {method: 'OTP', otp, fix: riderOnlineService.lastFix()}))) {
      setOtp(''); // the reason shows under the boxes
    }
  }

  return (
    <RiderScreen
      header={<TripHeader title={name} trip={trip} step={4} />}
      testID="rider-deliver"
      footer={
        locked ? (
          <BottomAction label={t.photoRoute} leftIcon="camera-outline" onPress={onNotAnswering} testID="rider-photo-route" />
        ) : (
          <View style={styles.tight}>
            <BottomAction label={t.delivered} disabled={otp.length !== 4} onPress={deliver} testID="rider-delivered" />
            <Text style={[text.small, text.center]}>{t.deliveredWhen}</Text>
          </View>
        )
      }>
      <SyncNote show={syncing} />
      <RefusalNotices tripId={trip.tripId} />
      <Text style={text.small}>{t.lockedWith(formatRupees(trip.payPaise), t.orderTitle(trip.orderCode))}</Text>
      <View style={styles.who}>
        <View style={styles.whoText}>
          <Text accessibilityRole="header" style={text.heading}>
            {name}
          </Text>
          <Text style={[text.body, text.secondary]}>{`${trip.customer.address}, ${trip.customer.area}`}</Text>
        </View>
        {distance !== null ? (
          <DropChip near={distance <= NEAR_DROP_M} label={distance <= NEAR_DROP_M ? t.nearDrop : t.farDrop(formatKm(distance))} />
        ) : null}
      </View>
      <Text style={[text.body, text.secondary]}>{t.handoverNote}</Text>
      <Fieldset legend={t.otpTitle(name)}>
        <CodeBoxes
          value={otp}
          onChangeText={setOtp}
          attemptsLeft={otpError?.attemptsLeft}
          lockedMessage={otpError?.lockedMessage}
          testID="rider-otp-input"
        />
        <Text style={text.small}>{t.otpNote(name)}</Text>
        {isDemo ? <Text style={text.small}>{t.demoOtp(DEMO_OTP)}</Text> : null}
      </Fieldset>
      <BottomAction label={t.callName(name)} variant="outline" leftIcon="phone-outline" onPress={onCall} testID="rider-call-customer" />
      {locked ? null : (
        <Card style={styles.tight}>
          <Text style={[text.body, text.bold]}>{t.ifNotAnswering(name)}</Text>
          <Text style={[text.body, text.secondary]}>{t.notAnsweringHelp(Math.round(trip.unreachableWaitSeconds / 60))}</Text>
          <BottomAction label={t.notAnswering} variant="outline" size="compact" onPress={onNotAnswering} testID="rider-unreachable" />
        </Card>
      )}
    </RiderScreen>
  );
}

/** "Near drop point" (or how far away) from the last GPS fix; advisory only, the server decides. */
function DropChip({near, label}: {near: boolean; label: string}) {
  const color = near ? colors.successText : colors.warningText;
  return (
    <View accessible accessibilityLabel={label} style={[styles.chip, {backgroundColor: near ? colors.successSoft : colors.warningSoft}]}>
      <Icon name="map-marker-outline" size={iconSize.xs} color={color} surface={false} />
      <Text style={[styles.chipText, {color}]}>{label}</Text>
    </View>
  );
}

/** A card whose title is cut into its top line, like a form fieldset. */
function Fieldset({legend, children}: PropsWithChildren<{legend: string}>) {
  const [legendHeight, setLegendHeight] = useState(24);
  const half = legendHeight / 2;
  return (
    <View style={{paddingTop: half}}>
      <View style={styles.legendRow}>
        <Text
          accessibilityRole="header"
          onLayout={event => setLegendHeight(event.nativeEvent.layout.height)}
          style={[text.heading, styles.legend]}>
          {legend}
        </Text>
      </View>
      <View style={[styles.fieldset, {paddingTop: half + spacing.lg}]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  // The chip moves under the name when both no longer fit on one line (long distance text, large font).
  who: {flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm},
  whoText: {flexGrow: 1, flexShrink: 1, flexBasis: 140},
  chip: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  chipText: {fontSize: typography.small, fontWeight: fontWeight.bold},
  // The legend's white backing hides the line behind it; 6 dp either side, text in line with the card text.
  legendRow: {position: 'absolute', top: 0, left: spacing.md + borderWidth.standard - 6, right: spacing.md - 6, zIndex: 1, flexDirection: 'row'},
  legend: {flexShrink: 1, paddingHorizontal: 6, backgroundColor: colors.white},
  fieldset: {
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  tight: {gap: spacing.xs},
});
