import React, {ReactNode, useCallback, useEffect, useState} from 'react';
import {Alert, AppState, StyleSheet, Text, View} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {Icon} from '../../../shared/components';
import {borderWidth, colors, fontWeight, iconSize, radius, spacing, typography} from '../../../design/tokens';
import {BottomAction} from '../components/BottomAction';
import {RiderHeader} from '../components/RiderHeader';
import {Card, RiderScreen} from '../components/ui';
import {riderDevice, type DeviceState} from '../native/riderDevice';
import {riderOnlineService} from '../native/riderOnlineService';
import type {RiderScreenProps} from '../navigation';
import {useStrings} from '../strings/StringsProvider';

const ANSWERS_KEY = 'rider.setup.v1';
type Answers = {autostart?: boolean; recents?: boolean; ring?: boolean};

export interface PhoneReadiness {
  location: boolean;
  notifications: boolean;
  device: DeviceState | null;
  answers: Answers;
  /** Location and notifications block going online; the rest only warn. */
  ready: boolean;
  /** Location and notifications were read at least once; until then `ready` is false without meaning "not set up". */
  checked: boolean;
  refresh(): void;
  answer(key: keyof Answers, value: boolean): void;
}

/** Re-checked whenever the app comes back to the front (the rider may have just changed a setting). */
export function usePhoneReadiness(): PhoneReadiness {
  const [location, setLocation] = useState(false);
  const [notifications, setNotifications] = useState(false);
  const [device, setDevice] = useState<DeviceState | null>(null);
  const [answers, setAnswers] = useState<Answers>({});
  const [checked, setChecked] = useState(false);

  const refresh = useCallback(() => {
    Promise.all([
      riderDevice.locationGranted().then(setLocation, () => setLocation(false)),
      riderDevice.notificationsGranted().then(setNotifications, () => setNotifications(false)),
    ]).then(() => setChecked(true));
    riderDevice.state().then(setDevice);
  }, []);

  useEffect(() => {
    refresh();
    AsyncStorage.getItem(ANSWERS_KEY)
      .then(raw => setAnswers(raw ? JSON.parse(raw) : {}))
      .catch(() => undefined);
    const subscription = AppState.addEventListener('change', state => state === 'active' && refresh());
    return () => subscription.remove();
  }, [refresh]);

  const answer = useCallback((key: keyof Answers, value: boolean) => {
    setAnswers(current => {
      const next = {...current, [key]: value};
      AsyncStorage.setItem(ANSWERS_KEY, JSON.stringify(next)).catch(() => undefined);
      return next;
    });
  }, []);

  return {location, notifications, device, answers, ready: location && notifications, checked, refresh, answer};
}

export type PhoneBrand = 'xiaomi' | 'coloros' | 'vivo' | 'samsung' | 'other';

/** The settings family for Build.MANUFACTURER: each family hides autostart and the recents lock in its own place. */
export function phoneBrand(manufacturer = ''): PhoneBrand {
  const name = manufacturer.toLowerCase();
  if (/xiaomi|redmi|poco/.test(name)) {
    return 'xiaomi';
  }
  if (/oppo|realme|oneplus/.test(name)) {
    return 'coloros';
  }
  if (/vivo|iqoo/.test(name)) {
    return 'vivo';
  }
  return name.includes('samsung') ? 'samsung' : 'other';
}

/** A finished check is one row; an unfinished one is outlined dark and says how to fix it. */
function SetupCheck({
  title,
  sub,
  done,
  steps,
  action,
  aside,
  testID,
}: {
  title: string;
  sub: string;
  done: boolean;
  steps?: string;
  action?: ReactNode;
  aside?: ReactNode;
  testID: string;
}) {
  const {strings} = useStrings();
  return (
    <Card style={[styles.check, !done && styles.attention]}>
      <View style={styles.row}>
        <View
          accessible
          accessibilityLabel={`${title}. ${done ? strings.setup.done : strings.setup.notDone}. ${sub}`}
          style={styles.rowText}
          testID={testID}>
          <View style={[styles.circle, done && styles.circleDone]}>
            {done ? <Icon name="check" size={iconSize.xs} color={colors.white} surface={false} /> : null}
          </View>
          <View style={styles.flex}>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.sub}>{sub}</Text>
          </View>
        </View>
        {aside}
      </View>
      {done ? null : (
        <>
          {steps ? <Text style={styles.steps}>{steps}</Text> : null}
          {action}
        </>
      )}
    </Card>
  );
}

