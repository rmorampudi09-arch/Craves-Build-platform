import React from 'react';
import {Linking, Pressable, StyleSheet, Text, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import type {ChefProductStackParamList} from '../../../app/navigation/types';
import {toAppApiError} from '../../../core/http/apiError';
import {
  borderWidth,
  colors,
  fontWeight,
  iconSize,
  radius,
  spacing,
  textDefaults,
  touchTarget,
  typography,
} from '../../../design/tokens';
import {Icon, type IconName} from '../../../shared/components/Icon';
import {SkeletonBlock} from '../../../shared/components/Skeleton';
import {RespondTimer} from '../../chefDashboard/components/RespondTimer';
import {acceptReadyMinutes} from '../../chefDashboard/domain/chefDashboardPresentation';
import {
  ChefActionButton,
  ChefCard,
  ChefScreen,
  ChefTopBar,
  ConfirmDialog,
  StatusChip,
  VegMark,
  useChefToast,
} from '../../chefShell/components/ui';
import type {VegMarkType} from '../../chefShell/components/ui/VegMark';
import {
  formatDayLabel,
  formatRupees,
  formatRupeesExact,
  formatTimeOfDay,
  shortCustomerName,
  shortOrderNumber,
} from '../../chefShell/domain/chefFormat';
import type {ChefOrderDetail} from '../api/chefOrderDetailApi';
import {NotPickedUpSheet} from '../components/NotPickedUpSheet';
import {CallButton} from '../components/OrderCardParts';
import {RejectOrderSheet} from '../components/RejectOrderSheet';
import {itemsSummary} from '../domain/chefOrderCard';
import {dialablePhone} from '../domain/chefOrderDetailModel';
import {chefOrderStatusChip} from '../domain/chefOrderFilters';
import {deriveChefPrepTimer} from '../domain/chefOrderTabs';
import {buildChefOrderTimeline, type ChefOrderTimelineStep} from '../domain/chefOrderTimeline';
import {useChefHandedOver} from '../state/useChefHandedOver';
import {useChefMenuPrepTimes} from '../state/useChefMenuPrepTimes';
import {useChefOrderDecision} from '../state/useChefOrderDecision';
import {useChefOrderDetailContract} from '../state/useChefOrderDetailContract';
import {useChefPreparingOrderActions} from '../state/useChefPreparingOrderActions';

type Props = NativeStackScreenProps<ChefProductStackParamList, 'ChefOrderDetail'>;

const OPEN_FAILED = "We couldn't open that on this phone.";
// Orders the chef can no longer act on: they show the Status card first and a way to ask Craves about the order.
const FINISHED = new Set<ChefOrderDetail['status']>([
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'CHEF_REJECTED',
  'CANCELLED',
  'REFUND_PENDING',
  'REFUNDED',
  'REFUND_FAILED',
]);

function placedLabel(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : `${formatDayLabel(date, new Date())}, ${formatTimeOfDay(date)}`;
}

function Card({title, children}: {title: string; children: React.ReactNode}) {
  return (
    <ChefCard>
      <Text accessibilityRole="header" allowFontScaling={textDefaults.allowFontScaling} style={styles.cardTitle}>
        {title}
      </Text>
      {children}
    </ChefCard>
  );
}

function Banner({tone, icon, children}: {tone: 'error' | 'success'; icon: IconName; children: React.ReactNode}) {
  const error = tone === 'error';
  return (
    <View style={[styles.banner, {backgroundColor: error ? colors.errorSoft : colors.successSoft}]}>
      <Icon color={error ? colors.flameRedAccessible : colors.successText} name={icon} size={iconSize.md} surface={false} />
      <View style={styles.bannerText}>{children}</View>
    </View>
  );
}

/** "Ready in 8 min / You promised 12:40 PM" for a cooking order, in red once it is late. */
function PrepBanner({order}: {order: ChefOrderDetail}) {
  const acceptedAt =
    order.statusHistory?.find(entry => entry.status === 'CHEF_ACCEPTED' || entry.status === 'PREPARING')?.at ?? order.updatedAt;
  const timer = deriveChefPrepTimer(
    {id: order.id, status: order.status, prepTimeMinutes: order.prepTimeMinutes, updatedAt: acceptedAt},
    Date.now(),
  );
  if (!timer) {
    return null;
  }
  const late = timer.isOverdue;
  const color = late ? colors.flameRedAccessible : colors.successText;
  const minutes = late
    ? Math.max(1, Math.round((Date.now() - timer.serverDueAtMs) / 60_000))
    : Math.max(1, Math.ceil(timer.remainingMs / 60_000));
  return (
    <Banner icon={late ? 'alert' : 'clock'} tone={late ? 'error' : 'success'}>
      <Text allowFontScaling={textDefaults.allowFontScaling} style={[styles.bannerTitle, {color}]}>
        {late ? `${minutes} min late` : `Ready in ${minutes} min`}
      </Text>
      <Text allowFontScaling={textDefaults.allowFontScaling} style={[styles.bannerDetail, {color}]}>
        {`You promised ${formatTimeOfDay(new Date(timer.serverDueAtMs))}`}
      </Text>
    </Banner>
  );
}

function StatusTimeline({steps}: {steps: ChefOrderTimelineStep[]}) {
  return (
    <View>
      {steps.map((step, index) => {
        const color = step.state === 'done' ? colors.success : colors.warning;
        return (
          <View key={`${step.label}-${index}`} style={styles.step}>
            <View style={styles.rail}>
              <View style={[styles.dot, step.state === 'todo' ? styles.dotTodo : {backgroundColor: color}]} />
              {index < steps.length - 1 ? (
                <View style={[styles.line, {backgroundColor: step.state === 'done' ? colors.success : colors.border}]} />
              ) : null}
            </View>
            <View style={styles.stepText}>
              <Text
                allowFontScaling={textDefaults.allowFontScaling}
                style={[styles.stepLabel, step.state === 'todo' && styles.stepTodo]}>
                {step.label}
              </Text>
              {step.detail ? (
                <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.stepDetail}>
                  {step.detail}
                </Text>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

function RoundButton({icon, label, onPress}: {icon: IconName; label: string; onPress: () => void}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={({pressed}) => [styles.round, pressed && styles.pressed]}>
      <Icon color={colors.textPrimary} name={icon} size={iconSize.md} surface={false} />
    </Pressable>
  );
}

/** One order: what to cook, who it is for, what the customer paid, and the next step for its status. */
export function ChefOrderDetailScreen({navigation, route}: Props) {
  const {orderId} = route.params;
  const toast = useChefToast();
  const detail = useChefOrderDetailContract(orderId);
  const decision = useChefOrderDecision(orderId);
  const prepActions = useChefPreparingOrderActions();
  const handover = useChefHandedOver();
  const menuItems = useChefMenuPrepTimes();
  const [rejectOpen, setRejectOpen] = React.useState(false);
  const [readyOpen, setReadyOpen] = React.useState(false);
  const [notPickedId, setNotPickedId] = React.useState<string | null>(null);
  const [pulling, setPulling] = React.useState(false);

  const order = detail.data?.order ?? null;
  const status = order?.status;

  // Say what went wrong once, plainly, then clear it.
  const {error: decisionError, clearError} = decision;
  React.useEffect(() => {
    if (decisionError) {
      toast.show(decisionError.message);
      clearError();
    }
  }, [clearError, decisionError, toast]);
  const {feedback, clearFeedback} = prepActions;
  React.useEffect(() => {
    if (feedback) {
      toast.show(feedback.message);
      clearFeedback();
    }
  }, [clearFeedback, feedback, toast]);
  // If the order moved on while the reject sheet was open (the latest status was loaded), the question is over.
  React.useEffect(() => {
    if (status && status !== 'CHEF_ACCEPTANCE_PENDING') {
      setRejectOpen(false);
    }
  }, [status]);

  const goBack = () => navigation.goBack();
  const goToOrders = () => navigation.navigate('ChefTabs', {screen: 'Orders'});
  const open = (url: string) => {
    Linking.openURL(url).catch(() => toast.show(OPEN_FAILED));
  };

  if (!order) {
    const loading = detail.status === 'pending';
    // A missing order is a real answer for a single order, unlike a route the server has not published.
    const notFound = !loading && detail.error !== null && toAppApiError(detail.error).status === 404;
    return (
      <ChefScreen header={<ChefTopBar onBack={goBack} showBell={false} title="Order" />}>
        {loading ? (
          <>
            <SkeletonBlock height={120} />
            <SkeletonBlock height={160} />
            <SkeletonBlock height={120} />
          </>
        ) : (
          <ChefCard>
            <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.cardTitle}>
              {notFound ? "We can't find this order" : "We couldn't load this order"}
            </Text>
            <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.muted}>
              {notFound ? 'It may have been removed. Go back to your orders.' : 'Check your connection and try again.'}
            </Text>
            <ChefActionButton
              label={notFound ? 'Back to orders' : 'Try again'}
              onPress={
                notFound
                  ? goBack
                  : () => {
                      detail.refresh().catch(() => undefined);
                    }
              }
              style={styles.cardAction}
              tone="neutral"
            />
          </ChefCard>
        )}
      </ChefScreen>
    );
  }

  const number = shortOrderNumber(order.id);
  const chip = chefOrderStatusChip(order.status);
  const finished = FINISHED.has(order.status);
  const address = order.deliveryAddress;
  const customer = shortCustomerName(address?.recipientName) ?? 'Customer';
  const phone = dialablePhone(address?.contactPhoneNumber);
  const cooking = order.status === 'CHEF_ACCEPTED' || order.status === 'PREPARING';
  const pendingDecision = order.status === 'CHEF_ACCEPTANCE_PENDING';
  const ready = order.status === 'READY_FOR_PICKUP';
  const deciding = decision.action !== null;
  const markingReady = prepActions.actionStateByOrder[order.id] === 'marking-ready';
  const minutes = acceptReadyMinutes(
    {
      id: order.id,
      status: order.status,
      prepTimeMinutes: order.prepTimeMinutes,
      items: order.items.map(({id, itemName, quantity, menuItemId}) => ({id, itemName, quantity, menuItemId})),
    },
    menuItems,
  );

  const accept = async () => {
    try {
      await decision.accept();
      goToOrders();
    } catch {
      // The decision hook reports what went wrong.
    }
  };
  const reject = async (reason: string) => {
    try {
      await decision.reject(reason);
      setRejectOpen(false);
      goToOrders();
    } catch {
      // The decision hook reports what went wrong.
    }
  };
  const markReady = async () => {
    try {
      await prepActions.markReady(order.id);
    } catch {
      // The preparing-order action reports the reason through its feedback.
    }
    setReadyOpen(false);
  };
  const pull = () => {
    setPulling(true);
    detail
      .refresh()
      .catch(() => undefined)
      .finally(() => setPulling(false));
  };

  let dock: React.ReactNode = null;
  if (pendingDecision) {
    dock = (
      <View style={styles.dock}>
        <ChefActionButton
          accessibilityLabel="Reject order"
          disabled={deciding}
          label="Reject"
          onPress={() => setRejectOpen(true)}
          style={styles.secondary}
          tone="neutral"
        />
        <ChefActionButton
          accessibilityLabel="Accept order"
          busy={decision.action === 'accept'}
          disabled={deciding}
          label={`Accept · ready in ${minutes} min`}
          onPress={() => {
            accept().catch(() => undefined);
          }}
          style={styles.main}
        />
      </View>
    );
  } else if (cooking) {
    dock = (
      <View style={styles.dock}>
        <CallButton label="Call customer" onPress={() => (phone ? open(`tel:${phone}`) : toast.show(OPEN_FAILED))} />
        <ChefActionButton
          accessibilityLabel="Mark ready"
          busy={markingReady}
          label="Mark ready"
          onPress={() => setReadyOpen(true)}
          style={styles.secondary}
          tone="success"
        />
      </View>
    );
  } else if (ready) {
    dock = (
      <View style={styles.dock}>
        <ChefActionButton
          accessibilityLabel="Not picked up"
          label="Not picked up"
          onPress={() => setNotPickedId(order.id)}
          style={styles.secondary}
          tone="neutral"
        />
        {handover.canHandOver(order) ? (
          <ChefActionButton
            accessibilityLabel="Handed over"
            busy={handover.busyOrderId === order.id}
            label="Handed over"
            onPress={() => {
              handover.handOver(order.id).catch(() => undefined);
            }}
            style={styles.main}
          />
        ) : null}
      </View>
    );
  }

  const timeline = pendingDecision ? null : (
    <Card title="Status">
      <StatusTimeline steps={buildChefOrderTimeline(order)} />
    </Card>
  );
  const alsoPaid = [
    order.deliveryFee > 0 ? `${formatRupeesExact(order.deliveryFee)} delivery` : null,
    order.taxAmount > 0 ? `${formatRupeesExact(order.taxAmount)} tax` : null,
  ].filter(Boolean);

  return (
    <ChefScreen
      footer={dock}
      header={
        <ChefTopBar
          onBack={goBack}
          right={<StatusChip label={chip.label} tone={chip.tone} />}
          showBell={false}
          subtitle={placedLabel(order.createdAt)}
          title={`Order ${number}`}
        />
      }
      onRefresh={pull}
      refreshing={pulling}>
      {pendingDecision && order.chefAcceptanceExpiresAt ? (
        <Banner icon="clock" tone="error">
          <RespondTimer createdAt={order.createdAt} expiresAt={order.chefAcceptanceExpiresAt} />
          <Text allowFontScaling={textDefaults.allowFontScaling} style={[styles.bannerDetail, {color: colors.flameRedAccessible}]}>
            Accept or reject before the timer runs out.
          </Text>
        </Banner>
      ) : null}
      {cooking ? <PrepBanner order={order} /> : null}

      {finished ? timeline : null}

      <Card title="Items">
        <View style={styles.items}>
          {order.items.map(item => (
            <View key={item.id} style={styles.item}>
              <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.quantity}>
                {`${item.quantity}×`}
              </Text>
              {item.foodType ? <VegMark type={item.foodType as VegMarkType} /> : null}
              <Text allowFontScaling={textDefaults.allowFontScaling} numberOfLines={2} style={styles.itemName}>
                {item.itemName}
              </Text>
              <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.itemPrice}>
                {formatRupeesExact(item.lineTotal)}
              </Text>
            </View>
          ))}
        </View>
        {order.customerNote ? (
          <View style={styles.note}>
            <Icon color={colors.warningText} name="info" size={iconSize.xs} surface={false} />
            <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.noteText}>
              {`“${order.customerNote}”`}
            </Text>
          </View>
        ) : null}
      </Card>

      {finished ? null : (
        <Card title="Customer">
          <View style={styles.customer}>
            <View style={styles.avatar}>
              <Text allowFontScaling={false} style={styles.avatarText}>
                {customer
                  .split(' ')
                  .map(part => part.charAt(0))
                  .join('')
                  .slice(0, 2)
                  .toUpperCase()}
              </Text>
            </View>
            <Text allowFontScaling={textDefaults.allowFontScaling} numberOfLines={1} style={styles.customerName}>
              {customer}
            </Text>
            {phone ? (
              <>
                <RoundButton icon="phone" label="Call customer" onPress={() => open(`tel:${phone}`)} />
                <RoundButton icon="mail" label="Message customer" onPress={() => open(`sms:${phone}`)} />
              </>
            ) : null}
          </View>
          {address ? (
            <Pressable
              accessibilityLabel="Open the address in Maps"
              accessibilityRole="button"
              onPress={() => open(`https://www.google.com/maps/search/?api=1&query=${address.latitude},${address.longitude}`)}
              style={({pressed}) => [styles.address, pressed && styles.pressed]}>
              <Icon color={colors.flameRedAccessible} name="location" size={iconSize.md} surface={false} />
              <View style={styles.addressText}>
                <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.addressLine}>
                  {[address.addressLine1, address.addressLine2, address.areaName].filter(Boolean).join(', ')}
                </Text>
                <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.muted}>
                  {[address.landmark ? `Near ${address.landmark}` : null, address.city].filter(Boolean).join(' · ')}
                </Text>
              </View>
            </Pressable>
          ) : null}
        </Card>
      )}

      {finished ? null : timeline}

      <Card title="Bill">
        <View style={styles.billRow}>
          <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.billLabel}>
            Food
          </Text>
          <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.billValue}>
            {formatRupees(order.foodSubtotal, {paise: true})}
          </Text>
        </View>
        {alsoPaid.length > 0 ? (
          <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.alsoPaid}>
            {`Customer also paid ${alsoPaid.join(' and ')} (not part of your earnings)`}
          </Text>
        ) : null}
      </Card>

      {finished ? (
        <ChefActionButton
          icon="headset"
          label="Problem with this order?"
          onPress={() => navigation.navigate('ChefSupportTicket', {orderId: order.id})}
          tone="neutral"
        />
      ) : null}

      <RejectOrderSheet
        busy={decision.action === 'reject'}
        onClose={() => setRejectOpen(false)}
        onConfirm={reason => {
          reject(reason).catch(() => undefined);
        }}
        orderNumber={number}
        visible={rejectOpen}
      />
      <ConfirmDialog
        busy={markingReady}
        cancelLabel="Not yet"
        confirmLabel="Yes, it's ready"
        message={`${itemsSummary(order.items)}${order.items.length ? '. ' : ''}The delivery partner is told to pick it up.`}
        onCancel={() => setReadyOpen(false)}
        onConfirm={() => {
          markReady().catch(() => undefined);
        }}
        title={`Is ${number} packed and ready?`}
        tone="success"
        visible={readyOpen}
      />
      <NotPickedUpSheet onClose={() => setNotPickedId(null)} orderId={notPickedId} />
    </ChefScreen>
  );
}

