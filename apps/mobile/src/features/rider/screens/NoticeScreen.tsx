import React, {useState} from 'react';
import {Linking, Pressable, Text, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {RiderField} from '../components/RiderField';
import {font, radius, spacing, themedStyles, typography} from '../theme';
import {riderApi} from '../api/riderApi';
import {Banner} from '../components/Banner';
import {BottomAction} from '../components/BottomAction';
import {RiderHeader} from '../components/RiderHeader';
import {CardsSkeleton, StateCard} from '../components/StateCard';
import {Card, RiderScreen, Title} from '../components/ui';
import {formatClock, formatDay, formatRupees} from '../domain/format';
import type {RiderNav} from '../navigation';
import {riderMessage} from '../domain/problem';
import {useRiderMe} from '../state/riderQueries';
import {useStrings} from '../strings/StringsProvider';
import {LoadFailed} from './TripDetailScreen';

/**
 * A notice from ops (Telangana Act 21, s.14): what happened, what is being checked, what happens next and how to appeal.
 * The rider can give their side in writing; a person decides, never the app.
 */
export function NoticeScreen() {
  const {strings, language} = useStrings();
  const n = strings.notice;
  const navigation = useNavigation<RiderNav>();
  const me = useRiderMe();
  const notice = me.data?.notice;
  const [writing, setWriting] = useState(false);
  const [side, setSide] = useState('');
  const [result, setResult] = useState<'sent' | {failed: string} | null>(null);
  const withWeekday = (value: string) => `${strings.earnings.weekdays[new Date(value).getDay()]} ${formatDay(value)}`;
  const phone = notice?.appealPhone ?? me.data?.supportPhone;
  const sideBy = notice?.deadline ? n.sideBy(withWeekday(notice.deadline)) : null;

  async function send() {
    try {
      await riderApi.reportIssue({category: 'OTHER', tripId: notice?.tripId, note: side.trim()});
      setResult('sent');
      setWriting(false);
    } catch (error) {
      setResult({failed: riderMessage(error, strings, language)});
    }
  }

  // Nothing to pin until /me has loaded (the phone comes with it).
  const footer = phone ? (
    <>
      {notice && result !== 'sent' ? (
        writing ? (
          <BottomAction label={n.sendSide} disabled={!side.trim()} onPress={send} testID="rider-notice-send" />
        ) : (
          <BottomAction label={n.addSide} onPress={() => setWriting(true)} testID="rider-notice-give" />
        )
      ) : null}
      <BottomAction
        label={n.callPerson}
        variant="outline"
        leftIcon="phone-outline"
        onPress={() => Linking.openURL(`tel:${phone}`).catch(() => undefined)}
        testID="rider-notice-call"
      />
    </>
  ) : undefined;

  const openTerms = () => navigation.navigate('Terms', {mode: 'view'});
  // The review as drawn: each line says plainly when the server hasn't sent it, rather than leaving a gap.
  const rows: [string, string][] = notice
    ? [
        [n.about, notice.reason],
        [n.have, notice.checking ?? n.notSent],
        [n.decides, notice.decidedBy ?? n.aPerson],
        [n.decisionBy, notice.deadline ? withWeekday(notice.deadline) : n.notSet],
        [n.onHold, notice.heldPaise !== undefined ? n.heldTrip(formatRupees(notice.heldPaise)) : notice.tripId ? n.heldTripOnly : n.nothingHeld],
      ]
    : [];

  return (
    <RiderScreen header={<RiderHeader title={n.yourAccount} back />} footer={footer} testID="rider-notice">
      {!me.data ? (
        me.isError ? (
          <LoadFailed error={me.error} onRetry={me.refetch} />
        ) : (
          <CardsSkeleton cards={2} testID="rider-notice-loading" />
        )
      ) : !notice ? (
        <StateCard icon="shield-check-outline" title={n.emptyTitle} body={n.emptyBody} testID="rider-notice-empty" />
      ) : (
        <>
          <View style={styles.intro}>
            <Title>{notice.title}</Title>
            {notice.sentAt ? <Text style={styles.meta}>{n.sent(`${withWeekday(notice.sentAt)}, ${formatClock(notice.sentAt)}`)}</Text> : null}
          </View>
          <View style={styles.amber}>
            <Text accessibilityRole="header" style={styles.amberTitle}>
              {n.reviewOpen}
            </Text>
            {/* Only a 7-day notice about one trip leaves the rider working with just that pay held. */}
            {me.data.status === 'ACTIVE' && notice.deadline && notice.tripId ? (
              <Text style={styles.amberBody} testID="rider-notice-keep-working">
                {n.keepWorking}
              </Text>
            ) : null}
          </View>
          <View style={styles.rows}>
            {rows.map(([label, value]) => (
              <View key={label} style={styles.row}>
                <Text style={[styles.meta, styles.rowLabel]}>{label}</Text>
                <Text style={[styles.rowValue]}>{value}</Text>
              </View>
            ))}
          </View>
          <Card style={styles.steps}>
            <Text accessibilityRole="header" style={styles.heading}>
              {n.ifPaused}
            </Text>
            <Text style={styles.body}>{n.ifPausedBody}</Text>
            <Text style={styles.body}>{n.person}</Text>
          </Card>
          <Text style={styles.meta} testID="rider-notice-side-by">
            {sideBy ? sideBy.join('') : n.sideNow}
          </Text>
          <Pressable accessibilityRole="link" onPress={openTerms} style={styles.link} testID="rider-notice-grievance">
            <Text style={styles.linkText}>{n.grievanceLink}</Text>
          </Pressable>
          {result === 'sent' ? <Banner tone="success" text={n.sideSent} testID="rider-notice-sent" /> : null}
          {writing ? (
            <Card>
              <RiderField
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
              {result && result !== 'sent' ? <Banner tone="warning" inset text={result.failed} testID="rider-notice-failed" /> : null}
            </Card>
          ) : null}
        </>
      )}
    </RiderScreen>
  );
}

const styles = themedStyles(c => ({
  intro: {gap: spacing.xxs},
  // The review card as drawn: warm amber, dark amber words.
  amber: {backgroundColor: c.warningSoft, borderRadius: radius.lg, padding: spacing.md, gap: spacing.xxs},
  amberTitle: {fontSize: typography.heading, fontFamily: font.bold, color: c.warningText},
  amberBody: {fontFamily: font.regular, fontSize: typography.body, lineHeight: 22, color: c.warningText},
  rows: {gap: spacing.sm},
  row: {flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm},
  rowLabel: {fontFamily: font.regular, fontSize: typography.body, flexShrink: 0},
  rowValue: {flex: 1, textAlign: 'right', fontSize: typography.body, fontFamily: font.semibold, color: c.textPrimary},
  body: {fontFamily: font.regular, fontSize: typography.body, lineHeight: 20, color: c.textSecondary},
  link: {minHeight: 44, justifyContent: 'center', alignItems: 'center'},
  linkText: {fontSize: typography.body, fontFamily: font.bold, color: c.redText},
  meta: {fontFamily: font.regular, fontSize: typography.small, color: c.textSecondary},
  heading: {fontSize: typography.body, fontFamily: font.bold, color: c.textPrimary},
  next: {marginTop: spacing.xs},
  steps: {gap: spacing.sm},
  input: {minHeight: 96, paddingVertical: spacing.sm, textAlignVertical: 'top'},
}));
