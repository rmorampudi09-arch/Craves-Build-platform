import React, {useEffect, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MaterialDesignIcons from '@react-native-vector-icons/material-design-icons';
import {
  useIsFocused,
  useNavigation,
  useRoute,
  type NavigationProp,
  type RouteProp,
} from '@react-navigation/native';
import type {
  CustomerOrdersStackParamList,
  CustomerTabParamList,
} from '../../../app/navigation/types';
import {useAppSelector} from '../../../app/store/hooks';
import {toAppApiError} from '../../../core/http/apiError';
import {colors, radius, spacing} from '../../../design/tokens';
import {iosType, iosWeight, useIosFonts} from '../../../design/iosType';
import {Icon, type IconName} from '../../../shared/components/Icon';
import {
  OfflineNotice,
  RecoverableErrorBanner,
  TerminalState,
} from '../../../shared/components/LifecycleStates';
import {ScreenShell} from '../../../shared/components/ScreenShell';
import {checkoutApi} from '../../checkout/api/checkoutApi';
import {CustomerChefAvatar} from '../../customerShell/components/CustomerChefAvatar';
import {paymentHandoffCoordinator} from '../../payment/domain/paymentHandoffCoordinator';
import {
  clearPersistedPaymentIfTerminal,
  recoverPersistedPaymentAttempt,
} from '../../payment/domain/persistedPaymentRecovery';
import {paymentRecoveryCoordinator} from '../../payment/domain/paymentRecoveryCoordinator';
import type {RazorpayVerificationProof} from '../../payment/domain/paymentTypes';
import {razorpayGateway} from '../../payment/gateway/razorpayGateway';
import {pendingPaymentAttemptStore} from '../../payment/storage/pendingPaymentAttemptStore';
import {CUSTOMER_REVIEWS_AVAILABLE} from '../../reviews/api/customerReviewsApi';
import {CustomerOrderMenuItemImage} from '../components/CustomerOrderMenuItemImage';
import {OrderMap} from '../components/OrderMap';
import {getProductionCustomerOrderMutationDecision} from '../domain/customerOrderActionEligibility';
import type {CustomerOrder, CustomerOrderMoney} from '../domain/customerOrderTypes';
import {
  getCustomerOrderJourney,
  KITCHEN_STEPS,
  type CustomerOrderJourney,
} from '../presentation/customerOrderJourney';
import {CUSTOMER_DELIVERY_POLL_INTERVAL_MS} from '../presentation/customerOrderTrackingPresentation';
import {
  formatCustomerOrderCreatedAt,
  formatCustomerOrderMoney,
  getCustomerOrderDisplayReference,
} from '../presentation/customerOrdersPresentation';
import {useCustomerOrderKitchenPresentationQuery} from '../query/customerOrderCatalogQueries';
import {
  useCustomerOrderDetailQuery,
  useCustomerOrderTrackingQuery,
} from '../query/customerOrdersQueries';
import {menuCategoryLabel} from '../../../shared/catalog/menuCategories';

type DetailRoute = RouteProp<CustomerOrdersStackParamList, 'CustomerOrderDetail'>;
type DetailNavigation = NavigationProp<CustomerOrdersStackParamList, 'CustomerOrderDetail'>;

const STEP_ICONS = ['clock-outline', 'chef-hat', 'shopping-outline'] as const;

/** Orders that can still change while the screen is open. */
const LIVE_STATUSES: ReadonlySet<CustomerOrder['status']> = new Set([
  'PAID',
  'CHEF_ACCEPTANCE_PENDING',
  'CHEF_ACCEPTED',
  'PREPARING',
  'READY_FOR_PICKUP',
  'OUT_FOR_DELIVERY',
]);

/** Before pickup the chef can still be reached and the order can still be cancelled. */
const IN_KITCHEN_STATUSES: ReadonlySet<CustomerOrder['status']> = new Set([
  'PAID',
  'CHEF_ACCEPTANCE_PENDING',
  'CHEF_ACCEPTED',
  'PREPARING',
  'READY_FOR_PICKUP',
]);

function AmountRow({label, money}: {label: string; money: CustomerOrderMoney}) {
  return (
    <View style={styles.amountRow}>
      <Text style={[iosType.subheadline, styles.secondaryText]}>{label}</Text>
      <Text style={[iosType.subheadline, styles.primaryText]}>
        {formatCustomerOrderMoney(money)}
      </Text>
    </View>
  );
}

function DetailSkeleton() {
  return (
    <View
      accessibilityLabel="Loading order details"
      accessibilityRole="progressbar"
      style={styles.skeletonWrap}>
      <View style={styles.skeletonHeader} />
      <View style={styles.skeletonMap} />
      <View style={styles.skeletonCard} />
    </View>
  );
}

function paymentStatusForOrder(order: CustomerOrder): {label: string; color: string} {
  switch (order.status) {
    case 'PAYMENT_PENDING':
      return {label: 'Payment pending', color: colors.warning};
    case 'REFUND_PENDING':
      return {label: 'Refund pending', color: colors.warning};
    case 'REFUNDED':
      return {label: 'Refunded', color: colors.success};
    case 'REFUND_FAILED':
      return {label: 'Refund issue', color: colors.error};
    case 'PAID':
    case 'CHEF_ACCEPTANCE_PENDING':
    case 'CHEF_ACCEPTED':
    case 'PREPARING':
    case 'READY_FOR_PICKUP':
    case 'OUT_FOR_DELIVERY':
    case 'DELIVERED':
      return {label: 'Paid', color: colors.success};
    default:
      return {label: 'See order status', color: colors.textSecondary};
  }
}

/** The three kitchen steps, laid over the blurred map. */
function KitchenSteps({step}: {step: -1 | 0 | 1 | 2}) {
  return (
    <View style={styles.stepsOverlay}>
      <View
        accessible
        accessibilityLabel={`Order progress: ${
          step === -1 ? 'not started' : `${KITCHEN_STEPS[step]}, step ${step + 1} of 3`
        }`}
        style={styles.stepsPanel}>
        {KITCHEN_STEPS.map((label, index) => {
          const done = index < step;
          const current = index === step;
          return (
            <View key={label} style={styles.stepColumn}>
              {index > 0 ? (
                <View style={[styles.stepLine, styles.stepLineLeft, step >= index && styles.stepLineDone]} />
              ) : null}
              {index < KITCHEN_STEPS.length - 1 ? (
                <View style={[styles.stepLine, styles.stepLineRight, step > index && styles.stepLineDone]} />
              ) : null}
              <View
                style={[
                  styles.stepCircle,
                  (done || current) && styles.stepCircleActive,
                  current && styles.stepCircleCurrent,
                ]}>
                <MaterialDesignIcons
                  name={done ? 'check' : STEP_ICONS[index]}
                  size={17}
                  color={done || current ? colors.white : colors.textSecondary}
                />
              </View>
              <Text
                numberOfLines={2}
                style={[
                  iosType.footnote,
                  styles.stepLabel,
                  done || current ? [iosWeight.semibold, styles.primaryText] : styles.secondaryText,
                ]}>
                {label}
              </Text>
            </View>
          );
        })}
      </View>
      <View style={styles.lockedNote}>
        <MaterialDesignIcons name="map-marker-path" size={14} color={colors.textPrimary} />
        <Text style={[iosType.caption1, iosWeight.semibold, styles.primaryText]}>
          Live map opens once your order is picked up
        </Text>
      </View>
    </View>
  );
}

function ActionRow({
  icon,
  label,
  onPress,
  destructive = false,
  last = false,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  destructive?: boolean;
  last?: boolean;
}) {
  const tint = destructive ? colors.flameRedAccessible : colors.textPrimary;
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={({pressed}) => [styles.actionRow, pressed && styles.rowPressed]}>
      <Icon name={icon} size={20} color={tint} surface={false} />
      <View style={[styles.actionRowBody, !last && styles.hairlineBottom]}>
        <Text style={[iosType.body, {color: tint}]}>{label}</Text>
        <Icon name="chevron-right" size={20} color={colors.borderStrong} surface={false} />
      </View>
    </Pressable>
  );
}

