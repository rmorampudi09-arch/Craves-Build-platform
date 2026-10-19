import React from 'react';
import {Linking} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {Button} from '../../../shared/components';
import {RiderHeader} from '../components/RiderHeader';
import {Body, Card, Label, RiderScreen, Value} from '../components/ui';
import {formatDay, formatRupees} from '../domain/format';
import type {RiderNav} from '../navigation';
import {useEarnings, useRiderMe} from '../state/riderQueries';
import {useStrings} from '../strings/StringsProvider';

export function HelpScreen() {
  const {strings} = useStrings();
  const h = strings.help;
  const navigation = useNavigation<RiderNav>();
  const supportPhone = useRiderMe().data?.supportPhone;
  const recent = useEarnings('week').data?.pages[0]?.trips.slice(0, 5) ?? [];

  return (
    <RiderScreen
      header={<RiderHeader title={h.title} />}
      testID="rider-help"
      footer={
        supportPhone ? (
          <Button
            label={strings.common.callSupport}
            leftIcon="phone"
            onPress={() => Linking.openURL(`tel:${supportPhone}`).catch(() => undefined)}
          />
        ) : null
      }>
      <Value>{h.faqTitle}</Value>
      {h.faqs.map(faq => (
        <Card key={faq.q}>
          <Value>{faq.q}</Value>
          <Body>{faq.a}</Body>
        </Card>
      ))}
      <Value>{h.reportTitle}</Value>
      {recent.length === 0 ? <Label>{h.noTrips}</Label> : null}
      {recent.map(trip => (
        <Button
          key={trip.tripId}
          variant="outline"
          label={`${formatDay(trip.completedAt)} · ${trip.kitchenArea} → ${trip.customerLocality} · ${formatRupees(trip.amountPaise)}`}
          onPress={() => navigation.navigate('TripDetail', {tripId: trip.tripId})}
        />
      ))}
    </RiderScreen>
  );
}
