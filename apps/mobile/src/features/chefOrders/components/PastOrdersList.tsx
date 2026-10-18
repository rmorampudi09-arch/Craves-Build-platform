import React from 'react';
import {FlatList, ScrollView, StyleSheet, Text, View} from 'react-native';
import {
  borderWidth,
  colors,
  fontWeight,
  radius,
  spacing,
  textDefaults,
  typography,
} from '../../../design/tokens';
import {LoadingIndicator} from '../../../shared/components/LoadingIndicator';
import type {ChefOperationalOrder} from '../../chefShell/api/chefOperationalApi';
import {ChefActionButton, ChipTap, EmptyState, ListGroup, ListRow, StatusChip, chipTapOverlap} from '../../chefShell/components/ui';
import {formatRupees, formatTimeOfDay, shortOrderNumber} from '../../chefShell/domain/chefFormat';
import {itemsSummary} from '../domain/chefOrderCard';
import {
  PAST_KINDS,
  chefOrderChip,
  filterPastOrders,
  groupPastOrders,
  mergePastOrders,
  pastGroupLabel,
  type PastFilterKind,
  type PastOrderGroup,
} from '../domain/chefOrderFilters';
import {useChefOrderHistoryQuery} from '../query/chefOrderHistoryQueries';

const CHIP_HEIGHT = 34;

function PastRow({order, onOpen}: {order: ChefOperationalOrder; onOpen: () => void}) {
  const number = shortOrderNumber(order.id);
  const chip = chefOrderChip(order);
  const finished = order.updatedAt ?? order.createdAt;
  const date = finished ? new Date(finished) : null;
  const when = date && !Number.isNaN(date.getTime()) ? formatTimeOfDay(date) : null;
  const dishes = itemsSummary(order.items);
  return (
    <ListRow
      accessibilityLabel={[`Order ${number}`, order.foodSubtotal !== undefined ? formatRupees(order.foodSubtotal) : null, chip.label]
        .filter(Boolean)
        .join(', ')}
      onPress={onOpen}
      right={<StatusChip label={chip.label} tone={chip.tone} />}
      subtitle={[dishes, [when, order.customerName].filter(Boolean).join(' · ')].filter(Boolean).join('\n')}
      title={order.foodSubtotal !== undefined ? `${number} · ${formatRupees(order.foodSubtotal)}` : number}
    />
  );
}

export interface PastOrdersListProps {
  /** Orders from the live list; anything finished among them is shown here. */
  orders: readonly ChefOperationalOrder[];
  onOpenOrder: (orderId: string) => void;
  onSeeNew: () => void;
  /** Pull to refresh: reads the live orders again. The older history is read again here too. */
  onRefresh: () => Promise<unknown>;
}

/** Finished orders (delivered, on the way, cancelled, rejected) grouped by day; older ones load as the list is scrolled. */
export function PastOrdersList({orders, onOpenOrder, onSeeNew, onRefresh}: PastOrdersListProps) {
  const history = useChefOrderHistoryQuery();
  const [pulling, setPulling] = React.useState(false);
  const pull = () => {
    setPulling(true);
    Promise.allSettled([onRefresh(), history.refresh()])
      .catch(() => undefined)
      .finally(() => setPulling(false));
  };
  const [kind, setKind] = React.useState<PastFilterKind>('ALL');
  const merged = React.useMemo(() => mergePastOrders(orders, history.orders), [history.orders, orders]);
  const groups = React.useMemo(() => groupPastOrders(filterPastOrders(merged, kind), new Date()), [kind, merged]);
  const kindLabel = PAST_KINDS.find(entry => entry.kind === kind)?.label.toLowerCase() ?? '';

  const chips = (
    <ScrollView
      contentContainerStyle={styles.chips}
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.chipScroll}>
      {PAST_KINDS.map(entry => {
        const on = entry.kind === kind;
        return (
          <ChipTap
            accessibilityLabel={entry.label}
            accessibilityRole="button"
            accessibilityState={{selected: on}}
            key={entry.kind}
            onPress={() => setKind(entry.kind)}>
            <View style={[styles.chip, on && styles.chipOn]}>
              <Text allowFontScaling={textDefaults.allowFontScaling} style={[styles.chipText, on && styles.chipTextOn]}>
                {entry.label}
              </Text>
            </View>
          </ChipTap>
        );
      })}
    </ScrollView>
  );

  return (
    <FlatList<PastOrderGroup>
      contentContainerStyle={styles.content}
      data={groups}
      keyExtractor={group => group.key}
      ListEmptyComponent={
        merged.length === 0 ? (
          <EmptyState
            illustration="orders"
            message="Delivered, rejected and cancelled orders show up here."
            title="No past orders yet">
            <ChefActionButton label="See new orders" onPress={onSeeNew} tone="neutral" />
          </EmptyState>
        ) : (
          <EmptyState illustration="search" message="Try another filter." title={`No ${kindLabel} orders`} width={160} />
        )
      }
      ListFooterComponent={history.isFetchingNextPage ? <LoadingIndicator accessibilityLabel="Loading older orders" /> : null}
      ListHeaderComponent={merged.length > 0 ? chips : null}
      onEndReached={history.loadOlder}
      onEndReachedThreshold={0.4}
      onRefresh={pull}
      refreshing={pulling}
      renderItem={({item: group}) => (
        <View style={styles.group}>
          <Text accessibilityRole="header" allowFontScaling={textDefaults.allowFontScaling} style={styles.groupTitle}>
            {pastGroupLabel(group)}
          </Text>
          <ListGroup>
            {group.orders.map(order => (
              <PastRow key={order.id} onOpen={() => onOpenOrder(order.id)} order={order} />
            ))}
          </ListGroup>
        </View>
      )}
      showsVerticalScrollIndicator={false}
    />
  );
}

const styles = StyleSheet.create({
  content: {flexGrow: 1, gap: spacing.md, paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.xxl},
  chipScroll: {marginHorizontal: -spacing.md, ...chipTapOverlap(CHIP_HEIGHT, spacing.md)},
  chips: {gap: spacing.xs, paddingHorizontal: spacing.md},
  chip: {
    height: CHIP_HEIGHT,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  chipOn: {borderColor: colors.flameRedAccessible, backgroundColor: colors.errorSoft},
  chipText: {color: colors.textPrimary, fontSize: typography.small, fontWeight: fontWeight.semibold},
  chipTextOn: {color: colors.flameRedAccessible},
  group: {gap: spacing.xs},
  groupTitle: {paddingHorizontal: spacing.xxs, color: colors.textSecondary, fontSize: typography.small, fontWeight: fontWeight.bold},
});
