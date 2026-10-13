import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {useNavigation, useRoute, type CompositeNavigationProp} from '@react-navigation/native';
import type {BottomTabNavigationProp} from '@react-navigation/bottom-tabs';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import type {
  ChefOrdersStackParamList,
  ChefOrdersStackRouteName,
  ChefProductStackParamList,
  ChefTabParamList,
} from '../../../app/navigation/types';
import {colors, fontWeight, iconSize, radius, spacing, textDefaults, typography} from '../../../design/tokens';
import {Icon} from '../../../shared/components/Icon';
import {SkeletonBlock} from '../../../shared/components/Skeleton';
import {useChefScheduledOrdersQueue} from '../../chefScheduledOrders/query/useChefScheduledOrdersQueue';
import {acceptReadyMinutes} from '../../chefDashboard/domain/chefDashboardPresentation';
import {RespondTimer} from '../../chefDashboard/components/RespondTimer';
import type {ChefOperationalOrder} from '../../chefShell/api/chefOperationalApi';
import {
  ChefActionButton,
  ChefCard,
  ChefScreen,
  ChefTopBar,
  ConfirmDialog,
  OrderCard,
  StatusChip,
  useChefToast,
} from '../../chefShell/components/ui';
import {formatTimeOfDay, shortOrderNumber} from '../../chefShell/domain/chefFormat';
import {useChefOperationalState} from '../../chefShell/state/ChefOperationalProvider';
import {FilterChips} from '../components/FilterChips';
import {KitchenStatusCard} from '../components/KitchenStatusCard';
import {NotPickedUpSheet} from '../components/NotPickedUpSheet';
import {CallButton, EmptyState, PartnerRow, PrepTimerLine} from '../components/OrderCardParts';
import {PastOrdersList} from '../components/PastOrdersList';
import {RejectOrderSheet} from '../components/RejectOrderSheet';
import {ScheduledOrdersList} from '../components/ScheduledOrdersList';
import {itemsSummary, toOrderCardOrder} from '../domain/chefOrderCard';
import {isOrderMovedOn} from '../domain/chefOrderDecision';
import {rejectKindOf} from '../domain/chefOrderReasons';
import {
  FILTER_FOR_ROUTE,
  ROUTE_FOR_FILTER,
  chefOrderStatusChip,
  ordersForFilter,
  type ChefOrderFilter,
} from '../domain/chefOrderFilters';
import {useChefHandedOver} from '../state/useChefHandedOver';
import {useChefMenuPrepTimes} from '../state/useChefMenuPrepTimes';
import {useChefNewOrderActions} from '../state/useChefNewOrderActions';
import {useChefPreparingOrderActions} from '../state/useChefPreparingOrderActions';

type OrdersNavigation = CompositeNavigationProp<
  NativeStackNavigationProp<ChefOrdersStackParamList>,
  CompositeNavigationProp<BottomTabNavigationProp<ChefTabParamList, 'Orders'>, NativeStackNavigationProp<ChefProductStackParamList>>
>;

const EMPTY_COPY: Record<'PREPARING' | 'READY', {icon: 'meal' | 'delivery'; title: string; message: string}> = {
  PREPARING: {icon: 'meal', title: 'Nothing cooking', message: 'Orders you accept show up here while you cook them.'},
  READY: {
    icon: 'delivery',
    title: 'Nothing waiting for pickup',
    message: 'When you mark an order ready, it waits here for the delivery partner.',
  },
};

const timeOf = (iso: string | null | undefined) => {
  const date = iso ? new Date(iso) : null;
  return date && !Number.isNaN(date.getTime()) ? formatTimeOfDay(date) : undefined;
};

