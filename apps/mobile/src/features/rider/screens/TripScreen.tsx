import React, {memo, useEffect, useState} from 'react';
import {Alert, View} from 'react-native';
import {useQueryClient} from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import {Badge, Button, Chip, SectionSkeleton} from '../../../shared/components';
import type {DeliverBody, FailBody, Trip, TripAction, TripStep} from '../api/contract';
import {idempotencyKey} from '../api/riderApi';
import {BottomAction} from '../components/BottomAction';
import {RiderHeader} from '../components/RiderHeader';
import {Body, Card, Label, Money, RateRow, RiderScreen, riderStyles, Title, Value} from '../components/ui';
import {AppApiError} from '../../../core/http/apiError';
import {formatRupees, formatTimer} from '../domain/format';
import {riderOnlineService} from '../native/riderOnlineService';
import {useRiderShell, type RiderScreenProps} from '../navigation';
import {riderKeys, useActiveTrip, useRiderMe} from '../state/riderQueries';
import {tripQueue, usePendingActions} from '../state/tripQueue';
import {useStrings} from '../strings/StringsProvider';
import {Banner} from '../components/Banner';
import {AtKitchen, ToKitchen} from './trip/Pickup';
import {Deliver, ToCustomer, type OtpError} from './trip/Dropoff';
import {call} from './trip/parts';

const ENDED: TripStep[] = ['DELIVERED', 'FAILED', 'CANCELLED'];
const FAIL_REASONS = ['CUSTOMER_UNREACHABLE', 'WRONG_ADDRESS', 'CUSTOMER_REFUSED', 'UNSAFE'] as const;

