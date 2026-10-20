import React, {memo, useEffect, useState} from 'react';
import {Alert, StyleSheet, Text, View} from 'react-native';
import {useQueryClient} from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import {Badge, Button, Chip, InputField, SectionSkeleton} from '../../../shared/components';
import {colors, fontWeight, spacing} from '../../../design/tokens';
import type {DeliverBody, FailBody, Trip, TripAction, TripStep} from '../api/contract';
import {idempotencyKey} from '../api/riderApi';
import {DEMO_OTP} from '../api/riderApi.mock';
import {BottomAction} from '../components/BottomAction';
import {RiderHeader} from '../components/RiderHeader';
import {Body, Card, Label, Money, RateRow, RiderScreen, riderStyles, Title, Value} from '../components/ui';
import {AppApiError} from '../../../core/http/apiError';
import {distanceMeters, formatKm, formatRupees, formatTimer} from '../domain/format';
import {riderOnlineService} from '../native/riderOnlineService';
import {useRiderShell, type RiderScreenProps} from '../navigation';
import {isDemo} from '../riderConfig';
import {riderKeys, useActiveTrip, useRiderMe} from '../state/riderQueries';
import {tripQueue, usePendingActions} from '../state/tripQueue';
import {useStrings} from '../strings/StringsProvider';
import {Banner} from '../components/Banner';
import {ToKitchen} from './trip/Pickup';
import {call, navigateTo} from './trip/parts';