/** Six checks so offers ring with the screen off (04-PhoneSetup.png), with steps for the rider's phone brand. */
export function PhoneSetupScreen({navigation}: RiderScreenProps<'PhoneSetup'>) {
  const {strings} = useStrings();
  const s = strings.setup;
  const phone = usePhoneReadiness();
  const brand = phoneBrand(phone.device?.manufacturer);

  const ask = (question: string, key: 'autostart' | 'ring') =>
    Alert.alert(question, undefined, [
      {text: s.notYet, style: 'cancel', onPress: () => phone.answer(key, false)},
      {text: s.yes, onPress: () => phone.answer(key, true)},
    ]);
  // A permission the rider refused for good can only be turned on in the app's settings.
  const allow = async (request: () => Promise<boolean>) => {
    if (!(await request())) {
      await riderDevice.openAppSettings();
    }
    phone.refresh();
  };
  const ring = () => riderOnlineService.testRing();

  const checks = {
    location: phone.location,
    notifications: phone.notifications,
    battery: Boolean(phone.device?.ignoringBatteryOptimizations),
    autostart: Boolean(phone.answers.autostart),
    recents: Boolean(phone.answers.recents),
    ring: Boolean(phone.answers.ring),
  };
  const total = Object.keys(checks).length;
  const doneCount = Object.values(checks).filter(Boolean).length;

  return (
    <RiderScreen
      // Back to where the rider came from (Home, Profile, or Home under a closed selfie screen).
      header={<RiderHeader title={s.title} back />}
      testID="rider-phone-setup"
      footer={phone.ready ? <BottomAction label={s.done} onPress={() => navigation.goBack()} testID="rider-setup-done" /> : undefined}>
      <Text style={styles.steps}>{s.intro}</Text>
      <View style={styles.progress}>
        <View style={styles.track}>
          <View style={[styles.fill, {transform: [{scaleX: doneCount / total}]}]} />
        </View>
        <Text style={styles.count}>{s.progress(doneCount, total)}</Text>
      </View>
      <View style={styles.checks}>
        <SetupCheck
          testID="setup-location"
          title={s.location}
          sub={s.required}
          done={checks.location}
          steps={s.locationSteps}
          action={<Fix label={s.allowLocation} onPress={() => allow(riderDevice.requestLocation)} />}
        />
        <SetupCheck
          testID="setup-notifications"
          title={s.notifications}
          sub={s.required}
          done={checks.notifications}
          steps={s.notificationsSteps}
          action={<Fix label={s.allowNotifications} onPress={() => allow(riderDevice.requestNotifications)} />}
        />
        <SetupCheck
          testID="setup-battery"
          title={s.battery}
          sub={s.recommended}
          done={checks.battery}
          steps={s.batterySteps}
          action={<Fix label={s.openBattery} onPress={() => riderDevice.openBatterySettings()} />}
        />
        <SetupCheck
          testID="setup-autostart"
          title={s.autostart}
          sub={s.recommended}
          done={checks.autostart}
          steps={s.autostartSteps[brand]}
          action={
            <Fix
              label={s.openAutostart}
              onPress={() => riderDevice.openAutostartSettings().finally(() => ask(s.askAutostart, 'autostart'))}
            />
          }
        />
        <SetupCheck
          testID="setup-recents"
          title={s.recents}
          sub={s.recommended}
          done={checks.recents}
          steps={s.recentsSteps[brand]}
          action={<Fix label={s.locked} onPress={() => phone.answer('recents', true)} />}
        />
        <SetupCheck
          testID="setup-ring"
          title={s.testRing}
          sub={checks.ring ? s.rang : s.recommended}
          done={checks.ring}
          steps={s.ringSteps}
          action={<Fix label={s.ring} onPress={() => ring().then(() => ask(s.askRing, 'ring'))} />}
          aside={
            checks.ring ? (
              <BottomAction label={s.ringAgain} variant="ghost" size="compact" onPress={ring} testID="rider-ring-again" />
            ) : null
          }
        />
      </View>
    </RiderScreen>
  );
}

function Fix({label, onPress}: {label: string; onPress: () => Promise<unknown> | void}) {
  return <BottomAction label={label} variant="outline" size="compact" onPress={onPress} />;
}

const styles = StyleSheet.create({
  flex: {flex: 1},
  progress: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm},
  track: {flex: 1, height: 8, borderRadius: radius.pill, backgroundColor: colors.muted, overflow: 'hidden'},
  fill: {height: '100%', width: '100%', backgroundColor: colors.success, transformOrigin: 'left'},
  count: {fontSize: typography.small, fontWeight: fontWeight.bold, color: colors.textPrimary},
  checks: {gap: spacing.sm},
  check: {gap: spacing.sm},
  attention: {borderColor: colors.textPrimary},
  row: {flexDirection: 'row', alignItems: 'center', gap: spacing.xs},
  rowText: {flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm},
  circle: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    borderWidth: borderWidth.strong,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleDone: {borderColor: colors.success, backgroundColor: colors.success},
  title: {fontSize: typography.body, fontWeight: fontWeight.bold, color: colors.textPrimary},
  sub: {fontSize: typography.small, color: colors.textSecondary},
  steps: {fontSize: typography.body, color: colors.textPrimary},
});
