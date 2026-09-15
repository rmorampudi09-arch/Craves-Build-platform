import React from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {ChefProductStackParamList} from '../../../app/navigation/types';
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
import {
  formatChefOrderStatus,
  maskChefOrderContactPhone,
} from '../domain/chefOrderDecision';
import {useChefOrderDecision} from '../state/useChefOrderDecision';
import {useChefOrderDetailContract} from '../state/useChefOrderDetailContract';

type Props = NativeStackScreenProps<ChefProductStackParamList, 'ChefOrderDetail'>;

function money(currency: string, value: number): string {
  return `${currency} ${value.toFixed(2)}`;
}

function shortOrderId(orderId: string): string {
  return `#${orderId.replace(/-/g, '').slice(-8).toUpperCase()}`;
}

function displayTimestamp(value: string): string {
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) {
    return 'Time unavailable';
  }
  return timestamp.toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function UnavailableRow({title, message}: {title: string; message: string}) {
  return (
    <View style={styles.unavailableRow}>
      <Icon color={colors.placeholder} name="lock" size={18} />
      <View style={styles.flex}>
        <Text style={styles.unavailableTitle}>{title}</Text>
        <Text style={styles.unavailableMessage}>{message}</Text>
      </View>
    </View>
  );
}

function LoadingScreen({onBack}: {onBack: () => void}) {
  return (
    <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={styles.safeArea}>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Back"
          accessibilityRole="button"
          onPress={onBack}
          style={styles.iconButton}>
          <Icon name="arrow-left" size={22} />
        </Pressable>
        <Text accessibilityRole="header" style={styles.headerTitle}>New order</Text>
        <View style={styles.headerSpacer} />
      </View>
      <View style={styles.loadingContent}>
        <SkeletonBlock borderRadius={radius.lg} height={92} />
        <SkeletonBlock borderRadius={radius.lg} height={180} />
        <SkeletonBlock borderRadius={radius.lg} height={140} />
        <SkeletonBlock borderRadius={radius.lg} height={160} />
      </View>
    </SafeAreaView>
  );
}

