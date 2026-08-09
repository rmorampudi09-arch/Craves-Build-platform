import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
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
import {RecoverableErrorBanner, TerminalState} from '../../../shared/components/LifecycleStates';
import {ScreenShell} from '../../../shared/components/ScreenShell';
import {CustomerEmptyState} from '../../customerEmptyStates/components/CustomerEmptyState';
import {customerEmptyStateAdapters} from '../../customerEmptyStates/customerEmptyStateAdapters';
import {CustomerHeader} from '../../customerShell/components/CustomerHeader';
import {CustomerLocationSelector} from '../../customerShell/components/CustomerLocationSelector';
import {useCustomerHeaderState} from '../../customerShell/hooks/useCustomerHeaderState';
import type {
  CartScreenAmountField,
  CartScreenItem,
  CartScreenModel,
} from '../domain/cartScreenModel';
import {resolveCartQuantityInteraction} from '../domain/cartScreenModel';
import {
  getCartAddressStatusCopy,
  getCartCheckoutStatusCopy,
  getCartEtaStatusCopy,
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

const CART_FOOTER_CLEARANCE = touchTarget.comfortable + spacing.xxxl + spacing.xl;

function formatAmountField(field: CartScreenAmountField): string {
  return field.amount ? formatCartMoney(field.amount) : 'Not available';
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
      <Text
        accessibilityLabel={`${label}: ${formatAmountField(field)}`}
        style={[styles.amountValue, emphasized && styles.amountValueStrong]}>
        {formatAmountField(field)}
      </Text>
    </View>
  );
}

