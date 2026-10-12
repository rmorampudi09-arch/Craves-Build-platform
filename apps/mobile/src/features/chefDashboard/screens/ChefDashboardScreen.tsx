import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {useNavigation, type CompositeNavigationProp} from '@react-navigation/native';
import type {BottomTabNavigationProp} from '@react-navigation/bottom-tabs';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import type {ChefProductStackParamList, ChefTabParamList} from '../../../app/navigation/types';
import {
  borderWidth,
  colors,
  fontWeight,
  iconSize,
  radius,
  spacing,
  textDefaults,
  typography,
} from '../../../design/tokens';
import {Icon} from '../../../shared/components/Icon';
import {useKitchenOpenState, type KitchenOpenState} from '../../chefProfile/state/useKitchenOpenState';
import {RejectOrderSheet} from '../../chefOrders/components/RejectOrderSheet';
import {toOrderCardOrder} from '../../chefOrders/domain/chefOrderCard';
import {isOrderMovedOn} from '../../chefOrders/domain/chefOrderDecision';
import {ordersForFilter} from '../../chefOrders/domain/chefOrderFilters';
import {rejectKindOf} from '../../chefOrders/domain/chefOrderReasons';
import {useChefNewOrderActions} from '../../chefOrders/state/useChefNewOrderActions';
import {useChefPreparingOrderActions} from '../../chefOrders/state/useChefPreparingOrderActions';
import type {ChefOperationalOrder} from '../../chefShell/api/chefOperationalApi';
import {
  ChefActionButton,
  ChefCard,
  ChefScreen,
  ConfirmDialog,
  ListGroup,
  ListRow,
  OrderCard,
  SectionHeader,
  StatTile,
  useChefToast,
} from '../../chefShell/components/ui';
import {NotificationBell} from '../../chefShell/components/ui/ChefTopBar';
import {formatRelativeTime, formatRupees, formatTimeOfDay, shortOrderNumber} from '../../chefShell/domain/chefFormat';
import {useChefOperationalState} from '../../chefShell/state/ChefOperationalProvider';
import {useChefReviewPreview} from '../../reviews/query/useChefReviewPreview';
import {RespondTimer} from '../components/RespondTimer';
import {useKitchenStatusControl} from '../components/useKitchenStatusControl';
import {acceptReadyMinutes} from '../domain/chefDashboardPresentation';
import {useChefDashboardModel} from '../state/useChefDashboardModel';

type HomeNavigation = CompositeNavigationProp<
  BottomTabNavigationProp<ChefTabParamList, 'Dashboard'>,
  NativeStackNavigationProp<ChefProductStackParamList>
>;

const KITCHEN_ROWS = 4;

const itemCount = (order: ChefOperationalOrder) => (order.items ?? []).reduce((sum, item) => sum + item.quantity, 0);
const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

function pillText(kitchen: KitchenOpenState): string {
  switch (kitchen.status) {
    case 'open':
      return 'Open · taking orders';
    case 'paused':
      return kitchen.pausedUntil ? `Paused · back at ${formatTimeOfDay(new Date(kitchen.pausedUntil))}` : 'Paused';
    case 'suspended':
      return 'Paused by Craves';
    case 'closed':
      if (kitchen.closedReason === 'not-accepting') return 'Closed · not taking orders';
      return kitchen.closedReason === 'outside-hours' && kitchen.opensAt ? `Closed · opens ${kitchen.opensAt}` : 'Closed';
    default:
      return kitchen.unavailable ? 'Kitchen status unavailable' : 'Checking kitchen status';
  }
}

const PILL_COLORS = {
  open: {background: colors.successSoft, foreground: colors.successText, dot: colors.success},
  paused: {background: colors.warningSoft, foreground: colors.warningText, dot: colors.warning},
  suspended: {background: colors.warningSoft, foreground: colors.warningText, dot: colors.warning},
  closed: {background: colors.white, foreground: colors.textSecondary, dot: colors.textSecondary},
  unknown: {background: colors.white, foreground: colors.textSecondary, dot: colors.borderStrong},
} as const;

