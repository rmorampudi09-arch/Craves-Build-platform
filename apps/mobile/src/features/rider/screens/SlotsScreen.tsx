import React, {useState} from 'react';
import {Alert, StyleSheet, Text, View} from 'react-native';
import {useIsFocused, useNavigation} from '@react-navigation/native';
import {useQueryClient} from '@tanstack/react-query';
import {colors, fontWeight, radius, spacing, typography} from '../../../design/tokens';
import type {SlotOffer} from '../api/contract';
import {riderApi} from '../api/riderApi';
import {BottomAction} from '../components/BottomAction';
import {Segmented} from '../components/Choices';
import {RiderHeader} from '../components/RiderHeader';
import {CardsSkeleton, ProblemCard, StateCard} from '../components/StateCard';
import {Card, RiderScreen} from '../components/ui';
import {formatClock, formatRupees} from '../domain/format';
import {riderMessage} from '../domain/problem';
import type {RiderNav} from '../navigation';
import {riderKeys, useSlots} from '../state/riderQueries';
import {useStrings} from '../strings/StringsProvider';

/** The calendar day of an instant in the phone's time zone, like formatClock; the day chips group by it. */
const dayOf = (value: string | number) => new Date(value).toDateString();

/**
 * Peak slots (REDESIGN.md, Slots): the days with windows as chips, each window as a card with Book, Booked or Full and
 * the standby list, and the slot running now on top. The server decides every rule; this screen only asks and shows.
 */
