// Steps 1 and 2 of the trip: ride to the kitchen, then collect the bag (docs/riders/SCREENS.md 9 and 10).
import React, {memo, useEffect, useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {Icon} from '../../../../shared/components';
import {colors, iconSize, radius, spacing} from '../../../../design/tokens';
import {BottomAction} from '../../components/BottomAction';
import {CountdownBar} from '../../components/CountdownBar';
import {Card, HeroCard, RiderScreen} from '../../components/ui';
import {formatRupees, formatTimer} from '../../domain/format';
import {useStrings} from '../../strings/StringsProvider';
import {call, navigateTo, OrderCard, PlaceCard, SyncNote, text, TripHeader, TwoUp, type StepProps} from './parts';

// Rider-only type size (DESIGN.md typography.orderCode).
const ORDER_CODE_SIZE = 60;

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

export function AtKitchen({trip, run, syncing}: StepProps) {
  const t = useStrings().strings.trip;
  const [shownAt] = useState(Date.now);
  const [lateSent, setLateSent] = useState(false);
  // The free wait runs from the later of arrival and the chef's ready time; before ready it has not started.
  const arrival = trip.arrivedKitchenAt ? Date.parse(trip.arrivedKitchenAt) : shownAt;
  const ready = trip.chefReadyAt ? Date.parse(trip.chefReadyAt) : null;

  return (
    <RiderScreen
      header={<TripHeader title={t.titles.AT_KITCHEN} trip={trip} step={2} />}
      testID="rider-pickup-check"
      footer={<BottomAction label={t.pickedUp} onPress={() => run('picked-up', 'PICKED_UP')} testID="rider-picked-up" />}>
      <SyncNote show={syncing} />
      <HeroCard style={styles.codeCard}>
        <Text style={[text.body, text.secondary, text.center]}>{t.matchCode}</Text>
        <Text
          accessibilityLabel={t.codeA11y(trip.orderCode.split('').join(' '))}
          adjustsFontSizeToFit
          minimumFontScale={0.5}
          numberOfLines={1}
          style={styles.code}
          testID="rider-order-code">
          {trip.orderCode}
        </Text>
        <Text style={[text.body, text.center]}>{t.itemsFrom(trip.itemsCount, trip.kitchen.kitchenName)}</Text>
      </HeroCard>
      {trip.sealed ? (
        <View accessible style={styles.sealed} testID="rider-sealed">
          <View style={styles.tick}>
            <Icon name="check" size={iconSize.xs} color={colors.white} surface={false} />
          </View>
          <View style={styles.flex}>
            <Text style={[text.body, text.bold]}>{t.sealedTitle}</Text>
            <Text style={text.small}>{t.sealedNote}</Text>
          </View>
        </View>
      ) : null}
      <FreeWait
        startMs={ready === null ? null : Math.max(arrival, ready)}
        seconds={trip.waitFreeSeconds}
        ratePaise={trip.waitPayPerMinutePaise}
        fromReady={ready !== null && ready > arrival}
      />
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
              label={t.foodNotReady}
              variant="outline"
              disabled={lateSent}
              onPress={async () => setLateSent(await run('food-not-ready', null))}
              testID="rider-food-not-ready"
            />
          }
        />
        {lateSent ? <Text style={text.small}>{t.foodNotReadySent}</Text> : null}
      </View>
    </RiderScreen>
  );
}

/** The free-wait card. Only this leaf ticks, once a second, so the screen above never re-renders. */
const FreeWait = memo(function FreeWaitView({
  startMs,
  seconds,
  ratePaise,
  fromReady,
}: {
  startMs: number | null;
  seconds: number;
  ratePaise?: number;
  fromReady: boolean;
}) {
  const t = useStrings().strings.trip;
  const [now, setNow] = useState(Date.now);
  const deadline = startMs === null ? null : startMs + seconds * 1000;
  const running = deadline !== null && now < deadline;

  useEffect(() => {
    if (!running) {
      return undefined;
    }
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running]);

  const rate = ratePaise === undefined ? undefined : formatRupees(ratePaise);
  const left = deadline === null ? 0 : (deadline - now) / 1000;
  const title = deadline === null ? t.freeWaitNotStarted : running ? t.freeWaitLeft(formatTimer(left)) : t.waitPaid;
  const body =
    deadline === null
      ? t.waitThen(rate)
      : running
        ? `${t.waitThen(rate)} ${fromReady ? t.timerFromReady : t.timerFromArrival}`
        : t.waitNow(rate);

  return (
    <Card>
      <View style={styles.timerRow}>
        <Icon name="clock-outline" size={iconSize.lg} color={colors.textPrimary} surface={false} />
        <Text
          // TalkBack hears whole minutes, not a new number every second.
          accessibilityLabel={running ? t.freeWaitLeftA11y(Math.ceil(left / 60)) : title}
          style={[text.heading, styles.flex, styles.tabular]}
          testID="rider-free-wait">
          {title}
        </Text>
      </View>
      {deadline !== null ? <CountdownBar deadlineMs={deadline} totalMs={seconds * 1000} variant="wait" /> : null}
      <Text style={[text.body, text.secondary]}>{body}</Text>
    </Card>
  );
});

const styles = StyleSheet.create({
  tight: {gap: spacing.xs},
  flex: {flex: 1},
  codeCard: {paddingVertical: spacing.lg, gap: spacing.xxs},
  code: {
    fontSize: ORDER_CODE_SIZE,
    fontWeight: '900',
    letterSpacing: 2,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  sealed: {flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, paddingHorizontal: spacing.xxs},
  tick: {
    width: iconSize.lg,
    height: iconSize.lg,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.success,
  },
  timerRow: {flexDirection: 'row', alignItems: 'center', gap: spacing.xs},
  tabular: {fontVariant: ['tabular-nums']},
});
