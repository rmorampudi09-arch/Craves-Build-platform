import React, {memo, useEffect, useRef, useState} from 'react';
import {AccessibilityInfo, ScrollView, StyleSheet, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useQueryClient} from '@tanstack/react-query';
import {Icon} from '../../../shared/components';
import {borderWidth, colors, fontWeight, iconSize, spacing, typography} from '../../../design/tokens';
import {AppApiError} from '../../../core/http/apiError';
import {idempotencyKey, riderApi} from '../api/riderApi';
import {Banner} from '../components/Banner';
import {BottomAction} from '../components/BottomAction';
import {CountdownBar} from '../components/CountdownBar';
import {Card} from '../components/ui';
import {formatKm, formatRupees} from '../domain/format';
import {whyOffer} from '../domain/offerRules';
import {offerDeadlineMs, secondsLeft} from '../domain/offerTiming';
import {useRiderShell, type RiderScreenProps} from '../navigation';
import {riderKeys} from '../state/riderQueries';
import {useStrings} from '../strings/StringsProvider';

const CLOSE_AFTER_MS = 2000;
const ANNOUNCE_AT = [30, 20, 10, 5];
/** The one 72 sp, weight 900 number in the app: the locked pay (DESIGN.md offerPay). */
const OFFER_PAY = {fontSize: 72, fontWeight: '900'} as const;

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

/** The ringing offer (08-Offer.png): locked pay first, distances, route, and a free decline. */
export function OfferScreen({route, navigation}: RiderScreenProps<'Offer'>) {
  const {strings} = useStrings();
  const o = strings.offer;
  const {riderId} = useRiderShell();
  const queryClient = useQueryClient();
  const {offer} = route.params;
  const deadline = offerDeadlineMs(route.params);
  const [ended, setEnded] = useState<string | null>(null);

  // A newer offer can replace this one on the same screen; start it fresh.
  useEffect(() => setEnded(null), [offer.offerId]);

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
    try {
      const trip = await riderApi.acceptOffer(offer.offerId, idempotencyKey('accept', offer.offerId, riderId));
      queryClient.setQueryData(riderKeys.activeTrip, trip);
      queryClient.invalidateQueries({queryKey: riderKeys.home});
      navigation.replace('Trip');
    } catch (error) {
      const status = error instanceof AppApiError ? error.status : undefined;
      if (status === 409) {
        // Other 409s (e.g. TRIP_IN_PROGRESS) carry the server's own words.
        setEnded(error instanceof AppApiError && error.code !== 'OFFER_TAKEN' ? error.message : o.taken);
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

  const pay = formatRupees(offer.payPaise);
  // The server's own breakdown, joined into one sentence; the app adds nothing up.
  const parts = offer.payLines.map(line => `${formatRupees(line.amountPaise)} ${line.label}`).join(' + ');
  const breakdown = parts ? `${parts}. ${o.locked}` : o.locked;
  const why = whyOffer(offer.reason, o);

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.screen} testID="rider-offer">
      <ScrollView contentContainerStyle={styles.content}>
        <CountdownBar deadlineMs={deadline} totalMs={offer.expiresInSec * 1000} testID="rider-offer-countdown" />
        <View style={styles.titleRow}>
          <Text accessibilityRole="header" style={[styles.heading, styles.flex]}>
            {o.title}
          </Text>
          {ended ? null : <SecondsLeft deadline={deadline} label={o.secondsLeft} />}
        </View>
        {ended ? <Banner tone="info" text={ended} testID="rider-offer-ended" /> : null}
        <View accessible accessibilityLabel={`${o.atLeast} ${pay}. ${breakdown}`} style={styles.pay}>
          <Text style={styles.secondary}>{o.atLeast}</Text>
          <Text style={styles.payHero} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5} testID="rider-offer-pay">
            {pay}
          </Text>
          <Text style={styles.small}>{breakdown}</Text>
        </View>
        <View style={styles.distances}>
          <Card style={styles.flex}>
            <Text style={styles.small}>{o.toKitchen}</Text>
            <Text style={styles.hero}>{formatKm(offer.pickupDistanceM)}</Text>
          </Card>
          <Card style={styles.flex}>
            <Text style={styles.small}>{o.toCustomer}</Text>
            <Text style={styles.hero}>{formatKm(offer.dropDistanceM)}</Text>
          </Card>
        </View>
        <Card>
          <View accessible accessibilityLabel={o.route(offer.kitchenArea, offer.customerLocality)} style={styles.route}>
            <Text style={styles.heading}>{offer.kitchenArea}</Text>
            <Icon name="arrow-right" size={iconSize.sm} color={colors.textSecondary} surface={false} />
            <Text style={styles.heading}>{offer.customerLocality}</Text>
          </View>
          <Text style={styles.secondary}>{o.total(offer.estMinutes, offer.itemsCount)}</Text>
        </Card>
        <View style={styles.push} />
        {why ? (
          <Text style={styles.secondary} testID="rider-offer-why">
            {why}
          </Text>
        ) : null}
        <Text style={styles.note}>{o.freeDecline}</Text>
      </ScrollView>
      {ended ? null : (
        <View style={styles.footer}>
          <BottomAction label={o.accept} size="tall" onPress={accept} testID="rider-offer-accept" />
          <BottomAction label={o.decline} variant="outline" onPress={decline} testID="rider-offer-decline" />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.white},
  content: {flexGrow: 1, gap: spacing.md, padding: spacing.md},
  flex: {flex: 1},
  titleRow: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: -spacing.xxs},
  pay: {marginTop: spacing.xs},
  payHero: {...OFFER_PAY, color: colors.textPrimary, fontVariant: ['tabular-nums']},
  distances: {flexDirection: 'row', gap: spacing.sm},
  route: {flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.xs},
  push: {flexGrow: 1},
  heading: {fontSize: typography.heading, fontWeight: fontWeight.bold, color: colors.textPrimary, fontVariant: ['tabular-nums']},
  hero: {fontSize: typography.hero, fontWeight: fontWeight.bold, color: colors.textPrimary},
  secondary: {fontSize: typography.body, color: colors.textSecondary},
  small: {fontSize: typography.small, color: colors.textSecondary},
  note: {fontSize: typography.body, color: colors.textPrimary, textAlign: 'center'},
  footer: {
    padding: spacing.md,
    gap: spacing.xs,
    borderTopWidth: borderWidth.standard,
    borderTopColor: colors.border,
    backgroundColor: colors.white,
  },
});
