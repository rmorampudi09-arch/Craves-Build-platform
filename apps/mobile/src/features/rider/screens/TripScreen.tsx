import React, {useCallback, useEffect, useState} from 'react';
import {useQueryClient} from '@tanstack/react-query';
import type {DeliverBody, FailBody, Trip, TripAction} from '../api/contract';
import {idempotencyKey} from '../api/riderApi';
import {BottomAction} from '../components/BottomAction';
import {RiderHeader} from '../components/RiderHeader';
import {CardsSkeleton, ProblemCard} from '../components/StateCard';
import {RiderScreen, Title} from '../components/ui';
import {useRiderShell, type RiderScreenProps} from '../navigation';
import {riderOnlineService} from '../native/riderOnlineService';
import {riderKeys, useActiveTrip, useRiderMe} from '../state/riderQueries';
import {displayedStep} from '../domain/tripSteps';
import {tripQueue, usePendingEntries} from '../state/tripQueue';
import {useStrings} from '../strings/StringsProvider';
import {Deliver, ToCustomer, type OtpError} from './trip/Dropoff';
import {NotAnswering} from './trip/NotAnswering';
import {call} from './trip/parts';
import {AtKitchen, ToKitchen} from './trip/Pickup';
import {TripEnd} from './trip/TripEnd';

export function TripScreen({navigation}: RiderScreenProps<'Trip'>) {
  const {strings} = useStrings();
  const t = strings.trip;
  const {riderId} = useRiderShell();
  const queryClient = useQueryClient();
  const active = useActiveTrip();
  const supportPhone = useRiderMe().data?.supportPhone;
  // Keep the last trip we saw: once it ends the server may stop returning it.
  const [trip, setTrip] = useState<Trip | null>(active.data ?? null);
  const [otp, setOtp] = useState('');
  const [otpError, setOtpError] = useState<OtpError | null>(null);
  const [notAnswering, setNotAnswering] = useState(false);
  // When the rider tapped Call at the door; the customer-not-answering steps show each time.
  const [callTimes, setCallTimes] = useState<number[]>([]);
  const [photoDelivery, setPhotoDelivery] = useState(false);
  // Steps whose first try is over and still wait: the screen shows where they lead. A step on its first try shows when
  // the server answers (its button is busy), so a delivery code is never "saved" while it is being checked.
  const queued = usePendingEntries(riderId, trip?.tripId).filter(e => e.deferred);
  const pending = queued.length;

  useEffect(() => {
    if (active.data) {
      setTrip(active.data);
    }
  }, [active.data]);

  // A wrong or locked OTP shows by the boxes, also when the queue replays a code sent while offline. A replayed step
  // that went through brings the server's trip before it leaves the queue, so the step on screen never goes back.
  const tripId = trip?.tripId;
  useEffect(() => {
    const offSent = tripQueue.onSent((entry, sent) => {
      if (entry.tripId === tripId) {
        setTrip(sent);
      }
    });
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
      offSent();
      off();
    };
  }, [tripId]);

  // Stable, so the not-answering view keeps one system Back listener.
  const showDeliver = useCallback(() => setNotAnswering(false), []);

  if (!trip) {
    if (active.isLoading) {
      return (
        <RiderScreen header={<RiderHeader />} testID="rider-trip-loading">
          <CardsSkeleton cards={3} />
        </RiderScreen>
      );
    }
    if (active.isError) {
      // Steps already tapped stay queued on the phone and go when it reaches Craves; the trip just can't be shown yet.
      return (
        <RiderScreen header={<RiderHeader />} testID="rider-trip-error">
          <ProblemCard error={active.error} onRetry={() => active.refetch()} testID="rider-trip-problem" />
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

  // The server's step with this trip's queued steps applied: a restart opens where the rider left off (blueprint A3).
  const step = displayedStep(trip.step, queued);

  /** Sends a step through the offline queue; false when the server refused it. A queued step shows at once (the queue's entries). */
  async function run(action: TripAction, body?: DeliverBody | FailBody): Promise<boolean> {
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
      // When and where the rider tapped: the server counts the step from then, even if it syncs much later.
      occurredAt: Date.now(),
      fix: riderOnlineService.lastFix(),
    });
    if (outcome.kind === 'sent') {
      queryClient.setQueryData(riderKeys.activeTrip, outcome.trip);
      setTrip(outcome.trip);
    }
    return outcome.kind !== 'rejected';
  }

  function backToWaiting() {
    queryClient.setQueryData(riderKeys.activeTrip, null);
    queryClient.invalidateQueries({queryKey: riderKeys.all});
    navigation.popTo('Tabs');
  }

  if (step === 'DELIVERED' || step === 'FAILED' || step === 'CANCELLED') {
    return (
      <TripEnd
        trip={trip}
        step={step}
        syncing={pending > 0}
        otpWaiting={queued.some(e => e.action === 'delivered' && (e.body as DeliverBody | undefined)?.method === 'OTP')}
        photoDelivery={photoDelivery}
        onReport={() => navigation.navigate('TripDetail', {tripId: trip.tripId})}
        onBack={backToWaiting}
      />
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
  const callCustomer = () => {
    setCallTimes(list => [...list, Date.now()]);
    call(trip.customer.phone);
  };

  if (notAnswering) {
    return (
      <NotAnswering
        trip={trip}
        run={run}
        syncing={pending > 0}
        callTimes={callTimes}
        onCall={callCustomer}
        supportPhone={supportPhone}
        otpLocked={otpError?.lockedMessage !== undefined}
        onBack={showDeliver}
        onPhotoSent={() => setPhotoDelivery(true)}
      />
    );
  }

  return (
    <Deliver
      trip={trip}
      run={run}
      syncing={pending > 0}
      otp={otp}
      setOtp={setOtp}
      otpError={otpError}
      onCall={callCustomer}
      onNotAnswering={() => setNotAnswering(true)}
    />
  );
}
