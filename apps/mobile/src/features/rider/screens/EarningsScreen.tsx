import React, {memo, useCallback, useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {FlashList} from '@shopify/flash-list';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Button, ListSkeleton, SegmentedControl, TerminalState} from '../../../shared/components';
import {borderWidth, colors, fontWeight, spacing, touchTarget, typography} from '../../../design/tokens';
import type {EarningsRange, TripEarning} from '../api/contract';
import {RiderHeader} from '../components/RiderHeader';
import {StatusBadge} from '../components/StatusBadge';
import {Label, Money} from '../components/ui';
import {formatClock, formatDay, formatRupees} from '../domain/format';
import type {RiderNav} from '../navigation';
import {useEarnings} from '../state/riderQueries';
import {useStrings} from '../strings/StringsProvider';

const TripRow = memo(function TripRowView({
  item,
  statusLabel,
  onOpen,
}: {
  item: TripEarning;
  statusLabel: string;
  onOpen: (tripId: string) => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => onOpen(item.tripId)}
      style={styles.row}
      testID={`earning-${item.tripId}`}>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle} numberOfLines={1}>{`${item.kitchenArea} → ${item.customerLocality}`}</Text>
        <Text style={styles.rowMeta}>{`${formatDay(item.completedAt)} · ${formatClock(item.completedAt)}`}</Text>
      </View>
      <View style={styles.rowEnd}>
        <Text style={styles.amount}>{formatRupees(item.amountPaise)}</Text>
        <StatusBadge status={item.status} label={statusLabel} compact />
      </View>
    </Pressable>
  );
});

export function EarningsScreen() {
  const {strings} = useStrings();
  const e = strings.earnings;
  const navigation = useNavigation<RiderNav>();
  const [range, setRange] = useState<EarningsRange>('today');
  const earnings = useEarnings(range);
  const trips = earnings.data?.pages.flatMap(page => page.trips) ?? [];
  const first = earnings.data?.pages[0];
  const open = useCallback((tripId: string) => navigation.navigate('TripDetail', {tripId}), [navigation]);

  return (
    <SafeAreaView edges={['top']} style={styles.screen} testID="rider-earnings">
      <RiderHeader title={e.title} />
      <View style={styles.top}>
        <SegmentedControl
          value={range}
          onChange={setRange}
          options={[
            {value: 'today', label: e.today},
            {value: 'week', label: e.week},
          ]}
        />
        {first ? (
          <>
            <Label>{first.rangeLabel}</Label>
            <Money paise={first.totalPaise} testID="rider-earnings-total" />
          </>
        ) : null}
        <Button label={e.payouts} variant="outline" onPress={() => navigation.navigate('Payouts')} />
      </View>
      {earnings.isLoading ? (
        <ListSkeleton />
      ) : earnings.isError ? (
        <TerminalState title={strings.common.error} actionLabel={strings.common.retry} onAction={() => earnings.refetch()} />
      ) : trips.length === 0 ? (
        <TerminalState title={e.empty} />
      ) : (
        <FlashList
          data={trips}
          keyExtractor={item => item.tripId}
          renderItem={({item}) => <TripRow item={item} statusLabel={e.status[item.status]} onOpen={open} />}
          onEndReached={() => earnings.hasNextPage && !earnings.isFetchingNextPage && earnings.fetchNextPage()}
          onEndReachedThreshold={0.5}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.surfaceBase},
  top: {padding: spacing.md, gap: spacing.sm},
  row: {
    minHeight: touchTarget.comfortable + spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    borderBottomWidth: borderWidth.standard,
    borderBottomColor: colors.border,
  },
  rowText: {flex: 1},
  rowTitle: {fontSize: typography.body, fontWeight: fontWeight.semibold, color: colors.textPrimary},
  rowMeta: {fontSize: typography.small, color: colors.textSecondary},
  rowEnd: {alignItems: 'flex-end', gap: spacing.xxs},
  amount: {fontSize: typography.body, fontWeight: fontWeight.bold, color: colors.textPrimary},
});
