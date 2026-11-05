import React, {memo, useCallback, useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {FlashList} from '@shopify/flash-list';
import {SafeAreaView} from 'react-native-safe-area-context';
import {LoadingIndicator, SkeletonBlock} from '../../../shared/components';
import {borderWidth, colors, fontWeight, radius, spacing, touchTarget, typography} from '../../../design/tokens';
import type {EarningsRange, TripEarning} from '../api/contract';
import {BottomAction} from '../components/BottomAction';
import {Segmented} from '../components/Choices';
import {RiderHeader} from '../components/RiderHeader';
import {StateCard} from '../components/StateCard';
import {StatusBadge} from '../components/StatusBadge';
import {Money} from '../components/ui';
import {formatClock, formatDay, formatHoursMinutes, formatKm, formatRupees} from '../domain/format';
import type {RiderNav} from '../navigation';
import {useEarnings, usePayouts, useProfile, useRiderHome} from '../state/riderQueries';
import {useStrings} from '../strings/StringsProvider';
import {LoadFailed} from './TripDetailScreen';

type EarningsStrings = ReturnType<typeof useStrings>['strings']['earnings'];

/** "wait ₹6 · tip ₹8.90": the server's extra lines, by component, after the distance. */
function extras(item: TripEarning, e: EarningsStrings): string[] {
  return item.lines
    .filter(line => line.component && line.component in e.lineShort)
    .map(line => `${e.lineShort[line.component as keyof typeof e.lineShort]} ${formatRupees(line.amountPaise)}`);
}

/** One trip, as drawn: time and route, then distance and extras, the server's amount on the right. Memoised for 200-row lists. */
const TripRow = memo(function TripRowView({
  item,
  withDay,
  e,
  onOpen,
}: {
  item: TripEarning;
  withDay: boolean;
  e: EarningsStrings;
  onOpen: (tripId: string) => void;
}) {
  const route = e.route(item.kitchenArea, item.customerLocality);
  const time = formatClock(item.completedAt);
  const when = withDay ? `${e.weekdays[new Date(item.completedAt).getDay()]} ${formatDay(item.completedAt)}, ${time}` : time;
  const sub = [formatKm(item.dropDistanceM), ...extras(item, e), ...(item.status === 'HELD' ? [e.seeWhy] : [])].join(' · ');
  const amount = formatRupees(item.amountPaise);
  const status = e.status[item.status];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${when}, ${route}, ${sub}, ${amount}, ${status}`}
      onPress={() => onOpen(item.tripId)}
      style={({pressed}) => [styles.row, pressed && styles.pressed]}
      testID={`earning-${item.tripId}`}>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{`${when} · ${route}`}</Text>
        <Text style={styles.meta}>{sub}</Text>
      </View>
      <View style={styles.rowEnd}>
        <Text style={styles.amount}>{amount}</Text>
        {item.status === 'CREDITED' ? null : <StatusBadge status={item.status} label={status} compact />}
      </View>
    </Pressable>
  );
});

type Tab = EarningsRange | 'payouts';

/** Today / This week / Payouts, as drawn; Payouts opens its own screen. */
function RangeSwitch({value, onChange, e}: {value: EarningsRange; onChange: (tab: Tab) => void; e: EarningsStrings}) {
  return (
    <Segmented<Tab>
      value={value}
      options={[
        {value: 'today', label: e.today},
        {value: 'week', label: e.week},
        {value: 'payouts', label: e.payoutsTab},
      ]}
      onChange={onChange}
      label={e.range}
      role="tab"
      testID="rider-range"
    />
  );
}

/** The first trip on hold, as drawn: what the server says, by when a person decides, and the way to add the rider's side. */
function HoldCard({item, e, onAddSide}: {item: TripEarning; e: EarningsStrings; onAddSide: () => void}) {
  const day = item.releaseOn ? `${e.weekdays[new Date(item.releaseOn).getDay()]} ${formatDay(item.releaseOn)}` : null;
  return (
    <View style={styles.hold} testID="rider-earnings-hold">
      <View style={styles.spread}>
        <Text style={styles.holdTitle}>{e.onHold(e.route(item.kitchenArea, item.customerLocality))}</Text>
        <Text style={[styles.holdTitle, styles.tabular]}>{formatRupees(item.amountPaise)}</Text>
      </View>
      <Text style={styles.holdBody}>{[item.holdReason, day ? e.reviewBy(day) : null, e.nothingElse].filter(Boolean).join(' ')}</Text>
      <Pressable accessibilityRole="link" onPress={onAddSide} style={styles.holdLink} testID="rider-earnings-add-side">
        <Text style={styles.linkText}>{e.addSide}</Text>
      </Pressable>
    </View>
  );
}

function RowsSkeleton() {
  return (
    <View testID="rider-earnings-loading">
      {[0, 1, 2, 3, 4].map(row => (
        <View key={row} style={styles.row}>
          <View style={styles.rowText}>
            <SkeletonBlock width="62%" height={16} />
            <SkeletonBlock width="28%" height={13} />
          </View>
          <SkeletonBlock width={48} height={16} />
        </View>
      ))}
    </View>
  );
}

export function EarningsScreen() {
  const {strings} = useStrings();
  const e = strings.earnings;
  const navigation = useNavigation<RiderNav>();
  const [range, setRange] = useState<EarningsRange>('today');
  const earnings = useEarnings(range);
  const home = useRiderHome().data;
  const profile = useProfile().data;
  const payouts = usePayouts().data;
  const trips = earnings.data?.pages.flatMap(page => page.trips) ?? [];
  const first = earnings.data?.pages[0];
  const open = useCallback((tripId: string) => navigation.navigate('TripDetail', {tripId}), [navigation]);
  const today = new Date();
  const onTab = (tab: Tab) => (tab === 'payouts' ? navigation.navigate('Payouts') : setRange(tab));
  const held = trips.find(item => item.status === 'HELD');
  // "5 trips · 2 h 36 min online · ₹184 per online hour": today's online time and rate come with Home; the week has only its count.
  const summary = [
    earnings.hasNextPage ? null : e.trips(trips.length),
    range === 'today' && home?.todayOnlineMinutes ? e.onlineFor(formatHoursMinutes(home.todayOnlineMinutes)) : null,
    range === 'today' && home?.todayPerHourPaise !== undefined ? e.perOnlineHour(formatRupees(home.todayPerHourPaise)) : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const lastPaid = payouts?.payouts.find(payout => payout.status === 'PAID');

  const top = (
    <View style={styles.top}>
      <RangeSwitch value={range} onChange={onTab} e={e} />
      {first ? (
        <View style={styles.summary}>
          <Text style={styles.meta}>
            {range === 'today' ? e.dated(first.rangeLabel, `${e.weekdays[today.getDay()]} ${formatDay(today.getTime())}`) : first.rangeLabel}
          </Text>
          <Money paise={first.totalPaise} testID="rider-earnings-total" />
          {/* Counted only once every page is here, so it never undercounts. */}
          {summary ? <Text style={styles.trips}>{summary}</Text> : null}
          {range === 'today' && home?.fleetPerHourPaise !== undefined ? <Text style={styles.meta}>{e.fleetLine(formatRupees(home.fleetPerHourPaise))}</Text> : null}
        </View>
      ) : earnings.isLoading ? (
        <SkeletonBlock width="40%" height={36} />
      ) : null}
      {held ? <HoldCard item={held} e={e} onAddSide={() => navigation.navigate('Notice')} /> : null}
    </View>
  );
  // "Paid every Monday to HDFC ···4417. Last payout Mon 27 Oct, ₹2,640, UTR …": only the parts the server has sent.
  const payoutLine = [
    profile?.payoutAccountMasked ? e.paidEvery(profile.payoutAccountMasked) : null,
    lastPaid?.paidAt
      ? e.lastPayout(`${e.weekdays[new Date(lastPaid.paidAt).getDay()]} ${formatDay(lastPaid.paidAt)}`, formatRupees(lastPaid.amountPaise), lastPaid.utr)
      : null,
    e.freeWithdraw,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <SafeAreaView edges={['top']} style={styles.screen} testID="rider-earnings">
      <RiderHeader title={e.title} />
      <FlashList
        data={trips}
        keyExtractor={item => item.tripId}
        renderItem={({item}) => <TripRow item={item} withDay={range === 'week'} e={e} onOpen={open} />}
        ListHeaderComponent={top}
        ListEmptyComponent={
          earnings.isLoading ? (
            <RowsSkeleton />
          ) : earnings.isError ? (
            <View style={styles.pad}>
              <LoadFailed error={earnings.error} onRetry={earnings.refetch} />
            </View>
          ) : (
            <View style={styles.pad}>
              <StateCard icon="moped" title={e.empty} body={e.emptyHint} testID="rider-earnings-empty" />
            </View>
          )
        }
        ListFooterComponent={
          earnings.isFetchingNextPage ? (
            <View style={styles.pad}>
              <LoadingIndicator accessibilityLabel={e.loadingMore} color={colors.textSecondary} size="small" />
            </View>
          ) : earnings.isFetchNextPageError ? (
            <View style={styles.pad}>
              <BottomAction label={strings.common.retry} variant="outline" onPress={() => earnings.fetchNextPage()} />
            </View>
          ) : earnings.hasNextPage ? null : (
            <Text style={[styles.meta, styles.pad]} testID="rider-earnings-payout-line">
              {payoutLine}
            </Text>
          )
        }
        onEndReached={() => earnings.hasNextPage && !earnings.isFetchingNextPage && earnings.fetchNextPage()}
        onEndReachedThreshold={0.5}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.white},
  top: {
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
    borderBottomWidth: borderWidth.standard,
    borderBottomColor: colors.border,
  },
  summary: {gap: spacing.xxs},
  trips: {fontSize: typography.body, color: colors.textSecondary},
  spread: {flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm},
  // The hold card as drawn: warm amber, dark amber words, the link in deep red.
  hold: {backgroundColor: colors.warningSoft, borderRadius: radius.lg, padding: spacing.md, gap: spacing.xxs},
  holdTitle: {fontSize: typography.body, fontWeight: fontWeight.medium, color: colors.textPrimary},
  holdBody: {fontSize: typography.body, lineHeight: 20, color: colors.warningText},
  holdLink: {minHeight: touchTarget.minimum, justifyContent: 'center'},
  linkText: {fontSize: typography.body, fontWeight: fontWeight.bold, color: colors.flameRedAccessible},
  tabular: {fontVariant: ['tabular-nums']},
  row: {
    minHeight: 69,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: borderWidth.standard,
    borderBottomColor: colors.border,
    backgroundColor: colors.white,
  },
  pressed: {backgroundColor: colors.muted},
  rowText: {flex: 1, gap: spacing.xxs},
  rowTitle: {fontSize: typography.body, fontWeight: fontWeight.bold, color: colors.textPrimary},
  meta: {fontSize: typography.small, color: colors.textSecondary},
  rowEnd: {alignItems: 'flex-end', gap: spacing.xxs},
  amount: {fontSize: typography.body, fontWeight: fontWeight.bold, color: colors.textPrimary, fontVariant: ['tabular-nums']},
  pad: {padding: spacing.md, gap: spacing.xxs},
});
