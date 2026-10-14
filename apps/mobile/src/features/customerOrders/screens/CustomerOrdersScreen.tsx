import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import {useIsFocused, useNavigation} from '@react-navigation/native';
import type {BottomTabNavigationProp} from '@react-navigation/bottom-tabs';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {useCustomerBottomNavScroll} from '../../../app/navigation/CustomerBottomNavController';
import {useAppDispatch, useAppSelector} from '../../../app/store/hooks';
import type {
  CustomerOrdersStackParamList,
  CustomerTabParamList,
} from '../../../app/navigation/types';
import {toAppApiError} from '../../../core/http/apiError';
import {colors, fontWeight, radius, spacing, typography} from '../../../design/tokens';
import {iosType, iosWeight} from '../../../design/iosType';
import {
  OfflineNotice,
  RecoverableErrorBanner,
  TerminalState,
} from '../../../shared/components/LifecycleStates';
import {ScreenShell} from '../../../shared/components/ScreenShell';
import {sessionManager} from '../../auth/api/sessionManager';
import {refreshCartSnapshot} from '../../cart/state/cartRefresh';
import {reorderCart} from '../../cart/state/cartMutations';
import {isDefinitiveCartRejection} from '../../cart/domain/cartWriteRejection';
import {CustomerEmptyState} from '../../customerEmptyStates/components/CustomerEmptyState';
import {customerEmptyStateAdapters} from '../../customerEmptyStates/customerEmptyStateAdapters';
import {CustomerBellButton} from '../../notifications/components/CustomerBellButton';
import {CustomerOrderCard} from '../components/CustomerOrderCard';
import type {CustomerOrder} from '../domain/customerOrderTypes';
import {createCustomerOrderReorder} from '../domain/customerOrderReorder';
import {
  CUSTOMER_ORDERS_TABS,
  selectCustomerOrdersTab,
  getPendingOrderVisibilityExpiry,
  type CustomerOrdersTabKey,
} from '../presentation/customerOrdersPresentation';
import {useCustomerOrdersQuery} from '../query/customerOrdersQueries';

const initialOffsets: Record<CustomerOrdersTabKey, number> = {
  ALL: 0,
  UPCOMING: 0,
  COMPLETED: 0,
  CANCELLED: 0,
};

function OrdersSkeleton() {
  return (
    <View
      accessibilityLabel="Loading your orders"
      accessibilityRole="progressbar"
      style={styles.skeletonWrap}>
      {[0, 1, 2].map(index => (
        <View key={index} style={styles.skeletonCard}>
          <View style={styles.skeletonLineWide} />
          <View style={styles.skeletonLine} />
          <View style={styles.skeletonBlock} />
        </View>
      ))}
    </View>
  );
}

