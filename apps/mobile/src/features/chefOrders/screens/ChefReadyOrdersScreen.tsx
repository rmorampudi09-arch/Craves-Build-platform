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
  type ChefOrderTab,
} from '../domain/chefOrderTabs';
import {deriveChefReadyOrderAge} from '../domain/chefReadyOrders';
import {
  useChefReadyOrderActions,
  type ChefReadyOrderAction,
} from '../state/useChefReadyOrderActions';

const TAB_LABELS: Record<ChefOrderTab, string> = {
  NEW: 'New',
  PREPARING: 'Preparing',
  READY: 'Ready',
  COMPLETED: 'Completed',
};

type ChefReadyOrdersNavigation = CompositeNavigationProp<
  NativeStackNavigationProp<ChefOrdersStackParamList, 'ChefOrdersReady'>,
  CompositeNavigationProp<
    BottomTabNavigationProp<ChefTabParamList, 'Orders'>,
    NativeStackNavigationProp<ChefProductStackParamList>
  >
>;

function shortOrderReference(orderId: string): string {
  return `#${orderId.replace(/-/g, '').slice(-8).toUpperCase()}`;
}

function deliveryLabel(order: ChefOperationalOrder): string {
  const summary = order.deliverySummary;
  if (!summary) {
    return 'Delivery area unavailable';
  }
  return [summary.areaName, summary.city].filter(Boolean).join(', ');
}

