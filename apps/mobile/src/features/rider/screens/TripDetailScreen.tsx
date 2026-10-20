import React, {useState} from 'react';
import {Alert, View} from 'react-native';
import {Button, Chip, SectionSkeleton, TerminalState} from '../../../shared/components';
import type {SupportCategory, SupportIssue} from '../api/contract';
import {riderApi} from '../api/riderApi';
import {RiderHeader} from '../components/RiderHeader';
import {StatusBadge} from '../components/StatusBadge';
import {Body, Card, Label, Money, RateRow, RiderScreen, riderStyles, Value} from '../components/ui';
import {formatClock, formatDay, formatKm, formatRupees} from '../domain/format';
import type {RiderScreenProps} from '../navigation';
import {useTripEarning} from '../state/riderQueries';
import {useStrings} from '../strings/StringsProvider';

const TRIP_CATEGORIES: SupportCategory[] = ['MISSING_PAY', 'WRONG_DISTANCE', 'WRONG_DEDUCTION', 'APP_PROBLEM', 'OTHER'];

/** "Report a problem": pick a category and send. Used on trips and on payouts. */
export function ReportProblem({
  issue,
  categories,
}: {
  issue: Omit<SupportIssue, 'category'>;
  categories: SupportCategory[];
}) {
  const {strings} = useStrings();
  const e = strings.earnings;
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<SupportCategory | null>(null);

  if (!open) {
    return <Button label={e.report} variant="outline" onPress={() => setOpen(true)} />;
  }
  return (
    <Card>
      <Value>{e.reportTitle}</Value>
      <View style={riderStyles.rowGap}>
        {categories.map(c => (
          <Chip key={c} label={e.categories[c]} selected={category === c} onPress={() => setCategory(c)} />
        ))}
      </View>
      <Button
        label={e.send}
        disabled={!category}
        onPress={async () => {
          try {
            await riderApi.reportIssue({...issue, category: category as SupportCategory});
            setOpen(false);
            Alert.alert(e.reportSent);
          } catch {
            Alert.alert(strings.common.error);
          }
        }}
      />
    </Card>
  );
}

export function TripDetailScreen({route}: RiderScreenProps<'TripDetail'>) {
  const {strings} = useStrings();
  const e = strings.earnings;
  const trip = useTripEarning(route.params.tripId);

  return (
    <RiderScreen header={<RiderHeader title={e.detailTitle} back />} testID="rider-trip-detail">
      {trip.data ? (
        <>
          <Card>
            <Value>{`${trip.data.kitchenArea} → ${trip.data.customerLocality}`}</Value>
            <Label>{`${e.completed} ${formatDay(trip.data.completedAt)} · ${formatClock(trip.data.completedAt)}`}</Label>
            <Money paise={trip.data.amountPaise} />
            <StatusBadge status={trip.data.status} label={e.status[trip.data.status]} />
          </Card>
          {trip.data.status === 'HELD' && trip.data.holdReason ? (
            <Card>
              <Value>{e.holdReason}</Value>
              <Body>{trip.data.holdReason}</Body>
              {trip.data.releaseOn ? <Label>{e.decisionBy(formatDay(trip.data.releaseOn))}</Label> : null}
            </Card>
          ) : null}
          <Card>
            {trip.data.lines.map(line => (
              <RateRow key={line.label} label={line.label} value={formatRupees(line.amountPaise)} />
            ))}
          </Card>
          <Card>
            {trip.data.pickupDistanceM ? <RateRow label={e.toKitchen} value={formatKm(trip.data.pickupDistanceM)} /> : null}
            {trip.data.dropDistanceM ? <RateRow label={e.toCustomer} value={formatKm(trip.data.dropDistanceM)} /> : null}
            <Label>{e.rateCard(trip.data.rateCardVersion)}</Label>
          </Card>
          <ReportProblem issue={{tripId: trip.data.tripId}} categories={TRIP_CATEGORIES} />
        </>
      ) : trip.isError ? (
        <TerminalState title={strings.common.error} actionLabel={strings.common.retry} onAction={() => trip.refetch()} />
      ) : (
        <SectionSkeleton />
      )}
    </RiderScreen>
  );
}