export function SlotsScreen() {
  const {strings, language} = useStrings();
  const s = strings.slots;
  const navigation = useNavigation<RiderNav>();
  const queryClient = useQueryClient();
  const slots = useSlots(useIsFocused());
  const [day, setDay] = useState<string>();
  const [busy, setBusy] = useState<string | null>(null);
  const data = slots.data;
  // Each day once, with its first window's instant for the chip label (never re-parse the day key).
  const days = new Map<string, string>();
  (data?.slots ?? []).forEach(slot => {
    if (!days.has(dayOf(slot.startsAt))) {
      days.set(dayOf(slot.startsAt), slot.startsAt);
    }
  });
  const chosen = day && days.has(day) ? day : days.keys().next().value;
  const shown = (data?.slots ?? []).filter(slot => dayOf(slot.startsAt) === chosen);
  const lowestRate = data?.slots.length ? Math.min(...data.slots.map(slot => slot.ratePerHourPaise)) : null;

  async function run(capacityId: string, work: () => Promise<unknown>) {
    setBusy(capacityId);
    try {
      await work();
      // The button stays busy until the list is read again, so a second tap cannot race the server.
      await queryClient.invalidateQueries({queryKey: riderKeys.slots});
    } catch (error) {
      Alert.alert(riderMessage(error, strings, language));
    } finally {
      setBusy(null);
    }
  }

  function cancel(slot: SlotOffer) {
    Alert.alert(s.cancelTitle, s.cancelBody, [
      {text: strings.common.cancel, style: 'cancel'},
      {text: s.cancelConfirm, style: 'destructive', onPress: () => run(slot.capacityId, () => riderApi.cancelSlotBooking(slot.bookingId as string))},
    ]);
  }

  const dayLabel = (key: string, startsAt: string) => {
    const date = new Date(startsAt);
    return key === dayOf(Date.now()) ? s.today : `${strings.earnings.weekdays[date.getDay()]} ${date.getDate()}`;
  };
  const weekdayClock = (value: string) => `${strings.earnings.weekdays[new Date(value).getDay()]} ${formatClock(value)}`;

  return (
    <RiderScreen header={<RiderHeader title={s.title} />} testID="rider-slots">
      <Text style={styles.sub}>{lowestRate === null ? s.subtitleNoRate : s.subtitle(formatRupees(lowestRate))}</Text>
      {data?.running ? (
        <Card style={styles.tight}>
          <Text style={styles.strong}>{s.runningTitle(data.running.clusterName)}</Text>
          <Text style={styles.body}>{s.runningLine(formatRupees(data.running.coveredPaise), data.running.inZoneMinutes)}</Text>
          <BottomAction label={s.openRunning} size="compact" onPress={() => navigation.navigate('SlotNow')} testID="rider-slot-now" />
        </Card>
      ) : null}
      {!data ? (
        slots.isError ? (
          <ProblemCard error={slots.error} onRetry={() => slots.refetch()} testID="rider-slots-problem" />
        ) : (
          <CardsSkeleton cards={2} testID="rider-slots-loading" />
        )
      ) : days.size === 0 ? (
        <StateCard icon="calendar-blank-outline" title={s.emptyTitle} body={s.emptyBody} testID="rider-slots-empty" />
      ) : (
        <>
          <Segmented
            value={chosen as string}
            options={[...days].map(([value, startsAt]) => ({value, label: dayLabel(value, startsAt)}))}
            onChange={setDay}
            label={s.dayLabel}
            role="tab"
            testID="rider-slot-day"
          />
          {shown.map(slot => {
            const opensLater = Date.parse(slot.opensAt) > Date.now();
            const full = slot.placesLeft <= 0;
            const window = s.window(slot.clusterName, formatClock(slot.startsAt), formatClock(slot.endsAt));
            return (
              <View key={slot.capacityId} testID={`rider-slot-${slot.capacityId}`}>
                <Card style={styles.tight}>
                  <View style={styles.row}>
                    <Text style={[styles.strong, styles.flex]}>{window}</Text>
                    {slot.bookingId ? (
                      <View style={[styles.pill, styles.pillBooked]}>
                        <Text style={styles.pillBookedText}>{s.booked}</Text>
                      </View>
                    ) : full ? (
                      <View style={[styles.pill, styles.pillFull]}>
                        <Text style={styles.pillFullText}>{s.full}</Text>
                      </View>
                    ) : (
                      <BottomAction
                        label={s.book}
                        accessibilityLabel={`${s.book}, ${window}`}
                        size="compact"
                        disabled={opensLater || busy === slot.capacityId}
                        onPress={() => run(slot.capacityId, () => riderApi.bookSlot(slot.capacityId))}
                        testID={`rider-slot-book-${slot.capacityId}`}
                      />
                    )}
                  </View>
                  {slot.bookingId ? (
                    <>
                      <Text style={styles.body}>{s.bookedLine(formatClock(Date.parse(slot.startsAt) + 15 * 60_000), formatClock(slot.startsAt))}</Text>
                      <BottomAction
                        label={s.cancel}
                        accessibilityLabel={`${s.cancel}, ${window}`}
                        variant="ghost"
                        size="compact"
                        onPress={() => cancel(slot)}
                        testID={`rider-slot-cancel-${slot.capacityId}`}
                      />
                    </>
                  ) : full ? (
                    <>
                      <Text style={styles.body}>{slot.standby ? s.onStandby : s.standbyLine(formatClock(slot.startsAt))}</Text>
                      {slot.standby ? null : (
                        <BottomAction
                          label={s.joinStandby}
                          accessibilityLabel={`${s.joinStandby}, ${window}`}
                          variant="ghost"
                          size="compact"
                          disabled={opensLater || busy === slot.capacityId}
                          onPress={() => run(slot.capacityId, () => riderApi.standbySlot(slot.capacityId))}
                          testID={`rider-slot-standby-${slot.capacityId}`}
                        />
                      )}
                    </>
                  ) : (
                    <Text style={styles.body}>{s.placesLine(slot.placesLeft, formatRupees(slot.ratePerHourPaise))}</Text>
                  )}
                  {opensLater && !slot.bookingId ? <Text style={styles.body}>{s.opensAt(weekdayClock(slot.opensAt))}</Text> : null}
                </Card>
              </View>
            );
          })}
          <Text style={styles.note}>{s.rules}</Text>
        </>
      )}
    </RiderScreen>
  );
}

const styles = StyleSheet.create({
  flex: {flex: 1},
  tight: {gap: spacing.xs},
  row: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm},
  sub: {fontSize: typography.small, color: colors.textSecondary},
  strong: {fontSize: typography.body, fontWeight: fontWeight.bold, color: colors.textPrimary},
  body: {fontSize: typography.body, color: colors.textSecondary},
  note: {fontSize: typography.small, lineHeight: 19, color: colors.textSecondary},
  // The state pills as drawn: green for Booked, warm grey for Full. No shadows.
  pill: {minHeight: 36, justifyContent: 'center', paddingHorizontal: spacing.md, borderRadius: radius.pill},
  pillBooked: {backgroundColor: colors.successSoft},
  pillBookedText: {fontSize: typography.body, fontWeight: fontWeight.bold, color: colors.successText},
  pillFull: {backgroundColor: colors.border},
  pillFullText: {fontSize: typography.body, fontWeight: fontWeight.bold, color: colors.textSecondary},
});
