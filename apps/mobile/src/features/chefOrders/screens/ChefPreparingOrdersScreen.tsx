import React from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  type ListRenderItemInfo,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import {
  useNavigation,
  type CompositeNavigationProp,
} from '@react-navigation/native';
import type {BottomTabNavigationProp} from '@react-navigation/bottom-tabs';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {
  ChefOrdersStackParamList,
  ChefProductStackParamList,
  ChefTabParamList,
} from '../../../app/navigation/types';
import {
  colors,
  elevation,
  fontWeight,
  radius,
  spacing,
  touchTarget,
  typography,
} from '../../../design/tokens';
import {Icon} from '../../../shared/components/Icon';
import {SkeletonBlock} from '../../../shared/components/Skeleton';
import type {ChefOperationalOrder} from '../../chefShell/api/chefOperationalApi';
import {ChefHeader} from '../../chefShell/components/ChefHeader';
import {useChefOperationalState} from '../../chefShell/state/ChefOperationalProvider';
import {
  CHEF_ORDER_TABS,
  countOverdueChefPrepTimers,
  type ChefOrderTab,
  type ChefPrepTimer,
} from '../domain/chefOrderTabs';
import {useChefPreparingOrderActions} from '../state/useChefPreparingOrderActions';

const TAB_LABELS: Record<ChefOrderTab, string> = {
  NEW: 'New',
  PREPARING: 'Preparing',
  READY: 'Ready',
  COMPLETED: 'Completed',
};

type ChefPreparingOrdersNavigation = CompositeNavigationProp<
  NativeStackNavigationProp<
    ChefOrdersStackParamList,
    'ChefOrdersPreparing'
  >,
  CompositeNavigationProp<
    BottomTabNavigationProp<ChefTabParamList, 'Orders'>,
    NativeStackNavigationProp<ChefProductStackParamList>
  >
>;

function shortOrderReference(orderId: string): string {
  return `#${orderId.replace(/-/g, '').slice(-8).toUpperCase()}`;
}

function formatTimer(timer: ChefPrepTimer | undefined): string {
  if (!timer) {
    return 'Prep time unavailable';
  }
  if (timer.isOverdue) {
    const elapsedMinutes = Math.max(1, Math.ceil(timer.elapsedMs / 60_000));
    return `${elapsedMinutes} min elapsed`;
  }
  const remainingMinutes = Math.max(1, Math.ceil(timer.remainingMs / 60_000));
  return `${remainingMinutes} min remaining`;
}

function deliveryLabel(order: ChefOperationalOrder): string {
  const summary = order.deliverySummary;
  if (!summary) {
    return 'Delivery area unavailable';
  }
  return [summary.areaName, summary.city].filter(Boolean).join(', ');
}

function PreparingSkeleton() {
  return (
    <View style={styles.skeletonList}>
      {[0, 1, 2].map(index => (
        <View key={index} style={styles.card}>
          <View style={styles.rowBetween}>
            <SkeletonBlock height={20} width={92} />
            <SkeletonBlock height={24} width={110} />
          </View>
          <View style={styles.skeletonGap}>
            <SkeletonBlock height={16} width="72%" />
            <SkeletonBlock height={16} width="58%" />
            <SkeletonBlock height={48} width="100%" />
          </View>
        </View>
      ))}
    </View>
  );
}

