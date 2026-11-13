// Steps 1 and 2 of the trip: ride to the kitchen, then collect the bag (docs/riders/SCREENS.md 9 and 10).
import React, {memo, useEffect, useState} from 'react';
import {Modal, Pressable, Text, View} from 'react-native';
import {Icon} from '../../../../shared/components';
import {colors, font, iconSize, radius, spacing, themedStyles, typography} from '../../theme';
import type {Trip} from '../../api/contract';
import {BottomAction} from '../../components/BottomAction';
import {CountdownBar} from '../../components/CountdownBar';
import {RefusalNotices} from '../../components/RefusalNotices';
import {SlideToConfirm} from '../../components/SlideToConfirm';
import {Card, RiderScreen} from '../../components/ui';
import {formatClock, formatOrderCode, formatRupees, formatTimer} from '../../domain/format';
import type {ReachedPrompt} from '../../native/riderOnlineService';
import {useStrings} from '../../strings/StringsProvider';
import {call, distanceLine, navigateTo, PlaceCard, SyncNote, text, TripHeader, TripRows, TwoUp, type StepProps} from './parts';

export function ToKitchen({trip, run, syncing, reached, onNotYet}: StepProps & {reached?: ReachedPrompt | null; onNotYet?: () => void}) {
  const t = useStrings().strings.trip;
  // Yes on the heads-up (Google Maps in front) is already the answer: post the step, no sheet.
  useEffect(() => {
    if (reached?.yes) {
      run('arrived-pickup');
    }
  }, [reached, run]);
  const distance = distanceLine(trip.pickupDistanceM, trip.kitchen, t);
  const rows: [string, string][] = [[t.foodReady, trip.chefReadyAt ? t.aboutClock(formatClock(trip.chefReadyAt)) : t.foodReadyUnknown]];
  return (
    <RiderScreen
      header={<TripHeader title={t.orderTitle(trip.orderCode)} trip={trip} step={1} />}
      testID="rider-to-kitchen"
      footer={
        <View style={styles.tight}>
          <SlideToConfirm label={t.reachedKitchen} onConfirm={() => run('arrived-pickup')} testID="rider-reached-kitchen" />
          <Text style={[text.small, text.center]}>{t.askNote}</Text>
        </View>
      }>
      {reached && !reached.yes ? (
        <Modal transparent animationType="slide" onRequestClose={onNotYet} testID="rider-reached-sheet">
          <View style={styles.sheetBack}>
            <View style={styles.sheet}>
              <View style={styles.grip} />
              <Text accessibilityRole="header" style={styles.sheetTitle}>
                {t.reachedTitle(reached.kitchenName || trip.kitchen.kitchenName)}
              </Text>
              <Text style={text.body}>
                {t.reachedBody(reached.distanceM)}
                {trip.waitPayPerMinutePaise ? ` ${t.reachedFreeWait(Math.round(trip.waitFreeSeconds / 60), formatRupees(trip.waitPayPerMinutePaise))}` : ''}
              </Text>
              {trip.chefReadyAt ? <TripRows rows={[[t.foodReady, t.aboutClock(formatClock(trip.chefReadyAt))]]} /> : null}
              <BottomAction label={t.reachedYes} onPress={() => run('arrived-pickup')} testID="rider-reached-yes" />
              <BottomAction label={t.reachedNotYet} variant="outline" onPress={() => onNotYet?.()} testID="rider-reached-not-yet" />
              <Text style={[text.small, styles.center]}>{t.reachedNotYetNote}</Text>
            </View>
          </View>
        </Modal>
      ) : null}
      <Text style={text.small}>{t.lockedWith(formatRupees(trip.payPaise), trip.kitchen.kitchenName)}</Text>
      <SyncNote show={syncing} />
      <RefusalNotices tripId={trip.tripId} />
      <PlaceCard label={t.rideTo} name={trip.kitchen.kitchenName} place={trip.kitchen} phase="kitchen" distance={distance} />
      <TripRows rows={rows} />
      <View style={styles.tight}>
        <TwoUp
          left={
            <BottomAction
              label={t.navigate}
              variant="outline"
              leftIcon="navigation-variant-outline"
              accessibilityHint={t.navigateNote}
              onPress={() => navigateTo(trip.kitchen)}
              testID="rider-navigate"
            />
          }
          right={
            <BottomAction
              label={t.callChef}
              variant="outline"
              leftIcon="phone-outline"
              onPress={() => call(trip.kitchen.chefPhone)}
              testID="rider-call-chef"
            />
          }
        />
        <Text style={text.small}>{t.navigateNote}</Text>
      </View>
    </RiderScreen>
  );
}