function ReadyOrdersSkeleton() {
  return (
    <View style={styles.skeletonList}>
      {[0, 1, 2].map(index => (
        <View key={index} style={styles.card}>
          <View style={styles.cardOpenArea}>
            <View style={styles.rowBetween}>
              <SkeletonBlock height={22} width={96} />
              <SkeletonBlock height={24} width={118} />
            </View>
            <View style={styles.skeletonGap}>
              <SkeletonBlock height={16} width="70%" />
              <SkeletonBlock height={16} width="56%" />
              <SkeletonBlock height={68} width="100%" />
            </View>
          </View>
          <SkeletonBlock height={52} width="100%" />
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
        const selected = tab === 'READY';
        const hint =
          tab === 'NEW'
            ? 'Shows new orders awaiting a response.'
            : tab === 'PREPARING'
              ? 'Shows accepted orders being prepared.'
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

function ReadyOrderCard({
  action,
  nowMs,
  onCheckPickup,
  onOpen,
  onReportDelay,
  order,
}: {
  action: ChefReadyOrderAction | undefined;
  nowMs: number;
  onCheckPickup: () => void;
  onOpen: () => void;
  onReportDelay: () => void;
  order: ChefOperationalOrder;
}) {
  const reference = shortOrderReference(order.id);
  const items = order.items ?? [];
  const readyAge = deriveChefReadyOrderAge(order.updatedAt, nowMs);
  const busy = action !== undefined;

  return (
    <View style={styles.card}>
      <Pressable
        accessibilityLabel={`Open ready order ${reference}`}
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
          <View style={styles.readyPill}>
            <Icon color={colors.success} name="check" size={15} />
            <Text style={styles.readyPillText}>READY</Text>
          </View>
        </View>

        <Text style={styles.updatedText}>
          {readyAge?.label ?? 'Ready status time unavailable'}
        </Text>

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

        <View style={styles.partnerPanel}>
          <View style={styles.partnerIcon}>
            <Icon color={colors.textSecondary} name="orders" size={18} />
          </View>
          <View style={styles.flex}>
            <Text style={styles.partnerTitle}>Delivery partner</Text>
            <Text style={styles.partnerText}>
              Assignment, ETA and partner contact are not provided by the current Chef API.
            </Text>
          </View>
        </View>
      </Pressable>

      <View style={styles.actionRow}>
        <Pressable
          accessibilityHint="Refreshes the authoritative order status. No escalation is sent unless the backend exposes that contract."
          accessibilityLabel={`Not picked up yet for order ${reference}`}
          accessibilityRole="button"
          accessibilityState={{disabled: busy}}
          disabled={busy}
          onPress={onReportDelay}
          style={({pressed}) => [
            styles.secondaryButton,
            (pressed || busy) && styles.pressed,
          ]}>
          {action === 'reporting-delay' ? (
            <ActivityIndicator color={colors.espressoBrown} size="small" />
          ) : null}
          <Text style={styles.secondaryButtonText}>
            {action === 'reporting-delay' ? 'Checking…' : 'Not Picked Up Yet'}
          </Text>
        </Pressable>
        <Pressable
          accessibilityHint="Revalidates the order. Pickup confirmation is blocked until an exact backend contract exists."
          accessibilityLabel={`Order picked up for order ${reference}`}
          accessibilityRole="button"
          accessibilityState={{disabled: busy}}
          disabled={busy}
          onPress={onCheckPickup}
          style={({pressed}) => [
            styles.primaryButton,
            (pressed || busy) && styles.pressed,
          ]}>
          {action === 'checking-pickup' ? (
            <ActivityIndicator color={colors.white} size="small" />
          ) : (
            <Icon color={colors.white} name="check" size={18} />
          )}
          <Text style={styles.primaryButtonText}>
            {action === 'checking-pickup' ? 'Checking…' : 'Order Picked Up'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

export function ChefReadyOrdersScreen() {
  const navigation = useNavigation<ChefReadyOrdersNavigation>();
  const {orderTabs, ordersStatus, isRefreshing, refresh} = useChefOperationalState();
  const actions = useChefReadyOrderActions();
  const page = orderTabs.pages.READY;
  const initialScrollOffset = React.useRef(orderTabs.scrollState.READY).current;
  const latestScrollOffsetRef = React.useRef(initialScrollOffset);
  const listRef = React.useRef<FlatList<ChefOperationalOrder>>(null);
  const [clockSampleMs, setClockSampleMs] = React.useState(() => Date.now());

  React.useEffect(() => {
    orderTabs.selectStatus('READY');
  }, [orderTabs.selectStatus]);

  React.useEffect(() => {
    if (page.items.length === 0) {
      return undefined;
    }
    setClockSampleMs(Date.now());
    const timerId = setInterval(() => setClockSampleMs(Date.now()), 30_000);
    return () => clearInterval(timerId);
  }, [page.items.length]);

  const persistScrollOffset = React.useCallback(() => {
    orderTabs.setScrollOffset('READY', latestScrollOffsetRef.current);
  }, [orderTabs.setScrollOffset]);

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
      if (tab === 'PREPARING') {
        persistScrollOffset();
        orderTabs.selectStatus('PREPARING');
        navigation.navigate('ChefOrdersPreparing');
        return;
      }
      if (tab === 'COMPLETED') {
        persistScrollOffset();
        orderTabs.selectStatus('COMPLETED');
        navigation.navigate('ChefOrdersCompleted');
        return;
      }
      if (tab === 'READY') {
        orderTabs.selectStatus('READY');
      }
    },
    [navigation, orderTabs.selectStatus, persistScrollOffset],
  );

  const refreshOrders = React.useCallback(() => {
    refresh().catch(() => undefined);
  }, [refresh]);

  const changePage = React.useCallback(
    (nextPage: number) => {
      latestScrollOffsetRef.current = 0;
      orderTabs.setScrollOffset('READY', 0);
      orderTabs.setPage('READY', nextPage);
      listRef.current?.scrollToOffset({offset: 0, animated: false});
    },
    [orderTabs.setPage, orderTabs.setScrollOffset],
  );

  const onScroll = React.useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      latestScrollOffsetRef.current = Math.max(0, event.nativeEvent.contentOffset.y);
    },
    [],
  );

  const renderItem = React.useCallback(
    ({item}: ListRenderItemInfo<ChefOperationalOrder>) => (
      <ReadyOrderCard
        action={actions.actionStateByOrder[item.id]}
        nowMs={clockSampleMs}
        onCheckPickup={() => actions.checkPickup(item.id).catch(() => undefined)}
        onOpen={() => openOrder(item.id)}
        onReportDelay={() => actions.reportPickupDelay(item.id).catch(() => undefined)}
        order={item}
      />
    ),
    [actions, clockSampleMs, openOrder],
  );

  const showInitialLoading = ordersStatus === 'pending' && page.items.length === 0;
  const showInitialError = ordersStatus === 'error' && page.items.length === 0;

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      <ChefHeader title="Orders" />
      <View style={styles.titleBlock}>
        <Text accessibilityRole="header" style={styles.title}>
          Ready for pickup
        </Text>
        <Text style={styles.subtitle}>
          Keep prepared orders visible while the delivery handoff is pending.
        </Text>
      </View>
      <StatusTabs counts={orderTabs.tabCounts} onSelect={selectStatusTab} />

      <View style={styles.summaryBanner}>
        <View style={styles.summaryIcon}>
          <Icon color={colors.success} name="check" size={22} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.summaryTitle}>
            {orderTabs.tabCounts.READY} ready for pickup
          </Text>
          <Text style={styles.summaryText}>
            Status is refreshed from the authoritative Chef orders feed.
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
        <ReadyOrdersSkeleton />
      ) : showInitialError ? (
        <View style={styles.centerState}>
          <Icon color={colors.textSecondary} name="wifi-off" size={32} />
          <Text style={styles.stateTitle}>Ready orders unavailable</Text>
          <Text style={styles.stateText}>
            Check your connection and retry. No pickup status has been changed.
          </Text>
          <Pressable
            accessibilityLabel="Retry ready orders"
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
              <Text style={styles.stateTitle}>No orders waiting for pickup</Text>
              <Text style={styles.stateText}>
                Orders move here after they are marked ready.
              </Text>
            </View>
          }
          ListFooterComponent={
            page.totalPages > 1 ? (
              <View style={styles.pagination}>
                <Pressable
                  accessibilityLabel="Previous ready orders page"
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
                  accessibilityLabel="Next ready orders page"
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
        accessibilityLabel="Open pickup handoff note"
        accessibilityRole="button"
        onPress={() =>
          Alert.alert(
            'Pickup handoff',
            'Craves does not guess delivery-partner assignment, ETA, contact, escalation, or pickup confirmation. Those actions stay blocked until exact backend contracts are available.',
          )
        }
        style={({pressed}) => [styles.tipBanner, pressed && styles.pressed]}>
        <View style={styles.tipIcon}>
          <Icon color={colors.warning} name="star" size={18} />
        </View>
        <Text style={styles.tipText}>
          Verify the assigned handoff before releasing an order to a delivery partner.
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
  tabStrip: {flexDirection: 'row', paddingHorizontal: spacing.md, paddingBottom: spacing.sm, gap: spacing.xs},
  tab: {flex: 1, minHeight: touchTarget.minimum, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 2, borderBottomColor: colors.border, opacity: 0.55},
  tabSelected: {borderBottomColor: colors.flameRed, opacity: 1},
  tabText: {color: colors.textSecondary, fontSize: typography.tiny, fontWeight: fontWeight.semibold},
  tabTextSelected: {color: colors.flameRed},
  tabCount: {minWidth: 20, height: 20, marginTop: spacing.xxs, paddingHorizontal: spacing.xxs, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, backgroundColor: colors.surfaceMuted},
  tabCountSelected: {backgroundColor: colors.successSoft},
  tabCountText: {color: colors.textSecondary, fontSize: 10, fontWeight: fontWeight.bold},
  tabCountTextSelected: {color: colors.success},
  summaryBanner: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginHorizontal: spacing.md, marginBottom: spacing.sm, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.successSoft},
  summaryIcon: {width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: colors.white},
  summaryTitle: {color: colors.textPrimary, fontSize: typography.body, fontWeight: fontWeight.bold},
  summaryText: {marginTop: spacing.xxs, color: colors.textSecondary, fontSize: typography.small},
  feedback: {flexDirection: 'row', alignItems: 'center', marginHorizontal: spacing.md, marginBottom: spacing.sm, padding: spacing.sm, borderRadius: radius.md},
  feedbackSuccess: {backgroundColor: colors.successSoft},
  feedbackError: {backgroundColor: colors.errorSoft},
  feedbackText: {flex: 1, color: colors.textPrimary, fontSize: typography.small, fontWeight: fontWeight.medium},
  feedbackDismiss: {marginLeft: spacing.sm, color: colors.textSecondary, fontSize: typography.tiny, fontWeight: fontWeight.bold},
  listContent: {paddingHorizontal: spacing.md, paddingBottom: spacing.md, gap: spacing.sm},
  emptyListContent: {flexGrow: 1},
  skeletonList: {flex: 1, paddingHorizontal: spacing.md, gap: spacing.sm},
  skeletonGap: {marginTop: spacing.md, gap: spacing.sm},
  card: {borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.white, overflow: 'hidden', ...elevation.card},
  cardOpenArea: {padding: spacing.md},
  rowBetween: {flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.sm},
  orderReference: {color: colors.textPrimary, fontSize: typography.heading, fontWeight: fontWeight.bold},
  kitchenName: {marginTop: spacing.xxs, color: colors.textSecondary, fontSize: typography.small},
  readyPill: {flexDirection: 'row', alignItems: 'center', gap: spacing.xxs, paddingHorizontal: spacing.xs, paddingVertical: spacing.xs, borderRadius: radius.pill, backgroundColor: colors.successSoft},
  readyPillText: {color: colors.success, fontSize: typography.tiny, fontWeight: fontWeight.bold},
  updatedText: {marginTop: spacing.sm, color: colors.textSecondary, fontSize: typography.tiny},
  itemSection: {marginTop: spacing.md, gap: spacing.xs},
  itemRow: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm},
  itemGlyph: {width: 34, height: 34, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceWarm},
  itemName: {flex: 1, color: colors.textPrimary, fontSize: typography.body, fontWeight: fontWeight.medium},
  moreItems: {marginLeft: 46, color: colors.textSecondary, fontSize: typography.small},
  secondaryText: {color: colors.textSecondary, fontSize: typography.small},
  addressRow: {flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.md, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border},
  addressText: {flex: 1, color: colors.textSecondary, fontSize: typography.small},
  partnerPanel: {flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginTop: spacing.md, padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.surfaceMuted},
  partnerIcon: {width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, backgroundColor: colors.white},
  partnerTitle: {color: colors.textPrimary, fontSize: typography.small, fontWeight: fontWeight.bold},
  partnerText: {marginTop: spacing.xxs, color: colors.textSecondary, fontSize: typography.tiny},
  actionRow: {flexDirection: 'row', gap: spacing.xs, padding: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border},
  secondaryButton: {flex: 1, minHeight: touchTarget.minimum, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, backgroundColor: colors.white, paddingHorizontal: spacing.xs},
  secondaryButtonText: {color: colors.espressoBrown, fontSize: typography.small, fontWeight: fontWeight.semibold, textAlign: 'center'},
  primaryButton: {flex: 1, minHeight: touchTarget.minimum, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, borderRadius: radius.md, backgroundColor: colors.flameRed, paddingHorizontal: spacing.xs},
  primaryButtonText: {color: colors.white, fontSize: typography.small, fontWeight: fontWeight.semibold, textAlign: 'center'},
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