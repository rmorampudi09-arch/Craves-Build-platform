import React from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
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
import {AppApiError} from '../../../core/http/apiError';
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
import {deriveChefNewOrderReceivedAge} from '../domain/chefNewOrders';
import {
  useChefNewOrderActions,
  type ChefNewOrderAction,
} from '../state/useChefNewOrderActions';

const TAB_LABELS: Record<ChefOrderTab, string> = {
  NEW: 'New',
  PREPARING: 'Preparing',
  READY: 'Ready',
  COMPLETED: 'Completed',
};

type ChefNewOrdersNavigation = CompositeNavigationProp<
  NativeStackNavigationProp<ChefOrdersStackParamList, 'ChefOrdersNew'>,
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

function NewOrdersSkeleton() {
  return (
    <View style={styles.skeletonList}>
      {[0, 1, 2].map(index => (
        <View key={index} style={styles.card}>
          <View style={styles.cardOpenArea}>
            <View style={styles.rowBetween}>
              <SkeletonBlock height={22} width={96} />
              <SkeletonBlock height={24} width={110} />
            </View>
            <View style={styles.skeletonGap}>
              <SkeletonBlock height={16} width="68%" />
              <SkeletonBlock height={16} width="78%" />
              <SkeletonBlock height={16} width="54%" />
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
        const selected = tab === 'NEW';
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

function NewOrderCard({
  action,
  nowMs,
  onAccept,
  onOpen,
  onReject,
  order,
}: {
  action: ChefNewOrderAction | undefined;
  nowMs: number;
  onAccept: () => void;
  onOpen: () => void;
  onReject: () => void;
  order: ChefOperationalOrder;
}) {
  const reference = shortOrderReference(order.id);
  const items = order.items ?? [];
  const received = deriveChefNewOrderReceivedAge(order.createdAt, nowMs);
  const busy = action !== undefined;

  return (
    <View style={styles.card}>
      <Pressable
        accessibilityLabel={`Open new order ${reference}`}
        accessibilityRole="button"
        onPress={onOpen}
        style={({pressed}) => [styles.cardOpenArea, pressed && styles.pressed]}>
        <View style={styles.rowBetween}>
          <View style={styles.flex}>
            <View style={styles.referenceRow}>
              <Text style={styles.orderReference}>{reference}</Text>
              <View style={styles.newBadge}>
                <Text style={styles.newBadgeText}>NEW</Text>
              </View>
            </View>
            {order.kitchenName ? (
              <Text numberOfLines={1} style={styles.kitchenName}>
                {order.kitchenName}
              </Text>
            ) : null}
          </View>
          <View style={styles.receivedPill}>
            <Icon color={colors.warning} name="bell" size={15} />
            <Text style={styles.receivedText}>{received.label}</Text>
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
          accessibilityLabel={`Reject new order ${reference}`}
          accessibilityRole="button"
          accessibilityState={{disabled: busy}}
          disabled={busy}
          onPress={onReject}
          style={({pressed}) => [
            styles.rejectButton,
            (pressed || busy) && styles.pressed,
          ]}>
          {action === 'rejecting' ? (
            <ActivityIndicator color={colors.error} size="small" />
          ) : null}
          <Text style={styles.rejectButtonText}>
            {action === 'rejecting' ? 'Rejecting…' : 'Reject'}
          </Text>
        </Pressable>
        <Pressable
          accessibilityLabel={`Accept new order ${reference}`}
          accessibilityRole="button"
          accessibilityState={{disabled: busy}}
          disabled={busy}
          onPress={onAccept}
          style={({pressed}) => [
            styles.acceptButton,
            (pressed || busy) && styles.pressed,
          ]}>
          {action === 'accepting' ? (
            <ActivityIndicator color={colors.white} size="small" />
          ) : (
            <Icon color={colors.white} name="check" size={18} />
          )}
          <Text style={styles.acceptButtonText}>
            {action === 'accepting' ? 'Accepting…' : 'Accept Order'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

export function ChefNewOrdersScreen() {
  const navigation = useNavigation<ChefNewOrdersNavigation>();
  const {orderTabs, ordersStatus, isRefreshing, refresh} = useChefOperationalState();
  const actions = useChefNewOrderActions();
  const page = orderTabs.pages.NEW;
  const initialScrollOffset = React.useRef(orderTabs.scrollState.NEW).current;
  const latestScrollOffsetRef = React.useRef(initialScrollOffset);
  const listRef = React.useRef<FlatList<ChefOperationalOrder>>(null);
  const [clockSampleMs, setClockSampleMs] = React.useState(() => Date.now());
  const [acceptOrderId, setAcceptOrderId] = React.useState<string | null>(null);
  const [prepMinutes, setPrepMinutes] = React.useState('');
  const [rejectOrderId, setRejectOrderId] = React.useState<string | null>(null);
  const [rejectReason, setRejectReason] = React.useState('');

  React.useEffect(() => {
    orderTabs.selectStatus('NEW');
  }, [orderTabs]);

  React.useEffect(() => {
    if (page.items.length === 0) {
      return undefined;
    }
    setClockSampleMs(Date.now());
    const timerId = setInterval(() => setClockSampleMs(Date.now()), 30_000);
    return () => clearInterval(timerId);
  }, [page.items.length]);

  const persistScrollOffset = React.useCallback(() => {
    orderTabs.setScrollOffset('NEW', latestScrollOffsetRef.current);
  }, [orderTabs]);

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
      if (tab === 'PREPARING') {
        persistScrollOffset();
        orderTabs.selectStatus('PREPARING');
        navigation.navigate('ChefOrdersPreparing');
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
      if (tab === 'NEW') {
        orderTabs.selectStatus('NEW');
      }
    },
    [navigation, orderTabs, persistScrollOffset],
  );

  const refreshOrders = React.useCallback(() => {
    refresh().catch(() => undefined);
  }, [refresh]);

  const changePage = React.useCallback(
    (nextPage: number) => {
      latestScrollOffsetRef.current = 0;
      orderTabs.setScrollOffset('NEW', 0);
      orderTabs.setPage('NEW', nextPage);
      listRef.current?.scrollToOffset({offset: 0, animated: false});
    },
    [orderTabs],
  );

  const openAccept = React.useCallback((orderId: string) => {
    setRejectOrderId(null);
    setRejectReason('');
    setPrepMinutes('');
    setAcceptOrderId(orderId);
  }, []);

  const openReject = React.useCallback((orderId: string) => {
    setAcceptOrderId(null);
    setPrepMinutes('');
    setRejectReason('');
    setRejectOrderId(orderId);
  }, []);

  const closeAccept = React.useCallback(() => {
    setAcceptOrderId(null);
    setPrepMinutes('');
  }, []);

  const closeReject = React.useCallback(() => {
    setRejectOrderId(null);
    setRejectReason('');
  }, []);

  const prepValue = Number(prepMinutes);
  const prepValid = Number.isInteger(prepValue) && prepValue > 0;
  const acceptBusy =
    acceptOrderId !== null && actions.actionStateByOrder[acceptOrderId] === 'accepting';
  const rejectBusy =
    rejectOrderId !== null && actions.actionStateByOrder[rejectOrderId] === 'rejecting';

  const submitAccept = React.useCallback(() => {
    if (!acceptOrderId || !prepValid || acceptBusy) {
      return;
    }
    actions
      .accept(acceptOrderId, prepValue)
      .then(() => closeAccept())
      .catch(error => {
        if (error instanceof AppApiError && error.status === 409) {
          closeAccept();
        }
      });
  }, [acceptBusy, acceptOrderId, actions, closeAccept, prepValid, prepValue]);

  const submitReject = React.useCallback(() => {
    const reason = rejectReason.trim();
    if (!rejectOrderId || !reason || rejectBusy) {
      return;
    }
    actions
      .reject(rejectOrderId, reason)
      .then(() => closeReject())
      .catch(error => {
        if (error instanceof AppApiError && error.status === 409) {
          closeReject();
        }
      });
  }, [actions, closeReject, rejectBusy, rejectOrderId, rejectReason]);

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
      <NewOrderCard
        action={actions.actionStateByOrder[item.id]}
        nowMs={clockSampleMs}
        onAccept={() => openAccept(item.id)}
        onOpen={() => openOrder(item.id)}
        onReject={() => openReject(item.id)}
        order={item}
      />
    ),
    [
      actions.actionStateByOrder,
      clockSampleMs,
      openAccept,
      openOrder,
      openReject,
    ],
  );

  const showInitialLoading = ordersStatus === 'pending' && page.items.length === 0;
  const showInitialError = ordersStatus === 'error' && page.items.length === 0;

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      <ChefHeader title="Orders" />
      <View style={styles.titleBlock}>
        <Text accessibilityRole="header" style={styles.title}>
          New orders
        </Text>
        <Text style={styles.subtitle}>
          Review incoming orders and respond with an accurate preparation time.
        </Text>
      </View>
      <StatusTabs counts={orderTabs.tabCounts} onSelect={selectStatusTab} />

      <View style={styles.summaryBanner}>
        <View style={styles.summaryIcon}>
          <Icon color={colors.flameRed} name="bell" size={22} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.summaryTitle}>
            {orderTabs.tabCounts.NEW} new {orderTabs.tabCounts.NEW === 1 ? 'order' : 'orders'}
          </Text>
          <Text style={styles.summaryText}>Respond individually so each order gets the right prep time.</Text>
        </View>
        <Pressable
          accessibilityHint="Explains why bulk acceptance is not currently available."
          accessibilityLabel="Accept all new orders"
          accessibilityRole="button"
          onPress={() =>
            Alert.alert(
              'Accept all unavailable',
              'Each acceptance currently requires an order-specific preparation time. Accept orders individually for now.',
            )
          }
          style={({pressed}) => [styles.bulkButton, pressed && styles.pressed]}>
          <Text style={styles.bulkButtonText}>Accept All</Text>
        </Pressable>
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
        <NewOrdersSkeleton />
      ) : showInitialError ? (
        <View style={styles.centerState}>
          <Icon color={colors.textSecondary} name="wifi-off" size={32} />
          <Text style={styles.stateTitle}>New orders unavailable</Text>
          <Text style={styles.stateText}>
            Check your connection and retry. No order decision has been sent.
          </Text>
          <Pressable
            accessibilityLabel="Retry new orders"
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
              <Text style={styles.stateTitle}>No new orders</Text>
              <Text style={styles.stateText}>
                Incoming orders that need a response will appear here.
              </Text>
            </View>
          }
          ListFooterComponent={
            page.totalPages > 1 ? (
              <View style={styles.pagination}>
                <Pressable
                  accessibilityLabel="Previous new orders page"
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
                  accessibilityLabel="Next new orders page"
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
        accessibilityLabel="Open response-time tip"
        accessibilityRole="button"
        onPress={() =>
          Alert.alert(
            'Response-time tip',
            'Each card shows how long ago the order was received. The exact acceptance countdown is not available on this screen yet, so Craves does not guess a deadline.',
          )
        }
        style={({pressed}) => [styles.tipBanner, pressed && styles.pressed]}>
        <View style={styles.tipIcon}>
          <Icon color={colors.warning} name="star" size={18} />
        </View>
        <Text style={styles.tipText}>Respond promptly and enter a realistic preparation time.</Text>
        <Icon color={colors.textSecondary} name="chevron-right" size={17} />
      </Pressable>

      <Modal
        animationType="slide"
        onRequestClose={() => !acceptBusy && closeAccept()}
        transparent
        visible={acceptOrderId !== null}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalAvoider}>
          <Pressable
            accessibilityLabel="Close accept order sheet"
            accessibilityRole="button"
            disabled={acceptBusy}
            onPress={closeAccept}
            style={styles.modalBackdrop}>
            <Pressable
              accessibilityRole="none"
              onPress={event => event.stopPropagation()}
              style={styles.sheet}>
              <Text accessibilityRole="header" style={styles.sheetTitle}>Accept order</Text>
              <Text style={styles.sheetText}>
                Enter the preparation time for {acceptOrderId ? shortOrderReference(acceptOrderId) : 'this order'}.
              </Text>
              <View style={styles.inputRow}>
                <TextInput
                  accessibilityLabel="Preparation time in minutes"
                  editable={!acceptBusy}
                  keyboardType="number-pad"
                  maxLength={6}
                  onChangeText={value => setPrepMinutes(value.replace(/\D/g, ''))}
                  placeholder="e.g. 35"
                  placeholderTextColor={colors.placeholder}
                  style={styles.input}
                  value={prepMinutes}
                />
                <Text style={styles.inputSuffix}>minutes</Text>
              </View>
              <View style={styles.sheetActions}>
                <Pressable
                  accessibilityLabel="Cancel accepting order"
                  accessibilityRole="button"
                  disabled={acceptBusy}
                  onPress={closeAccept}
                  style={({pressed}) => [styles.sheetSecondaryButton, pressed && styles.pressed]}>
                  <Text style={styles.sheetSecondaryText}>Cancel</Text>
                </Pressable>
                <Pressable
                  accessibilityLabel="Confirm accept order"
                  accessibilityRole="button"
                  accessibilityState={{disabled: !prepValid || acceptBusy}}
                  disabled={!prepValid || acceptBusy}
                  onPress={submitAccept}
                  style={({pressed}) => [
                    styles.sheetPrimaryButton,
                    (pressed || !prepValid || acceptBusy) && styles.buttonDisabled,
                  ]}>
                  {acceptBusy ? <ActivityIndicator color={colors.white} size="small" /> : null}
                  <Text style={styles.sheetPrimaryText}>{acceptBusy ? 'Accepting…' : 'Accept Order'}</Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        animationType="slide"
        onRequestClose={() => !rejectBusy && closeReject()}
        transparent
        visible={rejectOrderId !== null}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalAvoider}>
          <Pressable
            accessibilityLabel="Close reject order sheet"
            accessibilityRole="button"
            disabled={rejectBusy}
            onPress={closeReject}
            style={styles.modalBackdrop}>
            <Pressable
              accessibilityRole="none"
              onPress={event => event.stopPropagation()}
              style={styles.sheet}>
              <Text accessibilityRole="header" style={styles.sheetTitle}>Reject order?</Text>
              <Text style={styles.sheetText}>
                Give a reason before rejecting {rejectOrderId ? shortOrderReference(rejectOrderId) : 'this order'}.
              </Text>
              <TextInput
                accessibilityLabel="Rejection reason"
                editable={!rejectBusy}
                maxLength={500}
                multiline
                onChangeText={setRejectReason}
                placeholder="Reason for rejection"
                placeholderTextColor={colors.placeholder}
                style={[styles.input, styles.reasonInput]}
                textAlignVertical="top"
                value={rejectReason}
              />
              <View style={styles.sheetActions}>
                <Pressable
                  accessibilityLabel="Cancel rejecting order"
                  accessibilityRole="button"
                  disabled={rejectBusy}
                  onPress={closeReject}
                  style={({pressed}) => [styles.sheetSecondaryButton, pressed && styles.pressed]}>
                  <Text style={styles.sheetSecondaryText}>Cancel</Text>
                </Pressable>
                <Pressable
                  accessibilityLabel="Confirm reject order"
                  accessibilityRole="button"
                  accessibilityState={{disabled: !rejectReason.trim() || rejectBusy}}
                  disabled={!rejectReason.trim() || rejectBusy}
                  onPress={submitReject}
                  style={({pressed}) => [
                    styles.sheetRejectButton,
                    (pressed || !rejectReason.trim() || rejectBusy) && styles.buttonDisabled,
                  ]}>
                  {rejectBusy ? <ActivityIndicator color={colors.white} size="small" /> : null}
                  <Text style={styles.sheetPrimaryText}>{rejectBusy ? 'Rejecting…' : 'Reject Order'}</Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
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
  tab: {flex: 1, minHeight: touchTarget.minimum, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 2, borderBottomColor: colors.border, opacity: 0.5},
  tabSelected: {borderBottomColor: colors.flameRed, opacity: 1},
  tabText: {color: colors.textSecondary, fontSize: typography.tiny, fontWeight: fontWeight.semibold},
  tabTextSelected: {color: colors.flameRed},
  tabCount: {minWidth: 20, height: 20, marginTop: spacing.xxs, paddingHorizontal: spacing.xxs, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, backgroundColor: colors.surfaceMuted},
  tabCountSelected: {backgroundColor: colors.errorSoft},
  tabCountText: {color: colors.textSecondary, fontSize: 10, fontWeight: fontWeight.bold},
  tabCountTextSelected: {color: colors.flameRed},
  summaryBanner: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginHorizontal: spacing.md, marginBottom: spacing.sm, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.white},
  summaryIcon: {width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: colors.white},
  summaryTitle: {color: colors.textPrimary, fontSize: typography.body, fontWeight: fontWeight.bold},
  summaryText: {marginTop: spacing.xxs, color: colors.textSecondary, fontSize: typography.small},
  bulkButton: {minHeight: touchTarget.minimum, justifyContent: 'center', borderWidth: 1, borderColor: colors.flameRed, borderRadius: radius.pill, paddingHorizontal: spacing.sm, backgroundColor: colors.white},
  bulkButtonText: {color: colors.flameRed, fontSize: typography.small, fontWeight: fontWeight.bold},
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
  referenceRow: {flexDirection: 'row', alignItems: 'center', gap: spacing.xs},
  orderReference: {color: colors.textPrimary, fontSize: typography.heading, fontWeight: fontWeight.bold},
  newBadge: {paddingHorizontal: spacing.xs, paddingVertical: spacing.xxs, borderRadius: radius.pill, backgroundColor: colors.errorSoft},
  newBadgeText: {color: colors.flameRed, fontSize: typography.tiny, fontWeight: fontWeight.bold},
  kitchenName: {marginTop: spacing.xxs, color: colors.textSecondary, fontSize: typography.small},
  receivedPill: {maxWidth: '48%', flexDirection: 'row', alignItems: 'center', gap: spacing.xxs, paddingHorizontal: spacing.xs, paddingVertical: spacing.xs, borderRadius: radius.pill, backgroundColor: colors.warningSoft},
  receivedText: {flexShrink: 1, color: colors.warning, fontSize: typography.tiny, fontWeight: fontWeight.bold},
  itemSection: {marginTop: spacing.md, gap: spacing.xs},
  itemRow: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm},
  itemGlyph: {width: 34, height: 34, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white},
  itemName: {flex: 1, color: colors.textPrimary, fontSize: typography.body, fontWeight: fontWeight.medium},
  moreItems: {marginLeft: 46, color: colors.textSecondary, fontSize: typography.small},
  secondaryText: {color: colors.textSecondary, fontSize: typography.small},
  addressRow: {flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.md, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border},
  addressText: {flex: 1, color: colors.textSecondary, fontSize: typography.small},
  actionRow: {flexDirection: 'row', gap: spacing.xs, padding: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border},
  rejectButton: {flex: 1, minHeight: touchTarget.minimum, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, borderWidth: 1, borderColor: colors.error, borderRadius: radius.md, backgroundColor: colors.white, paddingHorizontal: spacing.xs},
  rejectButtonText: {color: colors.error, fontSize: typography.small, fontWeight: fontWeight.semibold},
  acceptButton: {flex: 1, minHeight: touchTarget.minimum, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, borderRadius: radius.md, backgroundColor: colors.flameRed, paddingHorizontal: spacing.xs},
  acceptButtonText: {color: colors.white, fontSize: typography.small, fontWeight: fontWeight.semibold},
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
  modalAvoider: {flex: 1},
  modalBackdrop: {flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(38,26,21,0.45)'},
  sheet: {borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, backgroundColor: colors.white, padding: spacing.lg, paddingBottom: spacing.xl},
  sheetTitle: {color: colors.textPrimary, fontSize: typography.heading, fontWeight: fontWeight.bold},
  sheetText: {marginTop: spacing.xs, color: colors.textSecondary, fontSize: typography.small},
  inputRow: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md},
  input: {minHeight: touchTarget.minimum, flex: 1, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, backgroundColor: colors.white, color: colors.textPrimary, fontSize: typography.body, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs},
  inputSuffix: {color: colors.textSecondary, fontSize: typography.body},
  reasonInput: {minHeight: 112, marginTop: spacing.md},
  sheetActions: {flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg},
  sheetSecondaryButton: {flex: 1, minHeight: touchTarget.minimum, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, backgroundColor: colors.white},
  sheetSecondaryText: {color: colors.textPrimary, fontSize: typography.body, fontWeight: fontWeight.semibold},
  sheetPrimaryButton: {flex: 1, minHeight: touchTarget.minimum, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, borderRadius: radius.md, backgroundColor: colors.flameRed},
  sheetRejectButton: {flex: 1, minHeight: touchTarget.minimum, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, borderRadius: radius.md, backgroundColor: colors.error},
  sheetPrimaryText: {color: colors.white, fontSize: typography.body, fontWeight: fontWeight.semibold},
  buttonDisabled: {opacity: 0.4},
});
