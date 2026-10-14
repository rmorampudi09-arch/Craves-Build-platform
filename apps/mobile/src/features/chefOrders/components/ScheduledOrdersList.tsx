import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {colors, fontWeight, iconSize, spacing, textDefaults, typography} from '../../../design/tokens';
import {Icon} from '../../../shared/components/Icon';
import {SkeletonBlock} from '../../../shared/components/Skeleton';
import type {ChefScheduledOrder} from '../../chefScheduledOrders/api/chefScheduledOrdersApi';
import type {ChefScheduledOrdersQueue} from '../../chefScheduledOrders/query/useChefScheduledOrdersQueue';
import type {ChefOperationalOrder} from '../../chefShell/api/chefOperationalApi';
import {
  ChefActionButton,
  ChefCard,
  ComingSoon,
  ConfirmDialog,
  ListGroup,
  ListRow,
  SectionHeader,
  StatusChip,
  useChefToast,
} from '../../chefShell/components/ui';
import {formatDayLabel, formatRupees, formatTimeOfDay, shortOrderNumber} from '../../chefShell/domain/chefFormat';
import {itemsSummary} from '../domain/chefOrderCard';
import {EmptyState} from './OrderCardParts';
import {RejectOrderSheet} from './RejectOrderSheet';

export const SCHEDULE_RESPONSE_FAILED = "We couldn't save that. Check your connection and try again.";

/** `Tomorrow, 1:00 PM`, or `Sat 18 Oct, 12:30 PM` further out. */
function scheduleWhen(iso: string, now: Date): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : `${formatDayLabel(date, now, {weekday: true})}, ${formatTimeOfDay(date)}`;
}

export interface ScheduledOrdersListProps {
  queue: ChefScheduledOrdersQueue;
  /** The live orders, to put the customer and dishes on a request when its order is already in the list. */
  orders: readonly ChefOperationalOrder[];
  onOpenOrder: (orderId: string) => void;
  onSeeNew: () => void;
}

