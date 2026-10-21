import React, {useEffect, useRef, useState} from 'react';
import {Animated, Easing, Linking, Pressable, StyleSheet, Text, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {Icon, SectionSkeleton} from '../../../shared/components';
import {borderWidth, colors, fontWeight, iconSize, spacing, typography} from '../../../design/tokens';
import {motionDuration} from '../../../design/motion';
import {useReducedMotionPreference} from '../../../design/reducedMotion';
import {BottomAction} from '../components/BottomAction';
import {RiderHeader} from '../components/RiderHeader';
import {Card, HeroCard, RiderScreen} from '../components/ui';
import {formatDay, formatRupees} from '../domain/format';
import type {RiderNav} from '../navigation';
import {useEarnings, useRiderMe} from '../state/riderQueries';
import {useStrings} from '../strings/StringsProvider';
import {LoadFailed} from './TripDetailScreen';

const openUrl = (url: string) => Linking.openURL(url).catch(() => undefined);

/** One question: the caret turns and the answer fades in (opacity and transform only, native driver, reduce motion honoured). */
function Question({q, a, expanded, onToggle, divider}: {q: string; a: string; expanded: boolean; onToggle: () => void; divider: boolean}) {
  const reduceMotion = useReducedMotionPreference();
  const progress = useRef(new Animated.Value(expanded ? 1 : 0)).current;

  useEffect(() => {
    if (reduceMotion) {
      progress.setValue(expanded ? 1 : 0);
      return;
    }
    Animated.timing(progress, {
      toValue: expanded ? 1 : 0,
      duration: motionDuration.selection,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [expanded, reduceMotion, progress]);

  const rotate = progress.interpolate({inputRange: [0, 1], outputRange: ['0deg', '90deg']});
  return (
    <View style={divider && styles.divider}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{expanded}}
        onPress={onToggle}
        style={({pressed}) => [styles.question, pressed && styles.pressed]}>
        <Animated.View style={[styles.caret, {transform: [{rotate}]}]}>
          <Icon name="menu-right" size={iconSize.lg} color={colors.textPrimary} surface={false} />
        </Animated.View>
        <Text style={styles.questionText}>{q}</Text>
      </Pressable>
      {expanded ? <Animated.Text style={[styles.answer, {opacity: progress}]}>{a}</Animated.Text> : null}
    </View>
  );
}

export function HelpScreen() {
  const {strings} = useStrings();
  const h = strings.help;
  const e = strings.earnings;
  const navigation = useNavigation<RiderNav>();
  const me = useRiderMe().data;
  const recent = useEarnings('week');
  const trips = recent.data?.pages[0]?.trips.slice(0, 3) ?? [];
  // The first answer starts open, as designed; -1 closes them all.
  const [expanded, setExpanded] = useState(0);

  return (
    <RiderScreen header={<RiderHeader title={h.title} back />} testID="rider-help">
      <HeroCard style={styles.talk}>
        <Text accessibilityRole="header" style={styles.heading}>
          {h.talkTitle}
        </Text>
        <Text style={styles.note}>{h.talkBody}</Text>
        {me?.supportPhone ? (
          <BottomAction
            label={h.callSupport}
            leftIcon="phone-outline"
            onPress={() => openUrl(`tel:${me.supportPhone}`)}
            style={styles.call}
            testID="rider-help-call"
          />
        ) : null}
        {me?.supportWhatsappUrl ? (
          <BottomAction
            label={h.whatsapp}
            variant="outline"
            size="compact"
            onPress={() => openUrl(me.supportWhatsappUrl as string)}
            testID="rider-help-whatsapp"
          />
        ) : null}
      </HeroCard>
      <Text accessibilityRole="header" style={[styles.heading, styles.section]}>
        {h.faqTitle}
      </Text>
      <Card style={styles.list}>
        {h.faqs.map((faq, index) => (
          <Question
            key={faq.q}
            q={faq.q}
            a={faq.a}
            expanded={expanded === index}
            onToggle={() => setExpanded(expanded === index ? -1 : index)}
            divider={index > 0}
          />
        ))}
      </Card>
      <Text accessibilityRole="header" style={[styles.heading, styles.section]}>
        {h.reportTitle}
      </Text>
      {recent.isLoading ? (
        <SectionSkeleton showTitle={false} testID="rider-help-loading" />
      ) : recent.isError ? (
        <LoadFailed error={recent.error} onRetry={recent.refetch} />
      ) : trips.length ? (
        <Card style={styles.list}>
          {trips.map((trip, index) => {
            const label = h.tripRow(formatDay(trip.completedAt), e.route(trip.kitchenArea, trip.customerLocality));
            const amount = formatRupees(trip.amountPaise);
            return (
              <Pressable
                key={trip.tripId}
                accessibilityRole="button"
                accessibilityLabel={`${label}, ${amount}`}
                accessibilityHint={e.report}
                onPress={() => navigation.navigate('TripDetail', {tripId: trip.tripId})}
                style={({pressed}) => [styles.trip, index > 0 && styles.divider, pressed && styles.pressed]}
                testID={`rider-help-trip-${trip.tripId}`}>
                <Text style={styles.tripText}>{label}</Text>
                <Text style={styles.amount}>{amount}</Text>
                <Icon name="chevron-right" size={iconSize.lg} color={colors.textSecondary} surface={false} />
              </Pressable>
            );
          })}
        </Card>
      ) : (
        <Text style={styles.note}>{h.noTrips}</Text>
      )}
    </RiderScreen>
  );
}

const styles = StyleSheet.create({
  talk: {gap: spacing.sm},
  heading: {fontSize: typography.heading, fontWeight: fontWeight.bold, color: colors.textPrimary},
  section: {marginTop: spacing.xs},
  note: {fontSize: typography.body, color: colors.textSecondary},
  call: {marginTop: spacing.xxs},
  list: {padding: 0, gap: 0, overflow: 'hidden'},
  divider: {borderTopWidth: borderWidth.standard, borderTopColor: colors.border},
  pressed: {backgroundColor: colors.muted},
  question: {minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: spacing.xxs, paddingHorizontal: spacing.md, paddingVertical: spacing.sm},
  // The glyph's own padding hangs into the card padding, so the triangle sits on the text edge.
  caret: {marginLeft: -spacing.xs},
  questionText: {flex: 1, fontSize: typography.body, fontWeight: fontWeight.bold, color: colors.textPrimary},
  answer: {paddingHorizontal: spacing.md, paddingBottom: spacing.md, fontSize: typography.body, color: colors.textSecondary},
  trip: {minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingLeft: spacing.md, paddingRight: spacing.sm},
  tripText: {flex: 1, fontSize: typography.body, color: colors.textPrimary},
  amount: {fontSize: typography.body, fontWeight: fontWeight.bold, color: colors.textPrimary, fontVariant: ['tabular-nums']},
});
