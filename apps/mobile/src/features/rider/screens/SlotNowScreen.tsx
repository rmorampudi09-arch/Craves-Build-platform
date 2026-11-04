import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {useIsFocused} from '@react-navigation/native';
import {colors, fontWeight, radius, spacing, typography} from '../../../design/tokens';
import {RiderHeader} from '../components/RiderHeader';
import {CardsSkeleton, StateCard} from '../components/StateCard';
import {Card, RateRow, RiderScreen} from '../components/ui';
import {formatClock, formatHoursMinutes, formatKm, formatRupees} from '../domain/format';
import {useSlots} from '../state/riderQueries';
import {useStrings} from '../strings/StringsProvider';

/** Your slot now (REDESIGN.md, SlotNow): the guarantee the minutes inside the zone cover so far, as the server counts them. */
export function SlotNowScreen() {
  const {strings} = useStrings();
  const s = strings.slots;
  const slots = useSlots(useIsFocused());
  const running = slots.data?.running;
  const cluster = slots.data?.clusters.find(c => c.name === running?.clusterName);
  const total = running ? Math.round((Date.parse(running.endsAt) - Date.parse(running.startsAt)) / 60_000) : 0;
  const share = running && total > 0 ? Math.min(1, running.inZoneMinutes / total) : 0;
  return (
    <RiderScreen header={<RiderHeader title={s.nowTitle} back />} testID="rider-slot-now-screen">
      {!slots.data ? (
        <CardsSkeleton cards={2} testID="rider-slot-now-loading" />
      ) : !running ? (
        <StateCard icon="calendar-blank-outline" title={s.noneRunningTitle} body={s.noneRunningBody} testID="rider-slot-now-none" />
      ) : (
        <>
          <View style={styles.intro}>
            <Text accessibilityRole="header" style={styles.title}>
              {s.nowHeading(running.clusterName, formatClock(running.startsAt), formatClock(running.endsAt))}
            </Text>
            <Text style={styles.body}>{cluster ? s.stayWithin(formatKm(cluster.radiusM), cluster.name) : s.stayNear(running.clusterName)}</Text>
          </View>
          <Card style={styles.tight}>
            <View style={styles.spread}>
              <Text style={styles.strong}>{s.guaranteedSoFar}</Text>
              <Text style={styles.money} testID="rider-slot-covered">
                {formatRupees(running.coveredPaise)}
              </Text>
            </View>
            <View
              style={styles.track}
              accessibilityRole="progressbar"
              accessibilityLabel={s.inZone}
              accessibilityValue={{min: 0, max: total, now: running.inZoneMinutes}}>
              <View style={[styles.fill, {width: `${Math.round(share * 100)}%`}]} />
            </View>
            <RateRow label={s.inZone} value={s.ofMinutes(formatHoursMinutes(running.inZoneMinutes), formatHoursMinutes(total))} />
            <RateRow label={s.rate} value={s.anHour(formatRupees(running.ratePerHourPaise))} />
            <Text style={styles.small}>{s.settledNote}</Text>
          </Card>
          <Text style={styles.small}>{s.opsNote}</Text>
        </>
      )}
    </RiderScreen>
  );
}

const styles = StyleSheet.create({
  intro: {gap: spacing.xxs},
  tight: {gap: spacing.sm},
  spread: {flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.sm},
  title: {fontSize: 30, lineHeight: 36, fontWeight: fontWeight.bold, color: colors.textPrimary},
  body: {fontSize: typography.body, lineHeight: 22, color: colors.textSecondary},
  small: {fontSize: typography.small, color: colors.textSecondary},
  strong: {fontSize: typography.body, fontWeight: fontWeight.medium, color: colors.textPrimary},
  money: {fontSize: 28, fontWeight: fontWeight.bold, color: colors.textPrimary, fontVariant: ['tabular-nums']},
  track: {height: 8, borderRadius: radius.pill, backgroundColor: colors.border, overflow: 'hidden'},
  fill: {height: '100%', backgroundColor: colors.success},
});