/** What the closed card says and does: open the kitchen, change the hours, or nothing (Craves holds it). */
function closedCardCopy(kitchen: KitchenOpenState): {title: string; message: string; action: 'open' | 'hours' | null} {
  if (kitchen.status === 'suspended') {
    return {
      title: 'Your kitchen is paused by Craves',
      message: "Customers can't order right now. Contact Craves support to find out why and how to open again.",
      action: null,
    };
  }
  if (kitchen.closedReason === 'not-accepting') {
    return {
      title: 'Your kitchen is not taking orders',
      message: "Customers can't order right now. Start taking orders again when you're ready to cook.",
      action: 'open',
    };
  }
  if (kitchen.closedReason === 'outside-hours') {
    return {
      title: 'Your kitchen is closed for now',
      message: kitchen.opensAt
        ? `It opens again at ${kitchen.opensAt}, as set in your opening hours.`
        : 'It opens again at its next opening time, as set in your opening hours.',
      action: 'hours',
    };
  }
  return {
    title: 'Your kitchen is closed',
    message: "Customers can't order right now. Open when you're ready to cook.",
    action: 'open',
  };
}

function HomeHeader({
  kitchen,
  onOpenStatus,
  onRetry,
}: {
  kitchen: KitchenOpenState;
  onOpenStatus: () => void;
  onRetry: () => void;
}) {
  const name = kitchen.kitchen?.kitchenName ?? 'Your kitchen';
  const text = pillText(kitchen);
  const pill = PILL_COLORS[kitchen.status];
  // Unreadable: tapping asks again. Still loading, or held by Craves: nothing to tap.
  const retry = kitchen.status === 'unknown' && kitchen.unavailable;
  const locked = (kitchen.status === 'unknown' && !kitchen.unavailable) || kitchen.status === 'suspended';
  return (
    <View style={styles.header}>
      <View importantForAccessibility="no-hide-descendants" style={styles.avatar}>
        <Text allowFontScaling={false} style={styles.avatarText}>
          {name.charAt(0).toUpperCase()}
        </Text>
      </View>
      <View style={styles.headerText}>
        <Text
          accessibilityRole="header"
          allowFontScaling={textDefaults.allowFontScaling}
          numberOfLines={1}
          style={styles.kitchenName}>
          {name}
        </Text>
        <Pressable
          accessibilityHint={retry ? 'Tries to load the kitchen status again' : undefined}
          accessibilityLabel={`Kitchen status: ${text}`}
          accessibilityRole="button"
          disabled={locked}
          hitSlop={{top: 10, bottom: 10, left: 8, right: 8}}
          onPress={retry ? onRetry : onOpenStatus}
          style={[styles.pill, {backgroundColor: pill.background}, pill.background === colors.white && styles.pillOutline]}>
          <View style={[styles.dot, {backgroundColor: pill.dot}]} />
          <Text allowFontScaling={textDefaults.allowFontScaling} numberOfLines={1} style={[styles.pillText, {color: pill.foreground}]}>
            {text}
          </Text>
          {locked ? null : <Icon color={pill.foreground} name={retry ? 'renew' : 'chevron-down'} size={iconSize.xs} surface={false} />}
        </Pressable>
      </View>
      <NotificationBell />
    </View>
  );
}