const styles = StyleSheet.create({
  cardTitle: {marginBottom: spacing.xs, color: colors.textPrimary, fontSize: typography.body, fontWeight: fontWeight.bold},
  muted: {color: colors.textSecondary, fontSize: typography.small},
  cardAction: {marginTop: spacing.sm},
  banner: {flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, padding: spacing.sm, borderRadius: radius.md},
  bannerText: {flex: 1, minWidth: 0, gap: 2},
  bannerTitle: {fontSize: typography.body, fontWeight: fontWeight.bold},
  bannerDetail: {fontSize: typography.small},
  items: {gap: spacing.xs},
  item: {flexDirection: 'row', alignItems: 'center', gap: spacing.xs},
  quantity: {minWidth: 26, color: colors.textPrimary, fontSize: typography.body, fontWeight: fontWeight.extrabold},
  itemName: {flex: 1, minWidth: 0, color: colors.textPrimary, fontSize: typography.body},
  itemPrice: {color: colors.textPrimary, fontSize: typography.body},
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    marginTop: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.warningSoft,
  },
  noteText: {flex: 1, color: colors.warningText, fontSize: typography.small},
  customer: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm},
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.infoSoft,
  },
  avatarText: {color: colors.infoText, fontSize: typography.body, fontWeight: fontWeight.bold},
  customerName: {flex: 1, color: colors.textPrimary, fontSize: typography.body, fontWeight: fontWeight.bold},
  round: {
    width: touchTarget.minimum,
    height: touchTarget.minimum,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  pressed: {opacity: 0.6},
  address: {
    minHeight: touchTarget.minimum,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: borderWidth.standard,
    borderTopColor: colors.border,
  },
  addressText: {flex: 1, minWidth: 0},
  addressLine: {color: colors.textPrimary, fontSize: typography.small},
  step: {flexDirection: 'row', gap: spacing.sm},
  rail: {alignItems: 'center', width: 20},
  dot: {width: 14, height: 14, borderRadius: 7, marginTop: 3},
  dotTodo: {backgroundColor: colors.white, borderWidth: 2, borderColor: colors.borderStrong},
  line: {flex: 1, width: 2, minHeight: 18},
  stepText: {flex: 1, minWidth: 0, paddingBottom: spacing.sm},
  stepLabel: {color: colors.textPrimary, fontSize: typography.body, fontWeight: fontWeight.semibold},
  stepTodo: {color: colors.textSecondary, fontWeight: fontWeight.regular},
  stepDetail: {color: colors.textSecondary, fontSize: typography.small},
  billRow: {flexDirection: 'row', justifyContent: 'space-between'},
  billLabel: {color: colors.textPrimary, fontSize: typography.body},
  billValue: {color: colors.textPrimary, fontSize: typography.body, fontWeight: fontWeight.bold},
  alsoPaid: {marginTop: spacing.xs, color: colors.textSecondary, fontSize: typography.small},
  dock: {flexDirection: 'row', gap: spacing.sm},
  secondary: {flex: 1},
  main: {flex: 2},
});