export function CustomerOrdersScreen() {
  const navigation =
    useNavigation<
      NativeStackNavigationProp<
        CustomerOrdersStackParamList,
        'CustomerOrdersRoot'
      >
    >();
  const dispatch = useAppDispatch();
  const identityId = useAppSelector(state => state.auth.identity?.id ?? null);
  const focused = useIsFocused();
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  const active = focused && appActive && Boolean(identityId);
  const mounted = useRef(true);
  const activity = useRef({
    active,
    identityId,
    generation: 0,
  });
  if (
    activity.current.active !== active ||
    activity.current.identityId !== identityId
  ) {
    activity.current = {
      active,
      identityId,
      generation: activity.current.generation + 1,
    };
  }
  const bottomNavScroll = useCustomerBottomNavScroll();
  const ordersQuery = useCustomerOrdersQuery();
  const [selectedTab, setSelectedTab] = useState<CustomerOrdersTabKey>('ALL');
  const [capabilityMessage, setCapabilityMessage] = useState<string | null>(null);
  const [reorderingOrderId, setReorderingOrderId] = useState<string | null>(null);
  const [uncertainReorder, setUncertainReorder] = useState(false);
  const [checkingCart, setCheckingCart] = useState(false);
  const reorderBusy = useRef(false);
  const cartCheckBusy = useRef(false);
  const uncertainRef = useRef(false);
  const confirmation = useRef<((confirmed: boolean) => void) | null>(null);
  const listRef = useRef<FlatList<CustomerOrder>>(null);
  const offsetsRef = useRef<Record<CustomerOrdersTabKey, number>>({...initialOffsets});

  const snapshot = ordersQuery.data;
  const [visibilityNow, setVisibilityNow] = useState(Date.now);
  useEffect(() => {
    if (!active) return undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const updateVisibility = () => {
      const now = Date.now();
      setVisibilityNow(now);
      const expiries = snapshot?.orders
        .map(getPendingOrderVisibilityExpiry)
        .filter((expiry): expiry is number => expiry !== null && expiry + 1 > now) ?? [];
      if (expiries.length) {
        timeout = setTimeout(updateVisibility, Math.min(Math.min(...expiries) + 1 - now, 2_147_483_647));
      }
    };
    updateVisibility();
    return () => clearTimeout(timeout);
  }, [active, snapshot]);
  const visibleOrders = useMemo(
    () => (snapshot ? selectCustomerOrdersTab(snapshot, selectedTab, visibilityNow) : []),
    [selectedTab, snapshot, visibilityNow],
  );
  const queryError = ordersQuery.error ? toAppApiError(ordersQuery.error) : null;
  const offline = queryError?.code === 'NETWORK_ERROR';
  const initialLoading = ordersQuery.isPending && !snapshot;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      confirmation.current?.(false);
    };
  }, []);

  useEffect(() => {
    return sessionManager.subscribeInvalidation(() => {
      confirmation.current?.(false);
      activity.current = {
        ...activity.current,
        active: false,
        generation: activity.current.generation + 1,
      };
    });
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') {
        confirmation.current?.(false);
      }
      setAppActive(state === 'active');
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    confirmation.current?.(false);
    uncertainRef.current = false;
    setUncertainReorder(false);
    setCapabilityMessage(null);
  }, [identityId]);

  const restoreSelectedOffset = useCallback(() => {
    requestAnimationFrame(() => {
      listRef.current?.scrollToOffset({
        offset: offsetsRef.current[selectedTab],
        animated: false,
      });
    });
  }, [selectedTab]);

  useEffect(() => {
    restoreSelectedOffset();
  }, [restoreSelectedOffset]);

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      offsetsRef.current[selectedTab] = event.nativeEvent.contentOffset.y;
      bottomNavScroll.onScroll(event);
    },
    [bottomNavScroll, selectedTab],
  );

  const selectTab = useCallback((tab: CustomerOrdersTabKey) => {
    setCapabilityMessage(null);
    setSelectedTab(tab);
  }, []);

  const refresh = useCallback(() => {
    setCapabilityMessage(null);
    ordersQuery.refetch();
  }, [ordersQuery]);

  const confirmReorder = useCallback(
    async (order: CustomerOrder) => {
      if (
        reorderBusy.current ||
        uncertainRef.current ||
        !activity.current.active ||
        !identityId
      ) {
        return;
      }

      const generation = activity.current.generation;
      const requestIdentity = identityId;
      const isCurrent = () =>
        mounted.current &&
        activity.current.active &&
        activity.current.generation === generation &&
        activity.current.identityId === requestIdentity;

      reorderBusy.current = true;
      setCapabilityMessage(null);
      setReorderingOrderId(order.id);
      let rejectionMessage =
        'These dishes could not be added. Please try again later.';

      try {
        const coordinator = createCustomerOrderReorder({
          isCurrent,
          readCart: async () => {
            const result = await dispatch(refreshCartSnapshot());
            return result.status === 'APPLIED' ? result.snapshot : null;
          },
          confirm: cart =>
            new Promise(resolve => {
              let settled = false;
              const finish = (value: boolean) => {
                if (settled) return;
                settled = true;
                confirmation.current = null;
                resolve(value);
              };
              confirmation.current = finish;
              Alert.alert(
                cart.lines.length
                  ? 'Replace your current cart?'
                  : 'Add these dishes to your cart?',
                cart.lines.length
                  ? 'Craves will recheck this exact cart before replacing it, then rebuild the previous order using today’s availability and prices.'
                  : 'Craves will recheck your cart before adding these dishes, then use today’s availability and prices.',
                [
                  {
                    text: cart.lines.length ? 'Keep cart' : 'Not now',
                    style: 'cancel',
                    onPress: () => finish(false),
                  },
                  {
                    text: cart.lines.length ? 'Verify & replace' : 'Add to cart',
                    onPress: () => finish(true),
                  },
                ],
                {cancelable: true, onDismiss: () => finish(false)},
              );
            }),
          replaceCart: async (orderId, expectedSnapshot, expectedKitchenId) => {
            uncertainRef.current = true;
            setUncertainReorder(true);
            setCapabilityMessage(
              'If this reorder cannot be confirmed, check your cart before trying again.',
            );
            const result = await dispatch(
              reorderCart({
                orderId,
                expectedSnapshot,
                expectedKitchenId,
              }),
            );
            if (
              result.status === 'FAILED' &&
              isDefinitiveCartRejection(result.error)
            ) {
              rejectionMessage = result.error.message;
              return 'REJECTED';
            }
            return result.status === 'APPLIED'
              ? 'APPLIED'
              : result.status === 'FAILED'
                ? 'FAILED'
                : 'STALE';
          },
        });

        const result = await coordinator.run({
          orderId: order.id,
          kitchenId: order.kitchenId,
          eligible: order.status === 'DELIVERED',
        });

        if (!isCurrent()) return;

        if (result === 'APPLIED') {
          uncertainRef.current = false;
          setUncertainReorder(false);
          setCapabilityMessage(null);
          navigation.navigate('CustomerCart');
        } else if (result === 'REJECTED' || result === 'STALE') {
          uncertainRef.current = false;
          setUncertainReorder(false);
          setCapabilityMessage(result === 'REJECTED' ? rejectionMessage : null);
        } else if (result === 'CART_CHANGED') {
          uncertainRef.current = false;
          setUncertainReorder(false);
          setCapabilityMessage(
            'Your cart changed while you were reviewing it. Tap Reorder again to review the latest cart.',
          );
        } else if (result === 'READ_FAILED') {
          uncertainRef.current = false;
          setUncertainReorder(false);
          setCapabilityMessage(
            'We couldn’t verify your current cart. Please try again after it finishes refreshing.',
          );
        } else if (result === 'UNCERTAIN') {
          uncertainRef.current = true;
          setUncertainReorder(true);
          setCapabilityMessage(
            'We couldn’t confirm the reorder. Check your cart before trying again so a newer cart is never replaced twice.',
          );
        }
      } finally {
        reorderBusy.current = false;
        if (mounted.current) setReorderingOrderId(null);
      }
    },
    [dispatch, identityId, navigation],
  );

  const checkCart = useCallback(async () => {
    if (!activity.current.active || reorderBusy.current || cartCheckBusy.current) {
      return;
    }
    const generation = activity.current.generation;
    cartCheckBusy.current = true;
    setCheckingCart(true);
    try {
      const result = await dispatch(refreshCartSnapshot());
      if (
        !mounted.current ||
        !activity.current.active ||
        activity.current.generation !== generation
      ) {
        return;
      }
      if (result.status === 'APPLIED') {
        uncertainRef.current = false;
        setUncertainReorder(false);
        setCapabilityMessage(null);
        navigation.navigate('CustomerCart');
      } else {
        setCapabilityMessage(
          'Your cart couldn’t be checked yet. Reconnect and try again before another reorder.',
        );
      }
    } finally {
      cartCheckBusy.current = false;
      if (mounted.current) setCheckingCart(false);
    }
  }, [dispatch, navigation]);

  const openDiscovery = useCallback(() => {
    const parent = navigation.getParent<BottomTabNavigationProp<CustomerTabParamList>>();
    parent?.navigate('Home');
  }, [navigation]);

  const listHeader = (
    <View>
      <View style={styles.header}>
        <Text accessibilityRole="header" style={styles.title}>
          My Orders
        </Text>
        <CustomerBellButton />
      </View>
      <View accessibilityLabel="Order filters" accessibilityRole="tablist" style={styles.tabs}>
        {CUSTOMER_ORDERS_TABS.map(tab => {
          const selected = tab.key === selectedTab;
          return (
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{selected}}
              key={tab.key}
              onPress={() => selectTab(tab.key)}
              style={({pressed}) => [
                styles.tab,
                selected && styles.tabSelected,
                pressed && !selected && styles.tabPressed,
              ]}>
              <Text
                numberOfLines={1}
                style={[styles.tabText, selected && styles.tabTextSelected]}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {capabilityMessage ? (
        <RecoverableErrorBanner
          message={capabilityMessage}
          onRetry={
            uncertainReorder
              ? () => {
                  checkCart().catch(() => undefined);
                }
              : undefined
          }
          retryLabel={checkingCart ? 'Checking cart…' : 'Check cart'}
          style={styles.banner}
        />
      ) : null}
      {queryError && snapshot ? (
        offline ? (
          <OfflineNotice
            message="You are viewing the last available order history. Pull to refresh when you are back online."
            onRetry={refresh}
            style={styles.banner}
          />
        ) : (
          <RecoverableErrorBanner
            message="Your saved order history is still visible, but the latest refresh failed."
            onRetry={refresh}
            style={styles.banner}
          />
        )
      ) : null}
    </View>
  );

  const emptyState = (() => {
    if (initialLoading) {
      return <OrdersSkeleton />;
    }
    if (ordersQuery.sessionRequired) {
      return (
        <TerminalState
          title="Sign in required"
          description="Sign in to see your orders."
        />
      );
    }
    if (queryError && !snapshot) {
      if (offline) {
        return (
          <CustomerEmptyState
            actionPending={ordersQuery.isFetching}
            connectivity="OFFLINE"
            model={customerEmptyStateAdapters.noInternet()}
            onAction={actionId => {
              if (actionId === 'RETRY') {
                refresh();
              }
            }}
            testID="customer-orders-offline"
          />
        );
      }
      return (
        <TerminalState
          title="Orders could not be loaded"
          description={queryError.message}
          actionLabel="Try again"
          onAction={refresh}
        />
      );
    }
    return (
      <CustomerEmptyState
        actionPending={ordersQuery.isRefetching}
        model={customerEmptyStateAdapters.noOrders()}
        onAction={actionId => {
          if (actionId === 'BROWSE_MEALS') {
            openDiscovery();
          } else if (actionId === 'REFRESH') {
            refresh();
          }
        }}
        testID="customer-orders-empty"
      />
    );
  })();

  return (
    <ScreenShell keyboardAvoiding={false} edges={['top']}>
      <FlatList
        ref={listRef}
        data={visibleOrders}
        keyExtractor={order => order.id}
        renderItem={({item}) => (
          <CustomerOrderCard
            order={item}
            onReorder={confirmReorder}
            reorderPending={reorderingOrderId === item.id}
            reorderDisabled={
              Boolean(reorderingOrderId) || uncertainReorder || !active
            }
          />
        )}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={emptyState}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={ordersQuery.isRefetching}
            onRefresh={refresh}
            colors={[colors.flameRed]}
            tintColor={colors.flameRed}
          />
        }
        onContentSizeChange={restoreSelectedOffset}
        onScroll={handleScroll}
        scrollEventThrottle={bottomNavScroll.scrollEventThrottle}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        ListFooterComponent={
          snapshot ? (
            ordersQuery.v2Available && ordersQuery.hasNextPage ? (
              <Pressable
                accessibilityLabel="Load older orders"
                accessibilityRole="button"
                disabled={ordersQuery.isFetchingNextPage}
                onPress={() =>
                  ordersQuery.fetchNextPage().catch(() => undefined)
                }
                style={({pressed}) => [
                  styles.loadOlderButton,
                  (pressed || ordersQuery.isFetchingNextPage) &&
                    styles.loadOlderButtonPressed,
                ]}>
                {ordersQuery.isFetchingNextPage ? (
                  <ActivityIndicator color={colors.flameRed} />
                ) : (
                  <Text style={[iosType.subheadline, iosWeight.semibold, styles.loadOlderButtonText]}>
                    Load older orders
                  </Text>
                )}
              </Pressable>
            ) : ordersQuery.isFetching ? (
              <View
                accessibilityLabel="Refreshing order status"
                accessibilityRole="progressbar"
                style={styles.footerLoading}>
                <ActivityIndicator color={colors.flameRed} />
              </View>
            ) : null
          ) : null
        }
      />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    paddingBottom: spacing.xl,
    backgroundColor: colors.white,
  },
  header: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  title: {
    minWidth: 0,
    flex: 1,
    color: colors.textPrimary,
    fontSize: typography.title,
    fontWeight: fontWeight.bold,
  },
  // Warm-grey track with the chosen filter raised in a white pill.
  tabs: {
    minHeight: 48,
    flexDirection: 'row',
    marginHorizontal: spacing.md,
    marginTop: spacing.xs,
    marginBottom: spacing.md,
    padding: spacing.xxs,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
  },
  tab: {
    minHeight: 40,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxs,
    borderRadius: radius.pill,
  },
  tabSelected: {
    backgroundColor: colors.white,
    shadowColor: colors.espressoBrown,
    shadowOpacity: 0.12,
    shadowRadius: 3,
    shadowOffset: {width: 0, height: 1},
    elevation: 2,
  },
  tabPressed: {opacity: 0.6},
  tabText: {
    color: colors.textSecondary,
    fontSize: typography.small,
    fontWeight: fontWeight.semibold,
    textAlign: 'center',
  },
  tabTextSelected: {
    color: colors.textPrimary,
    fontWeight: fontWeight.bold,
  },
  banner: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  skeletonWrap: {
    paddingHorizontal: spacing.md,
  },
  skeletonCard: {
    minHeight: 168,
    marginBottom: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceMuted,
  },
  skeletonLineWide: {
    width: '70%',
    height: 18,
    borderRadius: radius.sm,
    backgroundColor: colors.border,
  },
  skeletonLine: {
    width: '42%',
    height: 12,
    marginTop: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.border,
  },
  skeletonBlock: {
    flex: 1,
    marginTop: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.border,
  },
  loadOlderButton: {
    alignItems: 'center',
    alignSelf: 'center',
    justifyContent: 'center',
    marginVertical: spacing.md,
    minHeight: 44,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(118,118,128,0.12)',
  },
  loadOlderButtonPressed: {
    opacity: 0.6,
  },
  loadOlderButtonText: {
    color: colors.textPrimary,
  },
  footerLoading: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
  },
});
