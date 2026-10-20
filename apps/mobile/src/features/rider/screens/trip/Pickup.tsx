// Steps 1 and 2 of the trip: ride to the kitchen, then collect the bag (docs/riders/SCREENS.md 9 and 10).
import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {spacing} from '../../../../design/tokens';
import {BottomAction} from '../../components/BottomAction';
import {RiderScreen} from '../../components/ui';
import {useStrings} from '../../strings/StringsProvider';
import {call, navigateTo, OrderCard, PlaceCard, SyncNote, text, TripHeader, TwoUp, type StepProps} from './parts';

export function ToKitchen({trip, run, syncing}: StepProps) {
  const t = useStrings().strings.trip;
  return (
    <RiderScreen
      header={<TripHeader title={t.titles.TO_KITCHEN} trip={trip} step={1} />}
      testID="rider-to-kitchen"
      footer={
        <BottomAction label={t.reachedKitchen} onPress={() => run('arrived-pickup', 'AT_KITCHEN')} testID="rider-reached-kitchen" />
      }>
      <SyncNote show={syncing} />
      <PlaceCard label={t.pickUpFrom} name={trip.kitchen.kitchenName} place={trip.kitchen} />
      <View style={styles.tight}>
        <TwoUp
          left={
            <BottomAction
              label={t.callChef}
              variant="outline"
              leftIcon="phone-outline"
              onPress={() => call(trip.kitchen.chefPhone)}
              testID="rider-call-chef"
            />
          }
          right={
            <BottomAction
              label={t.navigate}
              variant="outline"
              leftIcon="navigation-variant-outline"
              accessibilityHint={t.navigateNote}
              onPress={() => navigateTo(trip.kitchen)}
              testID="rider-navigate"
            />
          }
        />
        <Text style={text.small}>{t.navigateNote}</Text>
      </View>
      <OrderCard trip={trip} withPay />
    </RiderScreen>
  );
}

const styles = StyleSheet.create({
  tight: {gap: spacing.xs},
});