/** A tick the rider gives themselves at the kitchen (the bag, the count); it never holds up "Picked up". */
function Check({label, checked, onToggle, testID}: {label: string; checked: boolean; onToggle: () => void; testID: string}) {
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{checked}} onPress={onToggle} style={styles.check} testID={testID}>
      <View style={[styles.box, checked && styles.boxOn]}>
        {checked ? <Icon name="check" size={iconSize.xs} color={colors.onInverse} surface={false} /> : null}
      </View>
      <Text style={[text.body, styles.flex]}>{label}</Text>
    </Pressable>
  );
}

export function AtKitchen({trip, run, syncing}: StepProps) {
  const t = useStrings().strings.trip;
  const [shownAt] = useState(Date.now);
  const [lateSent, setLateSent] = useState(false);
  const [bagChecked, setBagChecked] = useState(false);
  const [countChecked, setCountChecked] = useState(false);
  // The free wait runs from the later of arrival and the chef's ready time; before ready it has not started.
  const arrival = trip.arrivedKitchenAt ? Date.parse(trip.arrivedKitchenAt) : shownAt;
  const ready = trip.chefReadyAt ? Date.parse(trip.chefReadyAt) : null;

  return (
    <RiderScreen
      header={<TripHeader title={trip.kitchen.kitchenName} trip={trip} step={2} />}
      testID="rider-pickup-check"
      footer={
        <View style={styles.tight}>
          <SlideToConfirm label={t.pickedUp} onConfirm={() => run('picked-up')} testID="rider-picked-up" />
          <Text style={[text.small, text.center]}>{t.worksOffline}</Text>
        </View>
      }>
      <Text style={text.small}>{t.lockedPay(formatRupees(trip.payPaise))}</Text>
      <SyncNote show={syncing} />
      <RefusalNotices tripId={trip.tripId} />
      <CodeBoard trip={trip} />
      <FreeWait
        since={trip.arrivedKitchenAt ? formatClock(trip.arrivedKitchenAt) : null}
        startMs={ready === null ? null : Math.max(arrival, ready)}
        seconds={trip.waitFreeSeconds}
        ratePaise={trip.waitPayPerMinutePaise}
        fromReady={ready !== null && ready > arrival}
      />
      {trip.sealed ? (
        <View accessible style={styles.sealed} testID="rider-sealed">
          <View style={styles.tick}>
            <Icon name="check" size={iconSize.xs} color={colors.onSuccess} surface={false} />
          </View>
          <View style={styles.flex}>
            <Text style={[text.body, text.bold]}>{t.sealedTitle}</Text>
            <Text style={text.small}>{t.sealedNote}</Text>
          </View>
        </View>
      ) : null}
      <View style={styles.checks}>
        <Check label={t.checkBag(trip.customer.firstName)} checked={bagChecked} onToggle={() => setBagChecked(v => !v)} testID="rider-check-bag" />
        <Check label={t.checkCount(trip.itemsCount)} checked={countChecked} onToggle={() => setCountChecked(v => !v)} testID="rider-check-count" />
      </View>
      <View style={styles.tight}>
        <TwoUp
          left={
            <BottomAction
              label={t.foodNotReady}
              variant="outline"
              disabled={lateSent}
              onPress={async () => setLateSent(await run('food-not-ready'))}
              testID="rider-food-not-ready"
            />
          }
          right={
            <BottomAction
              label={t.callChef}
              variant="outline"
              leftIcon="phone-outline"
              onPress={() => call(trip.kitchen.chefPhone)}
              testID="rider-call-chef"
            />
          }
        />
        {lateSent ? <Text style={text.small}>{t.foodNotReadySent}</Text> : null}
      </View>
    </RiderScreen>
  );
}

/**
 * The kitchen's code board: the order number on the kitchen panel, as the chef's screen shows it, and "Show to chef"
 * for a full-screen copy the chef can read across the counter (tap anywhere to close).
 */
