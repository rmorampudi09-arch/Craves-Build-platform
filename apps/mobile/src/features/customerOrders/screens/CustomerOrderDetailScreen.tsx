import React from 'react';
import {
  ActivityIndicator,
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
import type {CustomerOrdersStackParamList} from '../../../app/navigation/types';
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
import {Button} from '../../../shared/components/Button';
import {Icon} from '../../../shared/components/Icon';
import {
  OfflineNotice,
  RecoverableErrorBanner,
  TerminalState,
} from '../../../shared/components/LifecycleStates';
import {ScreenShell} from '../../../shared/components/ScreenShell';
import type {CustomerOrderMoney} from '../domain/customerOrderTypes';
import {
  formatCustomerOrderCreatedAt,
  formatCustomerOrderMoney,
  getCustomerOrderDisplayReference,
  getCustomerOrderReferenceAction,
  getCustomerOrderStatusPresentation,
} from '../presentation/customerOrdersPresentation';
import {useCustomerOrderDetailQuery} from '../query/customerOrdersQueries';

type DetailRoute = RouteProp<CustomerOrdersStackParamList, 'CustomerOrderDetail'>;
type DetailNavigation = NavigationProp<
  CustomerOrdersStackParamList,
  'CustomerOrderDetail'
>;

interface AmountRowProps {
  label: string;
  money: CustomerOrderMoney;
  strong?: boolean;
}

function AmountRow({label, money, strong = false}: AmountRowProps) {
  return (
    <View style={styles.amountRow}>
      <Text style={[styles.amountLabel, strong && styles.amountStrong]}>{label}</Text>
      <Text style={[styles.amountValue, strong && styles.amountStrong]}>
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
  const address = order.deliveryAddress;
  const addressLines = address
    ? [
        address.addressLine1,
        address.addressLine2,
        address.landmark,
        address.areaName,
        `${address.city}, ${address.state} ${address.postalCode}`,
      ].filter((value): value is string => Boolean(value))
    : [];

  return (
    <ScreenShell
      edges={['top', 'bottom']}
      keyboardAvoiding={false}
      testID="customer-order-detail">
      <View style={styles.screen}>
        <View style={styles.header}>
          <Pressable
            accessibilityLabel="Back to orders"
            accessibilityRole="button"
            onPress={() => navigation.goBack()}
            style={({pressed}) => [styles.headerAction, pressed && styles.pressed]}>
            <Icon name="arrow-left" />
          </Pressable>
          <View style={styles.headerCopy}>
            <Text accessibilityRole="header" style={styles.headerTitle}>
              Order Details
            </Text>
            <Text style={styles.headerSubtitle}>
              #{getCustomerOrderDisplayReference(order.id)}
            </Text>
          </View>
          {detail.isFetching ? (
            <ActivityIndicator color={colors.flameRed} size="small" />
          ) : (
            <View style={styles.headerPlaceholder} />
          )}
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

          <View style={styles.heroCard}>
            <View style={styles.heroRow}>
              <View style={styles.heroCopy}>
                <Text style={styles.kitchenName}>{order.kitchenName}</Text>
                <Text style={styles.metaText}>
                  Placed {formatCustomerOrderCreatedAt(order.createdAt)}
                </Text>
              </View>
              <View style={styles.statusPill}>
                <Text accessibilityLiveRegion="polite" style={styles.statusText}>
                  {status.label}
                </Text>
              </View>
            </View>
            <Text style={styles.updatedText}>
              Last updated {formatCustomerOrderCreatedAt(order.updatedAt)}
            </Text>
            {order.prepTimeMinutes ? (
              <Text style={styles.updatedText}>
                Chef preparation estimate: {order.prepTimeMinutes} min
              </Text>
            ) : null}
            {canTrack ? (
              <Button
                label="Track Delivery"
                onPress={() =>
                  navigation.navigate('CustomerOrderTracking', {orderId: order.id})
                }
                style={styles.trackButton}
              />
            ) : null}
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Items</Text>
            {order.items.map(item => (
              <View key={item.id} style={styles.itemRow}>
                <View style={styles.itemCopy}>
                  <Text style={styles.itemName}>{item.itemName}</Text>
                  <Text style={styles.metaText}>Qty {item.quantity}</Text>
                </View>
                <Text style={styles.itemPrice}>
                  {formatCustomerOrderMoney(item.lineTotal)}
                </Text>
              </View>
            ))}
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Bill summary</Text>
            <AmountRow label="Food subtotal" money={order.foodSubtotal} />
            <AmountRow label="Platform fee" money={order.platformFee} />
            <AmountRow label="Tax" money={order.taxAmount} />
            <AmountRow label="Delivery fee" money={order.deliveryFee} />
            <View style={styles.amountDivider} />
            <AmountRow label="Total" money={order.grandTotal} strong />
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Delivery address</Text>
            {address ? (
              <>
                <Text style={styles.addressName}>{address.recipientName}</Text>
                {addressLines.map(line => (
                  <Text key={line} style={styles.addressLine}>
                    {line}
                  </Text>
                ))}
              </>
            ) : (
              <Text style={styles.metaText}>
                A customer-safe delivery address snapshot is not available for this order.
              </Text>
            )}
          </View>

          {order.chefResponseNote ? (
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Chef note</Text>
              <Text style={styles.bodyText}>{order.chefResponseNote}</Text>
            </View>
          ) : null}

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Order timeline</Text>
            <Text style={styles.bodyText}>
              Craves currently exposes the order's verified current status and timestamps here. Delivery status history is available from Track Delivery when delivery is active.
            </Text>
            <Text style={styles.timelineBlocker}>
              Detailed order-status events are not available for this order yet, so Craves shows only verified status information rather than estimating missing events.
            </Text>
          </View>
        </ScrollView>
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.white},
  header: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    borderBottomWidth: borderWidth.standard,
    borderBottomColor: colors.border,
    backgroundColor: colors.white,
  },
  headerAction: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
  },
  headerCopy: {minWidth: 0, flex: 1},
  headerTitle: {
    color: colors.espressoBrown,
    fontSize: typography.heading,
    fontWeight: fontWeight.bold,
  },
  headerSubtitle: {
    marginTop: spacing.xxs,
    color: colors.textSecondary,
    fontSize: typography.tiny,
  },
  headerPlaceholder: {width: 20, height: 20},
  pressed: {opacity: 0.72},
  content: {padding: spacing.md, paddingBottom: spacing.xl},
  notice: {marginBottom: spacing.sm},
  heroCard: {
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceWarm,
  },
  heroRow: {flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm},
  heroCopy: {minWidth: 0, flex: 1},
  kitchenName: {
    color: colors.espressoBrown,
    fontSize: typography.heading,
    fontWeight: fontWeight.bold,
  },
  statusPill: {
    maxWidth: '48%',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.errorSoft,
  },
  statusText: {
    color: colors.espressoBrown,
    fontSize: typography.tiny,
    fontWeight: fontWeight.semibold,
    textAlign: 'center',
  },
  metaText: {
    marginTop: spacing.xxs,
    color: colors.textSecondary,
    fontSize: typography.small,
  },
  updatedText: {
    marginTop: spacing.sm,
    color: colors.textSecondary,
    fontSize: typography.small,
  },
  trackButton: {marginTop: spacing.md},
  sectionCard: {
    marginTop: spacing.md,
    padding: spacing.md,
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
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    borderBottomWidth: borderWidth.standard,
    borderBottomColor: colors.border,
  },
  itemCopy: {minWidth: 0, flex: 1},
  itemName: {
    color: colors.espressoBrown,
    fontSize: typography.body,
    fontWeight: fontWeight.medium,
  },
  itemPrice: {
    color: colors.espressoBrown,
    fontSize: typography.body,
    fontWeight: fontWeight.semibold,
  },
  amountRow: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  amountLabel: {color: colors.textSecondary, fontSize: typography.small},
  amountValue: {color: colors.espressoBrown, fontSize: typography.small},
  amountStrong: {fontWeight: fontWeight.bold, color: colors.espressoBrown},
  amountDivider: {
    height: borderWidth.standard,
    marginVertical: spacing.xs,
    backgroundColor: colors.border,
  },
  addressName: {
    color: colors.espressoBrown,
    fontSize: typography.body,
    fontWeight: fontWeight.semibold,
  },
  addressLine: {
    marginTop: spacing.xxs,
    color: colors.textSecondary,
    fontSize: typography.small,
    lineHeight: 20,
  },
  bodyText: {
    color: colors.textSecondary,
    fontSize: typography.small,
    lineHeight: 21,
  },
  timelineBlocker: {
    marginTop: spacing.sm,
    color: colors.textSecondary,
    fontSize: typography.tiny,
    lineHeight: 18,
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