export function ChefOrderDetailScreen({navigation, route}: Props) {
  const {orderId} = route.params;
  const detail = useChefOrderDetailContract(orderId);
  const decision = useChefOrderDecision(orderId);
  const [prepMinutes, setPrepMinutes] = React.useState('');
  const [rejectOpen, setRejectOpen] = React.useState(false);
  const [rejectReason, setRejectReason] = React.useState('');

  const goToOrders = React.useCallback(() => {
    navigation.navigate('ChefTabs', {screen: 'Orders'});
  }, [navigation]);

  if (detail.status === 'pending' && !detail.data) {
    return <LoadingScreen onBack={() => navigation.goBack()} />;
  }

  if (!detail.data) {
    return (
      <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={styles.safeArea}>
        <View style={styles.header}>
          <Pressable
            accessibilityLabel="Back"
            accessibilityRole="button"
            onPress={() => navigation.goBack()}
            style={styles.iconButton}>
            <Icon name="arrow-left" size={22} />
          </Pressable>
          <Text accessibilityRole="header" style={styles.headerTitle}>New order</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.centerState}>
          <Icon color={colors.error} name="wifi-off" size={34} />
          <Text style={styles.centerTitle}>Order unavailable</Text>
          <Text style={styles.centerMessage}>
            {detail.error?.message ?? 'The latest order detail could not be loaded.'}
          </Text>
          <Pressable
            accessibilityLabel="Retry order detail"
            accessibilityRole="button"
            disabled={detail.isFetching}
            onPress={() => detail.refresh().catch(() => undefined)}
            style={({pressed}) => [styles.primaryButton, pressed && styles.pressed]}>
            <Text style={styles.primaryButtonText}>
              {detail.isFetching ? 'Refreshing…' : 'Try again'}
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const model = detail.data;
  const order = model.order;
  const actionable =
    model.actionability.acceptCandidate && model.actionability.rejectCandidate;
  const prepValue = Number(prepMinutes);
  const prepValid = Number.isInteger(prepValue) && prepValue > 0;
  const actionBusy = decision.action !== null;
  const address = order.deliveryAddress;

  const acceptOrder = async () => {
    try {
      await decision.accept(prepValue);
      goToOrders();
    } catch {
      // The hook exposes the normalized action error inline.
    }
  };

  const rejectOrder = async () => {
    try {
      await decision.reject(rejectReason);
      setRejectOpen(false);
      goToOrders();
    } catch {
      // The hook exposes the normalized action error inline.
    }
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={styles.safeArea}>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Back to Chef orders"
          accessibilityRole="button"
          disabled={actionBusy}
          onPress={() => navigation.goBack()}
          style={({pressed}) => [styles.iconButton, pressed && styles.pressed]}>
          <Icon name="arrow-left" size={22} />
        </Pressable>
        <Text accessibilityRole="header" style={styles.headerTitle}>New order</Text>
        <Pressable
          accessibilityLabel="Refresh order detail"
          accessibilityRole="button"
          disabled={detail.isFetching || actionBusy}
          onPress={() => detail.refresh().catch(() => undefined)}
          style={({pressed}) => [styles.iconButton, pressed && styles.pressed]}>
          {detail.isFetching ? (
            <ActivityIndicator color={colors.flameRed} size="small" />
          ) : (
            <Icon color={colors.flameRed} name="orders" size={21} />
          )}
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <View style={styles.heroCard}>
          <View style={styles.rowBetween}>
            <View>
              <Text style={styles.eyebrow}>Order</Text>
              <Text style={styles.orderId}>{shortOrderId(order.id)}</Text>
            </View>
            <View style={[styles.statusBadge, actionable && styles.statusBadgeNew]}>
              <Text style={[styles.statusText, actionable && styles.statusTextNew]}>
                {actionable ? 'NEW' : formatChefOrderStatus(order.status)}
              </Text>
            </View>
          </View>
          <Text style={styles.receivedText}>Received {displayTimestamp(order.createdAt)}</Text>
          <View style={styles.slaBox}>
            <Icon color={colors.warning} name="bell" size={18} />
            <View style={styles.flex}>
              <Text style={styles.slaTitle}>Response deadline unavailable</Text>
              <Text style={styles.slaMessage}>
                Craves will not estimate an acceptance countdown without the server SLA timestamp.
              </Text>
            </View>
          </View>
        </View>

        {decision.error ? (
          <Pressable
            accessibilityLabel="Dismiss order action error"
            accessibilityRole="button"
            onPress={decision.clearError}
            style={styles.errorBanner}>
            <Icon color={colors.error} name="wifi-off" size={19} />
            <Text style={styles.errorText}>{decision.error.message}</Text>
          </Pressable>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Order items</Text>
          {order.items.map((item, index) => (
            <View
              key={item.id}
              style={[styles.itemRow, index > 0 && styles.dividedRow]}>
              <View style={styles.quantityBadge}>
                <Text style={styles.quantityText}>{item.quantity}×</Text>
              </View>
              <View style={styles.flex}>
                <Text style={styles.itemName}>{item.itemName}</Text>
                <Text style={styles.itemMeta}>
                  {[item.category, item.foodType].filter(Boolean).join(' · ') || 'Dish'}
                </Text>
              </View>
              <Text style={styles.itemPrice}>{money(order.currency, item.lineTotal)}</Text>
            </View>
          ))}
          {order.items.length === 0 ? (
            <Text style={styles.emptyMessage}>No order items were returned.</Text>
          ) : null}
          <View style={styles.totalBlock}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Food subtotal</Text>
              <Text style={styles.totalValue}>{money(order.currency, order.foodSubtotal)}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Platform fee</Text>
              <Text style={styles.totalValue}>{money(order.currency, order.platformFee)}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Tax</Text>
              <Text style={styles.totalValue}>{money(order.currency, order.taxAmount)}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Delivery</Text>
              <Text style={styles.totalValue}>{money(order.currency, order.deliveryFee)}</Text>
            </View>
            <View style={[styles.totalRow, styles.grandTotalRow]}>
              <Text style={styles.grandTotalLabel}>Total</Text>
              <Text style={styles.grandTotalValue}>{money(order.currency, order.grandTotal)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Customer</Text>
          {model.authorizedContactSnapshot ? (
            <>
              <Text style={styles.customerName}>{model.authorizedContactSnapshot.recipientName}</Text>
              <Text style={styles.maskedPhone}>
                {maskChefOrderContactPhone(model.authorizedContactSnapshot.contactPhoneNumber)}
              </Text>
              <View style={styles.contactActions}>
                <View style={styles.disabledContactButton}>
                  <Icon color={colors.placeholder} name="phone" size={18} />
                  <Text style={styles.disabledContactText}>Call unavailable</Text>
                </View>
                <View style={styles.disabledContactButton}>
                  <Icon color={colors.placeholder} name="mail" size={18} />
                  <Text style={styles.disabledContactText}>Chat unavailable</Text>
                </View>
              </View>
              <Text style={styles.privacyNote}>
                Contact controls stay disabled until a separate authorized contact/chat contract is available.
              </Text>
            </>
          ) : (
            <UnavailableRow title="Customer contact unavailable" message="No authorized delivery contact snapshot was returned." />
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Delivery address</Text>
          {address ? (
            <View style={styles.addressRow}>
              <View style={styles.locationIcon}>
                <Icon color={colors.flameRed} name="location" size={20} />
              </View>
              <View style={styles.flex}>
                <Text style={styles.addressPrimary}>{address.addressLine1}</Text>
                {address.addressLine2 ? <Text style={styles.addressSecondary}>{address.addressLine2}</Text> : null}
                <Text style={styles.addressSecondary}>
                  {[address.areaName, address.city, address.state, address.postalCode]
                    .filter(Boolean)
                    .join(', ')}
                </Text>
                {address.landmark ? <Text style={styles.addressSecondary}>Near {address.landmark}</Text> : null}
              </View>
            </View>
          ) : (
            <Text style={styles.emptyMessage}>Delivery address is unavailable for this order.</Text>
          )}
          <UnavailableRow
            title="Map action unavailable"
            message="No approved Chef map/deep-link authorization contract is registered yet."
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Order context</Text>
          <UnavailableRow
            title="Customer note unavailable"
            message={model.unavailable.customerOrderNote.reason}
          />
          <UnavailableRow
            title="Payment method unavailable"
            message={model.unavailable.paymentMethod.reason}
          />
          <UnavailableRow
            title="Status timeline unavailable"
            message={model.unavailable.statusTimeline.reason}
          />
        </View>

        {!actionable ? (
          <View style={styles.latestStatusCard}>
            <Icon color={colors.success} name="check" size={22} />
            <View style={styles.flex}>
              <Text style={styles.latestStatusTitle}>Latest status</Text>
              <Text style={styles.latestStatusText}>{formatChefOrderStatus(order.status)}</Text>
              <Text style={styles.latestStatusHint}>This order can no longer be accepted or rejected from this screen.</Text>
            </View>
          </View>
        ) : null}
      </ScrollView>

      {actionable ? (
        <View style={styles.actionDock}>
          <Text style={styles.prepLabel}>Preparation time</Text>
          <View style={styles.prepInputRow}>
            <TextInput
              accessibilityLabel="Preparation time in minutes"
              editable={!actionBusy}
              keyboardType="number-pad"
              maxLength={6}
              onChangeText={value => setPrepMinutes(value.replace(/\D/g, ''))}
              placeholder="e.g. 35"
              placeholderTextColor={colors.placeholder}
              style={styles.prepInput}
              value={prepMinutes}
            />
            <Text style={styles.minutesLabel}>minutes</Text>
          </View>
          <View style={styles.actionRow}>
            <Pressable
              accessibilityLabel="Reject order"
              accessibilityRole="button"
              accessibilityState={{disabled: actionBusy}}
              disabled={actionBusy}
              onPress={() => {
                decision.clearError();
                setRejectOpen(true);
              }}
              style={({pressed}) => [styles.rejectButton, pressed && styles.pressed, actionBusy && styles.disabled]}>
              <Text style={styles.rejectButtonText}>Reject</Text>
            </Pressable>
            <Pressable
              accessibilityLabel="Accept order"
              accessibilityRole="button"
              accessibilityState={{disabled: actionBusy || !prepValid}}
              disabled={actionBusy || !prepValid}
              onPress={acceptOrder}
              style={({pressed}) => [styles.acceptButton, pressed && styles.pressed, (actionBusy || !prepValid) && styles.disabled]}>
              {decision.action === 'accept' ? (
                <ActivityIndicator color={colors.white} size="small" />
              ) : (
                <Text style={styles.acceptButtonText}>Accept order</Text>
              )}
            </Pressable>
          </View>
        </View>
      ) : null}

      <Modal
        animationType="slide"
        onRequestClose={() => !actionBusy && setRejectOpen(false)}
        transparent
        visible={rejectOpen}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalAvoider}>
          <Pressable
            accessibilityLabel="Close rejection dialog"
            accessibilityRole="button"
            disabled={actionBusy}
            onPress={() => setRejectOpen(false)}
            style={styles.modalBackdrop}
          />
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Reject this order?</Text>
            <Text style={styles.sheetMessage}>Add a clear reason. The decision is final once the server confirms it.</Text>
            <TextInput
              accessibilityLabel="Rejection reason"
              editable={!actionBusy}
              maxLength={500}
              multiline
              onChangeText={setRejectReason}
              placeholder="Why can’t you prepare this order?"
              placeholderTextColor={colors.placeholder}
              style={styles.reasonInput}
              textAlignVertical="top"
              value={rejectReason}
            />
            {decision.error ? <Text style={styles.sheetError}>{decision.error.message}</Text> : null}
            <View style={styles.sheetActions}>
              <Pressable
                accessibilityRole="button"
                disabled={actionBusy}
                onPress={() => setRejectOpen(false)}
                style={({pressed}) => [styles.sheetCancel, pressed && styles.pressed]}>
                <Text style={styles.sheetCancelText}>Keep order</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{disabled: actionBusy || !rejectReason.trim()}}
                disabled={actionBusy || !rejectReason.trim()}
                onPress={rejectOrder}
                style={({pressed}) => [styles.sheetReject, pressed && styles.pressed, (actionBusy || !rejectReason.trim()) && styles.disabled]}>
                {decision.action === 'reject' ? (
                  <ActivityIndicator color={colors.white} size="small" />
                ) : (
                  <Text style={styles.sheetRejectText}>Confirm reject</Text>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {flex: 1, backgroundColor: colors.surfaceMuted},
  flex: {flex: 1},
  pressed: {opacity: 0.68},
  disabled: {opacity: 0.45},
  header: {
    alignItems: 'center',
    backgroundColor: colors.white,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 60,
    paddingHorizontal: spacing.sm,
  },
  headerTitle: {color: colors.espressoBrown, fontSize: typography.heading, fontWeight: fontWeight.bold},
  iconButton: {alignItems: 'center', justifyContent: 'center', minHeight: touchTarget.minimum, minWidth: touchTarget.minimum},
  headerSpacer: {height: touchTarget.minimum, width: touchTarget.minimum},
  loadingContent: {gap: spacing.md, padding: spacing.md},
  centerState: {alignItems: 'center', flex: 1, justifyContent: 'center', padding: spacing.xl},
  centerTitle: {color: colors.textPrimary, fontSize: typography.heading, fontWeight: fontWeight.bold, marginTop: spacing.md},
  centerMessage: {color: colors.textSecondary, fontSize: typography.body, marginTop: spacing.xs, textAlign: 'center'},
  primaryButton: {backgroundColor: colors.flameRed, borderRadius: radius.pill, marginTop: spacing.lg, minHeight: touchTarget.minimum, paddingHorizontal: spacing.xl, justifyContent: 'center'},
  primaryButtonText: {color: colors.white, fontSize: typography.button, fontWeight: fontWeight.bold},
  content: {padding: spacing.md, paddingBottom: spacing.xxxl},
  heroCard: {...elevation.card, backgroundColor: colors.espressoBrown, borderRadius: radius.xl, padding: spacing.lg, marginBottom: spacing.md},
  rowBetween: {alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between'},
  eyebrow: {color: colors.creamDeep, fontSize: typography.small, fontWeight: fontWeight.semibold},
  orderId: {color: colors.white, fontSize: typography.hero, fontWeight: fontWeight.extrabold, marginTop: spacing.xxs},
  statusBadge: {backgroundColor: colors.surfaceMuted, borderRadius: radius.pill, maxWidth: 150, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs},
  statusBadgeNew: {backgroundColor: colors.flameRed},
  statusText: {color: colors.textSecondary, fontSize: typography.tiny, fontWeight: fontWeight.bold, textAlign: 'center'},
  statusTextNew: {color: colors.white},
  receivedText: {color: colors.creamDeep, fontSize: typography.small, marginTop: spacing.sm},
  slaBox: {alignItems: 'flex-start', backgroundColor: colors.white, borderRadius: radius.md, flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, padding: spacing.sm},
  slaTitle: {color: colors.textPrimary, fontSize: typography.small, fontWeight: fontWeight.semibold},
  slaMessage: {color: colors.textSecondary, fontSize: typography.tiny, marginTop: spacing.xxs},
  errorBanner: {alignItems: 'center', backgroundColor: colors.errorSoft, borderColor: colors.error, borderRadius: radius.md, borderWidth: 1, flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md, padding: spacing.sm},
  errorText: {color: colors.error, flex: 1, fontSize: typography.small, fontWeight: fontWeight.medium},
  card: {...elevation.card, backgroundColor: colors.white, borderRadius: radius.lg, marginBottom: spacing.md, padding: spacing.md},
  sectionTitle: {color: colors.espressoBrown, fontSize: typography.heading, fontWeight: fontWeight.bold, marginBottom: spacing.sm},
  itemRow: {alignItems: 'center', flexDirection: 'row', gap: spacing.sm, paddingVertical: spacing.sm},
  dividedRow: {borderTopColor: colors.border, borderTopWidth: 1},
  quantityBadge: {alignItems: 'center', backgroundColor: colors.white, borderRadius: radius.sm, justifyContent: 'center', minHeight: 38, minWidth: 38},
  quantityText: {color: colors.flameRed, fontSize: typography.small, fontWeight: fontWeight.bold},
  itemName: {color: colors.textPrimary, fontSize: typography.body, fontWeight: fontWeight.semibold},
  itemMeta: {color: colors.textSecondary, fontSize: typography.small, marginTop: spacing.xxs},
  itemPrice: {color: colors.espressoBrown, fontSize: typography.small, fontWeight: fontWeight.bold},
  emptyMessage: {color: colors.textSecondary, fontSize: typography.body, paddingVertical: spacing.sm},
  totalBlock: {borderTopColor: colors.borderStrong, borderTopWidth: 1, marginTop: spacing.sm, paddingTop: spacing.sm},
  totalRow: {alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.xs},
  totalLabel: {color: colors.textSecondary, fontSize: typography.small},
  totalValue: {color: colors.textPrimary, fontSize: typography.small, fontWeight: fontWeight.medium},
  grandTotalRow: {borderTopColor: colors.border, borderTopWidth: 1, marginTop: spacing.xs, paddingTop: spacing.sm},
  grandTotalLabel: {color: colors.espressoBrown, fontSize: typography.button, fontWeight: fontWeight.bold},
  grandTotalValue: {color: colors.flameRed, fontSize: typography.button, fontWeight: fontWeight.extrabold},
  customerName: {color: colors.textPrimary, fontSize: typography.button, fontWeight: fontWeight.semibold},
  maskedPhone: {color: colors.textSecondary, fontSize: typography.body, marginTop: spacing.xxs, letterSpacing: 0.5},
  contactActions: {flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md},
  disabledContactButton: {alignItems: 'center', backgroundColor: colors.surfaceMuted, borderRadius: radius.pill, flexDirection: 'row', gap: spacing.xs, minHeight: touchTarget.minimum, paddingHorizontal: spacing.md},
  disabledContactText: {color: colors.placeholder, fontSize: typography.small, fontWeight: fontWeight.semibold},
  privacyNote: {color: colors.textSecondary, fontSize: typography.tiny, marginTop: spacing.sm},
  addressRow: {alignItems: 'flex-start', flexDirection: 'row', gap: spacing.sm},
  locationIcon: {alignItems: 'center', backgroundColor: colors.iconSurface, borderRadius: radius.pill, height: 40, justifyContent: 'center', width: 40},
  addressPrimary: {color: colors.textPrimary, fontSize: typography.body, fontWeight: fontWeight.semibold},
  addressSecondary: {color: colors.textSecondary, fontSize: typography.small, marginTop: spacing.xxs},
  unavailableRow: {alignItems: 'flex-start', borderTopColor: colors.border, borderTopWidth: 1, flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm, paddingTop: spacing.sm},
  unavailableTitle: {color: colors.textPrimary, fontSize: typography.small, fontWeight: fontWeight.semibold},
  unavailableMessage: {color: colors.textSecondary, fontSize: typography.tiny, marginTop: spacing.xxs},
  latestStatusCard: {alignItems: 'flex-start', backgroundColor: colors.successSoft, borderColor: colors.success, borderRadius: radius.lg, borderWidth: 1, flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md, padding: spacing.md},
  latestStatusTitle: {color: colors.textPrimary, fontSize: typography.small, fontWeight: fontWeight.semibold},
  latestStatusText: {color: colors.success, fontSize: typography.body, fontWeight: fontWeight.bold, marginTop: spacing.xxs},
  latestStatusHint: {color: colors.textSecondary, fontSize: typography.tiny, marginTop: spacing.xxs},
  actionDock: {...elevation.card, backgroundColor: colors.white, borderTopColor: colors.border, borderTopWidth: 1, paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.sm},
  prepLabel: {color: colors.textPrimary, fontSize: typography.small, fontWeight: fontWeight.semibold},
  prepInputRow: {alignItems: 'center', flexDirection: 'row', gap: spacing.xs, marginTop: spacing.xs},
  prepInput: {backgroundColor: colors.surfaceMuted, borderColor: colors.borderStrong, borderRadius: radius.md, borderWidth: 1, color: colors.textPrimary, flex: 1, fontSize: typography.body, minHeight: touchTarget.minimum, paddingHorizontal: spacing.sm},
  minutesLabel: {color: colors.textSecondary, fontSize: typography.small},
  actionRow: {flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm},
  rejectButton: {alignItems: 'center', borderColor: colors.flameRed, borderRadius: radius.pill, borderWidth: 1, flex: 1, justifyContent: 'center', minHeight: touchTarget.comfortable},
  rejectButtonText: {color: colors.flameRed, fontSize: typography.button, fontWeight: fontWeight.bold},
  acceptButton: {...elevation.primaryAction, alignItems: 'center', backgroundColor: colors.flameRed, borderRadius: radius.pill, flex: 2, justifyContent: 'center', minHeight: touchTarget.comfortable},
  acceptButtonText: {color: colors.white, fontSize: typography.button, fontWeight: fontWeight.bold},
  modalAvoider: {flex: 1, justifyContent: 'flex-end'},
  modalBackdrop: {backgroundColor: 'rgba(38,26,21,0.48)', flex: 1},
  sheet: {backgroundColor: colors.white, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, paddingBottom: spacing.xl},
  sheetHandle: {alignSelf: 'center', backgroundColor: colors.borderStrong, borderRadius: radius.pill, height: 4, marginBottom: spacing.md, width: 48},
  sheetTitle: {color: colors.espressoBrown, fontSize: typography.hero, fontWeight: fontWeight.bold},
  sheetMessage: {color: colors.textSecondary, fontSize: typography.body, marginTop: spacing.xs},
  reasonInput: {backgroundColor: colors.surfaceMuted, borderColor: colors.borderStrong, borderRadius: radius.md, borderWidth: 1, color: colors.textPrimary, fontSize: typography.body, marginTop: spacing.md, minHeight: 112, padding: spacing.sm},
  sheetError: {color: colors.error, fontSize: typography.small, marginTop: spacing.sm},
  sheetActions: {flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md},
  sheetCancel: {alignItems: 'center', borderColor: colors.borderStrong, borderRadius: radius.pill, borderWidth: 1, flex: 1, justifyContent: 'center', minHeight: touchTarget.comfortable},
  sheetCancelText: {color: colors.textPrimary, fontSize: typography.button, fontWeight: fontWeight.semibold},
  sheetReject: {alignItems: 'center', backgroundColor: colors.error, borderRadius: radius.pill, flex: 1, justifyContent: 'center', minHeight: touchTarget.comfortable},
  sheetRejectText: {color: colors.white, fontSize: typography.button, fontWeight: fontWeight.bold},
});
