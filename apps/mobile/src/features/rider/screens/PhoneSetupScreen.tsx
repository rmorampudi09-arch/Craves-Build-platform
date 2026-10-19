import React, {useCallback, useEffect, useState} from 'react';
import {Alert, AppState, StyleSheet, Text, View} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {Button, Icon} from '../../../shared/components';
import {colors, fontWeight, spacing, typography} from '../../../design/tokens';
import {RiderHeader} from '../components/RiderHeader';
import {Body, Card, Label, RiderScreen} from '../components/ui';
import {riderDevice, type DeviceState} from '../native/riderDevice';
import {riderOnlineService} from '../native/riderOnlineService';
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
  refresh(): void;
  answer(key: keyof Answers, value: boolean): void;
}

/** Re-checked whenever the app comes back to the front (the rider may have just changed a setting). */
export function usePhoneReadiness(): PhoneReadiness {
  const [location, setLocation] = useState(false);
  const [notifications, setNotifications] = useState(false);
  const [device, setDevice] = useState<DeviceState | null>(null);
  const [answers, setAnswers] = useState<Answers>({});

  const refresh = useCallback(() => {
    riderDevice.locationGranted().then(setLocation, () => setLocation(false));
    riderDevice.notificationsGranted().then(setNotifications, () => setNotifications(false));
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

  return {location, notifications, device, answers, ready: location && notifications, refresh, answer};
}

function Check({
  label,
  done,
  required,
  steps,
  actionLabel,
  onAction,
  testID,
}: {
  label: string;
  done: boolean;
  required: string;
  steps?: string;
  actionLabel: string;
  onAction: () => void;
  testID: string;
}) {
  return (
    <Card>
      <View style={styles.checkRow} testID={testID} accessibilityLabel={`${label}: ${done ? 'done' : 'not done'}`}>
        <View style={[styles.tick, done && styles.tickDone]}>
          {done ? <Icon name="check" size={20} color={colors.white} surface={false} /> : null}
        </View>
        <View style={styles.checkText}>
          <Text style={styles.checkLabel}>{label}</Text>
          <Label>{required}</Label>
        </View>
      </View>
      {!done && steps ? <Body>{steps}</Body> : null}
      {!done ? <Button label={actionLabel} variant="outline" onPress={onAction} /> : null}
    </Card>
  );
}

export function PhoneSetupScreen() {
  const {strings} = useStrings();
  const s = strings.setup;
  const phone = usePhoneReadiness();

  const ask = (question: string, key: 'autostart' | 'recents' | 'ring') =>
    Alert.alert(question, undefined, [
      {text: s.notYet, style: 'cancel', onPress: () => phone.answer(key, false)},
      {text: s.yes, onPress: () => phone.answer(key, true)},
    ]);

  return (
    <RiderScreen header={<RiderHeader title={s.title} />} testID="rider-phone-setup">
      <Body>{s.intro}</Body>
      <Check
        testID="setup-location"
        label={s.location}
        required={s.required}
        done={phone.location}
        actionLabel={s.fix}
        onAction={() => riderDevice.requestLocation().then(phone.refresh)}
      />
      <Check
        testID="setup-notifications"
        label={s.notifications}
        required={s.required}
        done={phone.notifications}
        actionLabel={s.fix}
        onAction={() => riderDevice.requestNotifications().then(phone.refresh)}
      />
      <Check
        testID="setup-battery"
        label={s.battery}
        required={s.recommended}
        done={Boolean(phone.device?.ignoringBatteryOptimizations)}
        actionLabel={s.fix}
        onAction={() => riderDevice.openBatterySettings()}
      />
      <Check
        testID="setup-autostart"
        label={s.autostart}
        required={s.recommended}
        done={Boolean(phone.answers.autostart)}
        steps={s.autostartSteps}
        actionLabel={s.fix}
        onAction={() => riderDevice.openAutostartSettings().finally(() => ask(s.askAutostart, 'autostart'))}
      />
      <Check
        testID="setup-recents"
        label={s.recents}
        required={s.recommended}
        done={Boolean(phone.answers.recents)}
        steps={s.recentsSteps}
        actionLabel={s.fix}
        onAction={() => ask(s.askRecents, 'recents')}
      />
      <Check
        testID="setup-ring"
        label={s.testRing}
        required={s.recommended}
        done={Boolean(phone.answers.ring)}
        actionLabel={s.ring}
        onAction={() => riderOnlineService.testRing().then(() => ask(s.askRing, 'ring'))}
      />
    </RiderScreen>
  );
}

const styles = StyleSheet.create({
  checkRow: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm},
  tick: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tickDone: {backgroundColor: colors.success, borderColor: colors.success},
  checkText: {flex: 1},
  checkLabel: {fontSize: typography.body, fontWeight: fontWeight.semibold, color: colors.textPrimary},
});