/** Counts down from a start time; only this leaf re-renders each second. */
const Countdown = memo(function CountdownView({
  from,
  seconds,
  running,
  done,
}: {
  from: number;
  seconds: number;
  running: (left: string) => string;
  done: string;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const left = seconds - (now - from) / 1000;
  return <Label>{left > 0 ? running(formatTimer(left)) : done}</Label>;
});

function useElapsed(from: number | null, seconds: number): boolean {
  const [elapsed, setElapsed] = useState(false);
  useEffect(() => {
    if (from === null) {
      setElapsed(false);
      return;
    }
    const wait = from + seconds * 1000 - Date.now();
    if (wait <= 0) {
      setElapsed(true);
      return;
    }
    const timer = setTimeout(() => setElapsed(true), wait);
    return () => clearTimeout(timer);
  }, [from, seconds]);
  return elapsed;
}

export function TripScreen({navigation}: RiderScreenProps<'Trip'>) {
  const {strings} = useStrings();
  const t = strings.trip;
  const {riderId} = useRiderShell();
  const queryClient = useQueryClient();
  const active = useActiveTrip();
  const supportPhone = useRiderMe().data?.supportPhone;
  // Keep the last trip we saw: once it ends the server may stop returning it.
  const [trip, setTrip] = useState<Trip | null>(active.data ?? null);
  const [localStep, setLocalStep] = useState<TripStep | null>(null);
  const [otp, setOtp] = useState('');
  const [otpError, setOtpError] = useState<OtpError | null>(null);
  const [unreachableFrom, setUnreachableFrom] = useState<number | null>(null);
  // When the rider tapped Call at the door: the customer-not-answering steps show each time.
  const [callTimes, setCallTimes] = useState<number[]>([]);
  const calls = callTimes.length;
  const [failReason, setFailReason] = useState<string | null>(null);
  const [photoDelivery, setPhotoDelivery] = useState(false);
  const pending = usePendingActions(riderId, trip?.tripId);

  useEffect(() => {
    if (active.data) {
      setTrip(active.data);
    }
  }, [active.data]);

  // A wrong or locked OTP shows by the boxes, also when the queue replays a code sent while offline.
  const tripId = trip?.tripId;
  useEffect(() => {
    const off = tripQueue.onRejected((entry, info) => {
      if (entry.tripId !== tripId || entry.action !== 'delivered') {
        return;
      }
      if (info.code === 'OTP_LOCKED') {
        setOtpError({lockedMessage: info.message});
      } else if (info.code === 'OTP_INVALID') {
        setOtpError({attemptsLeft: info.attemptsLeft});
      }
    });
    return () => {
      off();
    };
  }, [tripId]);

  const waitOver = useElapsed(unreachableFrom, trip?.unreachableWaitSeconds ?? 0);

  if (!trip) {
    if (active.isLoading) {
      return (
        <RiderScreen header={<RiderHeader />} testID="rider-trip-loading">
          <SectionSkeleton />
        </RiderScreen>
      );
    }
    if (active.isError) {
      const offline = active.error instanceof AppApiError && (active.error.retriable || !active.error.status);
      return (
        <RiderScreen
          header={<RiderHeader />}
          testID="rider-trip-error"
          footer={<BottomAction label={strings.common.retry} onPress={() => active.refetch()} testID="rider-trip-retry" />}>
          <Banner tone="warning" text={offline ? strings.common.offline : t.loadFailed} />
        </RiderScreen>
      );
    }
    return (
      <RiderScreen
        header={<RiderHeader />}
        footer={<BottomAction label={t.backToWaiting} onPress={() => navigation.popTo('Tabs')} />}>
        <Title>{t.ended}</Title>
      </RiderScreen>
    );
  }

  // The optimistic step only counts while this trip still has actions waiting to sync.
  const step = pending > 0 ? localStep ?? trip.step : trip.step;

  /** Sends a step through the offline queue; false when the server refused it. */
  async function run(action: TripAction, nextStep: TripStep | null, body?: DeliverBody | FailBody): Promise<boolean> {
    if (!trip) {
      return false;
    }
    // Retried OTPs need a new key, or the server would replay the first (wrong) answer.
    const attempt = action === 'delivered' ? Date.now() : undefined;
    const outcome = await tripQueue.enqueue({
      riderId,
      tripId: trip.tripId,
      action,
      key: idempotencyKey(action, trip.tripId, riderId, attempt),
      body,
    });
    if (outcome.kind === 'sent') {
      queryClient.setQueryData(riderKeys.activeTrip, outcome.trip);
      setTrip(outcome.trip);
      setLocalStep(null);
    } else if (outcome.kind === 'queued' && nextStep) {
      setLocalStep(nextStep); // the step changes on screen at once and syncs later
    }
    return outcome.kind !== 'rejected';
  }

  async function deliverWithPhoto() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      return;
    }
    const shot = await ImagePicker.launchCameraAsync({mediaTypes: ['images'], quality: 0.5});
    if (shot.canceled) {
      return;
    }
    setPhotoDelivery(true);
    await run('delivered', 'DELIVERED', {
      method: 'PHOTO',
      photoUri: shot.assets[0]?.uri,
      callsMade: calls,
      fix: riderOnlineService.lastFix(),
    });
  }

  function backToWaiting() {
    queryClient.setQueryData(riderKeys.activeTrip, null);
    queryClient.invalidateQueries({queryKey: riderKeys.all});
    navigation.popTo('Tabs');
  }

  const header = <RiderHeader title={ENDED.includes(step) ? undefined : t.titles[step as keyof typeof t.titles]} tripId={trip.tripId} />;
  const syncNote = pending > 0 ? <Badge label={strings.common.savedWillSync} tone="info" /> : null;

  if (ENDED.includes(step)) {
    const title = step === 'DELIVERED' ? t.completeTitle : step === 'CANCELLED' ? t.cancelledTitle : t.failedTitle;
    return (
      <RiderScreen header={header} footer={<BottomAction label={t.backToWaiting} onPress={backToWaiting} testID="rider-back-to-waiting" />}>
        <Title>{title}</Title>
        {syncNote}
        {trip.cancelReason ? <Body>{trip.cancelReason}</Body> : null}
        <Card>
          <Label>{t.youEarned}</Label>
          <Money paise={step === 'DELIVERED' ? trip.payPaise : (trip.payLines ?? []).reduce((s, l) => s + l.amountPaise, 0)} />
          {trip.payLines ? (
            trip.payLines.map(line => <RateRow key={line.label} label={line.label} value={formatRupees(line.amountPaise)} />)
          ) : (
            <Label>{t.linesPending}</Label>
          )}
        </Card>
        {photoDelivery ? <Body>{t.photoHeld}</Body> : null}
      </RiderScreen>
    );
  }

  if (step === 'TO_KITCHEN') {
    return <ToKitchen trip={trip} run={run} syncing={pending > 0} />;
  }

  if (step === 'AT_KITCHEN') {
    return <AtKitchen trip={trip} run={run} syncing={pending > 0} />;
  }

  if (step === 'PICKED_UP') {
    return <ToCustomer trip={trip} run={run} syncing={pending > 0} />;
  }

  // AT_DROP: the customer's OTP first; the photo only after two calls and the wait.
  function callCustomer() {
    setCallTimes(list => [...list, Date.now()]);
    call(trip!.customer.phone);
  }

  if (unreachableFrom === null) {
    return (
      <Deliver
        trip={trip}
        run={run}
        syncing={pending > 0}
        otp={otp}
        setOtp={setOtp}
        otpError={otpError}
        onCall={callCustomer}
        onNotAnswering={() => setUnreachableFrom(Date.now())}
      />
    );
  }

  const photoUnlocked = calls >= 2 && waitOver;

  return (
    <RiderScreen header={header} testID="rider-deliver">
      {syncNote}
      {(
        <Card>
          <Value>{t.unreachableTitle}</Value>
          <Body>{t.unreachableSteps}</Body>
          <Label>{t.callsMade(calls)}</Label>
          <Countdown from={unreachableFrom} seconds={trip.unreachableWaitSeconds} running={t.waitLeft} done="" />
          <Body>{t.photoHint}</Body>
          <Button label={t.leavePhoto} disabled={!photoUnlocked} onPress={deliverWithPhoto} testID="rider-leave-photo" />
          {supportPhone ? (
            <Button label={strings.common.callSupport} variant="outline" onPress={() => call(supportPhone)} />
          ) : null}
          {photoUnlocked ? (
            <>
              <Label>{t.failTitle}</Label>
              <View style={riderStyles.rowGap}>
                {FAIL_REASONS.map(reason => (
                  <Chip key={reason} label={t.failReasons[reason]} selected={failReason === reason} onPress={() => setFailReason(reason)} />
                ))}
              </View>
              <Button
                label={t.markFailed}
                variant="ghost"
                disabled={!failReason}
                onPress={() =>
                  Alert.alert(t.markFailed, failReason ? t.failReasons[failReason as keyof typeof t.failReasons] : undefined, [
                    {text: strings.common.cancel, style: 'cancel'},
                    {text: t.confirmFail, style: 'destructive', onPress: () => run('failed', 'FAILED', {reason: failReason ?? 'OTHER'})},
                  ])
                }
              />
            </>
          ) : null}
        </Card>
      )}
    </RiderScreen>
  );
}