function CartLineCard({
  item,
  pending,
  onDecrease,
  onIncrease,
  onRemove,
}: {
  item: CartScreenItem;
  pending: boolean;
  onDecrease: (item: CartScreenItem) => void;
  onIncrease: (item: CartScreenItem) => void;
  onRemove: (item: CartScreenItem) => void;
}) {
  return (
    <View style={styles.lineCard}>
      <View style={styles.lineMediaFallback}>
        <Text accessibilityElementsHidden style={styles.lineMediaInitial}>
          {getCartItemInitial(item.itemName)}
        </Text>
      </View>

      <View style={styles.lineBody}>
        <View style={styles.lineHeadingRow}>
          <View style={styles.lineHeadingCopy}>
            <Text numberOfLines={2} style={styles.lineName}>
              {item.itemName}
            </Text>
            <Text style={styles.lineUnitPrice}>
              {formatCartMoney(item.unitPrice)} each
            </Text>
          </View>
          <Text style={styles.lineTotal}>{formatCartMoney(item.lineTotal)}</Text>
        </View>

        <View style={styles.lineActions}>
          <View
            accessibilityLabel={`${item.itemName} quantity ${item.quantity}`}
            style={styles.quantityControl}>
            <Pressable
              accessibilityLabel={`Decrease ${item.itemName} quantity`}
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

          <Pressable
            accessibilityLabel={`Remove ${item.itemName} from cart`}
            accessibilityRole="button"
            accessibilityState={{disabled: pending}}
            disabled={pending}
            onPress={() => onRemove(item)}
            style={({pressed}) => [
              styles.removeButton,
              pressed && !pending && styles.removeButtonPressed,
              pending && styles.controlDisabled,
            ]}>
            <Text style={styles.removeText}>Remove</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function DependencyCard({
  title,
  message,
  icon,
}: {
  title: string;
  message: string;
  icon: 'location' | 'check';
}) {
  return (
    <View style={styles.dependencyCard}>
      <View style={styles.dependencyIcon}>
        <Icon name={icon} size={iconSize.sm} color={colors.flameRed} />
      </View>
      <View style={styles.dependencyCopy}>
        <Text style={styles.dependencyTitle}>{title}</Text>
        <Text style={styles.dependencyMessage}>{message}</Text>
      </View>
    </View>
  );
}

function BillSummary({model}: {model: CartScreenModel}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <View style={styles.billCard}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${expanded ? 'Collapse' : 'Expand'} bill details`}
        accessibilityState={{expanded}}
        onPress={() => setExpanded(current => !current)}
        style={({pressed}) => [styles.billHeader, pressed && styles.cardPressed]}>
        <View>
          <Text style={styles.cardTitle}>Bill details</Text>
          <Text style={styles.cardCaption}>Server-verified amounts only</Text>
        </View>
        <Text style={styles.expandText}>{expanded ? 'Hide' : 'Show'}</Text>
      </Pressable>

      {expanded ? (
        <View style={styles.billRows}>
          <CartAmountRow label="Food subtotal" field={model.billSummary.foodSubtotal} />
          <CartAmountRow label="Delivery fee" field={model.billSummary.deliveryFee} />
          <CartAmountRow label="Platform fee" field={model.billSummary.platformFee} />
          <CartAmountRow label="Taxes" field={model.billSummary.taxAmount} />
          <CartAmountRow label="Coupon discount" field={model.billSummary.couponDiscount} />
          <View style={styles.billDivider} />
          <CartAmountRow
            emphasized
            label="Payable total"
            field={model.billSummary.grandTotal}
          />
          {!model.billSummary.complete ? (
            <Text accessibilityRole="alert" style={styles.billNotice}>
              Final fees, taxes and payable total are not available yet. Checkout stays disabled until the complete bill is verified.
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export function CustomerCartScreen() {
  const navigation = useNavigation<NavigationProp<CustomerCartStackParamList>>();
  const dispatch = useAppDispatch();
  const model = useAppSelector(selectCartScreenModel);
  const snapshotStatus = useAppSelector(state => state.cart.snapshotStatus);
  const snapshotErrorCode = useAppSelector(state => state.cart.snapshotErrorCode);
  const mutations = useAppSelector(state => state.cart.mutations);
  const header = useCustomerHeaderState();
  const bottomNavScroll = useCustomerBottomNavScroll();
  const [locationSelectorVisible, setLocationSelectorVisible] = useState(false);
  const [interactionError, setInteractionError] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);

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
    if (outcome.status === 'FAILED') {
      setRefreshError(outcome.error.message);
    }
  }, [dispatch]);

  useEffect(() => {
    if (snapshotStatus === 'UNINITIALIZED') {
      refreshCart();
    }
  }, [refreshCart, snapshotStatus]);

  const browseMeals = useCallback(() => {
    const tabs = navigation.getParent<BottomTabNavigationProp<CustomerTabParamList>>();
    if (tabs) {
      tabs.navigate('Home');
      return;
    }
    navigation.goBack();
  }, [navigation]);

  const handleMutationOutcome = useCallback((outcome: CartMutationOutcome) => {
    if (outcome.status === 'FAILED') {
      setInteractionError(outcome.error.message);
    }
  }, []);

  const updateQuantity = useCallback(
    (item: CartScreenItem, targetQuantity: number) => {
      const interaction = resolveCartQuantityInteraction(targetQuantity);
      setInteractionError(null);

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
              onPress: () => {
                dispatch(removeCartItem({lineId: item.lineId})).then(
                  handleMutationOutcome,
                );
              },
            },
          ],
        );
        return;
      }

      dispatch(
        setCartItemQuantity({
          lineId: item.lineId,
          quantity: interaction.quantity,
        }),
      ).then(handleMutationOutcome);
    },
    [dispatch, handleMutationOutcome],
  );

  const handleRemove = useCallback(
    (item: CartScreenItem) => {
      updateQuantity(item, 0);
    },
    [updateQuantity],
  );

  const handleCheckout = useCallback(() => {
    if (!model) {
      return;
    }
    setInteractionError(
      getCartCheckoutStatusCopy(model.checkout, model.billSummary.complete),
    );
  }, [model]);

  const storedRefreshError =
    snapshotStatus === 'ERROR'
      ? snapshotErrorCode === 'NETWORK_ERROR'
        ? 'You appear to be offline. Your last valid cart is still shown when available.'
        : 'The cart could not be refreshed. Your last valid cart is still shown when available.'
      : null;
  const visibleRefreshError = refreshError ?? storedRefreshError;

  const renderHeader = () => (
    <View>
      <View style={styles.titleRow}>
        <Pressable
          accessibilityLabel="Back"
          accessibilityRole="button"
          hitSlop={spacing.xs}
          onPress={() => navigation.goBack()}
          style={({pressed}) => [styles.backButton, pressed && styles.backPressed]}>
          <Icon name="arrow-left" size={iconSize.md} color={colors.espressoBrown} />
        </Pressable>
        <View style={styles.titleCopy}>
          <Text accessibilityRole="header" style={styles.title}>
            Your Cart
          </Text>
          <Text style={styles.subtitle}>
            {itemCount} {itemCount === 1 ? 'item' : 'items'} across {sections.length}{' '}
            {sections.length === 1 ? 'kitchen' : 'kitchens'}
          </Text>
        </View>
      </View>

      {visibleRefreshError ? (
        <RecoverableErrorBanner
          message={visibleRefreshError}
          onRetry={() => {
            refreshCart();
          }}
          style={styles.notice}
        />
      ) : null}
      {interactionError ? (
        <RecoverableErrorBanner message={interactionError} style={styles.notice} />
      ) : null}

      {model ? (
        <View style={styles.dependencies}>
          <DependencyCard
            icon="location"
            title="Delivery address"
            message={getCartAddressStatusCopy(model.deliveryAddress)}
          />
          <DependencyCard
            icon="check"
            title="Delivery estimate"
            message={getCartEtaStatusCopy(model.eta)}
          />
        </View>
      ) : null}
    </View>
  );

  const renderFooter = () =>
    model ? (
      <View style={styles.listFooter}>
        <View style={styles.offerCard}>
          <Text style={styles.cardTitle}>Offers & Coupons</Text>
          <Text style={styles.cardCaption}>
            {model.coupon.status === 'ERROR'
              ? 'Offers could not be verified for this cart.'
              : 'Offer application is unavailable until Craves can verify coupon results for this cart.'}
          </Text>
        </View>
        <BillSummary model={model} />
      </View>
    ) : null;

  const renderSectionHeader = ({section}: {section: CartKitchenSectionModel}) => (
    <View style={styles.kitchenHeader}>
      <Text style={styles.kitchenName}>{section.kitchenName}</Text>
      <Text style={styles.kitchenMeta}>
        {section.data.length} {section.data.length === 1 ? 'dish' : 'dishes'}
      </Text>
    </View>
  );

  const renderItem = ({item}: {item: CartScreenItem}) => (
    <CartLineCard
      item={item}
      pending={mutations[`line:${item.lineId}`]?.status === 'PENDING'}
      onDecrease={line => updateQuantity(line, line.quantity - 1)}
      onIncrease={line => updateQuantity(line, line.quantity + 1)}
      onRemove={handleRemove}
    />
  );

  const checkoutEnabled = Boolean(model?.checkout.enabled && model.billSummary.complete);
  const foodSubtotal = model?.billSummary.foodSubtotal.amount ?? null;
  const checkoutStatus = model
    ? getCartCheckoutStatusCopy(model.checkout, model.billSummary.complete)
    : 'Load the cart before checkout.';

  const content = (() => {
    if (!model && (snapshotStatus === 'UNINITIALIZED' || snapshotStatus === 'LOADING')) {
      return (
        <View
          accessibilityLabel="Loading cart"
          accessibilityRole="progressbar"
          style={styles.loadingState}>
          <ActivityIndicator color={colors.flameRed} size="large" />
          <Text style={styles.loadingText}>Loading your cart…</Text>
        </View>
      );
    }

    if (!model) {
      if (snapshotErrorCode === 'NETWORK_ERROR') {
        return (
          <CustomerEmptyState
            actionPending={snapshotStatus === 'LOADING'}
            connectivity="OFFLINE"
            model={customerEmptyStateAdapters.noInternet()}
            onAction={actionId => {
              if (actionId === 'RETRY') {
                refreshCart();
              }
            }}
            testID="customer-cart-offline"
          />
        );
      }
      return (
        <TerminalState
          title="Cart could not be loaded"
          description={visibleRefreshError ?? 'Refresh to load your current cart.'}
          actionLabel="Try again"
          onAction={() => {
            refreshCart();
          }}
          actionLoading={snapshotStatus === 'LOADING'}
        />
      );
    }

    return (
      <SectionList<CartScreenItem, CartKitchenSectionModel>
        sections={sections}
        keyExtractor={item => item.lineId}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={renderHeader}
        ListFooterComponent={renderFooter}
        ListEmptyComponent={
          <CustomerEmptyState
            model={customerEmptyStateAdapters.emptyCart()}
            onAction={actionId => {
              if (actionId === 'BROWSE_MEALS') {
                browseMeals();
              }
            }}
            style={styles.emptyState}
            testID="customer-cart-empty"
          />
        }
        onScroll={bottomNavScroll.onScroll}
        refreshControl={
          <RefreshControl
            colors={[colors.flameRed]}
            onRefresh={() => {
              refreshCart();
            }}
            refreshing={snapshotStatus === 'LOADING'}
            tintColor={colors.flameRed}
          />
        }
        renderItem={renderItem}
        renderSectionHeader={renderSectionHeader}
        scrollEventThrottle={bottomNavScroll.scrollEventThrottle}
        showsVerticalScrollIndicator={false}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={[
          styles.listContent,
          model.items.length > 0 && styles.listContentWithCheckout,
        ]}
      />
    );
  })();

  return (
    <ScreenShell edges={['top']} keyboardAvoiding={false} testID="customer-cart">
      <CustomerHeader
        variant="compact"
        onPressLocation={() => setLocationSelectorVisible(true)}
        onPressNotifications={() => {
          header.refreshNotifications();
        }}
      />

      <View style={styles.content}>{content}</View>

      {model && model.items.length > 0 ? (
        <View style={styles.checkoutBar}>
          <View style={styles.checkoutCopy}>
            <Text style={styles.checkoutEyebrow}>Payable total</Text>
            <Text style={styles.checkoutTotal}>
              {model.billSummary.grandTotal.amount
                ? formatCartMoney(model.billSummary.grandTotal.amount)
                : 'Not available'}
            </Text>
            {foodSubtotal ? (
              <Text style={styles.checkoutSubtotal}>
                Food subtotal {formatCartMoney(foodSubtotal)}
              </Text>
            ) : null}
          </View>
          <Button
            label="Proceed to Checkout"
            accessibilityHint={checkoutEnabled ? undefined : checkoutStatus}
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
  content: {
    flex: 1,
    backgroundColor: colors.surfaceBase,
  },
  loadingState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.xl,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: typography.body,
  },
  listContent: {
    flexGrow: 1,
    paddingBottom: spacing.xxl,
    backgroundColor: colors.surfaceBase,
  },
  listContentWithCheckout: {
    paddingBottom: CART_FOOTER_CLEARANCE,
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
    backgroundColor: colors.surfaceWarm,
  },
  backPressed: {
    opacity: 0.75,
  },
  titleCopy: {
    minWidth: 0,
    flex: 1,
  },
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
  notice: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  dependencies: {
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
    paddingBottom: spacing.md,
  },
  dependencyCard: {
    minHeight: 80,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    padding: spacing.md,
  },
  dependencyIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceWarm,
  },
  dependencyCopy: {
    minWidth: 0,
    flex: 1,
  },
  dependencyTitle: {
    color: colors.espressoBrown,
    fontSize: typography.body,
    fontWeight: fontWeight.semibold,
  },
  dependencyMessage: {
    color: colors.textSecondary,
    fontSize: typography.small,
    marginTop: spacing.xxs,
  },
  kitchenHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
    backgroundColor: colors.surfaceBase,
  },
  kitchenName: {
    minWidth: 0,
    flex: 1,
    color: colors.espressoBrown,
    fontSize: typography.heading,
    fontWeight: fontWeight.bold,
  },
  kitchenMeta: {
    color: colors.textSecondary,
    fontSize: typography.small,
  },
  lineCard: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    ...elevation.card,
  },
  lineMediaFallback: {
    width: 76,
    height: 76,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceWarmStrong,
  },
  lineMediaInitial: {
    color: colors.flameRed,
    fontSize: typography.hero,
    fontWeight: fontWeight.extrabold,
  },
  lineBody: {
    minWidth: 0,
    flex: 1,
  },
  lineHeadingRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
  },
  lineHeadingCopy: {
    minWidth: 0,
    flex: 1,
  },
  lineName: {
    color: colors.espressoBrown,
    fontSize: typography.body,
    fontWeight: fontWeight.bold,
  },
  lineUnitPrice: {
    color: colors.textSecondary,
    fontSize: typography.small,
    marginTop: spacing.xxs,
  },
  lineTotal: {
    color: colors.flameRed,
    fontSize: typography.body,
    fontWeight: fontWeight.bold,
  },
  lineActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  quantityControl: {
    minHeight: touchTarget.minimum,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.flameRed,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  quantityButton: {
    width: touchTarget.minimum,
    minHeight: touchTarget.minimum,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quantityButtonPressed: {
    backgroundColor: colors.surfaceWarm,
  },
  quantitySymbol: {
    color: colors.flameRed,
    fontSize: typography.heading,
    fontWeight: fontWeight.bold,
  },
  quantityValue: {
    minWidth: 28,
    color: colors.espressoBrown,
    fontSize: typography.body,
    fontWeight: fontWeight.bold,
    textAlign: 'center',
  },
  removeButton: {
    minHeight: touchTarget.minimum,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  },
  removeButtonPressed: {
    opacity: 0.7,
  },
  removeText: {
    color: colors.error,
    fontSize: typography.small,
    fontWeight: fontWeight.semibold,
  },
  controlDisabled: {
    opacity: 0.45,
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
    backgroundColor: colors.surfaceWarm,
    padding: spacing.md,
  },
  billCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    overflow: 'hidden',
  },
  billHeader: {
    minHeight: touchTarget.comfortable,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    padding: spacing.md,
  },
  cardPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  cardTitle: {
    color: colors.espressoBrown,
    fontSize: typography.heading,
    fontWeight: fontWeight.bold,
  },
  cardCaption: {
    color: colors.textSecondary,
    fontSize: typography.small,
    marginTop: spacing.xxs,
  },
  expandText: {
    color: colors.flameRed,
    fontSize: typography.small,
    fontWeight: fontWeight.semibold,
  },
  billRows: {
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: spacing.md,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  amountLabel: {
    minWidth: 0,
    flex: 1,
    color: colors.textSecondary,
    fontSize: typography.body,
  },
  amountLabelStrong: {
    color: colors.espressoBrown,
    fontWeight: fontWeight.bold,
  },
  amountValue: {
    color: colors.espressoBrown,
    fontSize: typography.body,
    fontWeight: fontWeight.medium,
    textAlign: 'right',
  },
  amountValueStrong: {
    fontWeight: fontWeight.extrabold,
  },
  billDivider: {
    height: 1,
    backgroundColor: colors.border,
  },
  billNotice: {
    color: colors.textSecondary,
    fontSize: typography.small,
    backgroundColor: colors.warningSoft,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  emptyState: {
    minHeight: 360,
  },
  checkoutBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    minHeight: 96,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.white,
    ...elevation.card,
  },
  checkoutCopy: {
    minWidth: 112,
    flex: 1,
  },
  checkoutEyebrow: {
    color: colors.textSecondary,
    fontSize: typography.tiny,
    fontWeight: fontWeight.medium,
  },
  checkoutTotal: {
    color: colors.espressoBrown,
    fontSize: typography.heading,
    fontWeight: fontWeight.extrabold,
    marginTop: spacing.xxs,
  },
  checkoutSubtotal: {
    color: colors.textSecondary,
    fontSize: typography.tiny,
    marginTop: spacing.xxs,
  },
  checkoutButton: {
    flex: 1.6,
  },
});