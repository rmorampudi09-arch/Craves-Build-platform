import React, {memo, useEffect, useRef, useState} from 'react';
import {Animated, StyleSheet, Text, View} from 'react-native';
import {useQueryClient} from '@tanstack/react-query';
import {Button} from '../../../shared/components';
import {colors, fontWeight, radius, spacing, typography} from '../../../design/tokens';
import {useReducedMotionPreference} from '../../../design/reducedMotion';
import {AppApiError} from '../../../core/http/apiError';
import {idempotencyKey, riderApi} from '../api/riderApi';
import {BottomAction} from '../components/BottomAction';
import {Body, Card, Label, Money, RiderScreen, Title, Value} from '../components/ui';
import {formatKm} from '../domain/format';
import {offerDeadlineMs, secondsLeft} from '../domain/offerTiming';
import {useRiderShell, type RiderScreenProps} from '../navigation';
import {riderKeys} from '../state/riderQueries';
import {useStrings} from '../strings/StringsProvider';

const CLOSE_AFTER_MS = 2000;

/** Only this leaf re-renders each second. */
const SecondsLeft = memo(function SecondsLeftView({deadline, label}: {deadline: number; label: (s: number) => string}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return <Text style={styles.seconds}>{label(Math.max(0, Math.ceil((deadline - now) / 1000)))}</Text>;
});

export function OfferScreen({route, navigation}: RiderScreenProps<'Offer'>) {
  const {strings} = useStrings();
  const o = strings.offer;
  const {riderId} = useRiderShell();
  const queryClient = useQueryClient();
  const reduceMotion = useReducedMotionPreference();
  const {offer} = route.params;
  const deadline = offerDeadlineMs(route.params);
  const [ended, setEnded] = useState<string | null>(null);
  const progress = useRef(new Animated.Value(1)).current;

  // A newer offer can replace this one on the same screen; start it fresh.
  useEffect(() => setEnded(null), [offer.offerId]);

  // One native-driver animation for the bar; the label above ticks once a second.
  useEffect(() => {
    const leftMs = deadline - Date.now();
    progress.setValue(Math.max(0, leftMs / (offer.expiresInSec * 1000)));
    const animation = Animated.timing(progress, {
      toValue: 0,
      duration: reduceMotion ? 0 : Math.max(0, leftMs),
      useNativeDriver: true,
    });
    animation.start();
    const expiry = setTimeout(() => setEnded(o.expired), Math.max(0, leftMs));
    return () => {
      animation.stop();
      clearTimeout(expiry);
    };
  }, [deadline, offer.expiresInSec, progress, reduceMotion, o.expired]);

  useEffect(() => {
    if (!ended) {
      return;
    }
    const close = setTimeout(() => navigation.goBack(), CLOSE_AFTER_MS);
    return () => clearTimeout(close);
  }, [ended, navigation]);

  async function accept() {
    if (secondsLeft(route.params, Date.now()) <= 0) {
      setEnded(o.expired);
      return;
    }
    try {
      const trip = await riderApi.acceptOffer(offer.offerId, idempotencyKey('accept', offer.offerId, riderId));
      queryClient.setQueryData(riderKeys.activeTrip, trip);
      queryClient.invalidateQueries({queryKey: riderKeys.home});
      navigation.replace('Trip');
    } catch (error) {
      const status = error instanceof AppApiError ? error.status : undefined;
      if (status === 409) {
        setEnded(o.taken);
      } else if (status === 410) {
        setEnded(o.expired);
      } else {
        // No answer: the server may have assigned the trip anyway, so Home re-checks.
        queryClient.invalidateQueries({queryKey: riderKeys.activeTrip});
        queryClient.invalidateQueries({queryKey: riderKeys.home});
        setEnded(strings.common.error);
      }
    }
  }

  function decline() {
    riderApi.declineOffer(offer.offerId, idempotencyKey('decline', offer.offerId, riderId)).catch(() => undefined);
    navigation.goBack();
  }

  return (
    <RiderScreen
      testID="rider-offer"
      footer={
        ended ? null : (
          <>
            <BottomAction label={o.accept} onPress={accept} testID="rider-offer-accept" />
            <Button label={o.decline} variant="outline" onPress={decline} testID="rider-offer-decline" />
          </>
        )
      }>
      <View style={styles.track} accessibilityElementsHidden>
        <Animated.View style={[styles.bar, {transform: [{scaleX: progress}]}]} />
      </View>
      {ended ? (
        <Title>{ended}</Title>
      ) : (
        <SecondsLeft deadline={deadline} label={o.secondsLeft} />
      )}
      <Label>{o.title}</Label>
      <Card>
        <Label>{o.atLeast}</Label>
        <Money paise={offer.payPaise} testID="rider-offer-pay" />
      </Card>
      <View style={styles.distances}>
        <Card style={styles.half}>
          <Label>{o.toKitchen}</Label>
          <Value>{formatKm(offer.pickupDistanceM)}</Value>
        </Card>
        <Card style={styles.half}>
          <Label>{o.toCustomer}</Label>
          <Value>{formatKm(offer.dropDistanceM)}</Value>
        </Card>
      </View>
      <Card>
        <Value>{`${offer.kitchenArea} → ${offer.customerLocality}`}</Value>
        <Label>{o.total(offer.estMinutes)}</Label>
      </Card>
      <Body>{o.freeDecline}</Body>
    </RiderScreen>
  );
}

const styles = StyleSheet.create({
  track: {height: 8, borderRadius: radius.pill, backgroundColor: colors.muted, overflow: 'hidden'},
  bar: {
    height: 8,
    width: '100%',
    backgroundColor: colors.flameRedAccessible,
    transformOrigin: 'left',
  },
  seconds: {fontSize: typography.heading, fontWeight: fontWeight.bold, color: colors.textPrimary},
  distances: {flexDirection: 'row', gap: spacing.sm},
  half: {flex: 1},
});
