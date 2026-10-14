import React, {useCallback, useEffect, useState} from 'react';
import {
  ActivityIndicator,
  AppState,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type AppStateStatus,
} from 'react-native';
import MaterialDesignIcons from '@react-native-vector-icons/material-design-icons';
import {
  useNavigation,
  useRoute,
  type NavigationProp,
  type RouteProp,
} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import type {CustomerOrdersStackParamList} from '../../../app/navigation/types';
import {toAppApiError} from '../../../core/http/apiError';
import {colors, radius, spacing} from '../../../design/tokens';
import {iosType, iosWeight, useIosFonts} from '../../../design/iosType';
import {Icon} from '../../../shared/components/Icon';
import {
  OfflineNotice,
  RecoverableErrorBanner,
  TerminalState,
} from '../../../shared/components/LifecycleStates';
import {ScreenShell} from '../../../shared/components/ScreenShell';
import {OrderMap} from '../components/OrderMap';
import {getCustomerOrderJourney, hasLeftKitchen} from '../presentation/customerOrderJourney';
import {
  CUSTOMER_DELIVERY_POLL_INTERVAL_MS,
  formatCustomerDeliveryTimestamp,
  getCustomerDeliveryStatusPresentation,
  isTerminalCustomerDeliveryStatus,
} from '../presentation/customerOrderTrackingPresentation';
import {getCustomerOrderDisplayReference} from '../presentation/customerOrdersPresentation';
import {
  useCustomerOrderDetailQuery,
  useCustomerOrderTrackingQuery,
} from '../query/customerOrdersQueries';

type TrackingRoute = RouteProp<CustomerOrdersStackParamList, 'CustomerOrderTracking'>;
type TrackingNavigation = NavigationProp<
  CustomerOrdersStackParamList,
  'CustomerOrderTracking'
>;

function TrackingSkeleton() {
  return (
    <View
      accessibilityLabel="Loading delivery updates"
      accessibilityRole="progressbar"
      style={styles.skeletonWrap}>
      <View style={styles.skeletonHeader} />
      <View style={styles.skeletonHero} />
      <View style={styles.skeletonCard} />
    </View>
  );
}