export function CustomerOrderDetailScreen() {
  useIosFonts();
  const navigation = useNavigation<DetailNavigation>();
  const route = useRoute<DetailRoute>();
  const focused = useIsFocused();
  const detail = useCustomerOrderDetailQuery(route.params.orderId);
  const order = detail.data;
  // Ready for pickup asks too: the pickup can be reported before the order status moves.
  const afterKitchen = order?.status === 'OUT_FOR_DELIVERY' || order?.status === 'READY_FOR_PICKUP';
  const tracking = useCustomerOrderTrackingQuery(route.params.orderId, afterKitchen);
  const kitchen = useCustomerOrderKitchenPresentationQuery(order?.kitchenId ?? '');
  const authPhone = useAppSelector(state => state.auth.identity?.phoneNumber ?? null);
  const [paymentBusy, setPaymentBusy] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const queryError = detail.error ? toAppApiError(detail.error) : null;
  const offline = queryError?.code === 'NETWORK_ERROR';
  const live = order ? LIVE_STATUSES.has(order.status) : false;
  const refetchDetail = detail.refetch;
  const refetchTracking = tracking.refetch;

  // The steps and the map follow the order while it is on screen, like the tracking screen.
  useEffect(() => {
    if (!focused || !live) return undefined;
    const intervalId = setInterval(() => {
      void refetchDetail();
      if (afterKitchen) void refetchTracking();
    }, CUSTOMER_DELIVERY_POLL_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [afterKitchen, focused, live, refetchDetail, refetchTracking]);

  if (detail.invalidOrderId) {
    return (
      <ScreenShell keyboardAvoiding={false} testID="customer-order-detail-invalid">
        <TerminalState
          title="Order link unavailable"
          description="This order link is invalid."
          actionLabel="Go back"
          onAction={() => navigation.goBack()}
        />
      </ScreenShell>
    );
  }

  if (detail.sessionRequired) {
    return (
      <ScreenShell keyboardAvoiding={false} testID="customer-order-detail-session-required">
        <TerminalState
          title="Sign in required"
          description="Your customer session is required to view this order."
          actionLabel="Go back"
          onAction={() => navigation.goBack()}
        />
      </ScreenShell>
    );
  }

  if (detail.isPending && !order) {
    return (
      <ScreenShell keyboardAvoiding={false} testID="customer-order-detail-loading">
        <DetailSkeleton />
      </ScreenShell>
    );
  }

  if (!order) {
    const unavailable = queryError?.status === 404;
    const forbidden = queryError?.status === 403;
    return (
      <ScreenShell keyboardAvoiding={false} testID="customer-order-detail-error">
        <TerminalState
          title={
            offline
              ? 'You appear to be offline'
              : unavailable
                ? 'Order unavailable'
                : forbidden
                  ? 'Customer access required'
                  : 'Order details could not be loaded'
          }
          description={
            unavailable
              ? 'This order may no longer exist or is not available to this signed-in customer.'
              : forbidden
                ? 'This signed-in account cannot access customer order details.'
                : queryError?.message ?? 'Try again to load this order.'
          }
          actionLabel="Try again"
          onAction={() => detail.refetch()}
          secondaryActionLabel="Go back"
          onSecondaryAction={() => navigation.goBack()}
        />
      </ScreenShell>
    );
  }

  const journey: CustomerOrderJourney = getCustomerOrderJourney(
    order,
    tracking.data?.status ?? null,
  );
  const paymentStatus = paymentStatusForOrder(order);
  const address = order.deliveryAddress;
  const home =
    address?.latitude != null && address.longitude != null
      ? {latitude: address.latitude, longitude: address.longitude}
      : null;
  const courier = tracking.data?.courierLocation ?? null;
  const inKitchen = IN_KITCHEN_STATUSES.has(order.status);
  const addressLine = address
    ? [
        address.addressLine1,
        address.addressLine2,
        address.landmark,
        address.areaName,
        address.city,
        address.state,
        address.postalCode,
      ]
        .filter((value): value is string => Boolean(value))
        .join(', ')
    : 'Delivery address snapshot unavailable';

  const openHelp = () => {
    const tabs = navigation.getParent<NavigationProp<CustomerTabParamList>>();
    tabs?.navigate('Profile', {screen: 'CustomerSupportChat', params: {orderId: order.id}});
  };

  const openTracking = () => {
    navigation.navigate('CustomerOrderTracking', {orderId: order.id});
  };

  const showContactChefUnavailable = () => {
    Alert.alert(
      'Contact chef unavailable',
      'Direct chef contact is not available for this order yet. Use Help for customer support.',
    );
  };

  const showCancelUnavailable = () => {
    const decision = getProductionCustomerOrderMutationDecision('CANCEL');
    if (decision.kind === 'BLOCKED') {
      Alert.alert('Cancellation unavailable', decision.message);
    }
  };

  const openReview = () => {
    navigation.navigate('CustomerOrderReview', {orderId: order.id});
  };

  const continuePendingPayment = async () => {
    if (paymentBusy || order.status !== 'PAYMENT_PENDING') return;
    setPaymentBusy(true);
    setPaymentError(null);
    try {
      const checkout = await checkoutApi.getSession(order.checkoutId);
      if (!checkout.orders.some(reference => reference.orderId === order.id)) {
        throw new Error('This order does not belong to the checkout returned by Craves.');
      }
      if (checkout.status !== 'PAYMENT_PENDING') {
        await detail.refetch();
        return;
      }

      const stored = await pendingPaymentAttemptStore.load();
      if (stored?.checkoutId === checkout.checkoutId) {
        const previous = await recoverPersistedPaymentAttempt();
        if (previous?.outcome === 'SUCCEEDED') {
          await detail.refetch();
          return;
        }
        if (previous?.outcome === 'RECONCILING') {
          setPaymentError('Craves is confirming this payment. Check its status before paying again.');
          return;
        }
      }

      const handoff = await paymentHandoffCoordinator.prepare(checkout);
      await pendingPaymentAttemptStore.save(handoff);

      let proof: RazorpayVerificationProof | null = null;
      try {
        proof = await razorpayGateway.open(handoff, {phone: authPhone});
      } catch {
        // A closed gateway is not proof of failure; ask Craves for the order status.
      }
      const recovery = await paymentRecoveryCoordinator.recover(
        handoff,
        proof ? {kind: 'RAZORPAY_SUCCESS', proof} : {kind: 'PROVIDER_ERROR'},
      );

      await clearPersistedPaymentIfTerminal(recovery);
      await detail.refetch();
      if (recovery.outcome === 'RECONCILING') {
        setPaymentError('Craves is confirming this payment. Check its status before paying again.');
      } else if (recovery.outcome === 'PENDING') {
        setPaymentError('Payment is still pending. You can continue this payment later.');
      } else if (recovery.outcome === 'FAILED' || recovery.outcome === 'CANCELLED') {
        setPaymentError('Payment did not complete. This order remains unpaid.');
      }
    } catch (error) {
      setPaymentError(
        error instanceof Error
          ? error.message
          : 'Payment status could not be confirmed. Check it before trying again.',
      );
    } finally {
      setPaymentBusy(false);
    }
  };

  return (
    <ScreenShell
      backgroundColor={colors.white}
      edges={['top']}
      keyboardAvoiding={false}
      testID="customer-order-detail">
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Back to orders"
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => navigation.goBack()}
          style={({pressed}) => [styles.headerButton, pressed && styles.pressed]}>
          <Icon name="arrow-left" size={24} color={colors.textPrimary} surface={false} />
        </Pressable>
        <Text accessibilityRole="header" numberOfLines={1} style={[iosType.headline, styles.headerTitle]}>
          Order details
        </Text>
        <Pressable
          accessibilityLabel="Help"
          accessibilityRole="button"
          hitSlop={8}
          onPress={openHelp}
          style={({pressed}) => [styles.headerButton, styles.headerHelp, pressed && styles.pressed]}>
          <Text style={[iosType.body, styles.redText]}>Help</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            colors={[colors.flameRed]}
            onRefresh={() => {
              void detail.refetch();
              if (afterKitchen) void tracking.refetch();
            }}
            refreshing={detail.isRefetching}
            tintColor={colors.flameRed}
          />
        }
        showsVerticalScrollIndicator={false}>
        {queryError ? (
          offline ? (
            <OfflineNotice
              message="Showing the last verified order details. Pull to refresh when you are back online."
              onRetry={() => detail.refetch()}
            />
          ) : (
            <RecoverableErrorBanner
              message="The last verified order details are still visible, but the latest refresh failed."
              onRetry={() => detail.refetch()}
            />
          )
        ) : null}
        {paymentError ? (
          <RecoverableErrorBanner
            message={paymentError}
            onRetry={() => detail.refetch()}
            retryLabel="Refresh order"
          />
        ) : null}

        <View style={styles.statusBlock}>
          <View style={styles.statusTitleRow}>
            <Text
              accessibilityLiveRegion="polite"
              style={[
                iosType.title1,
                styles.statusTitle,
                journey.kind === 'CLOSED' && journey.tone === 'danger' && styles.redText,
              ]}>
              {journey.title}
            </Text>
            {detail.isFetching ? <ActivityIndicator color={colors.textSecondary} size="small" /> : null}
          </View>
          <Text style={[iosType.subheadline, styles.secondaryText]}>{journey.detail}</Text>
        </View>

        {journey.kind === 'CLOSED' ? null : (
          <Pressable
            accessibilityLabel={journey.kind === 'DELIVERY' ? 'Open the delivery map' : undefined}
            accessibilityRole={journey.kind === 'DELIVERY' ? 'button' : undefined}
            disabled={journey.kind !== 'DELIVERY'}
            onPress={openTracking}>
            <OrderMap
              accessibilityLabel={
                journey.kind === 'KITCHEN'
                  ? 'Map, hidden until your order is picked up'
                  : 'Delivery map'
              }
              blurred={journey.kind === 'KITCHEN'}
              courier={courier}
              home={home}
              style={[styles.map, journey.kind === 'KITCHEN' ? styles.mapKitchen : styles.mapDelivery]}>
              {journey.kind === 'KITCHEN' ? (
                <KitchenSteps step={journey.step} />
              ) : (
                <View pointerEvents="none" style={styles.mapChip}>
                  <View style={[styles.liveDot, journey.delivered && styles.liveDotDone]} />
                  <Text style={[iosType.subheadline, iosWeight.semibold, styles.primaryText]}>
                    {journey.delivered ? 'Delivery history' : 'Track live'}
                  </Text>
                  <Icon name="chevron-right" size={18} color={colors.textSecondary} surface={false} />
                </View>
              )}
            </OrderMap>
          </Pressable>
        )}

        <View style={styles.card}>
          <View style={styles.kitchenRow}>
            <CustomerChefAvatar imageUrl={kitchen.data?.chefPhotoUrl} size={44} />
            <View style={styles.flexCopy}>
              <Text numberOfLines={1} style={[iosType.headline, styles.primaryText]}>
                {order.kitchenName}
              </Text>
              <Text numberOfLines={1} style={[iosType.footnote, styles.secondaryText]}>
                Order #{getCustomerOrderDisplayReference(order.id)} ·{' '}
                {formatCustomerOrderCreatedAt(order.createdAt)}
              </Text>
            </View>
          </View>

          <View style={styles.cardDivider} />

          {order.items.map(item => (
            <View key={item.id} style={styles.itemRow}>
              <CustomerOrderMenuItemImage menuItemId={item.menuItemId} size={52} />
              <View style={styles.flexCopy}>
                <Text numberOfLines={2} style={[iosType.subheadline, iosWeight.semibold, styles.primaryText]}>
                  {item.itemName}
                </Text>
                <Text numberOfLines={1} style={[iosType.footnote, styles.secondaryText]}>
                  {item.quantity} × {formatCustomerOrderMoney(item.unitPrice)}
                  {'  ·  '}
                  {menuCategoryLabel(item.category ?? '') || item.foodType || 'Home-cooked'}
                </Text>
              </View>
              <Text style={[iosType.subheadline, styles.primaryText]}>
                {formatCustomerOrderMoney(item.lineTotal)}
              </Text>
            </View>
          ))}

          <View style={styles.cardDivider} />
          <AmountRow label="Item total" money={order.foodSubtotal} />
          <AmountRow label="Delivery fee" money={order.deliveryFee} />
          <AmountRow label="Platform fee" money={order.platformFee} />
          <AmountRow label="Taxes" money={order.taxAmount} />
          <View style={styles.totalRow}>
            <Text style={[iosType.headline, styles.primaryText]}>Total</Text>
            <Text style={[iosType.title3, iosWeight.bold, styles.primaryText]}>
              {formatCustomerOrderMoney(order.grandTotal)}
            </Text>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.infoRow}>
            <View style={styles.infoIcon}>
              <Icon name="location" size={18} color={colors.textPrimary} surface={false} />
            </View>
            <View style={styles.flexCopy}>
              <Text style={[iosType.footnote, styles.secondaryText]}>Delivering to</Text>
              <Text numberOfLines={3} style={[iosType.subheadline, styles.primaryText]}>
                {addressLine}
              </Text>
            </View>
          </View>
          <View style={[styles.cardDivider, styles.infoDivider]} />
          <View style={styles.infoRow}>
            <View style={styles.infoIcon}>
              <Icon name="wallet" size={18} color={colors.textPrimary} surface={false} />
            </View>
            <View style={styles.flexCopy}>
              <Text style={[iosType.footnote, styles.secondaryText]}>Payment</Text>
              <Text style={[iosType.subheadline, iosWeight.semibold, {color: paymentStatus.color}]}>
                {paymentStatus.label}
              </Text>
            </View>
          </View>
        </View>

        {order.chefResponseNote ? (
          <View style={styles.card}>
            <Text style={[iosType.footnote, styles.secondaryText]}>Note from the chef</Text>
            <Text style={[iosType.subheadline, styles.primaryText, styles.noteText]}>
              {order.chefResponseNote}
            </Text>
          </View>
        ) : null}

        {CUSTOMER_REVIEWS_AVAILABLE && order.status === 'DELIVERED' ? (
          <View style={styles.card}>
            <Text style={[iosType.headline, styles.primaryText]}>How was your order?</Text>
            <Text style={[iosType.subheadline, styles.secondaryText, styles.noteText]}>
              Share a rating and optional feedback about this delivered order.
            </Text>
            <Pressable
              accessibilityLabel="Rate this order"
              accessibilityRole="button"
              onPress={openReview}
              style={({pressed}) => [styles.primaryButton, styles.reviewButton, pressed && styles.pressed]}>
              <Text style={[iosType.headline, styles.whiteText]}>Rate this order</Text>
            </Pressable>
          </View>
        ) : null}

        {order.status === 'PAYMENT_PENDING' ? (
          <Pressable
            accessibilityLabel="Continue payment"
            accessibilityRole="button"
            accessibilityState={{disabled: paymentBusy}}
            disabled={paymentBusy}
            onPress={() => {
              void continuePendingPayment();
            }}
            style={({pressed}) => [styles.primaryButton, pressed && styles.pressed]}>
            {paymentBusy ? <ActivityIndicator color={colors.white} size="small" /> : null}
            <Text style={[iosType.headline, styles.whiteText]}>
              {paymentBusy ? 'Please wait…' : 'Continue payment'}
            </Text>
          </Pressable>
        ) : null}

        {inKitchen ? (
          <View style={[styles.card, styles.actionsCard]}>
            <ActionRow icon="phone" label="Contact chef" onPress={showContactChefUnavailable} />
            <ActionRow destructive icon="trash" label="Cancel order" last onPress={showCancelUnavailable} />
          </View>
        ) : null}
      </ScrollView>
    </ScreenShell>
  );
}

