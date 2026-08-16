import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import type {BottomTabNavigationProp} from '@react-navigation/bottom-tabs';
import type {NavigationProp} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useCustomerBottomNavScroll} from '../../../app/navigation/CustomerBottomNavController';
import type {
  CustomerCartStackParamList,
  CustomerTabParamList,
} from '../../../app/navigation/types';
import {useAppDispatch, useAppSelector} from '../../../app/store/hooks';
import {
  colors,
  elevation,
  fontWeight,
  iconSize,
  radius,
  spacing,
  touchTarget,
  typography,
} from '../../../design/tokens';
import {Button} from '../../../shared/components/Button';
import {Icon} from '../../../shared/components/Icon';
import {
  RecoverableErrorBanner,
  TerminalState,
} from '../../../shared/components/LifecycleStates';
import {ScreenShell} from '../../../shared/components/ScreenShell';
import {CustomerEmptyState} from '../../customerEmptyStates/components/CustomerEmptyState';
import {customerEmptyStateAdapters} from '../../customerEmptyStates/customerEmptyStateAdapters';
import {CustomerHeader} from '../../customerShell/components/CustomerHeader';
import {CustomerLocationSelector} from '../../customerShell/components/CustomerLocationSelector';
import {useCustomerHeaderState} from '../../customerShell/hooks/useCustomerHeaderState';
import {checkoutApi} from '../../checkout/api/checkoutApi';
import type {CheckoutSession} from '../../checkout/domain/checkoutTypes';
import {paymentHandoffCoordinator} from '../../payment/domain/paymentHandoffCoordinator';
import {paymentRecoveryCoordinator} from '../../payment/domain/paymentRecoveryCoordinator';
import {razorpayGateway} from '../../payment/gateway/razorpayGateway';
import {
  checkCartServiceability,
  type CartDiscoveryDish,
} from '../api/cartServiceabilityApi';
import type {
  CartScreenAmountField,
  CartScreenItem,
  CartScreenModel,
} from '../domain/cartScreenModel';
import {resolveCartQuantityInteraction} from '../domain/cartScreenModel';
import {
  getCartItemInitial,
  groupCartItemsByKitchen,
  type CartKitchenSectionModel,
} from '../cartUiModel';
import {
  removeCartItem,
  setCartItemQuantity,
  type CartMutationOutcome,
} from '../state/cartMutations';
import {refreshCartSnapshot} from '../state/cartRefresh';
import {selectCartScreenModel} from '../state/cartSelectors';
import {formatCartMoney} from '../viewCartOverlayModel';

const DELIVERY_RADIUS_KM = 10;
type ServiceabilityState =
  | 'IDLE'
  | 'CHECKING'
  | 'SERVICEABLE'
  | 'UNSERVICEABLE'
  | 'ERROR';

function formatAmountField(field: CartScreenAmountField): string {
  return field.amount ? formatCartMoney(field.amount) : '₹0';
}

function CartAmountRow({
  label,
  field,
  emphasized = false,
}: {
  label: string;
  field: CartScreenAmountField;
  emphasized?: boolean;
}) {
  return (
    <View style={styles.amountRow}>
      <Text style={[styles.amountLabel, emphasized && styles.amountLabelStrong]}>
        {label}
      </Text>
      <Text style={[styles.amountValue, emphasized && styles.amountValueStrong]}>
        {formatAmountField(field)}
      </Text>
    </View>
  );
}

function foodTypeLabel(
  value: CartDiscoveryDish['foodType'] | CartScreenItem['foodType'],
): string | null {
  if (value === 'VEG') return 'Veg';
  if (value === 'NON_VEG') return 'Non-veg';
  if (value === 'EGG') return 'Egg';
  return null;
}

function spiceLabel(
  value: CartDiscoveryDish['spiceLevel'] | CartScreenItem['spiceLevel'],
): string | null {
  if (value === 'MILD') return 'Mild';
  if (value === 'MEDIUM') return 'Medium';
  if (value === 'SPICY') return 'Spicy';
  return null;
}

