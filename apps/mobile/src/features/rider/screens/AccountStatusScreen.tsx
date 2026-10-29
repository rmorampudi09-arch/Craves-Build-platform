import React, {useState} from 'react';
import {Linking, StyleSheet, Text, View} from 'react-native';
import {colors, fontWeight, spacing, typography} from '../../../design/tokens';
import {BottomAction} from '../components/BottomAction';
import {RiderHeader} from '../components/RiderHeader';
import {CardsSkeleton, ProblemCard} from '../components/StateCard';
import {Timeline} from '../components/Timeline';
import {Card, RiderScreen, Title} from '../components/ui';
import {formatClock, formatDay} from '../domain/format';
import {resolveGate} from '../domain/gate';
import {riderMessage} from '../domain/problem';
import {useRiderShell} from '../navigation';
import {RIDER_APP_VERSION} from '../riderConfig';
import {useRecheck, useRiderMe} from '../state/riderQueries';
import {useStrings} from '../strings/StringsProvider';
import {ApplicationScreen} from './ApplicationScreen';

/**
 * Why the rider can't work yet (02-AccountStatus.png), or the notice they must read, with a way to reach a person. Someone
 * not signed up, or applied and waiting, gets the application instead (ApplicationScreen).
 */
export function AccountStatusScreen() {
  const {strings, language} = useStrings();
  const a = strings.account;
  const ap = a.apply;
  const shell = useRiderShell();
  const me = useRiderMe();
  const gate = me.data ? resolveGate(me.data, RIDER_APP_VERSION, false) : null;
  const block = gate?.kind === 'account' ? gate.block : null;
  // Approved and waiting for the rate card: once Craves publishes it, the terms to accept open by themselves.
  useRecheck(() => me.refetch(), block === 'RATES_PENDING');
  // The rider's last Check again: a press that finds nothing new still says it looked, or why it couldn't.
  const [checked, setChecked] = useState<{at: number; error: unknown}>();

  if (!me.data) {
    return (
      <RiderScreen header={<RiderHeader title={a.headerBlocked} inactive />} testID="rider-account-status">
        {me.isError ? <ProblemCard error={me.error} onRetry={() => me.refetch()} /> : <CardsSkeleton />}
      </RiderScreen>
    );
  }
  if (block === 'NOT_RIDER' || block === 'PENDING') {
    return <ApplicationScreen me={me.data} />;
  }
  const notice = me.data.notice;
  const call = (phone: string) => Linking.openURL(`tel:${phone}`).catch(() => undefined);
  const appeal = block === 'SUSPENDED' || block === 'DEACTIVATED' || Boolean(notice);

  return (
    <RiderScreen
      header={<RiderHeader title={a.headerBlocked} inactive={Boolean(block)} />}
      testID="rider-account-status"
      footer={
        <>
          <BottomAction
            label={strings.common.callSupport}
            // Waiting on the rate card is nothing to call about; a paused or closed account is.
            variant={block === 'RATES_PENDING' ? 'outline' : 'primary'}
            leftIcon="phone-outline"
            onPress={() => call(me.data.supportPhone)}
            testID="rider-call-support"
          />
          {block ? (
            <BottomAction label={a.signOut} variant="neutral" onPress={() => shell.signOut()} testID="rider-sign-out" />
          ) : null}
        </>
      }>
      {block ? (
        <View style={styles.intro}>
          <Title>{a.titles[block]}</Title>
          <Text style={styles.secondary}>{a.bodies[block]}</Text>
        </View>
      ) : null}
      {block === 'RATES_PENDING' ? (
        <Card style={styles.timeline}>
          <Timeline
            items={[
              {title: ap.stepSent, state: 'done'},
              {title: ap.stepApproved, state: 'done'},
              {title: ap.stepRates, state: 'current', testID: 'rider-rates-pending'},
            ]}
          />
          <BottomAction
            label={a.checkAgain}
            variant="outline"
            size="compact"
            onPress={async () => {
              // refetch resolves on a failed request too; its error says why.
              const {error} = await me.refetch();
              setChecked({at: Date.now(), error});
            }}
            testID="rider-account-check-again"
          />
          {checked ? (
            <Text accessibilityLiveRegion="polite" style={styles.label} testID="rider-account-checked">
              {checked.error ? riderMessage(checked.error, strings, language) : a.ratesChecked(formatClock(checked.at))}
            </Text>
          ) : null}
        </Card>
      ) : null}
      {block && me.data.statusReason ? (
        <Card>
          <Text style={styles.label}>{a.reason}</Text>
          <Text style={styles.strong}>{me.data.statusReason}</Text>
          {me.data.statusEffectiveAt ? (
            <Text style={styles.label}>{`${a.since} ${formatDay(me.data.statusEffectiveAt)}`}</Text>
          ) : null}
        </Card>
      ) : null}
      {notice ? (
        <Card>
          <Text style={styles.strong}>{notice.title}</Text>
          <Text style={styles.body}>{notice.reason}</Text>
          {notice.deadline ? <Text style={styles.label}>{`${a.deadline} ${formatDay(notice.deadline)}`}</Text> : null}
          <BottomAction
            label={strings.common.callSupport}
            variant="outline"
            size="compact"
            leftIcon="phone-outline"
            onPress={() => call(notice.appealPhone)}
          />
        </Card>
      ) : null}
      {appeal ? (
        <Card>
          <Text style={styles.strong}>{a.appealTitle}</Text>
          <Text style={styles.secondary}>{a.appealBody}</Text>
        </Card>
      ) : null}
    </RiderScreen>
  );
}

const styles = StyleSheet.create({
  intro: {gap: spacing.xs},
  timeline: {gap: spacing.md},
  body: {fontSize: typography.body, color: colors.textPrimary},
  secondary: {fontSize: typography.body, color: colors.textSecondary},
  strong: {fontSize: typography.body, fontWeight: fontWeight.bold, color: colors.textPrimary},
  label: {fontSize: typography.small, color: colors.textSecondary},
});