export function CustomerOrderTrackingScreen() {
  useIosFonts();
  const navigation = useNavigation<TrackingNavigation>();
  const route = useRoute<TrackingRoute>();
  const insets = useSafeAreaInsets();
  const {height: windowHeight} = useWindowDimensions();
  const tracking = useCustomerOrderTrackingQuery(route.params.orderId);
  // Usually cached by the order screen; it carries the delivery address pin.
  const order = useCustomerOrderDetailQuery(route.params.orderId).data;
  const projection = tracking.data;
  const refetchTracking = tracking.refetch;
  const invalidOrderId = tracking.invalidOrderId;
  const sessionRequired = tracking.sessionRequired;
  const queryError = tracking.error ? toAppApiError(tracking.error) : null;
  const offline = queryError?.code === 'NETWORK_ERROR';
  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState);
  const [linkMessage, setLinkMessage] = useState<string | null>(null);
  const terminal = projection?.status
    ? isTerminalCustomerDeliveryStatus(projection.status)
    : false;
  const pollingBlockedByError = Boolean(
    queryError && queryError.status && queryError.status >= 400 && queryError.status < 500,
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', setAppState);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (
      appState !== 'active' ||
      terminal ||
      pollingBlockedByError ||
      invalidOrderId ||
      sessionRequired
    ) {
      return;
    }

    const intervalId = setInterval(() => {
      refetchTracking().then(() => undefined);
    }, CUSTOMER_DELIVERY_POLL_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [
    appState,
    pollingBlockedByError,
    terminal,
    invalidOrderId,
    refetchTracking,
    sessionRequired,
  ]);

  const openProviderTracking = useCallback(async () => {
    const url = projection?.trackingUrl;
    if (!url) {
      return;
    }
    setLinkMessage(null);
    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        setLinkMessage('This tracking link cannot be opened on this device.');
        return;
      }
      await Linking.openURL(url);
    } catch {
      setLinkMessage('The external tracking link could not be opened.');
    }
  }, [projection?.trackingUrl]);

  if (tracking.invalidOrderId) {
    return (
      <ScreenShell keyboardAvoiding={false} testID="customer-order-tracking-invalid">
        <TerminalState
          title="Tracking link unavailable"
          description="This order link is invalid."
          actionLabel="Go back"
          onAction={() => navigation.goBack()}
        />
      </ScreenShell>
    );
  }

  if (tracking.sessionRequired) {
    return (
      <ScreenShell keyboardAvoiding={false} testID="customer-order-tracking-session-required">
        <TerminalState
          title="Sign in required"
          description="Your customer session is required to view delivery updates."
          actionLabel="Go back"
          onAction={() => navigation.goBack()}
        />
      </ScreenShell>
    );
  }

  if (tracking.isPending && !projection) {
    return (
      <ScreenShell keyboardAvoiding={false} testID="customer-order-tracking-loading">
        <TrackingSkeleton />
      </ScreenShell>
    );
  }

  if (!projection) {
    const unavailable = queryError?.status === 404;
    const forbidden = queryError?.status === 403;
    return (
      <ScreenShell keyboardAvoiding={false} testID="customer-order-tracking-error">
        <TerminalState
          title={
            offline
              ? 'You appear to be offline'
              : unavailable
                ? 'Delivery updates unavailable'
                : forbidden
                  ? 'Customer access required'
                  : 'Delivery updates could not be loaded'
          }
          description={
            unavailable
              ? 'This order may no longer exist or is not available to this signed-in customer.'
              : forbidden
                ? 'This signed-in account cannot access customer delivery updates.'
                : queryError?.message ?? 'Try again to load delivery updates.'
          }
          actionLabel="Try again"
          onAction={() => tracking.refetch()}
          secondaryActionLabel="Go back"
          onSecondaryAction={() => navigation.goBack()}
        />
      </ScreenShell>
    );
  }

  const status = projection.status
    ? getCustomerDeliveryStatusPresentation(projection.status)
    : null;
  const pickedUp = order
    ? getCustomerOrderJourney(order, projection.status).kind === 'DELIVERY'
    : hasLeftKitchen(projection.status);
  const address = order?.deliveryAddress;
  const home =
    address?.latitude != null && address.longitude != null
      ? {latitude: address.latitude, longitude: address.longitude}
      : null;
  const history = [...projection.history].reverse();

  return (
    <ScreenShell
      backgroundColor={colors.white}
      edges={['bottom']}
      keyboardAvoiding={false}
      testID="customer-order-tracking">
      <OrderMap
        accessibilityLabel={
          pickedUp ? 'Delivery map' : 'Map, hidden until your order is picked up'
        }
        blurred={!pickedUp}
        bottomInset={24}
        courier={projection.courierLocation}
        home={home}
        interactive
        style={{height: Math.round(windowHeight * 0.46)}}>
        {pickedUp ? null : (
          <View pointerEvents="none" style={styles.mapLocked}>
            <View style={styles.lockedNote}>
              <MaterialDesignIcons name="map-marker-path" size={14} color={colors.textPrimary} />
              <Text style={[iosType.caption1, iosWeight.semibold, styles.primaryText]}>
                Live map opens once your order is picked up
              </Text>
            </View>
          </View>
        )}
      </OrderMap>

      <Pressable
        accessibilityLabel="Back to order details"
        accessibilityRole="button"
        onPress={() => navigation.goBack()}
        style={({pressed}) => [
          styles.floatingButton,
          {top: insets.top + spacing.xs},
          pressed && styles.pressed,
        ]}>
        <Icon name="arrow-left" size={22} color={colors.textPrimary} surface={false} />
      </Pressable>
      {tracking.isFetching ? (
        <View style={[styles.floatingButton, styles.floatingRight, {top: insets.top + spacing.xs}]}>
          <ActivityIndicator color={colors.textSecondary} size="small" />
        </View>
      ) : null}

      <ScrollView
        contentContainerStyle={styles.sheetContent}
        refreshControl={
          <RefreshControl
            colors={[colors.flameRed]}
            onRefresh={() => tracking.refetch()}
            refreshing={tracking.isRefetching}
            tintColor={colors.flameRed}
          />
        }
        showsVerticalScrollIndicator={false}
        style={styles.sheet}>
        {queryError ? (
          offline ? (
            <OfflineNotice
              message="Showing the last verified delivery update. Pull to refresh when you are back online."
              onRetry={() => tracking.refetch()}
            />
          ) : (
            <RecoverableErrorBanner
              message="The last verified delivery update is still visible, but the latest refresh failed."
              onRetry={() => tracking.refetch()}
            />
          )
        ) : null}
        {linkMessage ? <RecoverableErrorBanner message={linkMessage} /> : null}

        <View style={styles.statusBlock}>
          <Text style={[iosType.footnote, iosWeight.semibold, styles.secondaryText]}>
            Order #{getCustomerOrderDisplayReference(projection.orderId)}
          </Text>
          <Text
            accessibilityLiveRegion="polite"
            accessibilityRole="header"
            style={[iosType.title1, styles.primaryText]}>
            {status?.label ?? 'Waiting for delivery updates'}
          </Text>
          <Text style={[iosType.subheadline, styles.secondaryText]}>
            {status?.detail ??
              'A delivery partner has not been assigned yet. This page refreshes while Craves is open.'}
          </Text>
          {projection.observedAt ? (
            <Text style={[iosType.footnote, styles.secondaryText]}>
              Updated {formatCustomerDeliveryTimestamp(projection.observedAt)}
            </Text>
          ) : null}
        </View>

        {projection.trackingUrl ? (
          <Pressable
            accessibilityLabel="Open partner tracking"
            accessibilityRole="button"
            onPress={openProviderTracking}
            style={({pressed}) => [styles.secondaryButton, pressed && styles.pressed]}>
            <Icon name="location" size={18} color={colors.textPrimary} surface={false} />
            <Text style={[iosType.headline, styles.primaryText]}>Open partner tracking</Text>
          </Pressable>
        ) : null}

        <View style={styles.card}>
          <Text style={[iosType.headline, styles.primaryText, styles.cardTitle]}>
            Delivery updates
          </Text>
          {history.length > 0 ? (
            history.map((entry, index) => {
              const entryStatus = getCustomerDeliveryStatusPresentation(entry.newStatus);
              const latest = index === 0;
              const last = index === history.length - 1;
              return (
                <View key={`${entry.observedAt}-${entry.recordedAt}-${index}`} style={styles.timelineRow}>
                  <View style={styles.timelineRail}>
                    <View style={[styles.timelineDot, latest && styles.timelineDotLatest]} />
                    {last ? null : <View style={styles.timelineLine} />}
                  </View>
                  <View style={styles.timelineCopy}>
                    <Text
                      style={[
                        iosType.subheadline,
                        latest ? [iosWeight.semibold, styles.primaryText] : styles.secondaryText,
                      ]}>
                      {entryStatus.label}
                    </Text>
                    <Text style={[iosType.footnote, styles.secondaryText]}>
                      {formatCustomerDeliveryTimestamp(entry.observedAt)}
                    </Text>
                  </View>
                </View>
              );
            })
          ) : (
            <Text style={[iosType.subheadline, styles.secondaryText]}>
              No delivery updates yet.
            </Text>
          )}
        </View>

        <Text style={[iosType.footnote, styles.secondaryText]}>
          Only updates confirmed by the delivery partner are shown.
          {terminal ? '' : ' They refresh every 30 seconds while Craves is open.'}
        </Text>
      </ScrollView>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  primaryText: {color: colors.textPrimary},
  secondaryText: {color: colors.textSecondary},
  pressed: {opacity: 0.6},
  mapLocked: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 24,
  },
  lockedNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  floatingButton: {
    position: 'absolute',
    left: spacing.md,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    backgroundColor: colors.white,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: {width: 0, height: 2},
    elevation: 4,
  },
  floatingRight: {left: undefined, right: spacing.md},
  sheet: {
    flex: 1,
    marginTop: -24,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: colors.white,
  },
  sheetContent: {
    padding: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
  statusBlock: {gap: spacing.xxs},
  secondaryButton: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: 'rgba(118,118,128,0.12)',
  },
  card: {
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    backgroundColor: colors.white,
  },
  cardTitle: {marginBottom: spacing.sm},
  timelineRow: {flexDirection: 'row', gap: spacing.sm},
  timelineRail: {width: 14, alignItems: 'center'},
  timelineDot: {
    width: 10,
    height: 10,
    marginTop: 5,
    borderRadius: 5,
    backgroundColor: colors.borderStrong,
  },
  timelineDotLatest: {
    width: 14,
    height: 14,
    marginTop: 3,
    borderRadius: 7,
    borderWidth: 3,
    borderColor: colors.errorSoft,
    backgroundColor: colors.flameRedAccessible,
  },
  timelineLine: {
    flex: 1,
    width: 2,
    marginVertical: 2,
    backgroundColor: colors.border,
  },
  timelineCopy: {minWidth: 0, flex: 1, gap: 2, paddingBottom: spacing.md},
  skeletonWrap: {padding: spacing.md},
  skeletonHeader: {
    width: '52%',
    height: 24,
    borderRadius: radius.sm,
    backgroundColor: colors.border,
  },
  skeletonHero: {
    height: 190,
    marginTop: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceMuted,
  },
  skeletonCard: {
    height: 220,
    marginTop: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceMuted,
  },
});
