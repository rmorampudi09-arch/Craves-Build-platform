import React, {memo, useEffect, useRef, useState} from 'react';
import {AccessibilityInfo, BackHandler, ScrollView, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useQueryClient} from '@tanstack/react-query';
import {borderWidth, font, radius, spacing, themedStyles, typography} from '../theme';
import {AppApiError} from '../../../core/http/apiError';
import {idempotencyKey, riderApi} from '../api/riderApi';
import {Banner} from '../components/Banner';
import {BottomAction} from '../components/BottomAction';
import {CountdownBar} from '../components/CountdownBar';
import {OfferMap} from '../components/OfferMap';
import {OfflineBanner} from '../components/OfflineBanner';
import {PhasePanel} from '../components/PhasePanel';
import {RateRow} from '../components/ui';
import {formatClock, formatKm, formatRupees} from '../domain/format';
import {whyHome, whyOffer} from '../domain/offerRules';
import {offerDeadlineMs, secondsLeft} from '../domain/offerTiming';
import {problemOf, riderMessage} from '../domain/problem';
import {riderOnlineService} from '../native/riderOnlineService';
import {payLabel} from './TripDetailScreen';
import {useRiderShell, type RiderScreenProps} from '../navigation';
import {riderKeys} from '../state/riderQueries';
import {useStrings} from '../strings/StringsProvider';

const CLOSE_AFTER_MS = 2000;
const ANNOUNCE_AT = [30, 20, 10, 5];

/** Only this leaf re-renders each second. TalkBack hears it at 30, 20, 10 and 5 s, not every tick. */
const SecondsLeft = memo(function SecondsLeftView({deadline, label}: {deadline: number; label: (s: number) => string}) {
  const [now, setNow] = useState(Date.now());
  const seconds = Math.max(0, Math.ceil((deadline - now) / 1000));
  const previous = useRef(seconds);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    // A tick can skip a second, so announce on crossing a mark rather than on hitting it.
    const crossed = ANNOUNCE_AT.some(mark => seconds <= mark && previous.current > mark);
    previous.current = seconds;
    if (crossed) {
      AccessibilityInfo.announceForAccessibility(label(seconds));
    }
  }, [seconds, label]);
  return <Text style={styles.heading}>{label(seconds)}</Text>;
});

/**
 * The ringing offer (REDESIGN.md, Offer and OfferNext): locked pay first, the trip in rows, why it came, and a free decline.
 * A next-order offer (afterTrip) shows the current trip on top and starts after its drop.
 */