export function ChefDashboardScreen() {
  const navigation = useNavigation<HomeNavigation>();
  const toast = useChefToast();
  const model = useChefDashboardModel();
  const kitchen = useKitchenOpenState();
  const reviews = useChefReviewPreview();
  const newActions = useChefNewOrderActions();
  const prepActions = useChefPreparingOrderActions();
  const {orderTabs} = useChefOperationalState();

  const [readyTarget, setReadyTarget] = React.useState<ChefOperationalOrder | null>(null);
  const [rejectTarget, setRejectTarget] = React.useState<ChefOperationalOrder | null>(null);
  // Orders being cooked now (accepted or preparing), by the same rule as the Preparing list; packed ones are not cooking.
  const cooking = ordersForFilter(model.kitchenOrders, 'PREPARING').length;
  const kitchenControl = useKitchenStatusControl(kitchen, cooking, () =>
    navigation.navigate('Profile', {screen: 'ChefKitchenSchedule'}),
  );

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

  const refreshKitchen = kitchen.refresh;
  const retryKitchen = () => {
    refreshKitchen().catch(() => undefined);
  };
  const refresh = React.useCallback(() => {
    Promise.allSettled([model.refresh(), reviews.refresh(), refreshKitchen()]).catch(() => undefined);
  }, [model, refreshKitchen, reviews]);

  const openOrders = (screen: 'ChefOrdersNew' | 'ChefOrdersPreparing') => navigation.navigate('Orders', {screen});

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

  const rejectBusy = rejectTarget !== null && newActions.actionStateByOrder[rejectTarget.id] === 'rejecting';
  const submitReject = (reason: string) => {
    if (!rejectTarget) return;
    newActions
      .reject(rejectTarget.id, reason)
      .then(() => setRejectTarget(null))
      .catch(error => {
        // The order moved on while the sheet was open: its new state is shown, so the question is over.
        if (isOrderMovedOn(error)) setRejectTarget(null);
      });
  };

  const pending = model.pendingOrders;
  const firstPending = pending[0];
  const kitchenRows = model.kitchenOrders.slice(0, KITCHEN_ROWS);
  const menu = model.data.menu;
  const ordersFailed = model.sources.orders === 'error' && model.pendingOrders.length === 0 && model.kitchenOrders.length === 0;
  // "No orders" is only true once the orders have loaded; before that we simply do not know.
  const nothingGoingOn =
    model.sources.orders === 'success' && pending.length === 0 && model.kitchenOrders.length === 0 && kitchen.status === 'open';
  // Same for the menu. Dishes already on screen stay, even if a later refresh failed.
  const menuKnown = model.sources.menu === 'success' || model.menuItems.length > 0;
  const closedCopyNow = closedCardCopy(kitchen);
  const average = reviews.summary?.overallAverage;
  const nowMs = Date.now();

  const kitchenSection =
    model.kitchenOrders.length > 0 ? (
      <>
        <SectionHeader actionLabel="All orders" onAction={() => openOrders('ChefOrdersPreparing')} title="In the kitchen" />
        <ListGroup>
          {kitchenRows.map(order => {
            const number = shortOrderNumber(order.id);
            if (order.status === 'READY_FOR_PICKUP') {
              const partner = order.deliveryPartner;
              const eta = partner?.pickupEtaAt ? Math.round((Date.parse(partner.pickupEtaAt) - nowMs) / 60_000) : null;
              return (
                <ListRow
                  icon="check"
                  iconTone="green"
                  key={order.id}
                  onPress={() => navigation.navigate('ChefOrderDetail', {orderId: order.id})}
                  subtitle={
                    partner?.name
                      ? eta !== null && eta > 0
                        ? `${partner.name} picks up in ${eta} min`
                        : `${partner.name} is on the way to pick up`
                      : 'Waiting for pickup'
                  }
                  title={`${number} · Ready`}
                />
              );
            }
            const timer = orderTabs.prepTimers[order.id];
            const count = itemCount(order);
            const timing = timer
              ? timer.isOverdue
                ? `${Math.max(1, Math.round((nowMs - timer.serverDueAtMs) / 60_000))} min late`
                : `ready in ${Math.max(1, Math.ceil(timer.remainingMs / 60_000))} min`
              : null;
            return (
              <ListRow
                icon="meal"
                iconTone="amber"
                key={order.id}
                right={
                  <ChefActionButton
                    accessibilityLabel={`Mark ${number} ready`}
                    compact
                    label="Mark ready"
                    onPress={() => setReadyTarget(order)}
                    tone="neutral"
                  />
                }
                subtitle={[count > 0 ? plural(count, 'item', 'items') : null, timing].filter(Boolean).join(' · ') || 'Cooking'}
                title={`${number} · Preparing`}
              />
            );
          })}
        </ListGroup>
      </>
    ) : null;

  const todaySection = (
    <>
      <SectionHeader actionLabel="Earnings" onAction={() => navigation.navigate('Earnings')} title="Today" />
      <View style={styles.stats}>
        <StatTile label="Earned" value={model.sources.earnings === 'success' ? formatRupees(model.today.earned) : '—'} />
        <StatTile label="Orders" value={model.sources.orders === 'success' ? model.today.delivered : '—'} />
        {reviews.available ? <StatTile label="Rating" value={average != null ? `${average.toFixed(1)} ★` : '—'} /> : null}
      </View>
    </>
  );

  const latestReview = reviews.available ? reviews.reviews[0] : undefined;

  const menuCard = menuKnown ? (
    <ChefCard
      accessibilityLabel={
        menu.activeItems === 0 ? 'Add your first dish' : `${menu.sellableItems} of ${menu.activeItems} dishes available, open menu`
      }
      onPress={() => navigation.navigate('Menu')}>
      <View style={styles.menuRow}>
        <Icon color={colors.flameRedAccessible} name="meal" size={iconSize.xl} surface={false} />
        <View style={styles.bannerText}>
          {menu.activeItems === 0 ? (
            <>
              <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.cardTitle}>
                Add your first dish
              </Text>
              <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.cardMessage}>
                Customers can order once you have a dish on your menu.
              </Text>
            </>
          ) : (
            <>
              <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.cardTitle}>
                {`${menu.sellableItems} of ${menu.activeItems} dishes available`}
              </Text>
              <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.cardMessage}>
                {menu.activeItems === menu.sellableItems
                  ? 'All your dishes are switched on'
                  : `${plural(menu.activeItems - menu.sellableItems, 'dish is', 'dishes are')} switched off`}
              </Text>
            </>
          )}
        </View>
        <Icon color={colors.borderStrong} name="chevron-right" size={iconSize.md} surface={false} />
      </View>
    </ChefCard>
  ) : (
    <ChefCard>
      {model.sources.menu === 'error' ? (
        <>
          <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.cardTitle}>
            We couldn't load your menu
          </Text>
          <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.cardMessage}>
            Check your connection and try again.
          </Text>
          <ChefActionButton label="Try again" onPress={refresh} style={styles.fullWidth} tone="neutral" />
        </>
      ) : (
        <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.cardMessage}>
          Checking your menu
        </Text>
      )}
    </ChefCard>
  );

  return (
    <ChefScreen
      header={<HomeHeader kitchen={kitchen} onOpenStatus={kitchenControl.openSheet} onRetry={retryKitchen} />}
      onRefresh={refresh}
      refreshing={model.isRefreshing}
      withTabBar>
      {kitchen.status === 'closed' || kitchen.status === 'suspended' ? (
        <ChefCard style={styles.closedCard}>
          <Icon color={colors.textSecondary} name="store" size={iconSize.xxl} surface={false} />
          <Text accessibilityRole="header" allowFontScaling={textDefaults.allowFontScaling} style={styles.closedTitle}>
            {closedCopyNow.title}
          </Text>
          <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.closedMessage}>
            {closedCopyNow.message}
          </Text>
          {closedCopyNow.action === 'open' ? (
            <ChefActionButton
              busy={kitchen.saving}
              label="Open kitchen"
              onPress={() => kitchenControl.open().catch(() => undefined)}
              style={styles.fullWidth}
              tone="success"
            />
          ) : null}
          {closedCopyNow.action === 'hours' ? (
            <ChefActionButton
              label="Change opening hours"
              onPress={() => navigation.navigate('Profile', {screen: 'ChefKitchenSchedule'})}
              style={styles.fullWidth}
              tone="neutral"
            />
          ) : null}
        </ChefCard>
      ) : null}

      {kitchen.status === 'paused' ? (
        <>
          <View style={styles.banner}>
            <Icon color={colors.warningText} name="pause" size={iconSize.md} surface={false} />
            <View style={styles.bannerText}>
              <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.bannerTitle}>
                {kitchen.pausedUntil
                  ? `New orders paused until ${formatTimeOfDay(new Date(kitchen.pausedUntil))}`
                  : 'New orders paused'}
              </Text>
              <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.bannerDetail}>
                {kitchen.pausedUntil
                  ? `Customers see "Opens again at ${formatTimeOfDay(new Date(kitchen.pausedUntil))}". Orders you already accepted carry on.`
                  : 'Orders you already accepted carry on.'}
              </Text>
            </View>
          </View>
          <ChefActionButton
            busy={kitchen.saving}
            icon="play"
            label="Resume now"
            onPress={() => kitchenControl.resume().catch(() => undefined)}
            tone="success"
          />
        </>
      ) : null}

      {ordersFailed ? (
        <ChefCard>
          <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.cardTitle}>
            We couldn't load your orders
          </Text>
          <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.cardMessage}>
            Check your connection and try again.
          </Text>
          <ChefActionButton label="Try again" onPress={refresh} style={styles.fullWidth} tone="neutral" />
        </ChefCard>
      ) : null}

      {firstPending ? (
        <>
          <SectionHeader
            actionLabel={plural(pending.length, 'new order', 'new orders')}
            onAction={() => openOrders('ChefOrdersNew')}
            title="Needs you now"
          />
          <OrderCard
            actions={
              <>
                {firstPending.chefAcceptanceExpiresAt ? (
                  <RespondTimer createdAt={firstPending.createdAt} expiresAt={firstPending.chefAcceptanceExpiresAt} />
                ) : null}
                <View style={styles.buttons}>
                  <ChefActionButton
                    accessibilityLabel={`Reject order ${shortOrderNumber(firstPending.id)}`}
                    disabled={newActions.actionStateByOrder[firstPending.id] !== undefined}
                    label="Reject"
                    onPress={() => setRejectTarget(firstPending)}
                    style={styles.rejectButton}
                    tone="neutral"
                  />
                  <ChefActionButton
                    busy={newActions.actionStateByOrder[firstPending.id] === 'accepting'}
                    label={`Accept · ready in ${acceptReadyMinutes(firstPending, model.menuItems)} min`}
                    onPress={() => {
                      newActions.accept(firstPending.id).catch(() => undefined);
                    }}
                    style={styles.acceptButton}
                  />
                </View>
              </>
            }
            highlighted
            onPress={() => navigation.navigate('ChefOrderDetail', {orderId: firstPending.id})}
            order={toOrderCardOrder(firstPending)}
          />
        </>
      ) : null}

      {nothingGoingOn ? (
        <ChefCard>
          <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.cardTitle}>
            No orders right now
          </Text>
          <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.cardMessage}>
            New orders will show up here as soon as customers place them.
          </Text>
        </ChefCard>
      ) : null}

      {kitchen.status === 'paused' ? (
        <>
          {kitchenSection}
          {todaySection}
        </>
      ) : (
        <>
          {todaySection}
          {kitchenSection}
        </>
      )}

      <SectionHeader actionLabel="Manage" onAction={() => navigation.navigate('Menu')} title="Your menu" />
      {menuCard}

      {latestReview ? (
        <>
          <SectionHeader
            actionLabel="See all"
            onAction={() => navigation.navigate('Profile', {screen: 'ChefReviews'})}
            title="Latest reviews"
          />
          <ChefCard>
            <Text accessibilityLabel={`${latestReview.overallRating} out of 5 stars`} style={styles.stars}>
              {'★'.repeat(Math.max(0, Math.min(5, Math.round(latestReview.overallRating))))}
            </Text>
            {latestReview.reviewText ? (
              <Text allowFontScaling={textDefaults.allowFontScaling} numberOfLines={3} style={styles.reviewText}>
                {latestReview.reviewText}
              </Text>
            ) : null}
            <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.reviewDate}>
              {formatRelativeTime(latestReview.publishedAt, new Date())}
            </Text>
          </ChefCard>
        </>
      ) : null}

      <View style={styles.balance}>
        <View style={styles.balanceTop}>
          <View style={styles.bannerText}>
            <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.balanceLabel}>
              Available to withdraw
            </Text>
            <Text
              adjustsFontSizeToFit
              allowFontScaling={textDefaults.allowFontScaling}
              minimumFontScale={0.7}
              numberOfLines={1}
              style={styles.balanceAmount}>
              {model.balance ? formatRupees(Number(model.balance.available), {paise: true}) : '—'}
            </Text>
          </View>
          <Icon color={colors.white} name="wallet" size={iconSize.xl} surface={false} />
        </View>
        <ChefActionButton label="Withdraw" onPress={() => navigation.navigate('Earnings')} tone="inverse" />
      </View>

      {kitchenControl.dialogs}

      <RejectOrderSheet
        busy={rejectBusy}
        kind={rejectKindOf(rejectTarget ?? {})}
        onClose={() => setRejectTarget(null)}
        onConfirm={submitReject}
        orderNumber={rejectTarget ? shortOrderNumber(rejectTarget.id) : ''}
        visible={rejectTarget !== null}
      />

      <ConfirmDialog
        busy={readyTarget !== null && prepActions.actionStateByOrder[readyTarget.id] === 'marking-ready'}
        cancelLabel="Not yet"
        confirmLabel="Yes, it's ready"
        message={`${(readyTarget?.items ?? []).map(item => `${item.quantity} × ${item.itemName}`).join(', ')}${
          readyTarget?.items?.length ? '. ' : ''
        }The delivery partner is told to pick it up.`}
        onCancel={() => setReadyTarget(null)}
        onConfirm={() => {
          confirmReady().catch(() => undefined);
        }}
        title={`Is ${readyTarget ? shortOrderNumber(readyTarget.id) : 'this order'} packed and ready?`}
        tone="success"
        visible={readyTarget !== null}
      />
    </ChefScreen>
  );
}

