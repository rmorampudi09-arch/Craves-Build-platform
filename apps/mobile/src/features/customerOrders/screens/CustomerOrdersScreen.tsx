import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import type {BottomTabNavigationProp} from '@react-navigation/bottom-tabs';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {useCustomerBottomNavScroll} from '../../../app/navigation/CustomerBottomNavController';
import type {
  CustomerOrdersStackParamList,
  CustomerTabParamList,
} from '../../../app/navigation/types';
import {toAppApiError} from '../../../core/http/apiError';
import {
  borderWidth,
  colors,
  fontWeight,
  radius,
  spacing,
  typography,
} from '../../../design/tokens';
import {
  OfflineNotice,
  RecoverableErrorBanner,
  TerminalState,
} from '../../../shared/components/LifecycleStates';
import {ScreenShell} from '../../../shared/components/ScreenShell';
import {CustomerHeader} from '../../customerShell/components/CustomerHeader';
import {CustomerLocationSelector} from '../../customerShell/components/CustomerLocationSelector';
import {CustomerOrderCard} from '../components/CustomerOrderCard';
import type {CustomerOrder} from '../domain/customerOrderTypes';
import {
  CUSTOMER_ORDERS_LIFECYCLE_BUCKET_BLOCKER,
  CUSTOMER_ORDERS_TABS,
  isCustomerOrdersTabAuthoritative,
  selectCustomerOrdersTab,
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
  const bottomNavScroll = useCustomerBottomNavScroll();
  const ordersQuery = useCustomerOrdersQuery();
  const [selectedTab, setSelectedTab] = useState<CustomerOrdersTabKey>('ALL');
  const [locationSelectorVisible, setLocationSelectorVisible] = useState(false);
  const [capabilityMessage, setCapabilityMessage] = useState<string | null>(null);
  const listRef = useRef<FlatList<CustomerOrder>>(null);
  const offsetsRef = useRef<Record<CustomerOrdersTabKey, number>>({...initialOffsets});

  const snapshot = ordersQuery.data;
  const visibleOrders = useMemo(
    () => (snapshot ? selectCustomerOrdersTab(snapshot, selectedTab) : []),
    [selectedTab, snapshot],
  );
  const queryError = ordersQuery.error ? toAppApiError(ordersQuery.error) : null;
  const offline = queryError?.code === 'NETWORK_ERROR';
  const initialLoading = ordersQuery.isPending && !snapshot;
  const lifecycleBlocked = !isCustomerOrdersTabAuthoritative(selectedTab);

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

  const openDiscovery = useCallback(() => {
    const parent = navigation.getParent<BottomTabNavigationProp<CustomerTabParamList>>();
    parent?.navigate('Home');
  }, [navigation]);

  const listHeader = (
    <View>
      <CustomerHeader
        onPressLocation={() => setLocationSelectorVisible(true)}
        onPressNotifications={() =>
          setCapabilityMessage(
            'The notification inbox route is not part of the current authorized phase. Your unread badge is still live from the existing notification summary.',
          )
        }
      />
      <View style={styles.titleArea}>
        <Text accessibilityRole="header" style={styles.title}>
          My Orders
        </Text>
        <Text style={styles.subtitle}>Track, manage and reorder your meals</Text>
      </View>
      <View accessibilityRole="tablist" style={styles.tabs}>
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
                pressed && styles.tabPressed,
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
          style={styles.banner}
        />
      ) : null}
      {snapshot?.historyCompleteness === 'UNKNOWN_AFTER_SERVER_LIMIT' ? (
        <RecoverableErrorBanner
          message="Showing the newest 50 orders. The current server contract does not expose another page or a complete-history count yet."
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
          title="Customer session required"
          description="Orders are private account data and can only load for the signed-in customer."
        />
      );
    }
    if (queryError && !snapshot) {
      return (
        <TerminalState
          title={offline ? 'You appear to be offline' : 'Orders could not be loaded'}
          description={queryError.message}
          actionLabel="Try again"
          onAction={refresh}
        />
      );
    }
    if (lifecycleBlocked) {
      return (
        <TerminalState
          title="This order group is not available yet"
          description={`The server currently returns exact order statuses, but it does not define the approved ${selectedTab.toLowerCase()} lifecycle mapping. ${CUSTOMER_ORDERS_LIFECYCLE_BUCKET_BLOCKER}`}
          actionLabel="Show all orders"
          onAction={() => selectTab('ALL')}
        />
      );
    }
    return (
      <TerminalState
        title="No orders yet"
        description="Once you place an order, its live status and total will appear here."
        actionLabel="Discover meals"
        onAction={openDiscovery}
        secondaryActionLabel="Refresh"
        onSecondaryAction={refresh}
      />
    );
  })();

  return (
    <ScreenShell keyboardAvoiding={false} edges={['top']}>
      <FlatList
        ref={listRef}
        data={visibleOrders}
        keyExtractor={order => order.id}
        renderItem={({item}) => <CustomerOrderCard order={item} />}
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
          ordersQuery.isFetching && snapshot ? (
            <View
              accessibilityLabel="Refreshing order status"
              accessibilityRole="progressbar"
              style={styles.footerLoading}>
              <ActivityIndicator color={colors.flameRed} />
            </View>
          ) : null
        }
      />
      <CustomerLocationSelector
        visible={locationSelectorVisible}
        onClose={() => setLocationSelectorVisible(false)}
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
  titleArea: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  title: {
    color: colors.espressoBrown,
    fontSize: typography.hero,
    fontWeight: fontWeight.extrabold,
  },
  subtitle: {
    marginTop: spacing.xxs,
    color: colors.textSecondary,
    fontSize: typography.small,
  },
  tabs: {
    flexDirection: 'row',
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    borderBottomWidth: borderWidth.standard,
    borderBottomColor: colors.border,
  },
  tab: {
    minHeight: 48,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxs,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabSelected: {
    borderBottomColor: colors.flameRed,
  },
  tabPressed: {
    backgroundColor: colors.surfaceWarm,
    borderRadius: radius.sm,
  },
  tabText: {
    color: colors.textSecondary,
    fontSize: typography.tiny,
    fontWeight: fontWeight.semibold,
    textAlign: 'center',
  },
  tabTextSelected: {
    color: colors.flameRed,
  },
  banner: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  skeletonWrap: {
    paddingHorizontal: spacing.md,
  },
  skeletonCard: {
    minHeight: 210,
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
  footerLoading: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
  },
});
