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
import {useNavigation} from '@react-navigation/native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {
  colors,
  fontWeight,
  radius,
  spacing,
  touchTarget,
  typography,
} from '../../../design/tokens';
import {Icon} from '../../../shared/components/Icon';
import type {ChefScheduledOrder} from '../api/chefScheduledOrdersApi';
import {useChefScheduledOrdersQueue} from '../query/useChefScheduledOrdersQueue';

function formatRequestedTime(item: ChefScheduledOrder): string {
  const date = new Date(item.requestedFulfilmentAt);
  if (Number.isNaN(date.getTime())) return item.requestedFulfilmentAt;
  try {
    return new Intl.DateTimeFormat('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: item.requestedTimezone,
      timeZoneName: 'short',
    }).format(date);
  } catch {
    return date.toLocaleString();
  }
}

function shortId(value: string): string {
  return value.slice(0, 8).toUpperCase();
}

function paymentGateLabel(item: ChefScheduledOrder): string {
  return item.paymentGate === 'PAYMENT_AFTER_ALL_CHEFS_CONFIRM'
    ? 'Payment waits for all Chef confirmations'
    : 'Payment may proceed before Chef confirmation';
}

export function ChefScheduledOrdersScreen() {
  const navigation = useNavigation();
  const queue = useChefScheduledOrdersQueue();

  const confirmResponse = React.useCallback(
    (item: ChefScheduledOrder, action: 'ACCEPT' | 'REJECT') => {
      if (Date.parse(item.requestedFulfilmentAt) <= Date.now()) {
        Alert.alert(
          'Requested time has passed',
          'Refresh the queue before responding to this request.',
        );
        return;
      }

      Alert.alert(
        action === 'ACCEPT' ? 'Accept scheduled request?' : 'Reject scheduled request?',
        action === 'ACCEPT'
          ? 'Confirm that this kitchen can prepare this order for the requested fulfilment time.'
          : 'This records a rejection for this kitchen. Craves will not assume a refund, cancellation, or replacement consequence.',
        [
          {text: 'Back', style: 'cancel'},
          {
            text: action === 'ACCEPT' ? 'Accept' : 'Reject',
            style: action === 'REJECT' ? 'destructive' : 'default',
            onPress: () => {
              queue.respond(item, action, null).catch(() => undefined);
            },
          },
        ],
      );
    },
    [queue],
  );

  if (!queue.available) {
    return (
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
        <Header onBack={() => navigation.goBack()} />
        <View style={styles.centerState}>
          <Icon name="clock" size={36} color={colors.textSecondary} />
          <Text style={styles.stateTitle}>Scheduled requests are not live yet</Text>
          <Text style={styles.stateText}>
            The Chef scheduled-order backend exists, but its APIM route is not
            published. Craves will not read or respond to scheduled requests
            until that gateway operation is available.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      <Header onBack={() => navigation.goBack()} />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            colors={[colors.flameRed]}
            onRefresh={() => queue.refresh().catch(() => undefined)}
            refreshing={queue.isRefreshing}
            tintColor={colors.flameRed}
          />
        }>
        <View style={styles.introCard}>
          <Text style={styles.introTitle}>Pending confirmations</Text>
          <Text style={styles.introText}>
            Requests are ordered by requested fulfilment time. Each action uses
            the latest server response version and is reloaded after submission.
          </Text>
        </View>

        {queue.status === 'pending' && queue.items.length === 0 ? (
          <View style={styles.centerState}>
            <ActivityIndicator color={colors.flameRed} />
            <Text style={styles.stateText}>Loading scheduled requests…</Text>
          </View>
        ) : queue.status === 'error' && queue.items.length === 0 ? (
          <View style={styles.centerState}>
            <Text style={styles.stateTitle}>Scheduled requests unavailable</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => queue.refresh().catch(() => undefined)}
              style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>Try again</Text>
            </Pressable>
          </View>
        ) : queue.items.length === 0 ? (
          <View style={styles.centerState}>
            <Icon name="check" size={32} color={colors.success} />
            <Text style={styles.stateTitle}>No pending scheduled requests</Text>
            <Text style={styles.stateText}>
              New requests that require this Chef’s response will appear here.
            </Text>
          </View>
        ) : (
          queue.items.map(item => {
            const busy = queue.respondingOrderId === item.orderId;
            const expired = Date.parse(item.requestedFulfilmentAt) <= Date.now();
            return (
              <View key={`${item.scheduleRequestId}:${item.orderId}`} style={styles.card}>
                <View style={styles.cardTopRow}>
                  <View style={styles.cardCopy}>
                    <Text style={styles.requestedTime}>
                      {formatRequestedTime(item)}
                    </Text>
                    <Text style={styles.orderReference}>
                      Order #{shortId(item.orderId)}
                    </Text>
                  </View>
                  <View style={styles.pendingPill}>
                    <Text style={styles.pendingPillText}>Pending</Text>
                  </View>
                </View>

                <View style={styles.divider} />

                <Text style={styles.metaLabel}>Payment timing</Text>
                <Text style={styles.metaValue}>{paymentGateLabel(item)}</Text>

                {expired ? (
                  <Text style={styles.expiredText}>
                    The requested fulfilment time has passed. Refresh before
                    responding.
                  </Text>
                ) : null}

                <View style={styles.actionRow}>
                  <Pressable
                    accessibilityRole="button"
                    disabled={busy || expired}
                    onPress={() => confirmResponse(item, 'REJECT')}
                    style={({pressed}) => [
                      styles.rejectButton,
                      (pressed || busy || expired) && styles.disabled,
                    ]}>
                    <Text style={styles.rejectButtonText}>Reject</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    disabled={busy || expired}
                    onPress={() => confirmResponse(item, 'ACCEPT')}
                    style={({pressed}) => [
                      styles.primaryButton,
                      (pressed || busy || expired) && styles.disabled,
                    ]}>
                    {busy ? (
                      <ActivityIndicator color={colors.white} size="small" />
                    ) : (
                      <Text style={styles.primaryButtonText}>Accept</Text>
                    )}
                  </Pressable>
                </View>
              </View>
            );
          })
        )}

        {queue.responseError ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>
              The response could not be confirmed. Refresh before trying again.
            </Text>
          </View>
        ) : null}

        {queue.hasNextPage ? (
          <Pressable
            accessibilityRole="button"
            disabled={queue.isFetchingNextPage}
            onPress={() => queue.loadOlder().catch(() => undefined)}
            style={({pressed}) => [
              styles.loadMoreButton,
              (pressed || queue.isFetchingNextPage) && styles.disabled,
            ]}>
            {queue.isFetchingNextPage ? (
              <ActivityIndicator color={colors.flameRed} size="small" />
            ) : (
              <Text style={styles.loadMoreText}>Load later requests</Text>
            )}
          </Pressable>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Header({onBack}: {onBack: () => void}) {
  return (
    <View style={styles.header}>
      <Pressable
        accessibilityLabel="Back"
        accessibilityRole="button"
        onPress={onBack}
        style={({pressed}) => [styles.headerButton, pressed && styles.disabled]}>
        <Icon name="arrow-left" size={22} color={colors.espressoBrown} />
      </Pressable>
      <Text accessibilityRole="header" style={styles.headerTitle}>
        Scheduled orders
      </Text>
      <View style={styles.headerSpacer} />
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {flex: 1, backgroundColor: colors.surfaceBase},
  header: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.sm,
  },
  headerButton: {
    width: touchTarget.minimum,
    height: touchTarget.minimum,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    color: colors.espressoBrown,
    fontSize: typography.heading,
    fontWeight: fontWeight.bold,
  },
  headerSpacer: {width: touchTarget.minimum},
  content: {
    padding: spacing.md,
    paddingBottom: spacing.xxxl,
    gap: spacing.md,
  },
  introCard: {
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceMuted,
    padding: spacing.md,
  },
  introTitle: {
    color: colors.textPrimary,
    fontSize: typography.body,
    fontWeight: fontWeight.bold,
  },
  introText: {
    marginTop: spacing.xs,
    color: colors.textSecondary,
    fontSize: typography.small,
    lineHeight: 20,
  },
  centerState: {
    minHeight: 240,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  stateTitle: {
    marginTop: spacing.sm,
    color: colors.textPrimary,
    fontSize: typography.heading,
    fontWeight: fontWeight.bold,
    textAlign: 'center',
  },
  stateText: {
    marginTop: spacing.xs,
    color: colors.textSecondary,
    fontSize: typography.small,
    lineHeight: 20,
    textAlign: 'center',
  },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    padding: spacing.md,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  cardCopy: {flex: 1, minWidth: 0},
  requestedTime: {
    color: colors.textPrimary,
    fontSize: typography.body,
    fontWeight: fontWeight.bold,
  },
  orderReference: {
    marginTop: spacing.xxs,
    color: colors.textSecondary,
    fontSize: typography.tiny,
  },
  pendingPill: {
    borderRadius: radius.pill,
    backgroundColor: colors.warningSoft,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
  },
  pendingPillText: {
    color: colors.warningText,
    fontSize: typography.tiny,
    fontWeight: fontWeight.bold,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.md,
  },
  metaLabel: {
    color: colors.textSecondary,
    fontSize: typography.tiny,
  },
  metaValue: {
    marginTop: spacing.xxs,
    color: colors.textPrimary,
    fontSize: typography.small,
    fontWeight: fontWeight.semibold,
  },
  expiredText: {
    marginTop: spacing.sm,
    color: colors.warningText,
    fontSize: typography.small,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  primaryButton: {
    minHeight: touchTarget.minimum,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.flameRed,
    paddingHorizontal: spacing.md,
  },
  primaryButtonText: {
    color: colors.white,
    fontSize: typography.small,
    fontWeight: fontWeight.bold,
  },
  rejectButton: {
    minHeight: touchTarget.minimum,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.error,
    borderRadius: radius.md,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.md,
  },
  rejectButtonText: {
    color: colors.error,
    fontSize: typography.small,
    fontWeight: fontWeight.bold,
  },
  errorCard: {
    borderRadius: radius.md,
    backgroundColor: colors.errorSoft,
    padding: spacing.md,
  },
  errorText: {
    color: colors.error,
    fontSize: typography.small,
  },
  loadMoreButton: {
    minHeight: touchTarget.minimum,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    backgroundColor: colors.white,
  },
  loadMoreText: {
    color: colors.flameRedAccessible,
    fontSize: typography.small,
    fontWeight: fontWeight.bold,
  },
  disabled: {opacity: 0.5},
});
