// Pieces shared by the trip steps (docs/riders/SCREENS.md 9–14).
import React, {type ReactNode} from 'react';
import {Linking, StyleSheet, Text, useWindowDimensions, View} from 'react-native';
import {Badge} from '../../../../shared/components';
import {colors, fontWeight, spacing, typography} from '../../../../design/tokens';
import type {DeliverBody, FailBody, Place, Trip, TripAction, TripStep} from '../../api/contract';
import {RiderHeader} from '../../components/RiderHeader';
import {StepBar} from '../../components/StepBar';
import {Card, RateRow} from '../../components/ui';
import {formatRupees} from '../../domain/format';
import {useStrings} from '../../strings/StringsProvider';

/** Sends a step through the offline queue; resolves false when the server refused it. */
export type RunStep = (action: TripAction, nextStep: TripStep | null, body?: DeliverBody | FailBody) => Promise<boolean>;

/** What every trip step gets from TripScreen. */
export interface StepProps {
  trip: Trip;
  run: RunStep;
  /** Steps are saved on the phone and still waiting to reach the server. */
  syncing: boolean;
}

export function call(phone: string) {
  Linking.openURL(`tel:${phone}`).catch(() => undefined);
}

/** Two-wheeler navigation in the Google Maps app; falls back to the web link if the app is missing. */
export function navigateTo(place: Place) {
  const at = `${place.lat},${place.lng}`;
  Linking.openURL(`google.navigation:q=${at}&mode=l`).catch(() =>
    Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${at}&travelmode=two-wheeler`),
  );
}

/** The rider header, plus the 4-segment step bar on steps 1–4. */
export function TripHeader({title, trip, step}: {title?: string; trip: Trip; step?: number}) {
  return (
    <>
      <RiderHeader title={title} tripId={trip.tripId} />
      {step ? <StepBar step={step} /> : null}
    </>
  );
}

/** "Saved · will sync" while steps wait in the offline queue. */
export function SyncNote({show}: {show: boolean}) {
  const {strings} = useStrings();
  return show ? <Badge label={strings.common.savedWillSync} tone="info" testID="rider-sync-note" /> : null;
}

/** Two outline buttons 12 dp apart; they stack once large text makes each narrower than its label needs. */
export function TwoUp({left, right}: {left: ReactNode; right: ReactNode}) {
  const {fontScale} = useWindowDimensions();
  const cell = {flexGrow: 1, flexBasis: 150 * fontScale};
  return (
    <View style={styles.twoUp}>
      <View style={cell}>{left}</View>
      <View style={cell}>{right}</View>
    </View>
  );
}

/** Where to go: "Pick up from" / "Deliver to", the name, the address and the landmark. */
export function PlaceCard({label, name, place}: {label: string; name: string; place: Place}) {
  const t = useStrings().strings.trip;
  return (
    <Card>
      <Text style={text.small}>{label}</Text>
      <Text accessibilityRole="header" style={text.name}>
        {name}
      </Text>
      <Text style={text.body}>{`${place.address}, ${place.area}`}</Text>
      {place.landmark ? <Text style={[text.body, text.secondary]}>{t.landmark(place.landmark)}</Text> : null}
    </Card>
  );
}

/** Order code, items and (on the way to the kitchen) the locked pay, as key–value rows. */
export function OrderCard({trip, withPay}: {trip: Trip; withPay?: boolean}) {
  const t = useStrings().strings.trip;
  return (
    <Card style={styles.rows}>
      <RateRow label={t.orderCode} value={trip.orderCode} />
      <RateRow label={t.itemsLabel} value={t.items(trip.itemsCount, trip.sealed)} />
      {withPay ? <RateRow label={t.payLocked} value={formatRupees(trip.payPaise)} /> : null}
    </Card>
  );
}

export const text = StyleSheet.create({
  small: {fontSize: typography.small, color: colors.textSecondary},
  body: {fontSize: typography.body, color: colors.textPrimary},
  bold: {fontWeight: fontWeight.bold},
  secondary: {color: colors.textSecondary},
  center: {textAlign: 'center'},
  name: {fontSize: typography.hero, fontWeight: fontWeight.bold, color: colors.textPrimary},
  heading: {fontSize: typography.heading, fontWeight: fontWeight.bold, color: colors.textPrimary},
});

const styles = StyleSheet.create({
  twoUp: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm},
  // Key–value rows sit on a 28 dp pitch.
  rows: {gap: 10},
});
