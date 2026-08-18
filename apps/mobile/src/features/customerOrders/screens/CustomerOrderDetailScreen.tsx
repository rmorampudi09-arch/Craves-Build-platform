import React from 'react';
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
import {
  useNavigation,
  useRoute,
  type NavigationProp,
  type RouteProp,
} from '@react-navigation/native';
import type {
  CustomerOrdersStackParamList,
  CustomerTabParamList,
} from '../../../app/navigation/types';
import {toAppApiError} from '../../../core/http/apiError';
import {
  borderWidth,
  colors,
  elevation,
  fontWeight,
  radius,
  spacing,
  typography,
} from '../../../design/tokens';
import {Icon, type IconName} from '../../../shared/components/Icon';
import {
  OfflineNotice,
  RecoverableErrorBanner,
  TerminalState,
} from '../../../shared/components/LifecycleStates';
import {ScreenShell} from '../../../shared/components/ScreenShell';
import {getProductionCustomerOrderMutationDecision} from '../domain/customerOrderActionEligibility';
import type {
  CustomerOrder,
  CustomerOrderMoney,
  CustomerOrderStatus,
} from '../domain/customerOrderTypes';
import {
  formatCustomerOrderCreatedAt,
  formatCustomerOrderMoney,
  getCustomerOrderDisplayReference,
  getCustomerOrderReferenceAction,
  getCustomerOrderStatusPresentation,
} from '../presentation/customerOrdersPresentation';
import {useCustomerOrderDetailQuery} from '../query/customerOrdersQueries';

type DetailRoute = RouteProp<CustomerOrdersStackParamList, 'CustomerOrderDetail'>;
type DetailNavigation = NavigationProp<CustomerOrdersStackParamList, 'CustomerOrderDetail'>;

type ProgressStep = {label: string; icon: IconName};

const PROGRESS_STEPS: readonly ProgressStep[] = [
  {label: 'Preparing', icon: 'orders'},
  {label: 'On the way', icon: 'delivery'},
  {label: 'Out for delivery', icon: 'delivery'},
  {label: 'Delivered', icon: 'check'},
];

function AmountRow({
  label,
  money,
  strong = false,
}: {
  label: string;
  money: CustomerOrderMoney;
  strong?: boolean;
}) {
  return (
    <View style={[styles.amountRow, strong && styles.amountRowStrong]}>
      <Text style={[styles.amountLabel, strong && styles.amountStrong]}>{label}</Text>
      <Text style={[styles.amountValue, strong && styles.totalAmount]}>
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
      <View style={styles.skeletonCard} />
      <View style={styles.skeletonCard} />
      <View style={styles.skeletonCard} />
    </View>
  );
}

