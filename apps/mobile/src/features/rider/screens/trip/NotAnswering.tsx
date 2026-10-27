// The customer-not-answering steps (docs/riders/SCREENS.md 13): two calls, a wait at the door, then a photo.
import React, {useEffect, useState} from 'react';
import {Alert, BackHandler, Linking, Pressable, StyleSheet, Text, View} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import {Chip, Icon} from '../../../../shared/components';
import {borderWidth, colors, fontWeight, iconSize, radius, spacing, typography} from '../../../../design/tokens';
import {Banner} from '../../components/Banner';
import {BottomAction} from '../../components/BottomAction';
import {RefusalNotices} from '../../components/RefusalNotices';
import {Card, RiderScreen} from '../../components/ui';
import {formatClock} from '../../domain/format';
import {riderDevice} from '../../native/riderDevice';
import {riderOnlineService} from '../../native/riderOnlineService';
import {useStrings} from '../../strings/StringsProvider';
import {call, SyncNote, text, TripHeader, type StepProps} from './parts';

const FAIL_REASONS = ['CUSTOMER_UNREACHABLE', 'WRONG_ADDRESS', 'CUSTOMER_REFUSED', 'UNSAFE'] as const;
type FailReason = (typeof FAIL_REASONS)[number];
type StepState = 'done' | 'current' | 'locked';

export function NotAnswering({
  trip,
  run,
  syncing,
  callTimes,
  onCall,
  supportPhone,
  otpLocked,
  onBack,
  onPhotoSent,
}: StepProps & {
  /** When the rider tapped Call at the door, oldest first. */
  callTimes: number[];
  onCall: () => void;
  supportPhone?: string;
  otpLocked: boolean;
  /** Back to the OTP boxes. */
  onBack: () => void;
  onPhotoSent: () => void;
}) {
  const {strings} = useStrings();
  const t = strings.trip;
  const name = trip.customer.firstName;
  const [first, second] = callTimes;
  // The door wait starts at the second call (Trip.unreachableWaitSeconds).
  const waitMs = trip.unreachableWaitSeconds * 1000;
  const waitEnds = second === undefined ? null : second + waitMs;
  const waitOver = useHasPassed(waitEnds);
  // After the OTP lock the server takes the photo at once, without the calls or the wait.
  const photoOpen = waitOver || otpLocked;
  const [problem, setProblem] = useState<'denied' | 'error' | null>(null);
  const [failReason, setFailReason] = useState<FailReason | null>(null);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onBack();
      return true;
    });
    return () => sub.remove();
  }, [onBack]);

  async function leaveWithPhoto() {
    setProblem(null);
    try {
      if (!(await ImagePicker.requestCameraPermissionsAsync()).granted) {
        setProblem('denied');
        return;
      }
      const shot = await ImagePicker.launchCameraAsync({mediaTypes: ['images'], quality: 0.5});
      if (shot.canceled) {
        return;
      }
      onPhotoSent();
      const taken = shot.assets[0]?.uri;
      await run('delivered', {
        method: 'PHOTO',
        // Kept in the app's files until the server has it: the camera's cache may be cleared before an offline replay.
        photoUri: taken && (await riderDevice.keepPhoto(taken)),
        callsMade: callTimes.length,
        fix: riderOnlineService.lastFix(),
      });
    } catch {
      setProblem('error');
    }
  }

  function markFailed(reason: FailReason) {
    Alert.alert(t.markFailed, t.failReasons[reason], [
      {text: strings.common.cancel, style: 'cancel'},
      {text: t.confirmFail, style: 'destructive', onPress: () => run('failed', {reason})},
    ]);
  }

  return (
    <RiderScreen
      header={<TripHeader title={t.unreachableTitle} trip={trip} />}
      testID="rider-not-answering"
      footer={
        otpLocked ? undefined : <BottomAction label={t.cameOut(name)} variant="outline" onPress={onBack} testID="rider-came-out" />
      }>
      <SyncNote show={syncing} />
      <RefusalNotices tripId={trip.tripId} />
      <Banner tone="success" text={t.paidEitherWay} />
      <Card style={styles.steps}>
        <StepRow
          n={1}
          state={first === undefined ? 'current' : 'done'}
          title={t.callName(name)}
          sub={first === undefined ? t.tapToCall : t.noAnswer(formatClock(first))}
          onPress={onCall}
          testID="rider-call-1"
        />
        <StepRow
          n={2}
          state={second !== undefined ? 'done' : first !== undefined ? 'current' : 'locked'}
          title={t.callAgain}
          sub={second !== undefined ? t.noAnswer(formatClock(second)) : first !== undefined ? t.tapToCall : t.afterFirstCall}
          onPress={first === undefined ? undefined : onCall}
          testID="rider-call-2"
        />
        {/* When the rider can leave, as a time: no countdown or bar runs at the door (decision E5). */}
        <StepRow
          n={3}
          state={waitOver ? 'done' : waitEnds !== null ? 'current' : 'locked'}
          title={t.waitAtDoor}
          sub={waitEnds === null ? t.afterSecondCall : t.stayNear}
          below={
            waitEnds !== null && !waitOver ? (
              <Text style={[text.body, text.bold]} testID="rider-leave-at">
                {t.leaveAt(formatClock(waitEnds))}
              </Text>
            ) : null
          }
          testID="rider-door-wait"
        />
        <StepRow
          n={4}
          state={photoOpen ? 'current' : 'locked'}
          title={t.photoRoute}
          sub={photoOpen ? t.photoNow : t.unlocksAfterTimer}
        />
      </Card>
      <Banner tone="info" icon="camera-outline" text={t.photoRules(name)} />
      {problem ? (
        <View style={styles.tight}>
          <Banner tone="warning" text={problem === 'denied' ? t.cameraDenied : strings.common.error} testID="rider-camera-problem" />
          {problem === 'denied' ? (
            <BottomAction
              label={t.openSettings}
              variant="outline"
              size="compact"
              onPress={() => Linking.openSettings().catch(() => undefined)}
              testID="rider-open-settings"
            />
          ) : null}
        </View>
      ) : null}
      <BottomAction
        label={t.leavePhoto}
        leftIcon={photoOpen ? 'camera-outline' : 'lock-outline'}
        disabled={!photoOpen}
        accessibilityHint={photoOpen ? undefined : t.unlocksAfterTimer}
        onPress={leaveWithPhoto}
        testID="rider-leave-photo"
      />
      {supportPhone ? (
        <BottomAction
          label={t.callSupport}
          variant="outline"
          leftIcon="phone-outline"
          onPress={() => call(supportPhone)}
          testID="rider-call-support"
        />
      ) : null}
      <Text style={text.small}>{t.failNote}</Text>
      {waitOver ? (
        <View style={styles.tight} testID="rider-fail">
          <Text accessibilityRole="header" style={[text.body, text.bold]}>
            {t.failTitle}
          </Text>
          <View style={styles.chips}>
            {FAIL_REASONS.map(reason => (
              <Chip
                key={reason}
                label={t.failReasons[reason]}
                selected={failReason === reason}
                onPress={() => setFailReason(reason)}
                style={failReason === reason ? styles.chipSelected : undefined}
                testID={`rider-fail-${reason}`}
              />
            ))}
          </View>
          <BottomAction
            label={t.markFailed}
            variant="outline"
            disabled={!failReason}
            onPress={() => {
              if (failReason) {
                markFailed(failReason);
              }
            }}
            testID="rider-mark-failed"
          />
        </View>
      ) : null}
    </RiderScreen>
  );
}