function CodeBoard({trip}: {trip: Trip}) {
  const t = useStrings().strings.trip;
  const [shown, setShown] = useState(false);
  const code = formatOrderCode(trip.orderCode);
  const spelled = t.codeA11y(trip.orderCode.replace(/^#/, '').split('').join(' '));
  const items = t.itemsFor(trip.itemsCount, trip.customer.firstName, trip.customer.area);
  return (
    <View style={styles.board} testID="rider-code-board">
      <Text style={styles.boardAsk}>{t.tellChef}</Text>
      <View style={styles.tile}>
        <Text accessibilityLabel={spelled} adjustsFontSizeToFit minimumFontScale={0.5} numberOfLines={1} style={styles.code} testID="rider-order-code">
          {code}
        </Text>
      </View>
      <Text style={styles.boardItems}>{items}</Text>
      <Pressable accessibilityRole="button" onPress={() => setShown(true)} style={styles.show} testID="rider-show-chef">
        <Icon name="eye" size={iconSize.sm} color={colors.kitchenInk} surface={false} />
        <Text style={styles.showText}>{t.showChef}</Text>
      </Pressable>
      <Modal visible={shown} animationType="none" statusBarTranslucent onRequestClose={() => setShown(false)}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={spelled}
          accessibilityHint={t.showChefNote}
          onPress={() => setShown(false)}
          style={styles.full}
          testID="rider-show-chef-full">
          <Text adjustsFontSizeToFit minimumFontScale={0.3} numberOfLines={1} style={styles.fullCode}>
            {code}
          </Text>
          <Text style={styles.boardItems}>{items}</Text>
          <Text style={styles.fullNote}>{t.showChefNote}</Text>
        </Pressable>
      </Modal>
    </View>
  );
}

/** The free-wait card. Only this leaf ticks, once a second, so the screen above never re-renders. */
const FreeWait = memo(function FreeWaitView({
  since,
  startMs,
  seconds,
  ratePaise,
  fromReady,
}: {
  /** The arrival clock time ("Waiting since 20:10"), once the server has it. */
  since: string | null;
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
      {since ? <Text style={text.small}>{t.waitingSince(since)}</Text> : null}
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

const styles = themedStyles(c => ({
  // The reached sheet, as drawn: white, 28 dp top corners, over a dimmed trip screen.
  sheetBack: {flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(38, 26, 21, 0.5)'},
  sheet: {backgroundColor: c.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: spacing.md, paddingBottom: spacing.lg, gap: spacing.sm},
  grip: {width: 44, height: 5, borderRadius: 3, backgroundColor: c.border, alignSelf: 'center'},
  sheetTitle: {fontSize: 28, lineHeight: 34, fontFamily: font.bold, color: c.textPrimary},
  center: {textAlign: 'center'},
  tight: {gap: spacing.xs},
  flex: {flex: 1},
  // The code board: the kitchen's panel colour, the number on a tile, Barlow Condensed so 8 characters fit at 56.
  board: {alignItems: 'center', gap: 10, padding: spacing.md, borderRadius: 24, backgroundColor: c.kitchen},
  boardAsk: {fontFamily: font.semibold, fontSize: typography.body, color: c.kitchenSub, textAlign: 'center'},
  tile: {alignSelf: 'stretch', paddingHorizontal: spacing.md, paddingVertical: spacing.xxs, borderRadius: 14, backgroundColor: c.tile},
  code: {fontFamily: font.display, fontSize: typography.code, letterSpacing: 3, color: c.kitchenInk, textAlign: 'center', fontVariant: ['tabular-nums']},
  boardItems: {fontFamily: font.regular, fontSize: typography.body, color: c.kitchenInk, textAlign: 'center'},
  show: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: 18,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: c.kitchenInk,
  },
  showText: {fontFamily: font.bold, fontSize: typography.body, color: c.kitchenInk},
  full: {flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl, backgroundColor: c.kitchen},
  fullCode: {alignSelf: 'stretch', fontFamily: font.display, fontSize: 132, letterSpacing: 4, color: c.kitchenInk, textAlign: 'center', fontVariant: ['tabular-nums']},
  fullNote: {fontFamily: font.semibold, fontSize: typography.body, color: c.kitchenSub, textAlign: 'center'},
  checks: {gap: spacing.sm},
  check: {flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, minHeight: 24},
  box: {width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: c.border, alignItems: 'center', justifyContent: 'center'},
  boxOn: {backgroundColor: c.inverse, borderColor: c.inverse},
  sealed: {flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, paddingHorizontal: spacing.xxs},
  tick: {
    width: iconSize.lg,
    height: iconSize.lg,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.success,
  },
  timerRow: {flexDirection: 'row', alignItems: 'center', gap: spacing.xs},
  tabular: {fontVariant: ['tabular-nums']},
}));
