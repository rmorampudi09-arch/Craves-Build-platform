import React, {memo, useEffect, useState} from 'react';
import {Alert, StyleSheet, Text, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {useQueryClient} from '@tanstack/react-query';
import {Icon, SectionSkeleton} from '../../../shared/components';
import {colors, fontWeight, iconSize, spacing, typography} from '../../../design/tokens';
import {AppApiError} from '../../../core/http/apiError';
import type {HomeSummary} from '../api/contract';
import {riderApi} from '../api/riderApi';
import {Banner} from '../components/Banner';
import {BottomAction} from '../components/BottomAction';
import {RefusalNotices} from '../components/RefusalNotices';
import {RiderHeader} from '../components/RiderHeader';
import {Card, Money, RiderScreen} from '../components/ui';
import {formatClock, formatRupees} from '../domain/format';
import {riderOnlineService} from '../native/riderOnlineService';
import type {RiderNav} from '../navigation';
import {riderKeys, useActiveTrip, useRiderHome, useRiderMe} from '../state/riderQueries';
import {useStrings} from '../strings/StringsProvider';
import {usePhoneReadiness} from './PhoneSetupScreen';

const ENDED = ['DELIVERED', 'FAILED', 'CANCELLED'];
const two = (n: number) => String(n).padStart(2, '0');

/** "0:42:15": the shift clock always shows hours (07-HomeOnline.png). */
function shiftClock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 3600)}:${two(Math.floor(s / 60) % 60)}:${two(s % 60)}`;
}

/** Only this leaf re-renders each second. */
const ShiftTimer = memo(function ShiftTimerView({startedAt}: {startedAt: string}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <Text style={styles.timer} testID="rider-shift-timer">
      {shiftClock(now - Date.parse(startedAt))}
    </Text>
  );
});

/** Offline (05-HomeOffline.png): today so far, then the next slot and its guaranteed hourly pay from the server. */
function OfflineCards({home}: {home: HomeSummary}) {
  const h = useStrings().strings.home;
  const slot = home.nextSlot;
  return (
    <>
      <Card>
        <Text style={styles.small}>{h.today}</Text>
        <Money paise={home.todayEarningsPaise} testID="rider-today-earnings" />
        <Text style={styles.small}>{h.trips(home.todayTrips)}</Text>
      </Card>
      {slot ? (
        <Card style={styles.slot}>
          <View style={styles.tight}>
            <Text style={styles.small}>{h.nextSlot}</Text>
            <Text style={styles.heading}>{h.slotTime(formatClock(slot.startsAt), formatClock(slot.endsAt))}</Text>
            <Text style={styles.body}>{slot.zoneName}</Text>
          </View>
          {home.guaranteedPerHourPaise ? (
            <Banner tone="success" inset text={h.guaranteed(formatRupees(home.guaranteedPerHourPaise))} />
          ) : null}
        </Card>
      ) : null}
    </>
  );
}

/**
 * Phase 4: a break while online. While one runs the rider can come back sooner (always, so a break never strands them);
 * with rider choices on they can take one of 10, 20 or 30 minutes.
 */
function BreakCard({home, choices, onChange}: {home: HomeSummary; choices: boolean; onChange: () => void}) {
  const {strings} = useStrings();
  const h = strings.home;
  const [choosing, setChoosing] = useState(false);

  async function run(work: () => Promise<unknown>) {
    try {
      await work();
      setChoosing(false);
      onChange();
    } catch (error) {
      Alert.alert(error instanceof AppApiError ? error.message : strings.common.error);
    }
  }

  if (home.offersPausedUntil && Date.parse(home.offersPausedUntil) > Date.now()) {
    return (
      <Card style={styles.slot}>
        <View style={styles.tight}>
          <Text style={styles.strong} testID="rider-on-break">
            {h.onBreak(formatClock(home.offersPausedUntil))}
          </Text>
          <Text style={styles.secondary}>{h.onBreakBody}</Text>
        </View>
        <BottomAction label={h.backNow} size="compact" onPress={() => run(() => riderApi.resumeShift())} testID="rider-break-end" />
      </Card>
    );
  }
  if (!choices) {
    return null;
  }
  if (!choosing) {
    return <BottomAction label={h.takeBreak} variant="outline" size="compact" onPress={() => setChoosing(true)} testID="rider-break-start" />;
  }
  return (
    <Card style={styles.slot}>
      <Text style={styles.strong}>{h.breakHowLong}</Text>
      <View style={styles.choices}>
        {[10, 20, 30].map(minutes => (
          <BottomAction
            key={minutes}
            label={h.breakMinutes(minutes)}
            variant="outline"
            size="compact"
            onPress={() => run(() => riderApi.pauseShift(minutes))}
            style={styles.flex}
            testID={`rider-break-${minutes}`}
          />
        ))}
      </View>
      <Text style={styles.small}>{h.breakNote}</Text>
      <BottomAction label={strings.common.cancel} variant="ghost" size="compact" onPress={() => setChoosing(false)} />
    </Card>
  );
}

/** Online (07-HomeOnline.png): the shift, today, where to rest, and that offers ring with the screen off. */
function OnlineCards({home, choices, onChange}: {home: HomeSummary; choices: boolean; onChange: () => void}) {
  const h = useStrings().strings.home;
  return (
    <>
      <BreakCard home={home} choices={choices} onChange={onChange} />
      <Card style={styles.slot}>
        <View style={styles.tight}>
          <View style={styles.spread}>
            <Text style={styles.small}>{h.onShift}</Text>
            {home.slotEndsAt ? <Text style={styles.small}>{h.slotEnds(formatClock(home.slotEndsAt))}</Text> : null}
          </View>
          {home.shiftStartedAt ? <ShiftTimer startedAt={home.shiftStartedAt} /> : null}
          {home.zoneName ? <Text style={styles.body}>{home.zoneName}</Text> : null}
        </View>
        {home.guaranteedPerHourPaise ? (
          <Banner tone="success" inset text={h.waitingPaid(formatRupees(home.guaranteedPerHourPaise))} />
        ) : null}
      </Card>
      <Card style={styles.spread}>
        <View>
          <Text style={styles.small}>{h.today}</Text>
          <Text style={styles.hero} testID="rider-today-earnings">
            {formatRupees(home.todayEarningsPaise)}
          </Text>
        </View>
        <Text style={styles.secondary}>{h.trips(home.todayTrips)}</Text>
      </Card>
      {home.restPoint ? (
        <Card style={styles.iconCard}>
          <Icon name="map-marker-outline" size={iconSize.lg} color={colors.textPrimary} surface={false} />
          <View style={styles.flex}>
            <Text style={styles.strong}>{h.restPoint(home.restPoint.name, home.restPoint.area)}</Text>
            <Text style={styles.secondary}>{h.restPointBody}</Text>
          </View>
        </Card>
      ) : null}
      <Text style={[styles.small, styles.center]}>{h.ringsScreenOff}</Text>
    </>
  );
}

export function HomeScreen() {
  const {strings} = useStrings();
  const h = strings.home;
  const navigation = useNavigation<RiderNav>();
  const queryClient = useQueryClient();
  const home = useRiderHome();
  const me = useRiderMe();
  const trip = useActiveTrip();
  const phone = usePhoneReadiness();

  const tripInProgress = Boolean(trip.data && !ENDED.includes(trip.data.step));
  const online = home.data?.online ?? false;
  const refresh = () => queryClient.invalidateQueries({queryKey: riderKeys.all});

  // The server may still say "online" after a restart; keep the location loop in step with it.
  useEffect(() => {
    if (online) {
      riderOnlineService.start().catch(() => undefined);
    }
  }, [online]);

  function goOnline() {
    navigation.navigate(phone.ready ? 'GoOnline' : 'PhoneSetup');
  }

  async function goOffline() {
    const stop = async () => {
      await riderOnlineService.stop();
      await riderApi.endShift().catch(() => undefined);
      refresh();
    };
    if (tripInProgress) {
      Alert.alert(h.confirmOfflineTitle, h.confirmOfflineBody, [
        {text: strings.common.cancel, style: 'cancel'},
        {text: h.goOffline, style: 'destructive', onPress: stop},
      ]);
      return;
    }
    await stop();
  }

  const offline = home.error instanceof AppApiError && (home.error.retriable || !home.error.status);
  const warnings = [
    phone.device && !phone.device.locationEnabled ? h.gpsOff : null,
    phone.device?.powerSaveMode ? h.batterySaver : null,
    !phone.notifications || phone.device?.notificationsEnabled === false ? h.notificationsOff : null,
  ].filter((w): w is string => Boolean(w));
  const banner = home.data?.banner;
  const firstName = me.data?.name.split(' ')[0];

  return (
    <RiderScreen
      header={<RiderHeader title={firstName ? h.greeting(firstName) : strings.tabs.home} />}
      testID="rider-home"
      footer={
        online ? (
          <BottomAction label={h.goOffline} variant="outline" onPress={goOffline} testID="rider-go-offline" />
        ) : (
          <BottomAction label={h.goOnline} onPress={goOnline} disabled={!home.data} testID="rider-go-online" />
        )
      }>
      {home.isError ? (
        <View>
          <Banner tone="warning" icon={offline ? 'wifi-off' : 'alert'} text={offline ? strings.common.offline : strings.common.error} />
          <BottomAction label={strings.common.retry} variant="ghost" size="compact" onPress={refresh} testID="rider-home-retry" />
        </View>
      ) : null}
      <RefusalNotices />
      {tripInProgress ? (
        <Card>
          <Text style={styles.strong}>{h.resumeTitle}</Text>
          <BottomAction label={h.resume} onPress={() => navigation.navigate('Trip')} testID="rider-resume-trip" />
        </Card>
      ) : null}
      {me.data?.notice ? (
        <Card>
          <Text style={styles.strong}>{h.noticeTitle}</Text>
          <Text style={styles.body}>{me.data.notice.title}</Text>
          <BottomAction
            label={h.openNotice}
            variant="outline"
            size="compact"
            onPress={() => navigation.navigate('Notice')}
            testID="rider-open-notice"
          />
        </Card>
      ) : null}
      {!phone.ready ? (
        <Card>
          <Text style={styles.body}>{h.setupNeeded}</Text>
          <BottomAction label={h.openSetup} variant="outline" size="compact" onPress={() => navigation.navigate('PhoneSetup')} />
        </Card>
      ) : null}
      {warnings.map(warning => (
        <Banner key={warning} tone="warning" text={warning} />
      ))}
      {banner ? <Banner tone={banner.tone} text={banner.text} testID="rider-home-banner" /> : null}
      {home.data ? (
        online ? (
          <OnlineCards
            home={home.data}
            choices={Boolean(me.data?.features.riderChoices)}
            onChange={() => queryClient.invalidateQueries({queryKey: riderKeys.home})}
          />
        ) : (
          <OfflineCards home={home.data} />
        )
      ) : home.isLoading ? (
        <SectionSkeleton />
      ) : null}
    </RiderScreen>
  );
}

const styles = StyleSheet.create({
  flex: {flex: 1},
  tight: {gap: spacing.xxs},
  slot: {gap: spacing.md},
  spread: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm},
  choices: {flexDirection: 'row', gap: spacing.xs},
  iconCard: {flexDirection: 'row', alignItems: 'flex-start', gap: 10},
  center: {textAlign: 'center'},
  small: {fontSize: typography.small, color: colors.textSecondary},
  body: {fontSize: typography.body, color: colors.textPrimary},
  secondary: {fontSize: typography.body, color: colors.textSecondary},
  strong: {fontSize: typography.body, fontWeight: fontWeight.bold, color: colors.textPrimary},
  heading: {fontSize: typography.heading, fontWeight: fontWeight.bold, color: colors.textPrimary},
  hero: {fontSize: typography.hero, fontWeight: fontWeight.bold, color: colors.textPrimary, fontVariant: ['tabular-nums']},
  timer: {fontSize: typography.title, fontWeight: fontWeight.bold, color: colors.textPrimary, fontVariant: ['tabular-nums']},
});