function CartLineCard({
  item,
  discovery,
  pending,
  onDecrease,
  onIncrease,
  onRemove,
}: {
  item: CartScreenItem;
  discovery?: CartDiscoveryDish;
  pending: boolean;
  onDecrease: (item: CartScreenItem) => void;
  onIncrease: (item: CartScreenItem) => void;
  onRemove: (item: CartScreenItem) => void;
}) {
  const imageUrl = discovery?.imageUrl ?? item.imageUrl;
  const serves = discovery?.servesCount ?? item.servesCount;
  const spice = spiceLabel(discovery?.spiceLevel ?? item.spiceLevel);
  const foodType = foodTypeLabel(discovery?.foodType ?? item.foodType);
  const metadata = [
    spice,
    serves ? `Serves ${serves}` : null,
    foodType,
  ]
    .filter(Boolean)
    .join('  •  ');

  return (
    <View style={styles.lineCard}>
      {imageUrl ? (
        <Image source={{uri: imageUrl}} resizeMode="cover" style={styles.lineImage} />
      ) : (
        <View style={styles.lineMediaFallback}>
          <Text style={styles.lineMediaInitial}>
            {getCartItemInitial(item.itemName)}
          </Text>
        </View>
      )}

      <View style={styles.lineBody}>
        <Text numberOfLines={2} style={styles.lineName}>
          {item.itemName}
        </Text>
        <View style={styles.kitchenInline}>
          <Text numberOfLines={1} style={styles.lineKitchen}>
            {item.kitchenName}
          </Text>
          <Icon name="check" size={14} color={colors.flameRed} />
        </View>
        {metadata ? (
          <Text numberOfLines={1} style={styles.lineMeta}>
            {metadata}
          </Text>
        ) : null}
        <Text style={styles.linePrice}>{formatCartMoney(item.unitPrice)}</Text>
      </View>

      <View style={styles.lineRight}>
        <View style={styles.quantityControl}>
          <Pressable
            accessibilityLabel={`Decrease ${item.itemName} quantity`}
            disabled={pending}
            onPress={() => onDecrease(item)}
            style={styles.quantityButton}>
            <Text style={styles.quantitySymbol}>−</Text>
          </Pressable>
          <Text style={styles.quantityValue}>{item.quantity}</Text>
          <Pressable
            accessibilityLabel={`Increase ${item.itemName} quantity`}
            disabled={pending}
            onPress={() => onIncrease(item)}
            style={styles.quantityButton}>
            <Text style={styles.quantitySymbol}>+</Text>
          </Pressable>
        </View>
        <Pressable
          accessibilityLabel={`Remove ${item.itemName}`}
          disabled={pending}
          onPress={() => onRemove(item)}
          style={styles.removeButton}>
          <Icon name="trash" size={22} color={colors.flameRed} />
        </Pressable>
      </View>
    </View>
  );
}

function DeliveryCard({
  address,
  serviceability,
  estimatedMinutes,
  onChange,
}: {
  address: string | null;
  serviceability: ServiceabilityState;
  estimatedMinutes: number | null;
  onChange: () => void;
}) {
  const estimate =
    serviceability === 'CHECKING'
      ? 'Checking delivery availability…'
      : serviceability === 'UNSERVICEABLE'
        ? `Outside our ${DELIVERY_RADIUS_KM} km delivery area`
        : serviceability === 'ERROR'
          ? 'Delivery availability could not be verified'
          : serviceability === 'SERVICEABLE'
            ? estimatedMinutes
              ? `Delivery in approximately ${estimatedMinutes} min`
              : 'Delivery available within 10 km'
            : 'Choose an address to check delivery';

  return (
    <View style={styles.deliveryCard}>
      <View style={styles.deliveryIconBox}>
        <Icon name="delivery" size={28} color={colors.flameRed} />
      </View>
      <View style={styles.deliveryCopy}>
        <Text style={styles.deliveryLabel}>Delivering to</Text>
        <Text numberOfLines={2} style={styles.deliveryAddress}>
          {address ?? 'No delivery address selected'}
        </Text>
        <View style={styles.estimateRow}>
          <Icon name="clock" size={16} color={colors.flameRed} />
          <Text
            style={[
              styles.estimateText,
              serviceability === 'UNSERVICEABLE' && styles.unserviceableText,
            ]}>
            {estimate}
          </Text>
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={onChange}
        style={styles.changeButton}>
        <Text style={styles.changeText}>Change</Text>
      </Pressable>
    </View>
  );
}

function BillSummary({model}: {model: CartScreenModel}) {
  return (
    <View style={styles.billCard}>
      <Text style={styles.cardTitle}>Bill Details</Text>
      <View style={styles.billRows}>
        <CartAmountRow label="Food subtotal" field={model.billSummary.foodSubtotal} />
        <CartAmountRow label="Delivery fee" field={model.billSummary.deliveryFee} />
        <CartAmountRow label="Taxes" field={model.billSummary.taxAmount} />
        <CartAmountRow label="Coupon discount" field={model.billSummary.couponDiscount} />
        <View style={styles.billDivider} />
        <CartAmountRow emphasized label="To Pay" field={model.billSummary.grandTotal} />
      </View>
    </View>
  );
}

