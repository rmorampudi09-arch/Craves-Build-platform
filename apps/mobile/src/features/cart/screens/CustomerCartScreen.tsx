import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
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
  CustomerDishDetailStackParamList,
  CustomerTabParamList,
} from '../../../app/navigation/types';
import {useAppDispatch, useAppSelector} from '../../../app/store/hooks';
import {
  colors,
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
import {CustomerLocationSelector} from '../../customerShell/components/CustomerLocationSelector';
import {useCustomerHeaderState} from '../../customerShell/hooks/useCustomerHeaderState';
import {FoodTypePill} from '../../customerSubscription/components/MealPlanUi';
import {checkoutSessionCoordinator} from '../../checkout/domain/checkoutSessionCoordinator';
import type {CheckoutSession} from '../../checkout/domain/checkoutTypes';
import {paymentHandoffCoordinator} from '../../payment/domain/paymentHandoffCoordinator';
import {
  clearPersistedPaymentIfTerminal,
  recoverPersistedPaymentAttempt,
} from '../../payment/domain/persistedPaymentRecovery';
import {paymentRecoveryCoordinator} from '../../payment/domain/paymentRecoveryCoordinator';
import {razorpayGateway} from '../../payment/gateway/razorpayGateway';
import {pendingPaymentAttemptStore} from '../../payment/storage/pendingPaymentAttemptStore';
import {buildCartSnapshotRequest, cartApi} from '../api/cartApi';
import {
  CART_PREFLIGHT_AVAILABLE,
  cartPreflightApi,
  cartPreflightMatchesSnapshot,
} from '../api/cartPreflightApi';
import {
  checkCartServiceability,
  type CartDiscoveryDish,
} from '../api/cartServiceabilityApi';
import {
  cartItemsToRestore,
  isCartLineInteractionDisabled,
  recoveredCheckoutMatchesCurrentCart,
} from '../cartInteractionPolicy';
import {cartSnapshotsRequireQuoteRefresh} from '../domain/cartDeliveryQuote';
import type {CartScreenItem, CartScreenModel} from '../domain/cartScreenModel';
import {resolveCartQuantityInteraction} from '../domain/cartScreenModel';
import {
  getCartItemInitial,
  groupCartItemsByKitchen,
  type CartKitchenSectionModel,
} from '../cartUiModel';
import {
  addCartItem,
  clearCart,
  removeCartItem,
  setCartItemQuantity,
  type CartMutationOutcome,
} from '../state/cartMutations';
import {isDefinitiveCartRejection} from '../domain/cartWriteRejection';
import {CustomerChefFace} from '../../customerShell/components/CustomerChefFace';
import {useCustomerOrderKitchenPresentationQuery} from '../../customerOrders/query/customerOrderCatalogQueries';
import {refreshCartSnapshot} from '../state/cartRefresh';
import {selectCartScreenModel} from '../state/cartSelectors';
import {cartActions} from '../state/cartSlice';
import {formatCartMoney} from '../viewCartOverlayModel';

const DELIVERY_RADIUS_KM = 10;
type ServiceabilityState =
  | 'IDLE'
  | 'CHECKING'
  | 'SERVICEABLE'
  | 'UNSERVICEABLE'
  | 'ERROR';

type CartNavigation = NavigationProp<
  CustomerCartStackParamList & CustomerDishDetailStackParamList
>;

function spiceLabel(
  value: CartDiscoveryDish['spiceLevel'] | CartScreenItem['spiceLevel'],
): string | null {
  if (value === 'MILD') return 'Mild';
  if (value === 'MEDIUM') return 'Medium';
  if (value === 'SPICY') return 'Spicy';
  return null;
}

function kitchenInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return (words.slice(0, 2).map(word => word[0]).join('') || '?').toUpperCase();
}

/** Saved labels can arrive as "HOME"; show "Home" but leave mixed-case names alone. */
function addressLabel(label: string | null | undefined): string | null {
  if (!label) return null;
  return label === label.toUpperCase() ? label.charAt(0) + label.slice(1).toLowerCase() : label;
}

function isZeroMoney(money: CheckoutSession['platformFee']): boolean {
  return Number(money.amount) === 0;
}