/** One row of the steps card: a 28 dp circle, a title and a sub-line; call rows are buttons. */
function StepRow({
  n,
  state,
  title,
  sub,
  right,
  below,
  onPress,
  testID,
}: {
  n: number;
  state: StepState;
  title: string;
  sub: string;
  right?: React.ReactNode;
  below?: React.ReactNode;
  onPress?: () => void;
  testID?: string;
}) {
  const content = (
    <>
      <View style={styles.rowLine}>
        <View style={[styles.circle, circleStyle[state]]}>
          {state === 'done' ? (
            <Icon name="check" size={iconSize.xs} color={colors.white} surface={false} />
          ) : (
            <Text style={[styles.numeral, state === 'locked' && text.secondary]}>{n}</Text>
          )}
        </View>
        <View style={styles.flex}>
          <Text style={[text.body, text.bold]}>{title}</Text>
          <Text style={text.small}>{sub}</Text>
        </View>
        {right}
        {onPress && state === 'current' ? (
          <Icon name="phone-outline" size={iconSize.lg} color={colors.textPrimary} surface={false} />
        ) : null}
      </View>
      {below}
    </>
  );
  const rowStyle = [styles.row, n > 1 && styles.divider];
  return onPress ? (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({pressed}) => [rowStyle, pressed && styles.pressed]}
      testID={testID}>
      {content}
    </Pressable>
  ) : (
    <View accessible accessibilityState={{disabled: state === 'locked'}} style={rowStyle} testID={testID}>
      {content}
    </View>
  );
}

/** True once `at` has passed; re-renders its screen once, when that happens. */
function useHasPassed(at: number | null): boolean {
  const [passed, setPassed] = useState(false);
  useEffect(() => {
    if (at === null) {
      setPassed(false);
      return undefined;
    }
    const wait = at - Date.now();
    setPassed(wait <= 0);
    if (wait <= 0) {
      return undefined;
    }
    const timer = setTimeout(() => setPassed(true), wait);
    return () => clearTimeout(timer);
  }, [at]);
  return passed;
}

const styles = StyleSheet.create({
  flex: {flex: 1},
  tight: {gap: spacing.xs},
  steps: {padding: 0, gap: 0},
  row: {padding: spacing.md, gap: 10},
  divider: {borderTopWidth: borderWidth.standard, borderTopColor: colors.border},
  pressed: {backgroundColor: colors.muted},
  rowLine: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm},
  circle: {width: 28, height: 28, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center'},
  numeral: {fontSize: typography.small, fontWeight: fontWeight.bold, color: colors.textPrimary},
  chips: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs},
  chipSelected: {backgroundColor: colors.textPrimary, borderColor: colors.textPrimary},
});

const circleStyle = StyleSheet.create({
  done: {backgroundColor: colors.success},
  current: {borderWidth: borderWidth.strong, borderColor: colors.textPrimary},
  locked: {borderWidth: borderWidth.strong, borderColor: colors.borderStrong},
});
