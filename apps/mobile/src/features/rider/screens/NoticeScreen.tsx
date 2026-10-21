import React, {useState} from 'react';
import {Linking, StyleSheet, Text, View} from 'react-native';
import {InputField, SectionSkeleton} from '../../../shared/components';
import {colors, fontWeight, spacing, typography} from '../../../design/tokens';
import {riderApi} from '../api/riderApi';
import {Banner} from '../components/Banner';
import {BottomAction} from '../components/BottomAction';
import {RiderHeader} from '../components/RiderHeader';
import {Body, Card, RiderScreen, Title} from '../components/ui';
import {formatClock, formatDay} from '../domain/format';
import {useRiderMe} from '../state/riderQueries';
import {useStrings} from '../strings/StringsProvider';
import {LoadFailed} from './TripDetailScreen';

/** A numbered step: a 24 dp espresso circle, then the text 12 dp after it. */
function Step({n, label, children}: {n: number; label: string; children: React.ReactNode}) {
  return (
    <View accessible accessibilityLabel={`${n}. ${label}`} style={styles.step}>
      <View style={styles.circle}>
        <Text style={styles.circleText}>{n}</Text>
      </View>
      <Text style={styles.stepText}>{children}</Text>
    </View>
  );
}

/**
 * A notice from ops (Telangana Act 21, s.14): what happened, what is being checked, what happens next and how to appeal.
 * The rider can give their side in writing; a person decides, never the app.
 */
export function NoticeScreen() {
  const {strings} = useStrings();
  const n = strings.notice;
  const me = useRiderMe();
  const notice = me.data?.notice;
  const [writing, setWriting] = useState(false);
  const [side, setSide] = useState('');
  const [result, setResult] = useState<'sent' | 'failed' | null>(null);
  const withWeekday = (value: string) => `${strings.earnings.weekdays[new Date(value).getDay()]} ${formatDay(value)}`;
  const phone = notice?.appealPhone ?? me.data?.supportPhone;
  const sideBy = notice?.deadline ? n.sideBy(withWeekday(notice.deadline)) : null;

  async function send() {
    try {
      await riderApi.reportIssue({category: 'OTHER', tripId: notice?.tripId, note: side.trim()});
      setResult('sent');
      setWriting(false);
    } catch {
      setResult('failed');
    }
  }

  // Nothing to pin until /me has loaded (the phone comes with it).
  const footer = phone ? (
    <>
      {notice && result !== 'sent' ? (
        writing ? (
          <BottomAction label={n.sendSide} disabled={!side.trim()} onPress={send} testID="rider-notice-send" />
        ) : (
          <BottomAction label={n.giveSide} onPress={() => setWriting(true)} testID="rider-notice-give" />
        )
      ) : null}
      <BottomAction
        label={n.callSupport}
        variant="outline"
        leftIcon="phone-outline"
        onPress={() => Linking.openURL(`tel:${phone}`).catch(() => undefined)}
        testID="rider-notice-call"
      />
    </>
  ) : undefined;

  return (
    <RiderScreen header={<RiderHeader title={n.title} back />} footer={footer} testID="rider-notice">
      {!me.data ? (
        me.isError ? (
          <LoadFailed error={me.error} onRetry={me.refetch} />
        ) : (
          <SectionSkeleton lines={6} />
        )
      ) : !notice ? (
        <View style={styles.intro} testID="rider-notice-empty">
          <Title>{n.emptyTitle}</Title>
          <Text style={styles.note}>{n.emptyBody}</Text>
        </View>
      ) : (
        <>
          <View style={styles.intro}>
            <Title>{notice.title}</Title>
            {notice.sentAt ? <Text style={styles.meta}>{n.sent(`${withWeekday(notice.sentAt)}, ${formatClock(notice.sentAt)}`)}</Text> : null}
          </View>
          {/* Only a 7-day notice about one trip leaves the rider working with just that pay held. */}
          {me.data.status === 'ACTIVE' && notice.deadline && notice.tripId ? (
            <Banner tone="success" icon="shield-check-outline" text={n.keepWorking} testID="rider-notice-keep-working" />
          ) : null}
          <Card>
            <Text accessibilityRole="header" style={styles.heading}>
              {n.whatHappened}
            </Text>
            <Body>{notice.reason}</Body>
            {notice.checking ? (
              <>
                <Text accessibilityRole="header" style={[styles.heading, styles.next]}>
                  {n.checking}
                </Text>
                <Body>{notice.checking}</Body>
              </>
            ) : null}
          </Card>
          <Card style={styles.steps}>
            <Text accessibilityRole="header" style={styles.heading}>
              {n.next}
            </Text>
            {sideBy ? (
              <Step n={1} label={sideBy.join('')}>
                {sideBy[0]}
                <Text style={styles.bold}>{sideBy[1]}</Text>
                {sideBy[2]}
              </Step>
            ) : (
              <Step n={1} label={n.sideNow}>
                {n.sideNow}
              </Step>
            )}
            <Step n={2} label={n.person}>
              {n.person}
            </Step>
            <Step n={3} label={n.writing}>
              {n.writing}
            </Step>
          </Card>
          <Text style={styles.meta}>{n.appeal}</Text>
          {result === 'sent' ? <Banner tone="success" text={n.sideSent} testID="rider-notice-sent" /> : null}
          {writing ? (
            <Card>
              <InputField
                label={n.sideLabel}
                placeholder={n.sidePlaceholder}
                value={side}
                onChangeText={setSide}
                multiline
                autoFocus
                maxLength={1000}
                inputStyle={styles.input}
                testID="rider-notice-side"
              />
              {result === 'failed' ? <Banner tone="warning" inset text={strings.common.error} /> : null}
            </Card>
          ) : null}
        </>
      )}
    </RiderScreen>
  );
}

const styles = StyleSheet.create({
  intro: {gap: spacing.xxs},
  meta: {fontSize: typography.small, color: colors.textSecondary},
  note: {fontSize: typography.body, color: colors.textSecondary},
  heading: {fontSize: typography.body, fontWeight: fontWeight.bold, color: colors.textPrimary},
  next: {marginTop: spacing.xs},
  steps: {gap: spacing.sm},
  step: {flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm},
  circle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.textPrimary,
  },
  circleText: {fontSize: typography.small, fontWeight: fontWeight.bold, color: colors.white},
  stepText: {flex: 1, fontSize: typography.body, color: colors.textPrimary},
  bold: {fontWeight: fontWeight.bold},
  input: {minHeight: 96, paddingVertical: spacing.sm, textAlignVertical: 'top'},
});
