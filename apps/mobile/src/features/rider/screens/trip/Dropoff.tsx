// Steps 3 and 4 of the trip: ride to the customer, then hand over (docs/riders/SCREENS.md 11 and 12).
import React from 'react';
import {Banner} from '../../components/Banner';
import {BottomAction} from '../../components/BottomAction';
import {RiderScreen} from '../../components/ui';
import {useStrings} from '../../strings/StringsProvider';
import {call, navigateTo, OrderCard, PlaceCard, SyncNote, TripHeader, TwoUp, type StepProps} from './parts';

export function ToCustomer({trip, run, syncing}: StepProps) {
  const t = useStrings().strings.trip;
  return (
    <RiderScreen
      header={<TripHeader title={t.titles.PICKED_UP} trip={trip} step={3} />}
      testID="rider-to-customer"
      footer={
        <BottomAction label={t.reachedCustomer} onPress={() => run('arrived-drop', 'AT_DROP')} testID="rider-reached-customer" />
      }>
      <SyncNote show={syncing} />
      <PlaceCard label={t.deliverTo} name={trip.customer.firstName} place={trip.customer} />
      <TwoUp
        left={
          <BottomAction
            label={t.callName(trip.customer.firstName)}
            variant="outline"
            leftIcon="phone-outline"
            onPress={() => call(trip.customer.phone)}
            testID="rider-call-customer"
          />
        }
        right={
          <BottomAction
            label={t.navigate}
            variant="outline"
            leftIcon="navigation-variant-outline"
            accessibilityHint={t.navigateNote}
            onPress={() => navigateTo(trip.customer)}
            testID="rider-navigate"
          />
        }
      />
      <OrderCard trip={trip} />
      <Banner tone="info" text={t.noDeadline} testID="rider-no-deadline" />
    </RiderScreen>
  );
}