const HAIRLINE = StyleSheet.hairlineWidth;

const styles = StyleSheet.create({
  header: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xs,
    backgroundColor: colors.white,
  },
  headerButton: {
    minWidth: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerHelp: {paddingHorizontal: spacing.xs},
  headerTitle: {
    position: 'absolute',
    left: 72,
    right: 72,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  pressed: {opacity: 0.6},
  rowPressed: {backgroundColor: colors.surfaceMuted},
  content: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  primaryText: {color: colors.textPrimary},
  secondaryText: {color: colors.textSecondary},
  redText: {color: colors.flameRedAccessible},
  whiteText: {color: colors.white},
  flexCopy: {minWidth: 0, flex: 1, gap: 2},
  statusBlock: {gap: spacing.xxs},
  statusTitleRow: {flexDirection: 'row', alignItems: 'center', gap: spacing.xs},
  statusTitle: {flexShrink: 1, color: colors.textPrimary},
  map: {borderRadius: radius.lg},
  mapKitchen: {height: 248},
  mapDelivery: {height: 280},
  mapChip: {
    position: 'absolute',
    left: spacing.sm,
    bottom: spacing.sm,
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingLeft: spacing.sm,
    paddingRight: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.white,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: {width: 0, height: 3},
    elevation: 4,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.success,
  },
  liveDotDone: {backgroundColor: colors.textSecondary},
  stepsOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.md,
  },
  stepsPanel: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.xxs,
    borderRadius: 18,
    backgroundColor: colors.white,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 16,
    shadowOffset: {width: 0, height: 6},
    elevation: 6,
  },
  stepColumn: {flex: 1, alignItems: 'center', gap: spacing.xs},
  stepLine: {
    position: 'absolute',
    top: 17,
    height: 2,
    backgroundColor: colors.border,
  },
  stepLineLeft: {left: 0, right: '50%'},
  stepLineRight: {left: '50%', right: 0},
  stepLineDone: {backgroundColor: colors.flameRedAccessible},
  stepCircle: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    backgroundColor: colors.white,
  },
  stepCircleActive: {
    borderColor: colors.flameRedAccessible,
    backgroundColor: colors.flameRedAccessible,
  },
  stepCircleCurrent: {
    shadowColor: colors.flameRed,
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: {width: 0, height: 2},
    elevation: 3,
  },
  stepLabel: {textAlign: 'center', paddingHorizontal: spacing.xxs},
  lockedNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.86)',
  },
  card: {
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: HAIRLINE,
    borderColor: colors.borderStrong,
    backgroundColor: colors.white,
  },
  kitchenRow: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm},
  cardDivider: {
    height: HAIRLINE,
    marginVertical: spacing.sm,
    backgroundColor: colors.borderStrong,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xxs,
  },
  amountRow: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  totalRow: {
    marginTop: spacing.xs,
    paddingTop: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: HAIRLINE,
    borderTopColor: colors.borderStrong,
  },
  infoRow: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm},
  infoIcon: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: colors.surfaceMuted,
  },
  infoDivider: {marginLeft: 48},
  noteText: {marginTop: spacing.xxs},
  primaryButton: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: colors.flameRedAccessible,
  },
  reviewButton: {marginTop: spacing.sm},
  actionsCard: {paddingVertical: 0, paddingRight: 0},
  actionRow: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm},
  actionRowBody: {
    minHeight: 52,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingRight: spacing.sm,
  },
  hairlineBottom: {borderBottomWidth: HAIRLINE, borderBottomColor: colors.borderStrong},
  skeletonWrap: {padding: spacing.md, gap: spacing.md},
  skeletonHeader: {
    width: '58%',
    height: 28,
    borderRadius: radius.sm,
    backgroundColor: colors.border,
  },
  skeletonMap: {
    height: 248,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceMuted,
  },
  skeletonCard: {
    height: 220,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceMuted,
  },
});