const styles = StyleSheet.create({
  header: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.white,
    borderBottomWidth: borderWidth.standard,
    borderBottomColor: colors.border,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.flameRedAccessible,
  },
  avatarText: {color: colors.white, fontSize: typography.heading, fontWeight: fontWeight.bold},
  headerText: {flex: 1, minWidth: 0, alignItems: 'flex-start', gap: spacing.xxs},
  kitchenName: {color: colors.textPrimary, fontSize: typography.button, fontWeight: fontWeight.bold, alignSelf: 'stretch'},
  pill: {
    maxWidth: '100%',
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs - 2,
    paddingVertical: 2,
    paddingLeft: spacing.xs,
    paddingRight: spacing.xs - 2,
    borderRadius: radius.pill,
  },
  pillOutline: {borderWidth: borderWidth.standard, borderColor: colors.border},
  dot: {width: 8, height: 8, borderRadius: radius.pill},
  pillText: {flexShrink: 1, fontSize: typography.small, fontWeight: fontWeight.bold},
  closedCard: {alignItems: 'center', gap: spacing.xxs, paddingVertical: spacing.lg},
  closedTitle: {marginTop: spacing.xs, color: colors.textPrimary, fontSize: typography.heading - 2, fontWeight: fontWeight.bold},
  closedMessage: {color: colors.textSecondary, fontSize: typography.small, textAlign: 'center'},
  fullWidth: {alignSelf: 'stretch', marginTop: spacing.sm},
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.warningSoft,
  },
  bannerText: {flex: 1, minWidth: 0},
  bannerTitle: {color: colors.warningText, fontSize: typography.body, fontWeight: fontWeight.bold},
  bannerDetail: {color: colors.warningText, fontSize: typography.small},
  cardTitle: {color: colors.textPrimary, fontSize: typography.body, fontWeight: fontWeight.bold},
  cardMessage: {color: colors.textSecondary, fontSize: typography.small},
  buttons: {flexDirection: 'row', gap: spacing.sm},
  rejectButton: {flex: 1},
  acceptButton: {flex: 2},
  stats: {flexDirection: 'row', gap: spacing.sm},
  menuRow: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm},
  stars: {color: colors.warning, fontSize: typography.button, fontWeight: fontWeight.bold},
  reviewText: {marginTop: spacing.xxs, color: colors.textPrimary, fontSize: typography.body},
  reviewDate: {marginTop: spacing.xs, color: colors.textSecondary, fontSize: typography.small},
  balance: {gap: spacing.sm, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.espresso},
  balanceTop: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm},
  balanceLabel: {color: colors.white, fontSize: typography.small, opacity: 0.75},
  balanceAmount: {color: colors.white, fontSize: typography.title, fontWeight: fontWeight.extrabold},
});