function CartLineRow({
  item,
  discovery,
  pending,
  onDecrease,
  onIncrease,
}: {
  item: CartScreenItem;
  discovery?: CartDiscoveryDish;
  pending: boolean;
  onDecrease: (item: CartScreenItem) => void;
  onIncrease: (item: CartScreenItem) => void;
}) {
  const imageUrl = discovery?.imageUrl ?? item.imageUrl;
  const serves = discovery?.servesCount ?? item.servesCount;
  const spice = spiceLabel(discovery?.spiceLevel ?? item.spiceLevel);
  const metadata = [spice, serves ? `Serves ${serves}` : null].filter(Boolean).join(' · ');

  return (
    <View style={styles.lineRow}>
      {imageUrl ? (
        <Image source={{uri: imageUrl}} resizeMode="cover" style={styles.lineImage} />
      ) : (
        <View style={styles.lineMediaFallback}>
          <Text style={styles.lineMediaInitial}>{getCartItemInitial(item.itemName)}</Text>
        </View>
      )}

      <View style={styles.lineBody}>
        <Text numberOfLines={2} style={styles.lineName}>
          {item.itemName}
        </Text>
        <View style={styles.lineMetaRow}>
          <FoodTypePill foodType={discovery?.foodType ?? item.foodType} />
          {metadata ? (
            <Text numberOfLines={1} style={styles.lineMeta}>
              {metadata}
            </Text>
          ) : null}
        </View>
        <Text style={styles.linePrice}>{formatCartMoney(item.unitPrice)}</Text>
      </View>

      <View style={styles.quantityControl}>
        <Pressable
          accessibilityLabel={
            item.quantity === 1 ? `Remove ${item.itemName}` : `Decrease ${item.itemName} quantity`
          }
          accessibilityRole="button"
          accessibilityState={{disabled: pending}}
          disabled={pending}
          onPress={() => onDecrease(item)}
          style={({pressed}) => [
            styles.quantityButton,
            pressed && !pending && styles.quantityButtonPressed,
            pending && styles.controlDisabled,
          ]}>
          <Text style={styles.quantitySymbol}>−</Text>
        </Pressable>
        <Text accessibilityLiveRegion="polite" style={styles.quantityValue}>
          {item.quantity}
        </Text>
        <Pressable
          accessibilityLabel={`Increase ${item.itemName} quantity`}
          accessibilityRole="button"
          accessibilityState={{disabled: pending}}
          disabled={pending}
          onPress={() => onIncrease(item)}
          style={({pressed}) => [
            styles.quantityButton,
            pressed && !pending && styles.quantityButtonPressed,
            pending && styles.controlDisabled,
          ]}>
          <Text style={styles.quantitySymbol}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

function KitchenHeader({
  section,
  onOpen,
}: {
  section: CartKitchenSectionModel;
  onOpen: () => void;
}) {
  const count = section.data.reduce((total, item) => total + item.quantity, 0);
  const kitchen = useCustomerOrderKitchenPresentationQuery(section.kitchenId);
  return (
    <Pressable
      accessibilityLabel={`Open ${section.kitchenName}`}
      accessibilityRole="button"
      onPress={onOpen}
      style={styles.kitchenHeader}>
      <View style={styles.kitchenAvatar}>
        <CustomerChefFace
          url={kitchen.data?.chefPhotoUrl}
          fallback={<Text style={styles.kitchenInitials}>{kitchenInitials(section.kitchenName)}</Text>}
        />
      </View>
      <View style={styles.kitchenCopy}>
        <Text numberOfLines={1} style={styles.kitchenName}>
          {section.kitchenName}
        </Text>
        <Text style={styles.kitchenCount}>
          {count} {count === 1 ? 'item' : 'items'}
        </Text>
      </View>
      <Icon name="chevron-right" size={22} color={colors.textSecondary} surface={false} />
    </Pressable>
  );
}

function KitchenFooter({onAddMore}: {onAddMore: () => void}) {
  return (
    <Pressable accessibilityRole="button" onPress={onAddMore} style={styles.kitchenFooter}>
      <Icon name="plus" size={18} color={colors.flameRedAccessible} surface={false} />
      <Text style={styles.addMoreText}>Add more from this kitchen</Text>
    </Pressable>
  );
}

function DeliveryCard({
  label,
  address,
  serviceability,
  estimatedMinutes,
  onChange,
}: {
  label: string | null;
  address: string | null;
  serviceability: ServiceabilityState;
  estimatedMinutes: number | null;
  onChange: () => void;
}) {
  const estimate =
    serviceability === 'CHECKING'
      ? 'Checking delivery…'
      : serviceability === 'UNSERVICEABLE'
        ? `Outside our ${DELIVERY_RADIUS_KM} km delivery area`
        : serviceability === 'ERROR'
          ? 'Delivery could not be checked'
          : serviceability === 'SERVICEABLE'
            ? estimatedMinutes
              ? `Arrives in about ${estimatedMinutes} min`
              : `Delivers within ${DELIVERY_RADIUS_KM} km`
            : 'Choose an address to check delivery';

  return (
    <View style={styles.card}>
      <View style={styles.deliveryRow}>
        <View style={styles.iconTile}>
          <Icon name="location" size={20} color={colors.flameRedAccessible} surface={false} />
        </View>
        <View style={styles.deliveryCopy}>
          <Text style={styles.deliveryLabel}>{label ? `Deliver to ${label}` : 'Deliver to'}</Text>
          <Text numberOfLines={2} style={styles.deliveryAddress}>
            {address ?? 'No delivery address selected'}
          </Text>
        </View>
        <Pressable accessibilityRole="button" onPress={onChange} style={styles.changeButton}>
          <Text style={styles.changeText}>Change</Text>
        </Pressable>
      </View>
      <View style={styles.estimateRow}>
        <Icon
          name="clock"
          size={16}
          color={serviceability === 'UNSERVICEABLE' ? colors.error : colors.success}
          surface={false}
        />
        <Text
          style={[
            styles.estimateText,
            serviceability === 'UNSERVICEABLE' && styles.unserviceableText,
          ]}>
          {estimate}
        </Text>
      </View>
    </View>
  );
}

function OrderSummary({items, onEdit}: {items: CartScreenItem[]; onEdit: () => void}) {
  return (
    <View style={[styles.card, styles.orderCard]}>
      <View style={styles.orderHead}>
        <Text style={styles.cardTitle}>Your order</Text>
        <Pressable accessibilityLabel="Edit your order" accessibilityRole="button" onPress={onEdit}>
          <Text style={styles.changeText}>Edit</Text>
        </Pressable>
      </View>
      {items.map((item, index) => (
        <View key={item.lineId} style={[styles.orderRow, index > 0 && styles.rowDivider]}>
          <View style={styles.orderQuantity}>
            <Text style={styles.orderQuantityText}>{item.quantity}×</Text>
          </View>
          <Text numberOfLines={1} style={styles.orderName}>
            {item.itemName}
          </Text>
          <Text style={styles.orderPrice}>{formatCartMoney(item.lineTotal)}</Text>
        </View>
      ))}
    </View>
  );
}

function BillRow({label, value, free = false}: {label: string; value: string; free?: boolean}) {
  return (
    <View style={styles.billRow}>
      <Text style={styles.billLabel}>{label}</Text>
      <Text style={[styles.billValue, free && styles.billFree]}>{value}</Text>
    </View>
  );
}

function CheckoutBill({checkout}: {checkout: CheckoutSession}) {
  return (
    <View style={[styles.card, styles.billCard]}>
      <BillRow label="Item total" value={formatCartMoney(checkout.foodSubtotal)} />
      <BillRow label="Delivery fee" value={formatCartMoney(checkout.deliveryFee)} />
      <BillRow
        label="Platform fee"
        value={isZeroMoney(checkout.platformFee) ? 'Free' : formatCartMoney(checkout.platformFee)}
        free={isZeroMoney(checkout.platformFee)}
      />
      <BillRow label="Taxes & GST" value={formatCartMoney(checkout.taxAmount)} />
      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>To pay</Text>
        <Text style={styles.totalValue}>{formatCartMoney(checkout.grandTotal)}</Text>
      </View>
    </View>
  );
}

function PaymentNotice({
  message,
  onCheckStatus,
}: {
  message: string;
  onCheckStatus?: () => void;
}) {
  return (
    <View accessibilityRole="alert" style={styles.paymentNotice}>
      <Icon name="alert" size={20} color={colors.warningText} surface={false} />
      <View style={styles.paymentNoticeCopy}>
        <Text style={styles.paymentNoticeText}>{message}</Text>
        {onCheckStatus ? (
          <Pressable accessibilityRole="button" onPress={onCheckStatus}>
            <Text style={styles.paymentNoticeAction}>Check payment status</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export function CustomerCartScreen() {
  const navigation = useNavigation<CartNavigation>();
  const dispatch = useAppDispatch();
  const insets = useSafeAreaInsets();
  const model = useAppSelector(selectCartScreenModel);
  const snapshotStatus = useAppSelector(state => state.cart.snapshotStatus);
  const snapshotErrorCode = useAppSelector(state => state.cart.snapshotErrorCode);
  const mutations = useAppSelector(state => state.cart.mutations);
  const cartSnapshot = useAppSelector(state => state.cart.snapshot);
  const cartClientRevision = useAppSelector(state => state.cart.clientRevision);
  const authPhone = useAppSelector(state => state.auth.identity?.phoneNumber ?? null);
  const header = useCustomerHeaderState();
  const bottomNavScroll = useCustomerBottomNavScroll();
  const [locationSelectorVisible, setLocationSelectorVisible] = useState(false);
  const [interactionError, setInteractionError] = useState<string | null>(null);
  const [paymentNotice, setPaymentNotice] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [serviceability, setServiceability] = useState<ServiceabilityState>('IDLE');
  const [estimatedMinutes, setEstimatedMinutes] = useState<number | null>(null);
  const [discoveryByMenuItem, setDiscoveryByMenuItem] = useState<
    Record<string, CartDiscoveryDish>
  >({});
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [clearBusy, setClearBusy] = useState(false);
  const [paymentRecoveryActive, setPaymentRecoveryActive] = useState(false);
  const [checkoutReview, setCheckoutReview] = useState<CheckoutSession | null>(null);
  const [reviewCartModel, setReviewCartModel] = useState<CartScreenModel | null>(null);
  const activeCheckoutRef = useRef<CheckoutSession | null>(null);
  const checkoutInFlightRef = useRef(false);
  const persistedRecoveryRef = useRef<
    ReturnType<typeof recoverPersistedPaymentAttempt> | null
  >(null);
  const skipNextAutomaticPaymentRecoveryRef = useRef(false);

  const staleRecoveredCheckout = Boolean(
    paymentRecoveryActive &&
      checkoutReview &&
      !recoveredCheckoutMatchesCurrentCart(checkoutReview, cartSnapshot),
  );
  const visibleCheckoutReview = staleRecoveredCheckout ? null : checkoutReview;
  const visibleModel = visibleCheckoutReview && reviewCartModel ? reviewCartModel : model;
  const sections = useMemo(
    () => groupCartItemsByKitchen(visibleModel?.items ?? []),
    [visibleModel?.items],
  );
  const itemCount = useMemo(
    () => visibleModel?.items.reduce((total, item) => total + item.quantity, 0) ?? 0,
    [visibleModel?.items],
  );

  const refreshCart = useCallback(async () => {
    setRefreshError(null);
    const outcome = await dispatch(refreshCartSnapshot());
    if (outcome.status === 'FAILED') setRefreshError(outcome.error.message);
  }, [dispatch]);

  const openOrderConfirmation = useCallback(
    (checkout: CheckoutSession) => {
      const tabs = navigation.getParent<BottomTabNavigationProp<CustomerTabParamList>>();
      if (!tabs) return false;

      if (checkout.orders.length === 1) {
        tabs.navigate('Orders', {
          screen: 'CustomerOrderDetail',
          params: {orderId: checkout.orders[0].orderId},
        });
      } else {
        tabs.navigate('Orders', {screen: 'CustomerOrdersRoot'});
      }
      return true;
    },
    [navigation],
  );

  const reconcileInterruptedPayment = useCallback(
    (showSuccessAlert: boolean) => {
      if (persistedRecoveryRef.current) return persistedRecoveryRef.current;

      const task = (async () => {
        try {
          const recovery = await recoverPersistedPaymentAttempt();
          if (!recovery) {
            setPaymentRecoveryActive(false);
            if (!activeCheckoutRef.current) {
              setCheckoutReview(null);
              setReviewCartModel(null);
              setPaymentNotice(null);
            }
            return null;
          }

          const active =
            recovery.outcome === 'PENDING' || recovery.outcome === 'RECONCILING';
          setPaymentRecoveryActive(active);
          setCheckoutReview(active ? recovery.checkout : null);
          activeCheckoutRef.current =
            recovery.outcome === 'PENDING' ? recovery.checkout : null;
          if (!active) setReviewCartModel(null);

          if (recovery.outcome === 'SUCCEEDED') {
            setPaymentNotice(null);
            setCheckoutReview(null);
            await refreshCart();
            const opened = openOrderConfirmation(recovery.checkout);
            if (showSuccessAlert && !opened) {
              Alert.alert(
                'Payment successful',
                'Your interrupted payment was verified by Craves.',
              );
            }
          } else if (recovery.outcome === 'RECONCILING') {
            setPaymentNotice(
              'A previous payment is still being confirmed by Craves. Check its status before paying again.',
            );
          } else if (recovery.outcome === 'PENDING') {
            setPaymentNotice(
              'Your last payment was not completed.',
            );
          } else {
            setCheckoutReview(null);
            setPaymentNotice(
              'Your previous payment did not complete. You can safely update your cart or try checkout again.',
            );
          }
          return recovery;
        } catch (error) {
          setPaymentRecoveryActive(true);
          setPaymentNotice(
            'Craves could not verify your previous payment yet. Check its status before starting another payment.',
          );
          throw error;
        }
      })();

      persistedRecoveryRef.current = task;
      void task
        .finally(() => {
          if (persistedRecoveryRef.current === task) persistedRecoveryRef.current = null;
        })
        .catch(() => undefined);
      return task;
    },
    [openOrderConfirmation, refreshCart],
  );

  const handlePaymentStatusCheck = useCallback(async () => {
    setInteractionError(null);
    try {
      await reconcileInterruptedPayment(false);
    } catch {
      // The recovery function owns the user-facing payment status message.
    }
  }, [reconcileInterruptedPayment]);

  useEffect(() => {
    if (snapshotStatus === 'UNINITIALIZED') refreshCart();
  }, [refreshCart, snapshotStatus]);

  useEffect(() => {
    if (!checkoutBusy) {
      if (skipNextAutomaticPaymentRecoveryRef.current) {
        skipNextAutomaticPaymentRecoveryRef.current = false;
      } else {
        void reconcileInterruptedPayment(true).catch(() => undefined);
      }
    }
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active' && !checkoutBusy) {
        void reconcileInterruptedPayment(true).catch(() => undefined);
      }
    });
    return () => subscription.remove();
  }, [checkoutBusy, reconcileInterruptedPayment]);

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

  const requestClearCart = useCallback(() => {
    if (!cartSnapshot || cartSnapshot.lines.length === 0 || clearBusy || checkoutBusy || paymentRecoveryActive) return;
    const expectedSnapshot = cartSnapshot;
    Alert.alert(
      'Clear your cart?',
      'This removes only the cart you are reviewing now. If it changed elsewhere, Craves will stop instead of deleting newer items.',
      [
        {text: 'Keep cart', style: 'cancel'},
        {
          text: 'Clear cart',
          style: 'destructive',
          onPress: () => {
            setInteractionError(null);
            setClearBusy(true);
            void dispatch(clearCart({expectedSnapshot}))
              .then(outcome => {
                if (outcome.status !== 'FAILED') return;
                setInteractionError(
                  isDefinitiveCartRejection(outcome.error)
                    ? outcome.error.message
                    : 'We couldn’t confirm that your cart was cleared. Refresh the cart before trying again.',
                );
              })
              .finally(() => setClearBusy(false));
          },
        },
      ],
    );
  }, [cartSnapshot, checkoutBusy, clearBusy, dispatch, paymentRecoveryActive]);

  /** pay=false prepares the final bill (Proceed); pay=true opens Razorpay for the bill on screen. */
  const handleCheckout = useCallback(async (pay: boolean) => {
    const addressId = header.selectedLocation?.addressId;
    if ((!pay && !model) || !addressId || checkoutInFlightRef.current) return;
    checkoutInFlightRef.current = true;
    setInteractionError(null);
    setCheckoutBusy(true);
    try {
      const interrupted = await reconcileInterruptedPayment(false);
      if (interrupted?.outcome === 'SUCCEEDED') return;
      if (interrupted?.outcome === 'RECONCILING') {
        setPaymentNotice(
          'Your previous payment is still being confirmed. Check payment status before paying again.',
        );
        return;
      }

      let recoveredPendingCheckout: CheckoutSession | null = null;
      if (interrupted?.outcome === 'PENDING') {
        const recoveredCheckoutStillMatches =
          recoveredCheckoutMatchesCurrentCart(interrupted.checkout, cartSnapshot) &&
          interrupted.checkout.deliveryAddressId === addressId;

        if (recoveredCheckoutStillMatches) {
          recoveredPendingCheckout = interrupted.checkout;
        } else {
          await pendingPaymentAttemptStore.clear().catch(() => undefined);
          activeCheckoutRef.current = null;
          setCheckoutReview(null);
          setPaymentRecoveryActive(false);
          setPaymentNotice(
            'Your earlier unpaid payment was for a different cart or address, so this is a fresh bill.',
          );
        }
      }

      let checkout = recoveredPendingCheckout ?? activeCheckoutRef.current;
      if (
        checkout?.status === 'PAYMENT_PENDING' &&
        checkout.deliveryAddressId !== addressId
      ) {
        checkout = null;
        activeCheckoutRef.current = null;
        setCheckoutReview(null);
        setPaymentRecoveryActive(false);
        setPaymentNotice(
          'Delivery address changed, so Craves will prepare a fresh bill before payment.',
        );
      }

      const serviceable =
        checkout?.status === 'PAYMENT_PENDING' &&
        checkout.deliveryAddressId === addressId
          ? true
          : await verifyServiceability();
      if (!serviceable) {
        setInteractionError(
          `This address is outside the ${DELIVERY_RADIUS_KM} km delivery area for one or more kitchens. Choose another address.`,
        );
        return;
      }

      let preparedForReview = false;
      if (!checkout || checkout.status !== 'PAYMENT_PENDING') {
        if (!cartSnapshot) {
          setInteractionError('Refresh your cart before starting checkout.');
          return;
        }

        if (CART_PREFLIGHT_AVAILABLE) {
          const preflight = await cartPreflightApi.inspect();
          if (!cartPreflightMatchesSnapshot(preflight, cartSnapshot)) {
            await refreshCart();
            setInteractionError(
              'Your cart changed while you were reviewing it. Check the refreshed cart before checkout.',
            );
            return;
          }

          if (!preflight.readyForCurrentCheckoutValidation) {
            setInteractionError(
              'One or more cart items cannot be checked out right now. Review your cart before continuing.',
            );
            return;
          }
        }

        // Always refresh server-owned catalog pricing immediately before
        // checkout. If it changed, stop before creating a checkout/payment.
        const validatedCart = await cartApi.validate();
        const cartChanged = cartSnapshotsRequireQuoteRefresh(
          cartSnapshot,
          validatedCart,
        );
        dispatch(cartActions.snapshotAccepted(validatedCart));

        if (cartChanged) {
          setCheckoutReview(null);
          activeCheckoutRef.current = null;
          setInteractionError(
            'A price or cart detail changed. We refreshed the latest total—review it before continuing to payment.',
          );
          return;
        }

        checkout = await checkoutSessionCoordinator.create({
          cartId: validatedCart.cartId,
          cartClientRevision: cartClientRevision + 1,
          deliveryAddressId: addressId,
          expectedCart: buildCartSnapshotRequest(validatedCart),
        });
        activeCheckoutRef.current = checkout;
        setReviewCartModel(model);
        preparedForReview = true;
      }

      setCheckoutReview(checkout);
      // Razorpay only ever opens for a bill the customer has already seen on Checkout.
      if (!pay || preparedForReview) return;

      const handoff = await paymentHandoffCoordinator.prepare(checkout);
      await pendingPaymentAttemptStore.save(handoff);
      setPaymentRecoveryActive(true);

      try {
        const proof = await razorpayGateway.open(handoff, {phone: authPhone});
        const recovery = await paymentRecoveryCoordinator.recover(handoff, {
          kind: 'RAZORPAY_SUCCESS',
          proof,
        });
        await clearPersistedPaymentIfTerminal(recovery);
        activeCheckoutRef.current =
          recovery.outcome === 'PENDING' ? recovery.checkout : null;
        const recoveryActive =
          recovery.outcome === 'PENDING' || recovery.outcome === 'RECONCILING';
        setPaymentRecoveryActive(recoveryActive);

        if (recovery.outcome === 'SUCCEEDED') {
          setPaymentNotice(null);
          setCheckoutReview(null);
          await refreshCart();
          if (!openOrderConfirmation(recovery.checkout)) {
            Alert.alert('Payment successful', 'Your payment was verified by Craves.');
          }
          return;
        }
        if (recovery.outcome === 'RECONCILING') {
          setPaymentNotice(
            'Your payment is being confirmed by Craves. Do not pay again. Check its status shortly.',
          );
          return;
        }
        if (recovery.outcome === 'PENDING') {
          setPaymentNotice(
            'Payment is still pending. Continue payment later to reuse this payment instead of creating a duplicate.',
          );
          return;
        }
        setPaymentNotice(null);
        setCheckoutReview(null);
        setInteractionError('Payment did not complete. You can safely try checkout again.');
      } catch (paymentError) {
        const recovery = await paymentRecoveryCoordinator
          .recover(handoff, {kind: 'PROVIDER_ERROR'})
          .catch(() => null);

        if (recovery) {
          await clearPersistedPaymentIfTerminal(recovery);
          activeCheckoutRef.current =
            recovery.outcome === 'PENDING' ? recovery.checkout : null;
          const recoveryActive =
            recovery.outcome === 'PENDING' || recovery.outcome === 'RECONCILING';
          setPaymentRecoveryActive(recoveryActive);
          if (recovery.outcome === 'SUCCEEDED') {
            setPaymentNotice(null);
            setCheckoutReview(null);
            await refreshCart();
            if (!openOrderConfirmation(recovery.checkout)) {
              Alert.alert('Payment successful', 'Your payment was verified by Craves.');
            }
            return;
          }
          if (
            recovery.verification.status === 'PAID' ||
            recovery.outcome === 'RECONCILING'
          ) {
            setPaymentNotice(
              'Craves has received the payment signal and is confirming your order. Check payment status before paying again.',
            );
            return;
          }
          if (recovery.outcome === 'PENDING') {
            setPaymentNotice(
              'Payment not completed. Tap Continue to Payment to try again.',
            );
            return;
          }
          setPaymentNotice(null);
          setCheckoutReview(null);
        } else {
          setPaymentRecoveryActive(true);
          setPaymentNotice(
            'The payment provider closed, but Craves could not verify the payment state. Check payment status before paying again.',
          );
          return;
        }
        throw paymentError;
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Checkout could not be started.';
      setInteractionError(message);
    } finally {
      checkoutInFlightRef.current = false;
      setCheckoutBusy(false);
    }
  }, [
    authPhone,
    cartClientRevision,
    cartSnapshot,
    dispatch,
    header.selectedLocation,
    model,
    openOrderConfirmation,
    reconcileInterruptedPayment,
    refreshCart,
    verifyServiceability,
  ]);

  const onCheckoutPage = Boolean(visibleCheckoutReview);

  /** Back from Checkout: drop the bill and put the dishes back (creating it emptied the server cart). */
  const leaveCheckout = useCallback(async (): Promise<boolean> => {
    if (checkoutInFlightRef.current) return false;
    if (paymentRecoveryActive) {
      // Drop a started payment only while the server still reports it unpaid.
      const recovery = await reconcileInterruptedPayment(false).catch(() => undefined);
      if (recovery === undefined || recovery?.outcome === 'RECONCILING' || recovery?.outcome === 'SUCCEEDED') {
        return false;
      }
      await pendingPaymentAttemptStore.clear().catch(() => undefined);
      setPaymentRecoveryActive(false);
    }
    const checkoutItems = reviewCartModel?.items ?? [];
    activeCheckoutRef.current = null;
    setCheckoutReview(null);
    setReviewCartModel(null);
    setPaymentNotice(null);
    setInteractionError(null);
    if (checkoutItems.length === 0) return true;

    const refreshed = await dispatch(refreshCartSnapshot());
    const current = refreshed.status === 'APPLIED' ? refreshed.snapshot : cartSnapshot;
    let failed = false;
    for (const item of cartItemsToRestore(checkoutItems, current)) {
      const outcome = await dispatch(addCartItem(item));
      if (outcome.status === 'FAILED') failed = true;
    }
    if (failed) {
      setInteractionError('Some dishes could not be put back in your cart. Add them again from the kitchen.');
    }
    return true;
  }, [cartSnapshot, dispatch, paymentRecoveryActive, reconcileInterruptedPayment, reviewCartModel]);

  // Hardware back and the header arrow return from Checkout to the cart instead of leaving.
  useEffect(
    () =>
      navigation.addListener('beforeRemove', event => {
        if (!onCheckoutPage) return;
        event.preventDefault();
        void leaveCheckout();
      }),
    [leaveCheckout, navigation, onCheckoutPage],
  );

  const openKitchen = useCallback(
    (kitchenId: string) => navigation.navigate('CustomerKitchenProfile', {kitchenId}),
    [navigation],
  );

  const visibleRefreshError =
    refreshError ??
    (snapshotStatus === 'ERROR'
      ? snapshotErrorCode === 'NETWORK_ERROR'
        ? 'You appear to be offline. Your last valid cart is still shown when available.'
        : 'The cart could not be refreshed. Your last valid cart is still shown when available.'
      : null);

  const deliveryCard = (onChange: () => void) => (
    <DeliveryCard
      label={addressLabel(header.selectedLocation?.label)}
      address={header.selectedLocation?.displayName ?? null}
      serviceability={serviceability}
      estimatedMinutes={estimatedMinutes}
      onChange={onChange}
    />
  );

  const notices = (
    <>
      {visibleRefreshError && !onCheckoutPage ? (
        <RecoverableErrorBanner message={visibleRefreshError} onRetry={refreshCart} />
      ) : null}
      {paymentNotice ? (
        <PaymentNotice
          message={paymentNotice}
          onCheckStatus={paymentRecoveryActive ? handlePaymentStatusCheck : undefined}
        />
      ) : null}
      {interactionError ? <RecoverableErrorBanner message={interactionError} /> : null}
    </>
  );

  const renderItem = ({item}: {item: CartScreenItem}) => (
    <CartLineRow
      item={item}
      discovery={discoveryByMenuItem[item.menuItemId]}
      pending={isCartLineInteractionDisabled({
        checkoutBusy,
        lineMutationPending: mutations[`line:${item.lineId}`]?.status === 'PENDING',
        paymentRecoveryActive,
      })}
      onDecrease={line => updateQuantity(line, line.quantity - 1)}
      onIncrease={line => updateQuantity(line, line.quantity + 1)}
    />
  );

  const cartPage = (() => {
    if (!model && (snapshotStatus === 'UNINITIALIZED' || snapshotStatus === 'LOADING')) {
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
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={<View style={styles.noticeStack}>{notices}</View>}
        renderSectionHeader={({section}) => (
          <KitchenHeader section={section} onOpen={() => openKitchen(section.kitchenId)} />
        )}
        renderItem={renderItem}
        renderSectionFooter={({section}) => (
          <KitchenFooter onAddMore={() => openKitchen(section.kitchenId)} />
        )}
        ListFooterComponent={
          model.items.length > 0
            ? deliveryCard(() => {
                if (checkoutInFlightRef.current) return;
                setLocationSelectorVisible(true);
              })
            : null
        }
        ListFooterComponentStyle={styles.listFooter}
        ListEmptyComponent={
          <CustomerEmptyState
            model={customerEmptyStateAdapters.emptyCart()}
            onAction={actionId => {
              if (actionId === 'BROWSE_MEALS') browseMeals();
            }}
            testID="customer-cart-empty"
          />
        }
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

  const checkoutPage = visibleCheckoutReview ? (
    <ScrollView
      contentContainerStyle={[styles.listContent, styles.checkoutContent]}
      showsVerticalScrollIndicator={false}>
      {notices}
      {deliveryCard(() => {
        void leaveCheckout().then(left => left && setLocationSelectorVisible(true));
      })}
      {reviewCartModel?.items.length ? (
        <OrderSummary items={reviewCartModel.items} onEdit={() => {
          void leaveCheckout();
        }} />
      ) : null}
      <Text style={styles.sectionLabel}>BILL DETAILS</Text>
      <CheckoutBill checkout={visibleCheckoutReview} />
      <View style={[styles.card, styles.payCard]}>
        <View style={[styles.iconTile, styles.payTile]}>
          <Icon name="shield" size={20} color={colors.successText} surface={false} />
        </View>
        <View style={styles.deliveryCopy}>
          <Text style={styles.payTitle}>Pay securely with Razorpay</Text>
          <Text style={styles.deliveryLabel}>UPI, cards, net banking and wallets</Text>
        </View>
      </View>
      <Text style={styles.finePrint}>
        The kitchen gets your order as soon as the payment is confirmed.
      </Text>
    </ScrollView>
  ) : null;

  const reviewSections = groupCartItemsByKitchen(reviewCartModel?.items ?? []);
  const subtitle = onCheckoutPage
    ? reviewSections.map(section => section.kitchenName).join(', ') || 'Review your bill'
    : `${itemCount} ${itemCount === 1 ? 'item' : 'items'} · ${sections.length} ${
        sections.length === 1 ? 'kitchen' : 'kitchens'
      }`;
  const showBar = onCheckoutPage || Boolean(model && model.items.length > 0);
  const checkoutEnabled = onCheckoutPage
    ? Boolean(header.selectedLocation?.addressId && !checkoutBusy)
    : Boolean(
        model?.items.length &&
          header.selectedLocation?.addressId &&
          serviceability === 'SERVICEABLE' &&
          !checkoutBusy &&
          !Object.values(mutations).some(entry => entry.status === 'PENDING'),
      );
  const foodSubtotal = model?.billSummary.foodSubtotal.amount;

  return (
    <ScreenShell edges={['top']} keyboardAvoiding={false} testID="customer-cart">
      <View style={styles.topBar}>
        <Pressable
          accessibilityLabel={onCheckoutPage ? 'Back to cart' : 'Go back'}
          accessibilityRole="button"
          onPress={() => {
            if (onCheckoutPage) void leaveCheckout();
            else navigation.goBack();
          }}
          style={styles.backButton}>
          <Icon name="arrow-left" size={iconSize.md} color={colors.espressoBrown} surface={false} />
        </Pressable>
        <View style={styles.titleCopy}>
          <Text style={styles.title}>{onCheckoutPage ? 'Checkout' : 'Your cart'}</Text>
          {onCheckoutPage || itemCount > 0 ? (
            <Text numberOfLines={1} style={styles.subtitle}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {!onCheckoutPage && cartSnapshot?.lines.length ? (
          <Pressable
            accessibilityLabel="Clear cart"
            accessibilityRole="button"
            accessibilityState={{disabled: clearBusy || checkoutBusy}}
            disabled={clearBusy || checkoutBusy}
            onPress={requestClearCart}
            style={styles.clearButton}>
            <Icon name="trash" size={18} color={colors.textSecondary} surface={false} />
            <Text style={styles.clearText}>{clearBusy ? 'Clearing…' : 'Clear'}</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.content}>{onCheckoutPage ? checkoutPage : cartPage}</View>

      {showBar ? (
        <View style={[styles.checkoutBar, {paddingBottom: Math.max(insets.bottom, spacing.sm)}]}>
          <View style={styles.barCopy}>
            <Text style={styles.barLabel}>{onCheckoutPage ? 'To pay' : 'Item total'}</Text>
            <Text style={styles.barTotal}>
              {onCheckoutPage && visibleCheckoutReview
                ? formatCartMoney(visibleCheckoutReview.grandTotal)
                : foodSubtotal
                  ? formatCartMoney(foodSubtotal)
                  : '—'}
            </Text>
            {onCheckoutPage ? null : <Text style={styles.barHint}>+ fees at checkout</Text>}
          </View>
          <Button
            label={
              onCheckoutPage
                ? checkoutBusy ? 'Please wait…' : 'Continue to Payment'
                : checkoutBusy ? 'Preparing bill…' : 'Proceed to Checkout'
            }
            loading={checkoutBusy}
            disabled={!checkoutEnabled}
            onPress={() => handleCheckout(onCheckoutPage)}
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

const cardBorder = {borderWidth: 1, borderColor: colors.border} as const;

const styles = StyleSheet.create({
  content: {flex: 1, backgroundColor: colors.white},
  listContent: {flexGrow: 1, paddingTop: spacing.sm, paddingBottom: 150},
  checkoutContent: {paddingHorizontal: spacing.md, gap: spacing.sm},
  loadingState: {flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm},
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    width: touchTarget.minimum,
    height: touchTarget.minimum,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.iconSurface,
  },
  titleCopy: {flex: 1, minWidth: 0},
  title: {color: colors.espressoBrown, fontSize: 21, fontWeight: fontWeight.extrabold},
  subtitle: {color: colors.textSecondary, fontSize: typography.small, marginTop: 1},
  clearButton: {
    minHeight: touchTarget.minimum,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.xs,
  },
  clearText: {color: colors.textSecondary, fontSize: typography.small, fontWeight: fontWeight.semibold},
  noticeStack: {gap: spacing.sm, paddingHorizontal: spacing.md, marginBottom: spacing.sm},
  listFooter: {paddingHorizontal: spacing.md, paddingTop: spacing.sm},
  card: {...cardBorder, backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.md},
  kitchenHeader: {
    ...cardBorder,
    marginHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    paddingBottom: spacing.sm,
    backgroundColor: colors.white,
    borderBottomWidth: 0,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
  },
  kitchenAvatar: {
    width: 42,
    height: 42,
    borderRadius: radius.pill,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cream,
  },
  kitchenInitials: {color: colors.flameRed, fontSize: 15, fontWeight: fontWeight.extrabold},
  kitchenCopy: {flex: 1, minWidth: 0},
  kitchenName: {color: colors.espressoBrown, fontSize: typography.body, fontWeight: fontWeight.bold},
  kitchenCount: {color: colors.textSecondary, fontSize: typography.small},
  kitchenFooter: {
    ...cardBorder,
    marginHorizontal: spacing.md,
    minHeight: touchTarget.minimum,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.white,
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
    marginBottom: spacing.sm,
  },
  addMoreText: {color: colors.flameRedAccessible, fontSize: typography.small, fontWeight: fontWeight.bold},
  lineRow: {
    marginHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.white,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderTopWidth: 1,
    borderColor: colors.border,
  },
  lineImage: {width: 68, height: 68, borderRadius: radius.md, backgroundColor: colors.muted},
  lineMediaFallback: {
    width: 68,
    height: 68,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cream,
  },
  lineMediaInitial: {color: colors.flameRed, fontSize: typography.heading, fontWeight: fontWeight.extrabold},
  lineBody: {flex: 1, minWidth: 0},
  lineName: {color: colors.espressoBrown, fontSize: typography.body, fontWeight: fontWeight.semibold},
  lineMetaRow: {flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 4},
  lineMeta: {color: colors.textSecondary, fontSize: typography.tiny},
  linePrice: {color: colors.espressoBrown, fontSize: typography.body, fontWeight: fontWeight.bold, marginTop: 4},
  quantityControl: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.4,
    borderColor: colors.flameRed,
    borderRadius: radius.sm,
    backgroundColor: colors.white,
  },
  quantityButton: {width: 36, height: touchTarget.minimum, alignItems: 'center', justifyContent: 'center'},
  quantityButtonPressed: {backgroundColor: colors.surfaceMuted},
  quantitySymbol: {color: colors.flameRedAccessible, fontSize: 20, fontWeight: fontWeight.semibold},
  quantityValue: {
    minWidth: 18,
    textAlign: 'center',
    color: colors.espressoBrown,
    fontSize: typography.body,
    fontWeight: fontWeight.bold,
  },
  controlDisabled: {opacity: 0.45},
  deliveryRow: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm},
  iconTile: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cream,
  },
  deliveryCopy: {flex: 1, minWidth: 0},
  deliveryLabel: {color: colors.textSecondary, fontSize: typography.small},
  deliveryAddress: {color: colors.espressoBrown, fontSize: typography.body, fontWeight: fontWeight.bold},
  changeButton: {minHeight: touchTarget.minimum, justifyContent: 'center', paddingLeft: spacing.xs},
  changeText: {color: colors.flameRedAccessible, fontSize: typography.small, fontWeight: fontWeight.bold},
  estimateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    borderStyle: 'dashed',
  },
  estimateText: {flex: 1, color: colors.textSecondary, fontSize: typography.small},
  unserviceableText: {color: colors.error},
  orderCard: {paddingVertical: spacing.xs},
  orderHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: touchTarget.minimum,
  },
  cardTitle: {color: colors.espressoBrown, fontSize: typography.body, fontWeight: fontWeight.bold},
  orderRow: {flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.xs},
  rowDivider: {borderTopWidth: 1, borderTopColor: colors.border},
  orderQuantity: {
    minWidth: 30,
    height: 24,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.muted,
  },
  orderQuantityText: {color: colors.espressoBrown, fontSize: typography.tiny, fontWeight: fontWeight.bold},
  orderName: {flex: 1, color: colors.espressoBrown, fontSize: typography.small},
  orderPrice: {color: colors.espressoBrown, fontSize: typography.small, fontWeight: fontWeight.semibold},
  sectionLabel: {
    color: colors.textSecondary,
    fontSize: typography.tiny,
    fontWeight: fontWeight.bold,
    letterSpacing: 0.6,
    marginTop: spacing.xs,
    marginLeft: 2,
  },
  billCard: {paddingVertical: spacing.sm},
  billRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6},
  billLabel: {color: colors.textSecondary, fontSize: typography.body},
  billValue: {color: colors.espressoBrown, fontSize: typography.body},
  billFree: {color: colors.successText, fontWeight: fontWeight.bold},
  totalRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  totalLabel: {color: colors.espressoBrown, fontSize: typography.heading, fontWeight: fontWeight.extrabold},
  totalValue: {color: colors.espressoBrown, fontSize: 22, fontWeight: fontWeight.extrabold},
  payCard: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm},
  payTile: {backgroundColor: colors.successSoft},
  payTitle: {color: colors.espressoBrown, fontSize: typography.body, fontWeight: fontWeight.bold},
  finePrint: {
    color: colors.textSecondary,
    fontSize: typography.tiny,
    textAlign: 'center',
    paddingHorizontal: spacing.sm,
  },
  paymentNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#F3D9A6',
    backgroundColor: colors.warningSoft,
  },
  paymentNoticeCopy: {flex: 1, gap: 4},
  paymentNoticeText: {color: colors.espressoBrown, fontSize: typography.small},
  paymentNoticeAction: {color: colors.warningText, fontSize: typography.small, fontWeight: fontWeight.bold},
  checkoutBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    shadowColor: colors.espressoBrown,
    shadowOpacity: 0.06,
    shadowRadius: 18,
    shadowOffset: {width: 0, height: -8},
    elevation: 8,
  },
  barCopy: {minWidth: 96},
  barLabel: {color: colors.textSecondary, fontSize: typography.tiny},
  barTotal: {color: colors.espressoBrown, fontSize: 21, fontWeight: fontWeight.extrabold},
  barHint: {color: colors.textSecondary, fontSize: typography.tiny},
  checkoutButton: {flex: 1},
});