export function OfferScreen({route, navigation}: RiderScreenProps<'Offer'>) {
  const {strings, language} = useStrings();
  const o = strings.offer;
  const {riderId} = useRiderShell();
  const queryClient = useQueryClient();
  const {offer} = route.params;
  const deadline = offerDeadlineMs(route.params);
  const [ended, setEnded] = useState<string | null>(null);
  // Accept or Decline on its way: the other one waits, so one tap can't follow the other (each button holds its own repeats).
  const [answering, setAnswering] = useState<'accept' | 'decline' | null>(null);
  // An accept that got no answer: the offer stays open and both buttons come back (a repeated accept gets the same trip).
  const [failed, setFailed] = useState<string | null>(null);

  // A newer offer can replace this one on the same screen; start it fresh.
  useEffect(() => {
    setEnded(null);
    setAnswering(null);
    setFailed(null);
  }, [offer.offerId]);

  // The phone rings until the rider answers; the screen closing (accepted, declined, ended) stops it too.
  useEffect(() => () => riderOnlineService.stopRinging(offer.offerId), [offer.offerId]);

  // Like an incoming call: Back never drops a live offer by accident (it couldn't be opened again); Accept or Decline
  // decide, and once the offer has ended, Back closes the screen.
  useEffect(() => {
    if (ended) {
      return;
    }
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => subscription.remove();
  }, [ended]);

  useEffect(() => {
    const expiry = setTimeout(() => setEnded(o.expired), Math.max(0, deadline - Date.now()));
    return () => clearTimeout(expiry);
  }, [deadline, o.expired]);

  useEffect(() => {
    if (!ended) {
      return;
    }
    AccessibilityInfo.announceForAccessibility(ended);
    const close = setTimeout(() => navigation.goBack(), CLOSE_AFTER_MS);
    return () => clearTimeout(close);
  }, [ended, navigation]);

  async function accept() {
    if (secondsLeft(route.params, Date.now()) <= 0) {
      setEnded(o.expired);
      return;
    }
    setAnswering('accept');
    setFailed(null);
    riderOnlineService.stopRinging(offer.offerId);
    try {
      const trip = await riderApi.acceptOffer(offer.offerId, idempotencyKey('accept', offer.offerId, riderId));
      queryClient.setQueryData(riderKeys.activeTrip, trip);
      queryClient.invalidateQueries({queryKey: riderKeys.home});
      navigation.replace('Trip');
    } catch (error) {
      setAnswering(null);
      const code = error instanceof AppApiError ? error.code : undefined;
      if (code === 'OFFER_TAKEN') {
        setEnded(o.taken);
      } else if (code === 'OFFER_EXPIRED' || code === 'OFFER_NOT_FOUND' || (error instanceof AppApiError && error.status === 410)) {
        setEnded(o.expired);
      } else {
        // No answer, or another refusal (a trip in progress, an inactive account): the server may have assigned the
        // trip anyway, so Home re-checks; the rider reads why in their own language. Only a refusal ends the offer.
        queryClient.invalidateQueries({queryKey: riderKeys.activeTrip});
        queryClient.invalidateQueries({queryKey: riderKeys.home});
        const problem = problemOf(error);
        if (problem === 'offline' || problem === 'unavailable') {
          setFailed(riderMessage(error, strings, language));
        } else {
          setEnded(riderMessage(error, strings, language));
        }
      }
    }
  }

  function decline() {
    setAnswering('decline');
    riderApi.declineOffer(offer.offerId, idempotencyKey('decline', offer.offerId, riderId)).catch(() => undefined);
    navigation.goBack();
  }

  const pay = formatRupees(offer.payPaise);
  // The server's own breakdown, joined into one sentence; the app adds nothing up.
  const parts = offer.payLines.map(line => `${formatRupees(line.amountPaise)} ${payLabel(line, strings.pay.offer, language)}`).join(' + ');
  const next = offer.afterTrip;
  const kitchen = offer.kitchenName ?? offer.kitchenArea;
  const pickupKm = formatKm(offer.pickupDistanceM);
  // The reason, as drawn: the rule in one line, plus "only you" when nobody else is asked, or the next-order wording.
  const why = next ? o.whyNext : [whyOffer(offer.reason, o), offer.reason?.atOnce === 1 ? o.onlyYou : null].filter(Boolean).join(' ');
  const home = whyHome(offer.reason, o);
  // The two legs on their phase panels (peach to the kitchen, mint to the customer), then the times in rows.
  const toKitchen = offer.pickupMinutes == null ? pickupKm : o.kmMinutes(pickupKm, offer.pickupMinutes);
  const toCustomer = `${formatKm(offer.dropDistanceM)} · ${offer.customerLocality}`;
  const rows: [string, string][] = next
    ? next.foodReadyAt
      ? [[o.foodReadyAt, o.readyWhenArrive(formatClock(next.foodReadyAt))]]
      : []
    : [
        ...(offer.foodReadyInMinutes == null ? [] : [[o.foodReadyIn, o.aboutMinutes(offer.foodReadyInMinutes)] as [string, string]]),
        [o.wholeTrip, o.aboutMinutes(offer.estMinutes)],
      ];

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.screen} testID="rider-offer">
      <OfflineBanner />
      {next ? (
        <View style={styles.currentTrip} testID="rider-offer-current-trip">
          <Text style={styles.currentTripLabel}>{o.currentTrip(next.dropLocality)}</Text>
          <Text style={styles.currentTripValue}>{o.minutesToDrop(next.dropMinutes)}</Text>
        </View>
      ) : null}
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.titleRow}>
          <Text accessibilityRole="header" style={[styles.secondary, styles.flex]}>
            {next ? o.nextTitle : o.titleFor(kitchen)}
          </Text>
          {ended ? null : <SecondsLeft deadline={deadline} label={o.secondsLeft} />}
        </View>
        <CountdownBar deadlineMs={deadline} totalMs={offer.expiresInSec * 1000} testID="rider-offer-countdown" />
        {ended ? <Banner tone="info" text={ended} testID="rider-offer-ended" /> : null}
        <View accessible accessibilityLabel={`${o.atLeast} ${pay}. ${o.locked} ${parts}`} style={styles.pay}>
          <Text style={styles.payHero} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5} testID="rider-offer-pay">
            {pay}
          </Text>
          <Text style={styles.secondary}>{next ? o.fromDrop(kitchen, pickupKm) : o.locked}</Text>
          {parts ? <Text style={styles.small}>{parts}</Text> : null}
        </View>
        <View style={styles.legs}>
          <PhasePanel phase="kitchen" verb={next ? o.fromDropToKitchen : o.toKitchen} name={toKitchen} testID="rider-offer-kitchen" />
          <PhasePanel phase="customer" verb={o.toCustomer} name={toCustomer} testID="rider-offer-customer" />
        </View>
        <OfferMap key={offer.offerId} kitchen={offer.kitchenAt} customerArea={offer.customerAreaAt} label={o.mapLabel} />
        {rows.length ? (
          <View style={styles.rows}>
            {rows.map(([label, value]) => (
              <RateRow key={label} label={label} value={value} />
            ))}
          </View>
        ) : null}
        {why ? (
          <View style={styles.whyCard}>
            <Text style={styles.why} testID="rider-offer-why">
              {why}
            </Text>
          </View>
        ) : null}
        {home ? (
          <Text style={styles.secondary} testID="rider-offer-home">
            {home}
          </Text>
        ) : null}
        <View style={styles.push} />
      </ScrollView>
      {ended ? null : (
        <View style={styles.footer}>
          {failed ? <Banner tone="warning" text={failed} testID="rider-offer-failed" /> : null}
          <BottomAction
            label={next ? o.takeAfterDrop : o.accept}
            size="tall"
            onPress={accept}
            disabled={answering === 'decline'}
            testID="rider-offer-accept"
          />
          <BottomAction
            label={o.decline}
            variant="outline"
            onPress={decline}
            disabled={answering === 'accept'}
            testID="rider-offer-decline"
          />
          <Text style={styles.note}>{next ? o.freeDeclineNext : o.freeDecline}</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = themedStyles(c => ({
  screen: {flex: 1, backgroundColor: c.ground},
  content: {flexGrow: 1, gap: spacing.md, padding: spacing.md},
  flex: {flex: 1},
  titleRow: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm},
  pay: {marginTop: spacing.xs, gap: spacing.xxs},
  // The one 84 sp number in the app: the locked pay, in Barlow Condensed so ₹1,240 still fits a 360 dp phone.
  payHero: {fontFamily: font.display, fontSize: typography.pay, color: c.textPrimary, fontVariant: ['tabular-nums']},
  legs: {gap: spacing.xs},
  rows: {gap: spacing.xs, padding: spacing.md, borderRadius: radius.lg, backgroundColor: c.surface},
  whyCard: {backgroundColor: c.surface, borderRadius: radius.lg, padding: spacing.md},
  why: {fontFamily: font.regular, fontSize: typography.body, color: c.textSecondary},
  // The trip still under way, above a next-order offer: the inverse strip, dark by day and light by night.
  currentTrip: {backgroundColor: c.inverse, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.xxs},
  currentTripLabel: {fontFamily: font.regular, fontSize: typography.small, color: c.onInverse},
  currentTripValue: {fontSize: typography.heading, fontFamily: font.bold, color: c.onInverse},
  push: {flexGrow: 1},
  heading: {fontSize: typography.heading, fontFamily: font.bold, color: c.textPrimary, fontVariant: ['tabular-nums']},
  secondary: {fontFamily: font.regular, fontSize: typography.body, color: c.textSecondary},
  small: {fontFamily: font.regular, fontSize: typography.small, color: c.textSecondary},
  note: {fontFamily: font.regular, fontSize: typography.small, color: c.textSecondary, textAlign: 'center'},
  footer: {
    padding: spacing.md,
    gap: spacing.xs,
    borderTopWidth: borderWidth.standard,
    borderTopColor: c.border,
    backgroundColor: c.surface,
  },
}));
