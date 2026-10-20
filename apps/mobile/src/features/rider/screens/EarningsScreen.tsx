import React, {memo, useCallback, useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {FlashList} from '@shopify/flash-list';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Icon, LoadingIndicator, SkeletonBlock} from '../../../shared/components';
import {borderWidth, colors, fontWeight, iconSize, radius, spacing, touchTarget, typography} from '../../../design/tokens';
import type {EarningsRange, TripEarning} from '../api/contract';
import {BottomAction} from '../components/BottomAction';
import {RiderHeader} from '../components/RiderHeader';
import {StatusBadge} from '../components/StatusBadge';
import {Money} from '../components/ui';
import {formatClock, formatDay, formatRupees} from '../domain/format';
import type {RiderNav} from '../navigation';
import {useEarnings} from '../state/riderQueries';
import {useStrings} from '../strings/StringsProvider';
import {LoadFailed} from './TripDetailScreen';

type EarningsStrings = ReturnType<typeof useStrings>['strings']['earnings'];

/** One trip: route and time on the left, the server's amount and its status on the right. Memoised for 200-row lists. */
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
  const sub = item.status === 'HELD' ? `${when}, ${e.seeWhy}` : when;
  const amount = formatRupees(item.amountPaise);
  const status = e.status[item.status];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${route}, ${sub}, ${amount}, ${status}`}
      onPress={() => onOpen(item.tripId)}
      style={({pressed}) => [styles.row, pressed && styles.pressed]}
      testID={`earning-${item.tripId}`}>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{route}</Text>
        <Text style={styles.meta}>{sub}</Text>
      </View>
      <View style={styles.rowEnd}>
        <Text style={styles.amount}>{amount}</Text>
        <StatusBadge status={item.status} label={status} compact />
      </View>
    </Pressable>
  );
});

/** Today / This week, drawn to the design: a muted track with a white selected segment. */
function RangeSwitch({value, onChange, e}: {value: EarningsRange; onChange: (range: EarningsRange) => void; e: EarningsStrings}) {
  const options: [EarningsRange, string][] = [
    ['today', e.today],
    ['week', e.week],
  ];
  return (
    <View accessibilityRole="tablist" accessibilityLabel={e.range} style={styles.track}>
      {options.map(([range, label]) => (
        <Pressable
          key={range}
          accessibilityRole="tab"
          accessibilityState={{selected: value === range}}
          onPress={() => onChange(range)}
          style={[styles.segment, value === range && styles.segmentOn]}
          testID={`rider-range-${range}`}>
          <Text style={[styles.segmentText, value === range && styles.segmentTextOn]}>{label}</Text>
        </Pressable>
      ))}
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
  const trips = earnings.data?.pages.flatMap(page => page.trips) ?? [];
  const first = earnings.data?.pages[0];
  const open = useCallback((tripId: string) => navigation.navigate('TripDetail', {tripId}), [navigation]);
  const today = new Date();

  const top = (
    <View style={styles.top}>
      <RangeSwitch value={range} onChange={setRange} e={e} />
      {first ? (
        <View>
          <Text style={styles.meta}>
            {range === 'today' ? e.dated(first.rangeLabel, `${e.weekdays[today.getDay()]} ${formatDay(today.getTime())}`) : first.rangeLabel}
          </Text>
          <View style={styles.totalRow}>
            <Money paise={first.totalPaise} testID="rider-earnings-total" />
            {/* Counted only once every page is here, so it never undercounts. */}
            {earnings.hasNextPage ? null : <Text style={styles.trips}>{e.trips(trips.length)}</Text>}
          </View>
        </View>
      ) : earnings.isLoading ? (
        <SkeletonBlock width="40%" height={36} />
      ) : null}
      <Pressable
        accessibilityRole="button"
        onPress={() => navigation.navigate('Payouts')}
        style={({pressed}) => [styles.navRow, pressed && styles.pressed]}
        testID="rider-open-payouts">
        <Text style={styles.navText}>{e.payouts}</Text>
        <Icon name="chevron-right" size={iconSize.lg} color={colors.textPrimary} surface={false} />
      </Pressable>
    </View>
  );

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
              <Text style={styles.emptyTitle}>{e.empty}</Text>
              <Text style={styles.meta}>{e.emptyHint}</Text>
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
          ) : null
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
  track: {flexDirection: 'row', padding: spacing.xxs, borderRadius: radius.md, backgroundColor: colors.muted},
  segment: {
    flex: 1,
    minHeight: touchTarget.minimum,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    borderWidth: borderWidth.standard,
    borderColor: 'transparent',
  },
  segmentOn: {backgroundColor: colors.white, borderColor: colors.border},
  segmentText: {fontSize: typography.body, fontWeight: fontWeight.bold, color: colors.textSecondary},
  segmentTextOn: {color: colors.textPrimary},
  totalRow: {flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.sm},
  trips: {fontSize: typography.body, color: colors.textSecondary},
  navRow: {
    minHeight: touchTarget.minimum,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xxs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: borderWidth.standard,
    borderColor: colors.borderStrong,
  },
  navText: {flex: 1, fontSize: typography.body, fontWeight: fontWeight.bold, color: colors.textPrimary},
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
  emptyTitle: {fontSize: typography.body, fontWeight: fontWeight.bold, color: colors.textPrimary},
});