const ENDED: TripStep[] = ['DELIVERED', 'FAILED', 'CANCELLED'];
const NEAR_DROP_M = 200;
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
  const [foodNoteShown, setFoodNoteShown] = useState(false);
  const [unreachableFrom, setUnreachableFrom] = useState<number | null>(null);
  const [calls, setCalls] = useState(0);
  const [failReason, setFailReason] = useState<string | null>(null);
  const [photoDelivery, setPhotoDelivery] = useState(false);
  const pending = usePendingActions(riderId, trip?.tripId);

  useEffect(() => {
    if (active.data) {
      setTrip(active.data);
    }
  }, [active.data]);

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

  async function run(action: TripAction, nextStep: TripStep | null, body?: DeliverBody | FailBody) {
    if (!trip) {
      return;
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
    } else if (outcome.kind === 'queued') {
      if (nextStep) {
        setLocalStep(nextStep); // the step changes on screen at once and syncs later
      }
    } else if (action === 'delivered') {
      setOtp(''); // RiderRuntime shows the server's message, e.g. a wrong OTP
    }
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

  const orderCard = (
    <Card>
      <Label>{t.orderCode}</Label>
      <Value>{trip.orderCode}</Value>
      <Label>{t.items(trip.itemsCount, trip.sealed)}</Label>
    </Card>
  );

  if (step === 'TO_KITCHEN') {
    return <ToKitchen trip={trip} run={run} syncing={pending > 0} />;
  }

  if (step === 'AT_KITCHEN') {
    const atKitchen = true;
    const waitFrom = trip.arrivedKitchenAt ? Date.parse(trip.arrivedKitchenAt) : Date.now();
    return (
      <RiderScreen
        header={header}
        testID={atKitchen ? 'rider-pickup-check' : 'rider-to-kitchen'}
        footer={
          atKitchen ? (
            <BottomAction label={t.pickedUp} onPress={() => run('picked-up', 'PICKED_UP')} testID="rider-picked-up" />
          ) : (
            <BottomAction
              label={t.reachedKitchen}
              testID="rider-reached-kitchen"
              onPress={() => run('arrived-pickup', 'AT_KITCHEN')}
            />
          )
        }>
        {syncNote}
        <Card>
          <Value>{trip.kitchen.kitchenName}</Value>
          <Body>{`${trip.kitchen.area} · ${trip.kitchen.address}`}</Body>
          {trip.kitchen.landmark ? <Label>{t.landmark(trip.kitchen.landmark)}</Label> : null}
        </Card>
        {atKitchen ? (
          <Card>
            <Label>{t.matchCode}</Label>
            <Text style={styles.bigCode} testID="rider-order-code">
              {trip.orderCode}
            </Text>
            <Label>{t.items(trip.itemsCount, trip.sealed)}</Label>
            <Countdown from={waitFrom} seconds={trip.waitFreeSeconds} running={t.freeWaitLeft} done={t.waitPaid} />
          </Card>
        ) : (
          orderCard
        )}
        <View style={riderStyles.rowGap}>
          <Button label={t.callChef} leftIcon="phone" variant="outline" onPress={() => call(trip.kitchen.chefPhone)} />
          {atKitchen ? (
            foodNoteShown ? null : (
              <Button
                label={t.foodNotReady}
                variant="outline"
                onPress={() => {
                  setFoodNoteShown(true);
                  run('food-not-ready', null);
                }}
              />
            )
          ) : (
            <Button label={t.navigate} leftIcon="location" variant="outline" onPress={() => navigateTo(trip.kitchen)} />
          )}
        </View>
        {foodNoteShown ? <Body>{t.foodNotReadySent}</Body> : null}
      </RiderScreen>
    );
  }

  const customerCard = (
    <Card>
      <Value>{trip.customer.firstName}</Value>
      <Body>{`${trip.customer.area} · ${trip.customer.address}`}</Body>
      {trip.customer.landmark ? <Label>{t.landmark(trip.customer.landmark)}</Label> : null}
    </Card>
  );
  const contactButtons = (
    <View style={riderStyles.rowGap}>
      <Button
        label={t.callCustomer}
        leftIcon="phone"
        variant="outline"
        onPress={() => {
          if (unreachableFrom !== null) {
            setCalls(n => n + 1);
          }
          call(trip.customer.phone);
        }}
      />
      <Button label={t.navigate} leftIcon="location" variant="outline" onPress={() => navigateTo(trip.customer)} />
    </View>
  );

  if (step === 'PICKED_UP') {
    return (
      <RiderScreen
        header={header}
        testID="rider-to-customer"
        footer={<BottomAction label={t.reachedCustomer} onPress={() => run('arrived-drop', 'AT_DROP')} testID="rider-reached-customer" />}>
        {syncNote}
        {customerCard}
        {orderCard}
        {contactButtons}
      </RiderScreen>
    );
  }

  // AT_DROP: the customer's OTP first; the photo only after two calls and the wait.
  const fix = riderOnlineService.lastFix();
  const dropDistance = fix ? distanceMeters(fix, trip.customer) : null;
  const photoUnlocked = calls >= 2 && waitOver;

  return (
    <RiderScreen
      header={header}
      testID="rider-deliver"
      footer={
        <BottomAction
          label={t.delivered}
          disabled={otp.length !== 4}
          testID="rider-delivered"
          onPress={() => run('delivered', 'DELIVERED', {method: 'OTP', otp, fix})}
        />
      }>
      {syncNote}
      {customerCard}
      {dropDistance !== null ? (
        <Badge
          label={dropDistance <= NEAR_DROP_M ? t.nearDrop : t.farDrop(formatKm(dropDistance))}
          tone={dropDistance <= NEAR_DROP_M ? 'success' : 'warning'}
        />
      ) : null}
      <Card>
        <Value>{t.otpTitle}</Value>
        <InputField
          label={t.otpLabel}
          value={otp}
          onChangeText={value => setOtp(value.replace(/\D/g, '').slice(0, 4))}
          keyboardType="number-pad"
          maxLength={4}
          testID="rider-otp-input"
        />
        {isDemo ? <Label>{t.demoOtp(DEMO_OTP)}</Label> : null}
      </Card>
      {contactButtons}
      {unreachableFrom === null ? (
        <Button label={t.unreachable} variant="ghost" onPress={() => setUnreachableFrom(Date.now())} testID="rider-unreachable" />
      ) : (
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

const styles = StyleSheet.create({
  bigCode: {
    fontSize: 48,
    fontWeight: fontWeight.extrabold,
    letterSpacing: 2,
    color: colors.textPrimary,
    paddingVertical: spacing.xs,
  },
});
