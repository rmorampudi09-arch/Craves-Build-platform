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
  View,
  type AppStateStatus,
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
import type {CustomerDeliveryStatusTone} from '../presentation/customerOrderTrackingPresentation';
import {
  CUSTOMER_DELIVERY_POLL_INTERVAL_MS,
  formatCustomerDeliveryTimestamp,
  getCustomerDeliveryStatusPresentation,
  isTerminalCustomerDeliveryStatus,
} from '../presentation/customerOrderTrackingPresentation';
import {getCustomerOrderDisplayReference} from '../presentation/customerOrdersPresentation';
import {useCustomerOrderTrackingQuery} from '../query/customerOrdersQueries';

type TrackingRoute = RouteProp<CustomerOrdersStackParamList, 'CustomerOrderTracking'>;
type TrackingNavigation = NavigationProp<
  CustomerOrdersStackParamList,
  'CustomerOrderTracking'
>;

function toneStyle(tone: CustomerDeliveryStatusTone) {
  switch (tone) {
    case 'success':
      return styles.statusSuccess;
    case 'warning':
      return styles.statusWarning;
    case 'danger':
      return styles.statusDanger;
    case 'muted':
      return styles.statusMuted;
    case 'accent':
      return styles.statusAccent;
  }
}

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
  const navigation = useNavigation<TrackingNavigation>();
  const route = useRoute<TrackingRoute>();
  const tracking = useCustomerOrderTrackingQuery(route.params.orderId);
  const projection = tracking.data;
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
      tracking.invalidOrderId ||
      tracking.sessionRequired
    ) {
      return;
    }

    const intervalId = setInterval(() => {
      void tracking.refetch();
    }, CUSTOMER_DELIVERY_POLL_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [
    appState,
    pollingBlockedByError,
    terminal,
    tracking.invalidOrderId,
    tracking.refetch,
    tracking.sessionRequired,
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

  return (
    <ScreenShell
      edges={['top', 'bottom']}
      keyboardAvoiding={false}
      testID="customer-order-tracking">
      <View style={styles.screen}>
        <View style={styles.header}>
          <Pressable
            accessibilityLabel="Back to order details"
            accessibilityRole="button"
            onPress={() => navigation.goBack()}
            style={({pressed}) => [styles.headerAction, pressed && styles.pressed]}>
            <Icon name="arrow-left" />
          </Pressable>
          <View style={styles.headerCopy}>
            <Text accessibilityRole="header" style={styles.headerTitle}>
              Track Delivery
            </Text>
            <Text style={styles.headerSubtitle}>
              Order #{getCustomerOrderDisplayReference(projection.orderId)}
            </Text>
          </View>
          {tracking.isFetching ? (
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
              onRefresh={() => tracking.refetch()}
              refreshing={tracking.isRefetching}
              tintColor={colors.flameRed}
            />
          }
          showsVerticalScrollIndicator={false}>
          {queryError ? (
            offline ? (
              <OfflineNotice
                message="Showing the last verified delivery update. Pull to refresh when you are back online."
                onRetry={() => tracking.refetch()}
                style={styles.notice}
              />
            ) : (
              <RecoverableErrorBanner
                message="The last verified delivery update is still visible, but the latest refresh failed."
                onRetry={() => tracking.refetch()}
                style={styles.notice}
              />
            )
          ) : null}
          {linkMessage ? (
            <RecoverableErrorBanner message={linkMessage} style={styles.notice} />
          ) : null}

          {status ? (
            <View style={[styles.statusCard, toneStyle(status.tone)]}>
              <Text accessibilityLiveRegion="polite" style={styles.statusTitle}>
                {status.label}
              </Text>
              <Text style={styles.statusDetail}>{status.detail}</Text>
              {status.stage ? (
                <Text style={styles.statusMeta}>Delivery stage {status.stage} of 9</Text>
              ) : null}
              {projection.observedAt ? (
                <Text style={styles.statusMeta}>
                  Last observed {formatCustomerDeliveryTimestamp(projection.observedAt)}
                </Text>
              ) : null}
              {!terminal ? (
                <Text style={styles.pollingText}>
                  Updates refresh every 30 seconds while Craves is open. Pull down anytime to refresh now.
                </Text>
              ) : null}
              {projection.trackingUrl ? (
                <Button
                  label="Open External Tracking"
                  onPress={openProviderTracking}
                  variant="outline"
                  style={styles.externalButton}
                />
              ) : null}
            </View>
          ) : (
            <View style={styles.waitingCard}>
              <Icon name="orders" size={28} color={colors.flameRed} />
              <Text accessibilityLiveRegion="polite" style={styles.waitingTitle}>
                Waiting for delivery updates
              </Text>
              <Text style={styles.waitingText}>
                Your order is valid, but a delivery status has not been recorded yet. This page will refresh while Craves is open.
              </Text>
            </View>
          )}

          <View style={styles.timelineCard}>
            <Text style={styles.sectionTitle}>Delivery timeline</Text>
            {projection.history.length > 0 ? (
              projection.history.map((entry, index) => {
                const entryStatus = getCustomerDeliveryStatusPresentation(entry.newStatus);
                return (
                  <View key={`${entry.observedAt}-${entry.recordedAt}-${index}`} style={styles.timelineRow}>
                    <View style={styles.timelineMarker} />
                    <View style={styles.timelineCopy}>
                      <Text style={styles.timelineTitle}>{entryStatus.label}</Text>
                      <Text style={styles.timelineTime}>
                        {formatCustomerDeliveryTimestamp(entry.observedAt)}
                      </Text>
                    </View>
                  </View>
                );
              })
            ) : (
              <Text style={styles.emptyTimelineText}>
                No delivery history has been recorded yet.
              </Text>
            )}
          </View>

          <View style={styles.limitCard}>
            <Text style={styles.limitText}>
              Only verified delivery updates are shown. If an ETA, courier location, route map, cancellation outcome, or refund outcome is not available from Craves, this screen will not estimate it.
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
  statusCard: {
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
  },
  statusAccent: {backgroundColor: colors.surfaceWarm},
  statusSuccess: {backgroundColor: colors.successSoft},
  statusWarning: {backgroundColor: colors.warningSoft},
  statusDanger: {backgroundColor: colors.errorSoft},
  statusMuted: {backgroundColor: colors.surfaceMuted},
  statusTitle: {
    color: colors.espressoBrown,
    fontSize: typography.heading,
    fontWeight: fontWeight.bold,
  },
  statusDetail: {
    marginTop: spacing.xs,
    color: colors.textSecondary,
    fontSize: typography.body,
    lineHeight: 22,
  },
  statusMeta: {
    marginTop: spacing.sm,
    color: colors.espressoBrown,
    fontSize: typography.small,
    fontWeight: fontWeight.medium,
  },
  pollingText: {
    marginTop: spacing.sm,
    color: colors.textSecondary,
    fontSize: typography.tiny,
    lineHeight: 18,
  },
  externalButton: {marginTop: spacing.md},
  waitingCard: {
    alignItems: 'center',
    padding: spacing.xl,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceWarm,
  },
  waitingTitle: {
    marginTop: spacing.sm,
    color: colors.espressoBrown,
    fontSize: typography.heading,
    fontWeight: fontWeight.bold,
    textAlign: 'center',
  },
  waitingText: {
    marginTop: spacing.xs,
    color: colors.textSecondary,
    fontSize: typography.small,
    lineHeight: 21,
    textAlign: 'center',
  },
  timelineCard: {
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
  timelineRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: borderWidth.standard,
    borderBottomColor: colors.border,
  },
  timelineMarker: {
    width: 12,
    height: 12,
    marginTop: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.flameRed,
  },
  timelineCopy: {minWidth: 0, flex: 1},
  timelineTitle: {
    color: colors.espressoBrown,
    fontSize: typography.small,
    fontWeight: fontWeight.semibold,
  },
  timelineTime: {
    marginTop: spacing.xxs,
    color: colors.textSecondary,
    fontSize: typography.tiny,
  },
  emptyTimelineText: {
    color: colors.textSecondary,
    fontSize: typography.small,
    lineHeight: 21,
  },
  limitCard: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
  },
  limitText: {
    color: colors.textSecondary,
    fontSize: typography.tiny,
    lineHeight: 18,
  },
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