function StatusTabs({
  counts,
  onSelect,
}: {
  counts: Record<ChefOrderTab, number>;
  onSelect: (tab: ChefOrderTab) => void;
}) {
  return (
    <View accessibilityRole="tablist" style={styles.tabStrip}>
      {CHEF_ORDER_TABS.map(tab => {
        const selected = tab === 'PREPARING';
        const hint =
          tab === 'NEW'
            ? 'Shows new orders awaiting a response.'
            : tab === 'PREPARING'
              ? 'Shows orders currently being prepared.'
              : tab === 'READY'
                ? 'Shows prepared orders waiting for pickup.'
                : 'Shows delivered order history.';
        return (
          <Pressable
            accessibilityHint={hint}
            accessibilityLabel={`${TAB_LABELS[tab]}, ${counts[tab]} orders`}
            accessibilityRole="tab"
            accessibilityState={{selected}}
            key={tab}
            onPress={() => onSelect(tab)}
            style={[styles.tab, selected && styles.tabSelected]}>
            <Text style={[styles.tabText, selected && styles.tabTextSelected]}>
              {TAB_LABELS[tab]}
            </Text>
            <View style={[styles.tabCount, selected && styles.tabCountSelected]}>
              <Text style={[styles.tabCountText, selected && styles.tabCountTextSelected]}>
                {counts[tab] > 99 ? '99+' : counts[tab]}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

function PreparingOrderCard({
  action,
  onCall,
  onMarkReady,
  onOpen,
  order,
  timer,
}: {
  action: 'marking-ready' | 'calling' | undefined;
  onCall: () => void;
  onMarkReady: () => void;
  onOpen: () => void;
  order: ChefOperationalOrder;
  timer: ChefPrepTimer | undefined;
}) {
  const reference = shortOrderReference(order.id);
  const items = order.items ?? [];
  const timerLabel = formatTimer(timer);
  const busy = action !== undefined;

  return (
    <View style={styles.card}>
      <Pressable
        accessibilityLabel={`Open order ${reference}`}
        accessibilityRole="button"
        onPress={onOpen}
        style={({pressed}) => [styles.cardOpenArea, pressed && styles.pressed]}>
        <View style={styles.rowBetween}>
          <View style={styles.flex}>
            <Text style={styles.orderReference}>{reference}</Text>
            {order.kitchenName ? (
              <Text numberOfLines={1} style={styles.kitchenName}>
                {order.kitchenName}
              </Text>
            ) : null}
          </View>
          <View style={[styles.timerPill, timer?.isOverdue && styles.timerPillOverdue]}>
            <Text style={[styles.timerText, timer?.isOverdue && styles.timerTextOverdue]}>
              {timerLabel}
            </Text>
          </View>
        </View>

        <View style={styles.itemSection}>
          {items.length === 0 ? (
            <Text style={styles.secondaryText}>Order item summary unavailable.</Text>
          ) : (
            items.slice(0, 3).map(item => (
              <View key={item.id} style={styles.itemRow}>
                <View style={styles.itemGlyph}>
                  <Icon color={colors.flameRed} name="orders" size={18} />
                </View>
                <Text numberOfLines={1} style={styles.itemName}>
                  {item.quantity} × {item.itemName}
                </Text>
              </View>
            ))
          )}
          {items.length > 3 ? (
            <Text style={styles.moreItems}>+{items.length - 3} more items</Text>
          ) : null}
        </View>

        <View style={styles.addressRow}>
          <Icon color={colors.textSecondary} name="location" size={18} />
          <Text numberOfLines={2} style={styles.addressText}>
            {deliveryLabel(order)}
          </Text>
          <Icon color={colors.textSecondary} name="chevron-right" size={17} />
        </View>
      </Pressable>

      <View style={styles.actionRow}>
        <Pressable
          accessibilityLabel={`Call customer for order ${reference}`}
          accessibilityRole="button"
          disabled={busy}
          onPress={onCall}
          style={({pressed}) => [
            styles.secondaryButton,
            (pressed || busy) && styles.pressed,
          ]}>
          {action === 'calling' ? (
            <ActivityIndicator color={colors.espressoBrown} size="small" />
          ) : (
            <Icon color={colors.espressoBrown} name="phone" size={18} />
          )}
          <Text style={styles.secondaryButtonText}>
            {action === 'calling' ? 'Opening…' : 'Call Customer'}
          </Text>
        </Pressable>
        <Pressable
          accessibilityLabel={`Mark order ${reference} ready for pickup`}
          accessibilityRole="button"
          disabled={busy}
          onPress={onMarkReady}
          style={({pressed}) => [
            styles.primaryButton,
            (pressed || busy) && styles.pressed,
          ]}>
          {action === 'marking-ready' ? (
            <ActivityIndicator color={colors.white} size="small" />
          ) : (
            <Icon color={colors.white} name="check" size={18} />
          )}
          <Text style={styles.primaryButtonText}>
            {action === 'marking-ready' ? 'Updating…' : 'Mark as Ready'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

export function ChefPreparingOrdersScreen() {
  const navigation = useNavigation<ChefPreparingOrdersNavigation>();
  const {
    orderTabs,
    ordersStatus,
    isRefreshing,
    refresh,
  } = useChefOperationalState();
  const actions = useChefPreparingOrderActions();
  const page = orderTabs.pages.PREPARING;
  const initialScrollOffset = React.useRef(orderTabs.scrollState.PREPARING).current;
  const latestScrollOffsetRef = React.useRef(initialScrollOffset);
  const listRef = React.useRef<FlatList<ChefOperationalOrder>>(null);

  React.useEffect(() => {
    orderTabs.selectStatus('PREPARING');
  }, [orderTabs, orderTabs.selectStatus]);

  const persistScrollOffset = React.useCallback(() => {
    orderTabs.setScrollOffset('PREPARING', latestScrollOffsetRef.current);
  }, [orderTabs, orderTabs.setScrollOffset]);

  React.useEffect(
    () => () => {
      persistScrollOffset();
    },
    [persistScrollOffset],
  );

  const openOrder = React.useCallback(
    (orderId: string) => {
      persistScrollOffset();
      navigation.navigate('ChefOrderDetail', {orderId});
    },
    [navigation, persistScrollOffset],
  );

  const selectStatusTab = React.useCallback(
    (tab: ChefOrderTab) => {
      if (tab === 'NEW') {
        persistScrollOffset();
        orderTabs.selectStatus('NEW');
        navigation.navigate('ChefOrdersNew');
        return;
      }
      if (tab === 'READY') {
        persistScrollOffset();
        orderTabs.selectStatus('READY');
        navigation.navigate('ChefOrdersReady');
        return;
      }
      if (tab === 'COMPLETED') {
        persistScrollOffset();
        orderTabs.selectStatus('COMPLETED');
        navigation.navigate('ChefOrdersCompleted');
        return;
      }
      if (tab === 'PREPARING') {
        orderTabs.selectStatus('PREPARING');
      }
    },
    [navigation, orderTabs, orderTabs.selectStatus, persistScrollOffset],
  );

  const refreshOrders = React.useCallback(() => {
    refresh().catch(() => undefined);
  }, [refresh]);

  const changePage = React.useCallback(
    (nextPage: number) => {
      latestScrollOffsetRef.current = 0;
      orderTabs.setScrollOffset('PREPARING', 0);
      orderTabs.setPage('PREPARING', nextPage);
      listRef.current?.scrollToOffset({offset: 0, animated: false});
    },
    [orderTabs, orderTabs.setPage, orderTabs.setScrollOffset],
  );

  const confirmReady = React.useCallback(
    (orderId: string) => {
      Alert.alert(
        'Mark order ready?',
        'Confirm every item is prepared and packaged for pickup.',
        [
          {text: 'Not yet', style: 'cancel'},
          {
            text: 'Mark Ready',
            onPress: () => {
              actions.markReady(orderId).catch(() => undefined);
            },
          },
        ],
      );
    },
    [actions],
  );

  const callCustomer = React.useCallback(
    (orderId: string) => {
      actions.callCustomer(orderId).catch(() => undefined);
    },
    [actions],
  );

  const overdueCount = React.useMemo(
    () => countOverdueChefPrepTimers(orderTabs.prepTimers),
    [orderTabs.prepTimers],
  );

  const onScroll = React.useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      latestScrollOffsetRef.current = Math.max(
        0,
        event.nativeEvent.contentOffset.y,
      );
    },
    [],
  );

  const renderItem = React.useCallback(
    ({item}: ListRenderItemInfo<ChefOperationalOrder>) => (
      <PreparingOrderCard
        action={actions.actionStateByOrder[item.id]}
        onCall={() => callCustomer(item.id)}
        onMarkReady={() => confirmReady(item.id)}
        onOpen={() => openOrder(item.id)}
        order={item}
        timer={orderTabs.prepTimers[item.id]}
      />
    ),
    [
      actions.actionStateByOrder,
      callCustomer,
      confirmReady,
      openOrder,
      orderTabs.prepTimers,
    ],
  );

  const showInitialLoading = ordersStatus === 'pending' && page.items.length === 0;
  const showInitialError = ordersStatus === 'error' && page.items.length === 0;

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      <ChefHeader title="Orders" />
      <View style={styles.titleBlock}>
        <Text accessibilityRole="header" style={styles.title}>
          Preparing orders
        </Text>
        <Text style={styles.subtitle}>
          Keep preparation moving and mark each order ready when packaging is complete.
        </Text>
      </View>
      <StatusTabs counts={orderTabs.tabCounts} onSelect={selectStatusTab} />

      <View style={styles.summaryBanner}>
        <View style={styles.summaryIcon}>
          <Icon color={colors.flameRed} name="chef" size={22} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.summaryTitle}>
            {orderTabs.tabCounts.PREPARING} in preparation
          </Text>
          <Text style={styles.summaryText}>
            {overdueCount > 0
              ? `${overdueCount} ${overdueCount === 1 ? 'order needs' : 'orders need'} attention`
              : 'Preparation timers are on track'}
          </Text>
        </View>
      </View>

      {actions.feedback ? (
        <Pressable
          accessibilityHint="Dismiss this message"
          accessibilityLabel={actions.feedback.message}
          accessibilityRole="button"
          onPress={actions.clearFeedback}
          style={[
            styles.feedback,
            actions.feedback.kind === 'success' ? styles.feedbackSuccess : styles.feedbackError,
          ]}>
          <Text style={styles.feedbackText}>{actions.feedback.message}</Text>
          <Text style={styles.feedbackDismiss}>Dismiss</Text>
        </Pressable>
      ) : null}

      {showInitialLoading ? (
        <PreparingSkeleton />
      ) : showInitialError ? (
        <View style={styles.centerState}>
          <Icon color={colors.textSecondary} name="wifi-off" size={32} />
          <Text style={styles.stateTitle}>Preparing orders unavailable</Text>
          <Text style={styles.stateText}>
            Check your connection and retry. No order status has been changed.
          </Text>
          <Pressable
            accessibilityLabel="Retry preparing orders"
            accessibilityRole="button"
            disabled={isRefreshing}
            onPress={refreshOrders}
            style={({pressed}) => [
              styles.retryButton,
              (pressed || isRefreshing) && styles.pressed,
            ]}>
            <Text style={styles.retryButtonText}>
              {isRefreshing ? 'Refreshing…' : 'Try again'}
            </Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          style={styles.list}
          contentContainerStyle={[
            styles.listContent,
            page.items.length === 0 && styles.emptyListContent,
          ]}
          contentOffset={{x: 0, y: initialScrollOffset}}
          data={page.items}
          keyExtractor={order => order.id}
          ListEmptyComponent={
            <View style={styles.centerState}>
              <Icon color={colors.success} name="check" size={34} />
              <Text style={styles.stateTitle}>No orders are being prepared</Text>
              <Text style={styles.stateText}>
                Accepted orders will appear here when preparation begins.
              </Text>
            </View>
          }
          ListFooterComponent={
            page.totalPages > 1 ? (
              <View style={styles.pagination}>
                <Pressable
                  accessibilityLabel="Previous preparing orders page"
                  accessibilityRole="button"
                  disabled={page.page <= 1}
                  onPress={() => changePage(page.page - 1)}
                  style={({pressed}) => [
                    styles.pageButton,
                    (pressed || page.page <= 1) && styles.pageButtonDisabled,
                  ]}>
                  <Text style={styles.pageButtonText}>Previous</Text>
                </Pressable>
                <Text style={styles.pageLabel}>
                  Page {page.page} of {page.totalPages}
                </Text>
                <Pressable
                  accessibilityLabel="Next preparing orders page"
                  accessibilityRole="button"
                  disabled={!page.hasNextPage}
                  onPress={() => changePage(page.page + 1)}
                  style={({pressed}) => [
                    styles.pageButton,
                    (pressed || !page.hasNextPage) && styles.pageButtonDisabled,
                  ]}>
                  <Text style={styles.pageButtonText}>Next</Text>
                </Pressable>
              </View>
            ) : null
          }
          onMomentumScrollEnd={persistScrollOffset}
          onScroll={onScroll}
          onScrollEndDrag={persistScrollOffset}
          refreshControl={
            <RefreshControl
              colors={[colors.flameRed]}
              onRefresh={refreshOrders}
              refreshing={isRefreshing}
              tintColor={colors.flameRed}
            />
          }
          renderItem={renderItem}
          scrollEventThrottle={64}
          showsVerticalScrollIndicator={false}
        />
      )}

      <Pressable
        accessibilityLabel="Open preparation tip"
        accessibilityRole="button"
        onPress={() =>
          Alert.alert(
            'Preparation tip',
            'Verify quantities, seal the package, and keep the order in the designated pickup area before marking it ready.',
          )
        }
        style={({pressed}) => [styles.tipBanner, pressed && styles.pressed]}>
        <View style={styles.tipIcon}>
          <Icon color={colors.warning} name="star" size={18} />
        </View>
        <Text style={styles.tipText}>
          Check quantities and packaging before marking an order ready.
        </Text>
        <Icon color={colors.textSecondary} name="chevron-right" size={17} />
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {flex: 1, backgroundColor: colors.surfaceBase},
  flex: {flex: 1, minWidth: 0},
  list: {flex: 1},
  pressed: {opacity: 0.6},
  titleBlock: {paddingHorizontal: spacing.md, paddingTop: spacing.lg, paddingBottom: spacing.sm},
  title: {color: colors.textPrimary, fontSize: typography.hero, fontWeight: fontWeight.bold},
  subtitle: {marginTop: spacing.xs, color: colors.textSecondary, fontSize: typography.small},
  tabStrip: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.xs,
  },
  tab: {
    flex: 1,
    minHeight: touchTarget.minimum,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 2,
    borderBottomColor: colors.border,
    opacity: 0.5,
  },
  tabSelected: {borderBottomColor: colors.flameRed, opacity: 1},
  tabText: {color: colors.textSecondary, fontSize: typography.tiny, fontWeight: fontWeight.semibold},
  tabTextSelected: {color: colors.flameRed},
  tabCount: {
    minWidth: 20,
    height: 20,
    marginTop: spacing.xxs,
    paddingHorizontal: spacing.xxs,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
  },
  tabCountSelected: {backgroundColor: colors.errorSoft},
  tabCountText: {color: colors.textSecondary, fontSize: 10, fontWeight: fontWeight.bold},
  tabCountTextSelected: {color: colors.flameRed},
  summaryBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceWarm,
  },
  summaryIcon: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.white,
  },
  summaryTitle: {color: colors.textPrimary, fontSize: typography.body, fontWeight: fontWeight.bold},
  summaryText: {marginTop: spacing.xxs, color: colors.textSecondary, fontSize: typography.small},
  feedback: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.md,
  },
  feedbackSuccess: {backgroundColor: colors.successSoft},
  feedbackError: {backgroundColor: colors.errorSoft},
  feedbackText: {flex: 1, color: colors.textPrimary, fontSize: typography.small, fontWeight: fontWeight.medium},
  feedbackDismiss: {marginLeft: spacing.sm, color: colors.textSecondary, fontSize: typography.tiny, fontWeight: fontWeight.bold},
  listContent: {paddingHorizontal: spacing.md, paddingBottom: spacing.md, gap: spacing.sm},
  emptyListContent: {flexGrow: 1},
  skeletonList: {flex: 1, paddingHorizontal: spacing.md, gap: spacing.sm},
  skeletonGap: {marginTop: spacing.md, gap: spacing.sm},
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    overflow: 'hidden',
    ...elevation.card,
  },
  cardOpenArea: {padding: spacing.md},
  rowBetween: {flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.sm},
  orderReference: {color: colors.textPrimary, fontSize: typography.heading, fontWeight: fontWeight.bold},
  kitchenName: {marginTop: spacing.xxs, color: colors.textSecondary, fontSize: typography.small},
  timerPill: {paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.pill, backgroundColor: colors.successSoft},
  timerPillOverdue: {backgroundColor: colors.warningSoft},
  timerText: {color: colors.success, fontSize: typography.tiny, fontWeight: fontWeight.bold},
  timerTextOverdue: {color: colors.warning},
  itemSection: {marginTop: spacing.md, gap: spacing.xs},
  itemRow: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm},
  itemGlyph: {width: 34, height: 34, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceWarm},
  itemName: {flex: 1, color: colors.textPrimary, fontSize: typography.body, fontWeight: fontWeight.medium},
  moreItems: {marginLeft: 46, color: colors.textSecondary, fontSize: typography.small},
  secondaryText: {color: colors.textSecondary, fontSize: typography.small},
  addressRow: {flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.md, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border},
  addressText: {flex: 1, color: colors.textSecondary, fontSize: typography.small},
  actionRow: {flexDirection: 'row', gap: spacing.xs, padding: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border},
  secondaryButton: {flex: 1, minHeight: touchTarget.minimum, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, backgroundColor: colors.white, paddingHorizontal: spacing.xs},
  secondaryButtonText: {color: colors.espressoBrown, fontSize: typography.small, fontWeight: fontWeight.semibold},
  primaryButton: {flex: 1, minHeight: touchTarget.minimum, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, borderRadius: radius.md, backgroundColor: colors.flameRed, paddingHorizontal: spacing.xs},
  primaryButtonText: {color: colors.white, fontSize: typography.small, fontWeight: fontWeight.semibold},
  centerState: {flex: 1, minHeight: 220, alignItems: 'center', justifyContent: 'center', padding: spacing.xl},
  stateTitle: {marginTop: spacing.sm, color: colors.textPrimary, fontSize: typography.heading, fontWeight: fontWeight.bold, textAlign: 'center'},
  stateText: {marginTop: spacing.xs, color: colors.textSecondary, fontSize: typography.small, textAlign: 'center'},
  retryButton: {minHeight: touchTarget.minimum, marginTop: spacing.md, justifyContent: 'center', borderRadius: radius.pill, backgroundColor: colors.flameRed, paddingHorizontal: spacing.lg},
  retryButtonText: {color: colors.white, fontSize: typography.body, fontWeight: fontWeight.semibold},
  pagination: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, paddingVertical: spacing.md},
  pageButton: {minHeight: touchTarget.minimum, justifyContent: 'center', borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.pill, paddingHorizontal: spacing.md},
  pageButtonDisabled: {opacity: 0.35},
  pageButtonText: {color: colors.textPrimary, fontSize: typography.small, fontWeight: fontWeight.semibold},
  pageLabel: {color: colors.textSecondary, fontSize: typography.small},
  tipBanner: {minHeight: touchTarget.comfortable, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginHorizontal: spacing.md, marginBottom: spacing.xs, paddingHorizontal: spacing.sm, borderRadius: radius.md, backgroundColor: colors.warningSoft},
  tipIcon: {width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, backgroundColor: colors.white},
  tipText: {flex: 1, color: colors.textPrimary, fontSize: typography.small, fontWeight: fontWeight.medium},
});