export function CustomerCartScreen() {
  const navigation = useNavigation<NavigationProp<CustomerCartStackParamList>>();
  const dispatch = useAppDispatch();
  const insets = useSafeAreaInsets();
  const model = useAppSelector(selectCartScreenModel);
  const snapshotStatus = useAppSelector(state => state.cart.snapshotStatus);
  const snapshotErrorCode = useAppSelector(state => state.cart.snapshotErrorCode);
  const mutations = useAppSelector(state => state.cart.mutations);
  const authPhone = useAppSelector(state => state.auth.identity?.phoneNumber ?? null);
  const header = useCustomerHeaderState();
  const bottomNavScroll = useCustomerBottomNavScroll();
  const [locationSelectorVisible, setLocationSelectorVisible] = useState(false);
  const [interactionError, setInteractionError] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [serviceability, setServiceability] = useState<ServiceabilityState>('IDLE');
  const [estimatedMinutes, setEstimatedMinutes] = useState<number | null>(null);
  const [discoveryByMenuItem, setDiscoveryByMenuItem] = useState<
    Record<string, CartDiscoveryDish>
  >({});
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const activeCheckoutRef = useRef<CheckoutSession | null>(null);

  const sections = useMemo(
    () => groupCartItemsByKitchen(model?.items ?? []),
    [model?.items],
  );
  const itemCount = useMemo(
    () => model?.items.reduce((total, item) => total + item.quantity, 0) ?? 0,
    [model?.items],
  );

  const refreshCart = useCallback(async () => {
    setRefreshError(null);
    const outcome = await dispatch(refreshCartSnapshot());
    if (outcome.status === 'FAILED') setRefreshError(outcome.error.message);
  }, [dispatch]);

  useEffect(() => {
    if (snapshotStatus === 'UNINITIALIZED') refreshCart();
  }, [refreshCart, snapshotStatus]);

  const verifyServiceability = useCallback(async () => {
    const location = header.selectedLocation;
    if (!model || !location || model.items.length === 0) {
      setServiceability('IDLE');
      setEstimatedMinutes(null);
      setDiscoveryByMenuItem({});
      return false;
    }

    setServiceability('CHECKING');
    try {
      const result = await checkCartServiceability(
        location.latitude,
        location.longitude,
        model.items.map(item => item.kitchenId),
      );
      const nextMap: Record<string, CartDiscoveryDish> = {};
      result.dishes.forEach(dish => {
        if (model.items.some(item => item.menuItemId === dish.menuItemId)) {
          nextMap[dish.menuItemId] = dish;
        }
      });
      setDiscoveryByMenuItem(nextMap);
      setEstimatedMinutes(result.estimatedMinutes);
      setServiceability(result.serviceable ? 'SERVICEABLE' : 'UNSERVICEABLE');
      return result.serviceable;
    } catch {
      setServiceability('ERROR');
      setEstimatedMinutes(null);
      return false;
    }
  }, [header.selectedLocation, model]);

  useEffect(() => {
    verifyServiceability();
  }, [verifyServiceability]);

  const browseMeals = useCallback(() => {
    const tabs = navigation.getParent<BottomTabNavigationProp<CustomerTabParamList>>();
    if (tabs) tabs.navigate('Home');
    else navigation.goBack();
  }, [navigation]);

  const handleMutationOutcome = useCallback((outcome: CartMutationOutcome) => {
    if (outcome.status === 'FAILED') setInteractionError(outcome.error.message);
  }, []);

  const updateQuantity = useCallback(
    (item: CartScreenItem, targetQuantity: number) => {
      const interaction = resolveCartQuantityInteraction(targetQuantity);
      setInteractionError(null);
      activeCheckoutRef.current = null;
      if (interaction.kind === 'INVALID') {
        setInteractionError('Choose a valid cart quantity.');
        return;
      }
      if (interaction.kind === 'REMOVE') {
        Alert.alert(
          'Remove this item?',
          `${item.itemName} will be removed from your cart.`,
          [
            {text: 'Keep item', style: 'cancel'},
            {
              text: 'Remove',
              style: 'destructive',
              onPress: () =>
                dispatch(removeCartItem({lineId: item.lineId})).then(
                  handleMutationOutcome,
                ),
            },
          ],
        );
        return;
      }
      dispatch(
        setCartItemQuantity({lineId: item.lineId, quantity: interaction.quantity}),
      ).then(handleMutationOutcome);
    },
    [dispatch, handleMutationOutcome],
  );

  const handleCheckout = useCallback(async () => {
    const addressId = header.selectedLocation?.addressId;
    if (!model || !addressId || checkoutBusy) return;
    setInteractionError(null);
    setCheckoutBusy(true);
    try {
      const serviceable = await verifyServiceability();
      if (!serviceable) {
        setInteractionError(
          `This address is outside the ${DELIVERY_RADIUS_KM} km delivery area for one or more kitchens. Choose another address.`,
        );
        return;
      }

      let checkout = activeCheckoutRef.current;
      if (
        !checkout ||
        checkout.deliveryAddressId !== addressId ||
        checkout.status !== 'PAYMENT_PENDING'
      ) {
        checkout = await checkoutApi.createSession({deliveryAddressId: addressId});
        activeCheckoutRef.current = checkout;
      }

      const handoff = await paymentHandoffCoordinator.prepare(checkout);
      try {
        const proof = await razorpayGateway.open(handoff, {phone: authPhone});
        const recovery = await paymentRecoveryCoordinator.recover(handoff, {
          kind: 'RAZORPAY_SUCCESS',
          proof,
        });
        activeCheckoutRef.current = recovery.checkout;

        if (recovery.outcome === 'SUCCEEDED') {
          activeCheckoutRef.current = null;
          Alert.alert('Payment successful', 'Your payment was verified by Craves.');
          await refreshCart();
          return;
        }
        if (recovery.outcome === 'RECONCILING') {
          setInteractionError(
            'Your payment is being confirmed by Craves. Do not pay again. Check Orders shortly.',
          );
          return;
        }
        if (recovery.outcome === 'PENDING') {
          setInteractionError(
            'Payment is still pending. Do not start another payment until Craves finishes checking this one.',
          );
          return;
        }
        setInteractionError('Payment did not complete. You can safely retry this payment.');
      } catch (paymentError) {
        const recovery = await paymentRecoveryCoordinator
          .recover(handoff, {kind: 'PROVIDER_ERROR'})
          .catch(() => null);

        if (recovery) {
          activeCheckoutRef.current = recovery.checkout;
          if (recovery.outcome === 'SUCCEEDED') {
            activeCheckoutRef.current = null;
            Alert.alert('Payment successful', 'Your payment was verified by Craves.');
            await refreshCart();
            return;
          }
          if (
            recovery.verification.status === 'PAID' ||
            recovery.outcome === 'RECONCILING'
          ) {
            setInteractionError(
              'Craves has received the payment signal and is reconciling your order. Do not pay again.',
            );
            return;
          }
        }
        throw paymentError;
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Checkout could not be started.';
      setInteractionError(message);
    } finally {
      setCheckoutBusy(false);
    }
  }, [
    authPhone,
    checkoutBusy,
    header.selectedLocation,
    model,
    refreshCart,
    verifyServiceability,
  ]);

  const visibleRefreshError =
    refreshError ??
    (snapshotStatus === 'ERROR'
      ? snapshotErrorCode === 'NETWORK_ERROR'
        ? 'You appear to be offline. Your last valid cart is still shown when available.'
        : 'The cart could not be refreshed. Your last valid cart is still shown when available.'
      : null);

  const renderHeader = () => (
    <View>
      <View style={styles.titleRow}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <Icon name="arrow-left" size={iconSize.md} color={colors.espressoBrown} />
        </Pressable>
        <View style={styles.titleCopy}>
          <Text style={styles.title}>Your Cart</Text>
          <Text style={styles.subtitle}>
            {itemCount} {itemCount === 1 ? 'item' : 'items'} from {sections.length}{' '}
            {sections.length === 1 ? 'kitchen' : 'kitchens'}
          </Text>
        </View>
      </View>

      {visibleRefreshError ? (
        <RecoverableErrorBanner
          message={visibleRefreshError}
          onRetry={refreshCart}
          style={styles.notice}
        />
      ) : null}
      {interactionError ? (
        <RecoverableErrorBanner message={interactionError} style={styles.notice} />
      ) : null}

      {model ? (
        <DeliveryCard
          address={header.selectedLocation?.displayName ?? null}
          serviceability={serviceability}
          estimatedMinutes={estimatedMinutes}
          onChange={() => setLocationSelectorVisible(true)}
        />
      ) : null}
    </View>
  );

  const renderFooter = () =>
    model ? (
      <View style={styles.listFooter}>
        <View style={styles.offerCard}>
          <View style={styles.offerTitleRow}>
            <View style={styles.offerIcon}>
              <Icon name="ticket" size={20} color={colors.flameRed} />
            </View>
            <Text style={styles.cardTitle}>Offers & Coupons</Text>
          </View>
          <Text style={styles.offerCaption}>
            Offers will appear here when coupon verification is enabled.
          </Text>
        </View>
        <BillSummary model={model} />
      </View>
    ) : null;

  const renderItem = ({item}: {item: CartScreenItem}) => (
    <CartLineCard
      item={item}
      discovery={discoveryByMenuItem[item.menuItemId]}
      pending={mutations[`line:${item.lineId}`]?.status === 'PENDING'}
      onDecrease={line => updateQuantity(line, line.quantity - 1)}
      onIncrease={line => updateQuantity(line, line.quantity + 1)}
      onRemove={line => updateQuantity(line, 0)}
    />
  );

  const content = (() => {
    if (
      !model &&
      (snapshotStatus === 'UNINITIALIZED' || snapshotStatus === 'LOADING')
    ) {
      return (
        <View style={styles.loadingState}>
          <ActivityIndicator color={colors.flameRed} size="large" />
          <Text>Loading your cart…</Text>
        </View>
      );
    }
    if (!model) {
      return (
        <TerminalState
          title="Cart could not be loaded"
          description={visibleRefreshError ?? 'Refresh to load your current cart.'}
          actionLabel="Try again"
          onAction={refreshCart}
        />
      );
    }
    return (
      <SectionList<CartScreenItem, CartKitchenSectionModel>
        sections={sections}
        keyExtractor={item => item.lineId}
        ListHeaderComponent={renderHeader}
        ListFooterComponent={renderFooter}
        ListEmptyComponent={
          <CustomerEmptyState
            model={customerEmptyStateAdapters.emptyCart()}
            onAction={actionId => {
              if (actionId === 'BROWSE_MEALS') browseMeals();
            }}
            testID="customer-cart-empty"
          />
        }
        renderItem={renderItem}
        renderSectionHeader={() => null}
        refreshControl={
          <RefreshControl
            refreshing={snapshotStatus === 'LOADING'}
            onRefresh={refreshCart}
            tintColor={colors.flameRed}
          />
        }
        onScroll={bottomNavScroll.onScroll}
        scrollEventThrottle={bottomNavScroll.scrollEventThrottle}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
      />
    );
  })();

  const checkoutEnabled = Boolean(
    model?.items.length &&
      header.selectedLocation?.addressId &&
      serviceability === 'SERVICEABLE' &&
      !checkoutBusy,
  );

  return (
    <ScreenShell edges={['top']} keyboardAvoiding={false} testID="customer-cart">
      <CustomerHeader
        variant="compact"
        onPressLocation={() => setLocationSelectorVisible(true)}
        onPressNotifications={() => header.refreshNotifications()}
      />
      <View style={styles.content}>{content}</View>

      {model && model.items.length > 0 ? (
        <View
          style={[
            styles.checkoutBar,
            {paddingBottom: Math.max(insets.bottom, spacing.sm)},
          ]}>
          <View style={styles.checkoutCopy}>
            <Text style={styles.checkoutTotal}>
              {formatAmountField(model.billSummary.grandTotal)}
            </Text>
            <Text style={styles.checkoutLink}>View Bill Details</Text>
          </View>
          <Button
            label={checkoutBusy ? 'Please wait…' : 'Proceed to Checkout'}
            disabled={!checkoutEnabled}
            onPress={handleCheckout}
            style={styles.checkoutButton}
          />
        </View>
      ) : null}

      <CustomerLocationSelector
        visible={locationSelectorVisible}
        onClose={() => setLocationSelectorVisible(false)}
      />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  content: {flex: 1, backgroundColor: colors.surfaceBase},
  listContent: {
    flexGrow: 1,
    paddingBottom: 145,
    backgroundColor: colors.surfaceBase,
  },
  loadingState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  backButton: {
    width: touchTarget.minimum,
    height: touchTarget.minimum,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
  },
  titleCopy: {flex: 1},
  title: {
    color: colors.espressoBrown,
    fontSize: typography.hero,
    fontWeight: fontWeight.extrabold,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: typography.small,
    marginTop: spacing.xxs,
  },
  notice: {marginHorizontal: spacing.md, marginBottom: spacing.sm},
  deliveryCard: {
    marginHorizontal: spacing.md,
    marginVertical: spacing.sm,
    padding: spacing.md,
    minHeight: 112,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...elevation.card,
  },
  deliveryIconBox: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    backgroundColor: colors.iconSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deliveryCopy: {flex: 1, minWidth: 0},
  deliveryLabel: {color: colors.textSecondary, fontSize: typography.small},
  deliveryAddress: {
    color: colors.espressoBrown,
    fontSize: typography.body,
    fontWeight: fontWeight.semibold,
    marginTop: 2,
  },
  estimateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.xs,
  },
  estimateText: {flex: 1, color: colors.textSecondary, fontSize: typography.small},
  unserviceableText: {color: colors.error},
  changeButton: {
    alignSelf: 'flex-start',
    paddingVertical: spacing.xs,
    paddingLeft: spacing.xs,
  },
  changeText: {
    color: colors.flameRed,
    fontSize: typography.small,
    fontWeight: fontWeight.bold,
  },
  lineCard: {
    minHeight: 128,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    ...elevation.card,
  },
  lineImage: {
    width: 92,
    height: 92,
    borderRadius: radius.md,
    backgroundColor: colors.white,
  },
  lineMediaFallback: {
    width: 92,
    height: 92,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
  },
  lineMediaInitial: {
    color: colors.flameRed,
    fontSize: typography.hero,
    fontWeight: fontWeight.extrabold,
  },
  lineBody: {
    flex: 1,
    minWidth: 0,
    alignSelf: 'stretch',
    justifyContent: 'center',
  },
  lineName: {
    color: colors.espressoBrown,
    fontSize: typography.body,
    fontWeight: fontWeight.bold,
  },
  kitchenInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 3,
  },
  lineKitchen: {
    maxWidth: '88%',
    color: colors.textSecondary,
    fontSize: typography.small,
  },
  lineMeta: {
    color: colors.textSecondary,
    fontSize: typography.tiny,
    marginTop: 5,
  },
  linePrice: {
    color: colors.espressoBrown,
    fontSize: typography.body,
    fontWeight: fontWeight.bold,
    marginTop: spacing.xs,
  },
  lineRight: {
    alignSelf: 'stretch',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 4,
  },
  quantityControl: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    backgroundColor: colors.white,
  },
  quantityButton: {
    width: 38,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quantitySymbol: {
    color: colors.flameRed,
    fontSize: 24,
    fontWeight: fontWeight.semibold,
  },
  quantityValue: {
    minWidth: 26,
    textAlign: 'center',
    color: colors.espressoBrown,
    fontSize: typography.body,
    fontWeight: fontWeight.bold,
  },
  removeButton: {
    minWidth: 42,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 5,
  },
  listFooter: {
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  offerCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    padding: spacing.md,
  },
  offerTitleRow: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm},
  offerIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.iconSurface,
  },
  offerCaption: {
    color: colors.textSecondary,
    fontSize: typography.small,
    marginTop: spacing.xs,
  },
  billCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    padding: spacing.md,
  },
  cardTitle: {
    color: colors.espressoBrown,
    fontSize: typography.heading,
    fontWeight: fontWeight.bold,
  },
  billRows: {gap: spacing.sm, marginTop: spacing.md},
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  amountLabel: {flex: 1, color: colors.textSecondary, fontSize: typography.body},
  amountLabelStrong: {color: colors.espressoBrown, fontWeight: fontWeight.bold},
  amountValue: {
    color: colors.espressoBrown,
    fontSize: typography.body,
    fontWeight: fontWeight.medium,
  },
  amountValueStrong: {
    fontSize: typography.heading,
    fontWeight: fontWeight.extrabold,
  },
  billDivider: {height: 1, backgroundColor: colors.border, marginVertical: 2},
  checkoutBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    minHeight: 96,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    ...elevation.card,
  },
  checkoutCopy: {minWidth: 110},
  checkoutTotal: {
    color: colors.espressoBrown,
    fontSize: typography.heading,
    fontWeight: fontWeight.extrabold,
  },
  checkoutLink: {
    color: colors.flameRed,
    fontSize: typography.tiny,
    fontWeight: fontWeight.semibold,
    marginTop: 3,
  },
  checkoutButton: {flex: 1},
});