/** One Orders screen. Its route says which of New, Preparing, Ready, Scheduled or Past is on; switching never opens a new page. */
export function ChefOrdersScreen() {
  const navigation = useNavigation<OrdersNavigation>();
  const route = useRoute();
  const filter: ChefOrderFilter = FILTER_FOR_ROUTE[route.name as ChefOrdersStackRouteName] ?? 'NEW';
  const toast = useChefToast();
  const {orders, orderTabs, ordersStatus, refresh} = useChefOperationalState();
  const newActions = useChefNewOrderActions();
  const prepActions = useChefPreparingOrderActions();
  const handover = useChefHandedOver();
  const menuItems = useChefMenuPrepTimes();
  const scheduled = useChefScheduledOrdersQueue();

  const [rejectId, setRejectId] = React.useState<string | null>(null);
  const [readyTarget, setReadyTarget] = React.useState<ChefOperationalOrder | null>(null);
  const [notPickedId, setNotPickedId] = React.useState<string | null>(null);
  const [pulling, setPulling] = React.useState(false);

  // The order actions explain what happened (accepted, no longer available...); show it once.
  const {feedback: newFeedback, clearFeedback: clearNewFeedback} = newActions;
  React.useEffect(() => {
    if (newFeedback) {
      toast.show(newFeedback.message);
      clearNewFeedback();
    }
  }, [clearNewFeedback, newFeedback, toast]);
  const {feedback: prepFeedback, clearFeedback: clearPrepFeedback} = prepActions;
  React.useEffect(() => {
    if (prepFeedback) {
      toast.show(prepFeedback.message);
      clearPrepFeedback();
    }
  }, [clearPrepFeedback, prepFeedback, toast]);

  const counts = {
    NEW: ordersForFilter(orders, 'NEW').length,
    PREPARING: ordersForFilter(orders, 'PREPARING').length,
    READY: ordersForFilter(orders, 'READY').length,
    // No number until the list is known: not while it loads, not after it failed, not while it is not published.
    SCHEDULED: scheduled.unavailable || scheduled.status !== 'success' ? undefined : scheduled.pending.length,
  };
  const showFilter = (next: ChefOrderFilter) => navigation.replace(ROUTE_FOR_FILTER[next]);
  const openOrder = (orderId: string) => navigation.navigate('ChefOrderDetail', {orderId});

  const refreshAll = () => Promise.allSettled([refresh(), scheduled.refresh()]);
  const pull = () => {
    setPulling(true);
    refreshAll()
      .catch(() => undefined)
      .finally(() => setPulling(false));
  };

  const rejectBusy = rejectId !== null && newActions.actionStateByOrder[rejectId] === 'rejecting';
  const submitReject = (reason: string) => {
    const orderId = rejectId;
    if (!orderId) return;
    newActions
      .reject(orderId, reason)
      .then(() => setRejectId(null))
      .catch(error => {
        // The order moved on while the sheet was open: its new state is shown, so the question is over.
        if (isOrderMovedOn(error)) setRejectId(null);
      });
  };

  const confirmReady = async () => {
    const order = readyTarget;
    if (!order) return;
    try {
      await prepActions.markReady(order.id);
    } catch {
      // The preparing-order action reports the reason through its feedback.
    }
    setReadyTarget(null);
  };

  const renderNew = (order: ChefOperationalOrder) => {
    const number = shortOrderNumber(order.id);
    const action = newActions.actionStateByOrder[order.id];
    return (
      <OrderCard
        actions={
          <>
            {order.chefAcceptanceExpiresAt ? (
              <RespondTimer createdAt={order.createdAt} expiresAt={order.chefAcceptanceExpiresAt} />
            ) : null}
            <View style={styles.buttons}>
              <ChefActionButton
                accessibilityLabel={`Reject order ${number}`}
                busy={action === 'rejecting'}
                disabled={action !== undefined}
                label="Reject"
                onPress={() => setRejectId(order.id)}
                style={styles.secondary}
                tone="neutral"
              />
              <ChefActionButton
                accessibilityLabel={`Accept order ${number}`}
                busy={action === 'accepting'}
                disabled={action !== undefined}
                label={`Accept · ${acceptReadyMinutes(order, menuItems)} min`}
                onPress={() => {
                  newActions.accept(order.id).catch(() => undefined);
                }}
                style={styles.main}
              />
            </View>
          </>
        }
        key={order.id}
        onPress={() => openOrder(order.id)}
        order={toOrderCardOrder(order)}
      />
    );
  };

  const renderPreparing = (order: ChefOperationalOrder) => {
    const number = shortOrderNumber(order.id);
    const timer = orderTabs.prepTimers[order.id];
    const action = prepActions.actionStateByOrder[order.id];
    const accepted = timeOf(order.updatedAt);
    return (
      <OrderCard
        actions={
          <>
            {timer ? <PrepTimerLine timer={timer} /> : null}
            <View style={styles.buttons}>
              <CallButton
                busy={action === 'calling'}
                label={`Call customer for ${number}`}
                onPress={() => {
                  prepActions.callCustomer(order.id).catch(() => undefined);
                }}
              />
              <ChefActionButton
                accessibilityLabel={`Mark ${number} ready`}
                busy={action === 'marking-ready'}
                disabled={action !== undefined}
                label="Mark ready"
                onPress={() => setReadyTarget(order)}
                style={styles.grow}
                tone="success"
              />
            </View>
          </>
        }
        key={order.id}
        onPress={() => openOrder(order.id)}
        order={{...toOrderCardOrder(order), area: undefined, placedAt: undefined, detail: accepted ? `Accepted ${accepted}` : undefined}}
      />
    );
  };

  const renderReady = (order: ChefOperationalOrder) => {
    const number = shortOrderNumber(order.id);
    const since = timeOf(order.updatedAt);
    const chip = chefOrderStatusChip(order.status);
    return (
      <OrderCard
        actions={
          <>
            <PartnerRow partner={order.deliveryPartner} />
            <View style={styles.buttons}>
              <ChefActionButton
                accessibilityLabel={`Not picked up ${number}`}
                label="Not picked up"
                onPress={() => setNotPickedId(order.id)}
                style={styles.secondary}
                tone="neutral"
              />
              {handover.canHandOver(order) ? (
                <ChefActionButton
                  accessibilityLabel={`Handed over ${number}`}
                  busy={handover.busyOrderId === order.id}
                  label="Handed over"
                  onPress={() => {
                    handover.handOver(order.id).catch(() => undefined);
                  }}
                  style={styles.main}
                />
              ) : null}
            </View>
          </>
        }
        badge={<StatusChip label={chip.label} tone={chip.tone} />}
        key={order.id}
        onPress={() => openOrder(order.id)}
        order={{...toOrderCardOrder(order), area: undefined, placedAt: undefined, detail: since ? `Ready since ${since}` : undefined}}
      />
    );
  };

  const loading = ordersStatus === 'pending' && orders.length === 0;
  const failed = ordersStatus === 'error' && orders.length === 0;

  const renderLive = (list: ChefOperationalOrder[]) => {
    if (list.length === 0 && filter === 'NEW') {
      return (
        <>
          <EmptyState
            icon="bell"
            message="New orders show up here. Keep the app open while your kitchen is open."
            title="No new orders"
          />
          <KitchenStatusCard
            cookingCount={counts.PREPARING}
            onChangeHours={() => navigation.navigate('Profile', {screen: 'ChefKitchenSchedule', initial: false})}
          />
        </>
      );
    }
    if (list.length === 0 && (filter === 'PREPARING' || filter === 'READY')) {
      const copy = EMPTY_COPY[filter];
      return (
        <EmptyState icon={copy.icon} message={copy.message} title={copy.title}>
          <ChefActionButton label="See new orders" onPress={() => showFilter('NEW')} style={styles.emptyAction} tone="neutral" />
        </EmptyState>
      );
    }
    return (
      <>
        {list.map(order => (filter === 'NEW' ? renderNew(order) : filter === 'PREPARING' ? renderPreparing(order) : renderReady(order)))}
        {filter === 'READY' ? (
          <View style={styles.tip}>
            <Icon color={colors.infoText} name="info" size={iconSize.md} surface={false} />
            <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.tipText}>
              Hand the bag only to the partner shown here. Check the order number on the bag.
            </Text>
          </View>
        ) : null}
      </>
    );
  };

  const body = (() => {
    if (filter === 'SCHEDULED') {
      return <ScheduledOrdersList onOpenOrder={openOrder} onSeeNew={() => showFilter('NEW')} orders={orders} queue={scheduled} />;
    }
    if (loading) {
      return (
        <>
          <SkeletonBlock height={150} />
          <SkeletonBlock height={150} />
          <SkeletonBlock height={150} />
        </>
      );
    }
    if (failed) {
      return (
        <ChefCard>
          <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.errorTitle}>
            We couldn't load your orders
          </Text>
          <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.errorMessage}>
            Check your connection and try again.
          </Text>
          <ChefActionButton label="Try again" onPress={pull} tone="neutral" />
        </ChefCard>
      );
    }
    return renderLive(filter === 'PAST' ? [] : ordersForFilter(orders, filter));
  })();

  // Past is a long list that loads older orders as it is scrolled, so it scrolls itself.
  const paged = filter === 'PAST' && !loading && !failed;

  const header = (
    <>
      <ChefTopBar title="Orders" />
      <FilterChips counts={counts} onSelect={next => next !== filter && showFilter(next)} selected={filter} />
    </>
  );

  return (
    <ChefScreen
      header={header}
      onRefresh={pull}
      refreshing={pulling}
      scroll={!paged}
      withTabBar>
      {paged ? (
        <PastOrdersList
          onOpenOrder={openOrder}
          onRefresh={refreshAll}
          onSeeNew={() => showFilter('NEW')}
          orders={orders}
        />
      ) : (
        body
      )}

      <RejectOrderSheet
        busy={rejectBusy}
        kind={rejectKindOf(orders.find(order => order.id === rejectId) ?? {})}
        onClose={() => setRejectId(null)}
        onConfirm={submitReject}
        orderNumber={rejectId ? shortOrderNumber(rejectId) : ''}
        visible={rejectId !== null}
      />
      <ConfirmDialog
        busy={readyTarget !== null && prepActions.actionStateByOrder[readyTarget.id] === 'marking-ready'}
        cancelLabel="Not yet"
        confirmLabel="Yes, it's ready"
        message={`${itemsSummary(readyTarget?.items)}${readyTarget?.items?.length ? '. ' : ''}The delivery partner is told to pick it up.`}
        onCancel={() => setReadyTarget(null)}
        onConfirm={() => {
          confirmReady().catch(() => undefined);
        }}
        title={`Is ${readyTarget ? shortOrderNumber(readyTarget.id) : 'this order'} packed and ready?`}
        tone="success"
        visible={readyTarget !== null}
      />
      <NotPickedUpSheet onClose={() => setNotPickedId(null)} orderId={notPickedId} />
    </ChefScreen>
  );
}

const styles = StyleSheet.create({
  buttons: {flexDirection: 'row', gap: spacing.sm},
  secondary: {flex: 1},
  main: {flex: 2},
  grow: {flex: 1},
  emptyAction: {alignSelf: 'stretch', marginTop: spacing.sm},
  tip: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.infoSoft,
  },
  tipText: {flex: 1, color: colors.infoText, fontSize: typography.body},
  errorTitle: {color: colors.textPrimary, fontSize: typography.body, fontWeight: fontWeight.bold},
  errorMessage: {color: colors.textSecondary, fontSize: typography.small, marginBottom: spacing.sm},
});