function progressStageForStatus(status: CustomerOrderStatus): number {
  switch (status) {
    case 'DELIVERED':
      return 3;
    case 'OUT_FOR_DELIVERY':
      return 2;
    case 'READY_FOR_PICKUP':
      return 1;
    case 'PAYMENT_PENDING':
    case 'PAID':
    case 'CHEF_ACCEPTANCE_PENDING':
    case 'CHEF_ACCEPTED':
    case 'PREPARING':
      return 0;
    default:
      return -1;
  }
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

function deliveryTimeCopy(order: CustomerOrder, canTrack: boolean): string {
  if (order.status === 'DELIVERED') return 'Delivered';
  if (canTrack) return 'Live delivery updates available';
  if (order.prepTimeMinutes) return `Preparation estimate: ${order.prepTimeMinutes} min`;
  return 'Delivery estimate unavailable';
}

function OrderProgress({stage}: {stage: number}) {
  return (
    <View style={styles.progressWrap}>
      <View style={styles.progressTrackRow}>
        {PROGRESS_STEPS.map((step, index) => {
          const active = stage >= index;
          return (
            <React.Fragment key={step.label}>
              <View style={[styles.progressCircle, active && styles.progressCircleActive]}>
                <Icon
                  name={step.icon}
                  size={18}
                  color={active ? colors.white : colors.textSecondary}
                  surface={false}
                />
              </View>
              {index < PROGRESS_STEPS.length - 1 ? (
                <View
                  style={[
                    styles.progressConnector,
                    stage > index && styles.progressConnectorActive,
                  ]}
                />
              ) : null}
            </React.Fragment>
          );
        })}
      </View>
      <View style={styles.progressLabels}>
        {PROGRESS_STEPS.map((step, index) => (
          <Text
            key={step.label}
            numberOfLines={2}
            style={[styles.progressLabel, stage >= index && styles.progressLabelActive]}>
            {step.label}
          </Text>
        ))}
      </View>
    </View>
  );
}

export function CustomerOrderDetailScreen() {
  const navigation = useNavigation<DetailNavigation>();
  const route = useRoute<DetailRoute>();
  const detail = useCustomerOrderDetailQuery(route.params.orderId);
  const order = detail.data;
  const queryError = detail.error ? toAppApiError(detail.error) : null;
  const offline = queryError?.code === 'NETWORK_ERROR';

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

  const status = getCustomerOrderStatusPresentation(order.status);
  const canTrack = getCustomerOrderReferenceAction(order.status) === 'TRACK';
  const stage = progressStageForStatus(order.status);
  const paymentStatus = paymentStatusForOrder(order);
  const address = order.deliveryAddress;
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
    tabs?.navigate('Profile', {screen: 'CustomerSettingsSupport'});
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

  return (
    <ScreenShell edges={['top']} keyboardAvoiding={false} testID="customer-order-detail">
      <View style={styles.screen}>
        <View style={styles.header}>
          <Pressable
            accessibilityLabel="Back to orders"
            accessibilityRole="button"
            onPress={() => navigation.goBack()}
            style={({pressed}) => [styles.headerAction, pressed && styles.pressed]}>
            <Icon name="arrow-left" size={24} surface={false} />
          </Pressable>
          <Text accessibilityRole="header" style={styles.headerTitle}>
            Order Details
          </Text>
          <Pressable
            accessibilityLabel="Help"
            accessibilityRole="button"
            onPress={openHelp}
            style={({pressed}) => [styles.helpAction, pressed && styles.pressed]}>
            <Icon name="phone" size={20} color={colors.flameRed} surface={false} />
            <Text style={styles.helpText}>Help</Text>
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              colors={[colors.flameRed]}
              onRefresh={() => detail.refetch()}
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
                style={styles.notice}
              />
            ) : (
              <RecoverableErrorBanner
                message="The last verified order details are still visible, but the latest refresh failed."
                onRetry={() => detail.refetch()}
                style={styles.notice}
              />
            )
          ) : null}

          <View style={styles.summaryCard}>
            <View style={styles.summaryTopRow}>
              <View style={styles.orderIdentity}>
                <Text style={styles.orderNumber}>
                  Order #{getCustomerOrderDisplayReference(order.id)}
                </Text>
                <Text style={styles.placedText}>
                  Placed {formatCustomerOrderCreatedAt(order.createdAt)}
                </Text>
              </View>
              <View style={styles.kitchenIdentity}>
                <Text numberOfLines={2} style={styles.kitchenName}>
                  {order.kitchenName}
                </Text>
                <Text style={styles.kitchenCaption}>Home kitchen</Text>
              </View>
            </View>

            <View style={styles.currentStatusRow}>
              <View style={styles.statusIconCircle}>
                <Icon
                  name={stage === 3 ? 'check' : stage >= 2 ? 'delivery' : 'orders'}
                  size={21}
                  color={colors.flameRed}
                  surface={false}
                />
              </View>
              <View style={styles.statusCopy}>
                <Text accessibilityLiveRegion="polite" style={styles.statusTitle}>
                  {status.label}
                </Text>
                <Text style={styles.statusDetail}>
                  {order.prepTimeMinutes
                    ? `Preparation estimate: ${order.prepTimeMinutes} min`
                    : `Updated ${formatCustomerOrderCreatedAt(order.updatedAt)}`}
                </Text>
              </View>
              {detail.isFetching ? (
                <ActivityIndicator color={colors.flameRed} size="small" />
              ) : null}
            </View>

            <Pressable
              accessibilityRole={canTrack ? 'button' : undefined}
              accessibilityLabel={canTrack ? 'Open live delivery tracking' : undefined}
              disabled={!canTrack}
              onPress={() =>
                navigation.navigate('CustomerOrderTracking', {orderId: order.id})
              }
              style={canTrack ? styles.trackableProgress : undefined}>
              <OrderProgress stage={stage} />
            </Pressable>
          </View>

          <View style={styles.itemsCard}>
            <Text style={styles.sectionTitle}>Order Items</Text>
            {order.items.map((item, index) => (
              <View
                key={item.id}
                style={[
                  styles.itemRow,
                  index === order.items.length - 1 && styles.itemRowLast,
                ]}>
                <View style={styles.itemThumb}>
                  <Icon name="chef" size={24} color={colors.flameRed} surface={false} />
                </View>
                <View style={styles.itemCopy}>
                  <Text numberOfLines={2} style={styles.itemName}>
                    {item.itemName}
                  </Text>
                  <Text numberOfLines={1} style={styles.itemMeta}>
                    {item.category || item.foodType || 'Home-cooked dish'}
                  </Text>
                  <View style={styles.itemPriceLine}>
                    <Text style={styles.unitPrice}>
                      {formatCustomerOrderMoney(item.unitPrice)}
                    </Text>
                    <Text style={styles.quantityText}>× {item.quantity}</Text>
                  </View>
                </View>
                <Text style={styles.itemTotal}>
                  {formatCustomerOrderMoney(item.lineTotal)}
                </Text>
              </View>
            ))}

            <View style={styles.billDivider} />
            <AmountRow label="Item Total" money={order.foodSubtotal} />
            <AmountRow label="Delivery Fee" money={order.deliveryFee} />
            <AmountRow label="Platform Fee" money={order.platformFee} />
            <AmountRow label="Tax" money={order.taxAmount} />
            <AmountRow label="Total Amount" money={order.grandTotal} strong />
          </View>

          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <View style={styles.infoIconCircle}>
                <Icon name="location" size={22} color={colors.flameRed} surface={false} />
              </View>
              <View style={styles.infoCopy}>
                <Text style={styles.infoTitle}>Delivery Address</Text>
                <Text numberOfLines={3} style={styles.infoValue}>
                  {addressLine}
                </Text>
              </View>
            </View>

            <View style={styles.infoDivider} />

            <View style={styles.infoRow}>
              <View style={styles.infoIconCircle}>
                <Icon name="clock" size={22} color={colors.flameRed} surface={false} />
              </View>
              <View style={styles.infoCopy}>
                <Text style={styles.infoTitle}>Delivery Time</Text>
                <Text style={styles.infoValue}>{deliveryTimeCopy(order, canTrack)}</Text>
              </View>
            </View>

            <View style={styles.infoDivider} />

            <View style={styles.infoRow}>
              <View style={styles.infoIconCircle}>
                <Icon name="ticket" size={22} color={colors.flameRed} surface={false} />
              </View>
              <View style={styles.infoCopy}>
                <Text style={styles.infoTitle}>Payment Status</Text>
                <Text style={styles.infoValue}>Order payment</Text>
              </View>
              <Text style={[styles.paymentStatus, {color: paymentStatus.color}]}>
                {paymentStatus.label}
              </Text>
            </View>
          </View>

          {order.chefResponseNote ? (
            <View style={styles.noteCard}>
              <Text style={styles.sectionTitle}>Chef Note</Text>
              <Text style={styles.noteText}>{order.chefResponseNote}</Text>
            </View>
          ) : null}

          <View style={styles.bottomActions}>
            <Pressable
              accessibilityLabel="Contact chef"
              accessibilityRole="button"
              onPress={showContactChefUnavailable}
              style={({pressed}) => [styles.secondaryAction, pressed && styles.pressed]}>
              <Icon name="phone" size={20} color={colors.flameRed} surface={false} />
              <Text style={styles.secondaryActionText}>Contact Chef</Text>
            </Pressable>
            <Pressable
              accessibilityLabel="Cancel order"
              accessibilityRole="button"
              onPress={showCancelUnavailable}
              style={({pressed}) => [styles.primaryAction, pressed && styles.pressed]}>
              <Icon name="trash" size={20} color={colors.white} surface={false} />
              <Text style={styles.primaryActionText}>Cancel Order</Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.white},
  header: {
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    backgroundColor: colors.white,
  },
  headerAction: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
  },
  headerTitle: {
    minWidth: 0,
    flex: 1,
    color: colors.espressoBrown,
    fontSize: typography.heading,
    fontWeight: fontWeight.bold,
  },
  helpAction: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.pill,
  },
  helpText: {
    color: colors.flameRed,
    fontSize: typography.small,
    fontWeight: fontWeight.bold,
  },
  pressed: {opacity: 0.72},
  content: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xxl,
  },
  notice: {marginBottom: spacing.sm},
  summaryCard: {
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
    backgroundColor: colors.white,
    ...elevation.card,
  },
  summaryTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  orderIdentity: {minWidth: 0, flex: 1.15},
  kitchenIdentity: {minWidth: 0, flex: 0.85, alignItems: 'flex-end'},
  orderNumber: {
    color: colors.espressoBrown,
    fontSize: typography.heading,
    fontWeight: fontWeight.bold,
  },
  placedText: {
    marginTop: spacing.xxs,
    color: colors.textSecondary,
    fontSize: typography.small,
  },
  kitchenName: {
    color: colors.espressoBrown,
    fontSize: typography.body,
    fontWeight: fontWeight.bold,
    textAlign: 'right',
  },
  kitchenCaption: {
    marginTop: spacing.xxs,
    color: colors.textSecondary,
    fontSize: typography.tiny,
    textAlign: 'right',
  },
  currentStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  statusIconCircle: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.errorSoft,
  },
  statusCopy: {minWidth: 0, flex: 1},
  statusTitle: {
    color: colors.flameRed,
    fontSize: typography.heading,
    fontWeight: fontWeight.bold,
  },
  statusDetail: {
    marginTop: spacing.xxs,
    color: colors.textSecondary,
    fontSize: typography.small,
  },
  trackableProgress: {borderRadius: radius.md},
  progressWrap: {marginTop: spacing.lg},
  progressTrackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
  },
  progressCircle: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: borderWidth.standard,
    borderColor: colors.borderStrong,
    backgroundColor: colors.white,
  },
  progressCircleActive: {
    borderColor: colors.flameRed,
    backgroundColor: colors.flameRed,
  },
  progressConnector: {
    flex: 1,
    height: 2,
    marginHorizontal: spacing.xxs,
    backgroundColor: colors.border,
  },
  progressConnectorActive: {backgroundColor: colors.flameRed},
  progressLabels: {flexDirection: 'row', marginTop: spacing.xs},
  progressLabel: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: typography.tiny,
    lineHeight: 16,
    textAlign: 'center',
  },
  progressLabelActive: {
    color: colors.espressoBrown,
    fontWeight: fontWeight.semibold,
  },
  itemsCard: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xs,
    borderRadius: radius.lg,
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
    backgroundColor: colors.white,
    ...elevation.card,
  },
  sectionTitle: {
    marginBottom: spacing.sm,
    color: colors.espressoBrown,
    fontSize: typography.body,
    fontWeight: fontWeight.bold,
  },
  itemRow: {
    minHeight: 84,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    borderBottomWidth: borderWidth.standard,
    borderBottomColor: colors.border,
  },
  itemRowLast: {borderBottomWidth: 0},
  itemThumb: {
    width: 68,
    height: 68,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
  },
  itemCopy: {minWidth: 0, flex: 1},
  itemName: {
    color: colors.espressoBrown,
    fontSize: typography.body,
    fontWeight: fontWeight.bold,
  },
  itemMeta: {
    marginTop: spacing.xxs,
    color: colors.textSecondary,
    fontSize: typography.small,
  },
  itemPriceLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  unitPrice: {
    color: colors.espressoBrown,
    fontSize: typography.small,
    fontWeight: fontWeight.semibold,
  },
  quantityText: {color: colors.espressoBrown, fontSize: typography.small},
  itemTotal: {
    color: colors.espressoBrown,
    fontSize: typography.body,
    fontWeight: fontWeight.semibold,
  },
  billDivider: {
    height: borderWidth.standard,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
    backgroundColor: colors.border,
  },
  amountRow: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  amountRowStrong: {
    minHeight: 54,
    marginTop: spacing.xs,
    marginHorizontal: -spacing.md,
    paddingHorizontal: spacing.md,
    borderTopWidth: borderWidth.standard,
    borderTopColor: colors.errorSoft,
    backgroundColor: colors.errorSoft,
  },
  amountLabel: {color: colors.textSecondary, fontSize: typography.small},
  amountValue: {color: colors.espressoBrown, fontSize: typography.small},
  amountStrong: {
    color: colors.flameRed,
    fontSize: typography.body,
    fontWeight: fontWeight.bold,
  },
  totalAmount: {
    color: colors.flameRed,
    fontSize: typography.heading,
    fontWeight: fontWeight.extrabold,
  },
  infoCard: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
    backgroundColor: colors.white,
    ...elevation.card,
  },
  infoRow: {
    minHeight: 82,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  infoIconCircle: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.errorSoft,
  },
  infoCopy: {minWidth: 0, flex: 1},
  infoTitle: {
    color: colors.espressoBrown,
    fontSize: typography.body,
    fontWeight: fontWeight.bold,
  },
  infoValue: {
    marginTop: spacing.xxs,
    color: colors.textSecondary,
    fontSize: typography.small,
    lineHeight: 19,
  },
  infoDivider: {
    height: borderWidth.standard,
    marginLeft: 56,
    backgroundColor: colors.border,
  },
  paymentStatus: {
    maxWidth: 90,
    fontSize: typography.small,
    fontWeight: fontWeight.bold,
    textAlign: 'right',
  },
  noteCard: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  noteText: {
    color: colors.textSecondary,
    fontSize: typography.small,
    lineHeight: 20,
  },
  bottomActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  secondaryAction: {
    minHeight: 52,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderWidth: borderWidth.standard,
    borderColor: colors.flameRed,
    backgroundColor: colors.white,
  },
  secondaryActionText: {
    color: colors.flameRed,
    fontSize: typography.small,
    fontWeight: fontWeight.bold,
  },
  primaryAction: {
    minHeight: 52,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.flameRed,
  },
  primaryActionText: {
    color: colors.white,
    fontSize: typography.small,
    fontWeight: fontWeight.bold,
  },
  skeletonWrap: {padding: spacing.md},
  skeletonHeader: {
    width: '58%',
    height: 24,
    borderRadius: radius.sm,
    backgroundColor: colors.border,
  },
  skeletonCard: {
    height: 150,
    marginTop: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceMuted,
  },
});