export function ScheduledOrdersList({queue, orders, onOpenOrder, onSeeNew}: ScheduledOrdersListProps) {
  const toast = useChefToast();
  const [confirmItem, setConfirmItem] = React.useState<ChefScheduledOrder | null>(null);
  const [declineItem, setDeclineItem] = React.useState<ChefScheduledOrder | null>(null);
  const now = new Date();
  const orderOf = (orderId: string) => orders.find(order => order.id === orderId);

  if (queue.unavailable) {
    return (
      <ComingSoon
        message="Customers will be able to book food for a later time. You'll confirm each request here."
        title="Scheduled orders are coming soon"
      />
    );
  }
  if (queue.status === 'pending' && queue.pending.length === 0) {
    return (
      <View style={styles.skeleton}>
        <SkeletonBlock height={150} />
        <SkeletonBlock height={150} />
      </View>
    );
  }
  if (queue.status === 'error' && queue.pending.length === 0) {
    return (
      <ChefCard>
        <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.errorTitle}>
          We couldn't load your scheduled orders
        </Text>
        <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.errorMessage}>
          Check your connection and try again.
        </Text>
        <ChefActionButton
          label="Try again"
          onPress={() => {
            queue.refresh().catch(() => undefined);
          }}
          tone="neutral"
        />
      </ChefCard>
    );
  }
  if (queue.pending.length === 0 && queue.confirmed.length === 0) {
    return (
      <EmptyState
        icon="calendar"
        message="When a customer books food for a later time, you confirm it here."
        title="No scheduled orders">
        <ChefActionButton label="See new orders" onPress={onSeeNew} style={styles.action} tone="neutral" />
      </EmptyState>
    );
  }

  const respond = async (item: ChefScheduledOrder, action: 'ACCEPT' | 'REJECT', note?: string) => {
    try {
      // false: this order's answer is already on its way, so this press did nothing and the first one decides what is shown.
      if ((await queue.respond(item, action, note)) === false) {
        return;
      }
    } catch {
      toast.show(SCHEDULE_RESPONSE_FAILED);
    }
    setConfirmItem(null);
    setDeclineItem(null);
  };

  return (
    <>
      {queue.pending.length > 0 ? <SectionHeader title="Waiting for you to confirm" /> : null}
      {queue.pending.map(item => {
        const live = orderOf(item.orderId);
        const busy = queue.respondingOrderId === item.orderId;
        const passed = Date.parse(item.requestedFulfilmentAt) <= now.getTime();
        const who = [shortOrderNumber(item.orderId), live?.customerName, live?.deliverySummary?.areaName ?? undefined]
          .filter(Boolean)
          .join(' · ');
        const dishes = itemsSummary(live?.items);
        return (
          <ChefCard key={`${item.scheduleRequestId}:${item.orderId}`}>
            <View style={styles.top}>
              <View style={styles.topText}>
                <View style={styles.when}>
                  <Icon color={colors.infoText} name="calendar" size={iconSize.sm} surface={false} />
                  <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.whenText}>
                    {scheduleWhen(item.requestedFulfilmentAt, now)}
                  </Text>
                </View>
                <Text allowFontScaling={textDefaults.allowFontScaling} numberOfLines={2} style={styles.who}>
                  {who}
                </Text>
              </View>
              {live?.foodSubtotal !== undefined ? (
                <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.amount}>
                  {formatRupees(live.foodSubtotal)}
                </Text>
              ) : null}
            </View>
            {dishes ? (
              <Text allowFontScaling={textDefaults.allowFontScaling} numberOfLines={2} style={styles.dishes}>
                {dishes}
              </Text>
            ) : null}
            <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.note}>
              {passed
                ? 'The requested time has passed. Pull down to refresh.'
                : item.paymentGate === 'PAYMENT_BEFORE_CHEF_CONFIRMATION'
                  ? 'Customer has already paid.'
                  : 'Customer pays when you confirm.'}
            </Text>
            <View style={styles.buttons}>
              <ChefActionButton
                accessibilityLabel={`Decline scheduled order ${shortOrderNumber(item.orderId)}`}
                disabled={busy || passed}
                label="Decline"
                onPress={() => setDeclineItem(item)}
                style={styles.decline}
                tone="neutral"
              />
              <ChefActionButton
                accessibilityLabel={`Confirm scheduled order ${shortOrderNumber(item.orderId)}`}
                busy={busy}
                disabled={passed}
                label="Confirm"
                onPress={() => setConfirmItem(item)}
                style={styles.confirm}
              />
            </View>
          </ChefCard>
        );
      })}
      {queue.hasNextPage ? (
        <ChefActionButton
          busy={queue.isFetchingNextPage}
          label="Show more"
          onPress={() => {
            queue.loadOlder().catch(() => undefined);
          }}
          tone="neutral"
        />
      ) : null}

      {queue.confirmed.length > 0 ? (
        <>
          <SectionHeader title="Confirmed" />
          <ListGroup>
            {queue.confirmed.map(item => {
              const live = orderOf(item.orderId);
              const when = scheduleWhen(item.requestedFulfilmentAt, now);
              return (
                <ListRow
                  accessibilityLabel={`Scheduled order ${shortOrderNumber(item.orderId)}, ${when}, confirmed`}
                  icon="calendar-check"
                  iconTone="red"
                  key={`${item.scheduleRequestId}:${item.orderId}`}
                  onPress={() => onOpenOrder(item.orderId)}
                  right={<StatusChip label="Confirmed" tone="info" />}
                  subtitle={[shortOrderNumber(item.orderId), itemsSummary(live?.items)].filter(Boolean).join(' · ')}
                  title={when}
                />
              );
            })}
          </ListGroup>
        </>
      ) : null}

      <ConfirmDialog
        busy={confirmItem !== null && queue.respondingOrderId === confirmItem.orderId}
        cancelLabel="Not yet"
        confirmLabel="Confirm"
        message="It shows up in New orders when it is time to cook."
        onCancel={() => setConfirmItem(null)}
        onConfirm={() => {
          if (confirmItem) respond(confirmItem, 'ACCEPT').catch(() => undefined);
        }}
        title={`Confirm for ${scheduleWhen(confirmItem?.requestedFulfilmentAt ?? '', now).replace(/^(Today|Tomorrow)/, m => m.toLowerCase())}?`}
        visible={confirmItem !== null}
      />
      <RejectOrderSheet
        busy={declineItem !== null && queue.respondingOrderId === declineItem.orderId}
        // A request the customer has not paid for yet has nothing to refund.
        kind={declineItem?.paymentGate === 'PAYMENT_BEFORE_CHEF_CONFIRMATION' ? 'paid' : 'unpaid'}
        onClose={() => setDeclineItem(null)}
        onConfirm={reason => {
          if (declineItem) respond(declineItem, 'REJECT', reason).catch(() => undefined);
        }}
        orderNumber={declineItem ? shortOrderNumber(declineItem.orderId) : ''}
        visible={declineItem !== null}
      />
    </>
  );
}

const styles = StyleSheet.create({
  skeleton: {gap: spacing.md},
  errorTitle: {color: colors.textPrimary, fontSize: typography.body, fontWeight: fontWeight.bold},
  errorMessage: {color: colors.textSecondary, fontSize: typography.small, marginBottom: spacing.sm},
  action: {alignSelf: 'stretch', marginTop: spacing.sm},
  top: {flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.sm},
  topText: {flex: 1, minWidth: 0},
  when: {flexDirection: 'row', alignItems: 'center', gap: spacing.xs},
  whenText: {flex: 1, color: colors.textPrimary, fontSize: typography.button, fontWeight: fontWeight.extrabold},
  who: {marginTop: spacing.xxs, color: colors.textSecondary, fontSize: typography.small},
  amount: {color: colors.textPrimary, fontSize: typography.button, fontWeight: fontWeight.extrabold},
  dishes: {marginTop: spacing.xs, color: colors.textPrimary, fontSize: typography.body},
  note: {marginTop: spacing.sm, color: colors.textSecondary, fontSize: typography.small},
  buttons: {flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm},
  decline: {flex: 1},
  confirm: {flex: 2},
});
