import React from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {useNavigation, type NavigationProp} from '@react-navigation/native';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {
  ChefTabParamList,
  ChefTabRouteName,
} from '../../../app/navigation/types';
import {useAppSelector} from '../../../app/store/hooks';
import {
  colors,
  elevation,
  fontWeight,
  radius,
  spacing,
  touchTarget,
  typography,
} from '../../../design/tokens';
import {Icon, type IconName} from '../../../shared/components/Icon';
import {SkeletonBlock} from '../../../shared/components/Skeleton';
import {ChefHeader} from '../../chefShell/components/ChefHeader';
import type {ChefOperationalOrder} from '../../chefShell/api/chefOperationalApi';
import {useChefDashboardModel} from '../state/useChefDashboardModel';
import {
  CHEF_DASHBOARD_SALES_RANGES,
  formatChefDashboardOrderStatus,
  getChefDashboardGreeting,
  shortChefDashboardOrderReference,
  type ChefDashboardSalesRange,
} from '../domain/chefDashboardPresentation';

interface MetricCardProps {
  label: string;
  value: number;
  icon: IconName;
  sourceStatus: 'pending' | 'error' | 'success';
}

function MetricCard({label, value, icon, sourceStatus}: MetricCardProps) {
  return (
    <View style={styles.metricCard}>
      <View style={styles.metricIcon}>
        <Icon name={icon} size={20} color={colors.flameRed} />
      </View>
      {sourceStatus === 'pending' ? (
        <SkeletonBlock width={42} height={28} />
      ) : (
        <Text style={styles.metricValue}>
          {sourceStatus === 'success' ? value : '—'}
        </Text>
      )}
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

interface QuickActionProps {
  title: string;
  subtitle: string;
  icon: IconName;
  onPress: () => void;
}

function QuickAction({title, subtitle, icon, onPress}: QuickActionProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${subtitle}`}
      onPress={onPress}
      style={({pressed}) => [styles.quickAction, pressed && styles.pressed]}>
      <View style={styles.quickActionIcon}>
        <Icon name={icon} size={22} color={colors.flameRed} />
      </View>
      <View style={styles.quickActionCopy}>
        <Text style={styles.quickActionTitle}>{title}</Text>
        <Text style={styles.quickActionSubtitle}>{subtitle}</Text>
      </View>
      <Icon name="chevron-right" size={17} color={colors.textSecondary} />
    </Pressable>
  );
}

function SectionTitle({title}: {title: string}) {
  return <Text style={styles.sectionTitle}>{title}</Text>;
}

function ContractUnavailable({
  icon,
  title,
  message,
}: {
  icon: IconName;
  title: string;
  message: string;
}) {
  return (
    <View style={styles.unavailableState}>
      <View style={styles.unavailableIcon}>
        <Icon name={icon} size={22} color={colors.textSecondary} />
      </View>
      <View style={styles.unavailableCopy}>
        <Text style={styles.unavailableTitle}>{title}</Text>
        <Text style={styles.unavailableMessage}>{message}</Text>
      </View>
    </View>
  );
}

function ActiveOrderCard({
  order,
  onPress,
}: {
  order: ChefOperationalOrder;
  onPress: () => void;
}) {
  const reference = shortChefDashboardOrderReference(order.id);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open Orders for active order ${reference}`}
      onPress={onPress}
      style={({pressed}) => [styles.orderCard, pressed && styles.pressed]}>
      <View style={styles.orderIcon}>
        <Icon name="orders" size={20} color={colors.flameRed} />
      </View>
      <View style={styles.orderCopy}>
        <Text style={styles.orderReference}>{reference}</Text>
        <Text style={styles.orderStatus}>
          {formatChefDashboardOrderStatus(order.status)}
        </Text>
      </View>
      <Icon name="chevron-right" size={18} color={colors.textSecondary} />
    </Pressable>
  );
}

function DashboardSourceError({
  refreshing,
  onRetry,
}: {
  refreshing: boolean;
  onRetry: () => void;
}) {
  return (
    <View style={styles.errorBanner}>
      <Icon name="wifi-off" size={20} color={colors.error} />
      <View style={styles.errorCopy}>
        <Text style={styles.errorTitle}>Some live data could not be loaded</Text>
        <Text style={styles.errorMessage}>
          Existing dashboard information is kept where available.
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Retry dashboard refresh"
        disabled={refreshing}
        onPress={onRetry}
        style={({pressed}) => [
          styles.retryButton,
          (pressed || refreshing) && styles.pressed,
        ]}>
        <Text style={styles.retryText}>{refreshing ? 'Refreshing' : 'Retry'}</Text>
      </Pressable>
    </View>
  );
}

export function ChefDashboardScreen() {
  const navigation = useNavigation<NavigationProp<ChefTabParamList>>();
  const displayName = useAppSelector(
    state => state.auth.identity?.displayName?.trim() || 'Chef',
  );
  const {data, sources, isRefreshing, refresh} = useChefDashboardModel();
  const [salesRange, setSalesRange] =
    React.useState<ChefDashboardSalesRange>('7D');

  const firstName = React.useMemo(
    () => displayName.split(/\s+/)[0] || 'Chef',
    [displayName],
  );
  const greeting = React.useMemo(
    () => getChefDashboardGreeting(new Date().getHours()),
    [],
  );
  const hasSourceError = React.useMemo(
    () => Object.values(sources).some(status => status === 'error'),
    [sources],
  );

  const runRefresh = React.useCallback(() => {
    refresh().catch(() => undefined);
  }, [refresh]);

  const navigate = React.useCallback(
    (routeName: ChefTabRouteName) => navigation.navigate(routeName),
    [navigation],
  );

  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      style={styles.safeArea}>
      <ChefHeader title="Dashboard" />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            colors={[colors.flameRed]}
            onRefresh={runRefresh}
            refreshing={isRefreshing}
            tintColor={colors.flameRed}
          />
        }
        showsVerticalScrollIndicator={false}>
        <View style={styles.greetingBlock}>
          <Text accessibilityRole="header" style={styles.greeting}>
            {greeting}, {firstName}
          </Text>
          <Text style={styles.greetingSubtitle}>
            Here is your kitchen at a glance.
          </Text>
        </View>

        {hasSourceError ? (
          <DashboardSourceError
            refreshing={isRefreshing}
            onRetry={runRefresh}
          />
        ) : null}

        <View style={styles.walletCard}>
          <View style={styles.walletHeader}>
            <View>
              <Text style={styles.walletEyebrow}>Wallet balance</Text>
              <Text style={styles.walletAmount}>—</Text>
            </View>
            <View style={styles.walletIcon}>
              <Icon name="analytics" size={22} color={colors.white} />
            </View>
          </View>
          <Text style={styles.walletMessage}>
            Balance and withdrawal eligibility are unavailable from the current payout contract.
          </Text>
          <View style={styles.walletFooter}>
            <Text style={styles.walletLedgerStatus}>
              {sources.earnings === 'pending'
                ? 'Refreshing earnings ledger…'
                : sources.earnings === 'error'
                  ? 'Earnings ledger unavailable'
                  : 'Earnings ledger connected'}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Withdraw unavailable"
              accessibilityState={{disabled: true}}
              disabled
              style={styles.withdrawButton}>
              <Text style={styles.withdrawText}>Withdraw</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.section}>
          <SectionTitle title="Orders overview" />
          <View style={styles.metricGrid}>
            <MetricCard
              icon="bell"
              label="New orders"
              sourceStatus={sources.orders}
              value={data.orders.pendingAcceptance}
            />
            <MetricCard
              icon="chef"
              label="Active orders"
              sourceStatus={sources.orders}
              value={data.orders.activeOrders}
            />
            <MetricCard
              icon="check"
              label="Ready"
              sourceStatus={sources.orders}
              value={data.orders.readyForPickup}
            />
            <MetricCard
              icon="orders"
              label="Total orders"
              sourceStatus={sources.orders}
              value={data.orders.totalOrders}
            />
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeadingRow}>
            <SectionTitle title="Sales overview" />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open Analytics"
              onPress={() => navigate('Analytics')}
              style={({pressed}) => pressed && styles.pressed}>
              <Text style={styles.sectionLink}>View analytics</Text>
            </Pressable>
          </View>
          <View style={styles.card}>
            <View
              accessibilityRole="tablist"
              style={styles.rangeSelector}>
              {CHEF_DASHBOARD_SALES_RANGES.map(range => {
                const selected = salesRange === range.id;
                return (
                  <Pressable
                    accessibilityRole="tab"
                    accessibilityState={{selected}}
                    key={range.id}
                    onPress={() => setSalesRange(range.id)}
                    style={({pressed}) => [
                      styles.rangeChip,
                      selected && styles.rangeChipSelected,
                      pressed && styles.pressed,
                    ]}>
                    <Text
                      style={[
                        styles.rangeChipText,
                        selected && styles.rangeChipTextSelected,
                      ]}>
                      {range.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.chartCanvas}>
              {[0, 1, 2, 3].map(line => (
                <View key={line} style={styles.chartGridLine} />
              ))}
              <View style={styles.chartEmptyOverlay}>
                <Icon name="analytics" size={26} color={colors.placeholder} />
                <Text style={styles.chartEmptyTitle}>Sales data unavailable</Text>
                <Text style={styles.chartEmptyMessage}>
                  The approved sales time-series contract is not available yet.
                </Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <SectionTitle title="Quick actions" />
          <View style={styles.quickActionGrid}>
            <QuickAction
              icon="orders"
              onPress={() => navigate('Orders')}
              subtitle={
                sources.orders === 'success'
                  ? `${data.orders.pendingAcceptance} new orders`
                  : 'Open order workspace'
              }
              title="Orders"
            />
            <QuickAction
              icon="chef"
              onPress={() => navigate('Menu')}
              subtitle={
                sources.menu === 'success'
                  ? `${data.menu.sellableItems} dishes live`
                  : 'Manage your menu'
              }
              title="Menu"
            />
            <QuickAction
              icon="analytics"
              onPress={() => navigate('Analytics')}
              subtitle="Business performance"
              title="Analytics"
            />
            <QuickAction
              icon="account"
              onPress={() => navigate('Profile')}
              subtitle="Kitchen and account"
              title="Profile"
            />
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeadingRow}>
            <SectionTitle title="Active orders" />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="View all orders"
              onPress={() => navigate('Orders')}
              style={({pressed}) => pressed && styles.pressed}>
              <Text style={styles.sectionLink}>View all</Text>
            </Pressable>
          </View>
          {sources.orders === 'pending' && data.orders.active.length === 0 ? (
            <View style={styles.orderSkeletons}>
              <SkeletonBlock height={78} borderRadius={radius.md} />
              <SkeletonBlock height={78} borderRadius={radius.md} />
            </View>
          ) : sources.orders === 'error' && data.orders.active.length === 0 ? (
            <View style={styles.card}>
              <ContractUnavailable
                icon="wifi-off"
                message="Refresh the dashboard to try loading operational orders again."
                title="Active orders unavailable"
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Retry active orders"
                disabled={isRefreshing}
                onPress={runRefresh}
                style={({pressed}) => [
                  styles.inlineRetryButton,
                  (pressed || isRefreshing) && styles.pressed,
                ]}>
                <Text style={styles.inlineRetryText}>
                  {isRefreshing ? 'Refreshing…' : 'Try again'}
                </Text>
              </Pressable>
            </View>
          ) : data.orders.active.length === 0 ? (
            <View style={styles.card}>
              <ContractUnavailable
                icon="orders"
                message="New accepted orders will appear here automatically."
                title="No active orders"
              />
            </View>
          ) : (
            <View style={styles.orderList}>
              {data.orders.active.slice(0, 3).map(order => (
                <ActiveOrderCard
                  key={order.id}
                  onPress={() => navigate('Orders')}
                  order={order}
                />
              ))}
            </View>
          )}
        </View>

        <View style={styles.section}>
          <SectionTitle title="Recent reviews" />
          <View style={styles.card}>
            <ContractUnavailable
              icon="star"
              message="Recent reviews will appear when an approved Chef reviews read model is available."
              title="Reviews unavailable"
            />
          </View>
        </View>

        <View style={styles.insightBanner}>
          <View style={styles.insightIcon}>
            <Icon name="analytics" size={22} color={colors.flameRed} />
          </View>
          <View style={styles.insightCopy}>
            <Text style={styles.insightEyebrow}>Business insight</Text>
            <Text style={styles.insightTitle}>Insights are not available yet</Text>
            <Text style={styles.insightMessage}>
              No approved business-insight contract is currently registered for the Chef dashboard.
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.surfaceMuted,
  },
  content: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  greetingBlock: {
    marginBottom: spacing.lg,
  },
  greeting: {
    color: colors.espressoBrown,
    fontSize: typography.hero,
    fontWeight: fontWeight.bold,
  },
  greetingSubtitle: {
    color: colors.textSecondary,
    fontSize: typography.body,
    marginTop: spacing.xxs,
  },
  errorBanner: {
    alignItems: 'center',
    backgroundColor: colors.errorSoft,
    borderColor: colors.error,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
    padding: spacing.sm,
  },
  errorCopy: {flex: 1},
  errorTitle: {
    color: colors.textPrimary,
    fontSize: typography.small,
    fontWeight: fontWeight.semibold,
  },
  errorMessage: {
    color: colors.textSecondary,
    fontSize: typography.tiny,
    marginTop: spacing.xxs,
  },
  retryButton: {
    minHeight: touchTarget.minimum,
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  },
  retryText: {
    color: colors.error,
    fontSize: typography.small,
    fontWeight: fontWeight.bold,
  },
  walletCard: {
    ...elevation.card,
    backgroundColor: colors.espressoBrown,
    borderRadius: radius.xl,
    marginBottom: spacing.xl,
    padding: spacing.lg,
  },
  walletHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  walletEyebrow: {
    color: colors.creamDeep,
    fontSize: typography.small,
    fontWeight: fontWeight.semibold,
  },
  walletAmount: {
    color: colors.white,
    fontSize: typography.title,
    fontWeight: fontWeight.extrabold,
    marginTop: spacing.xxs,
  },
  walletIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: radius.pill,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  walletMessage: {
    color: colors.creamDeep,
    fontSize: typography.small,
    marginTop: spacing.sm,
  },
  walletFooter: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  walletLedgerStatus: {
    color: colors.placeholder,
    flex: 1,
    fontSize: typography.tiny,
  },
  withdrawButton: {
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: radius.pill,
    justifyContent: 'center',
    minHeight: touchTarget.minimum,
    opacity: 0.52,
    paddingHorizontal: spacing.lg,
  },
  withdrawText: {
    color: colors.espressoBrown,
    fontSize: typography.small,
    fontWeight: fontWeight.bold,
  },
  section: {
    marginBottom: spacing.xl,
  },
  sectionHeadingRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    color: colors.espressoBrown,
    fontSize: typography.heading,
    fontWeight: fontWeight.bold,
    marginBottom: spacing.sm,
  },
  sectionHeadingRowTitle: {marginBottom: 0},
  sectionLink: {
    color: colors.flameRed,
    fontSize: typography.small,
    fontWeight: fontWeight.semibold,
    paddingVertical: spacing.xs,
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  metricCard: {
    ...elevation.card,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    flexBasis: '46%',
    flexGrow: 1,
    minHeight: 126,
    padding: spacing.md,
  },
  metricIcon: {
    alignItems: 'center',
    backgroundColor: colors.surfaceWarm,
    borderRadius: radius.pill,
    height: 38,
    justifyContent: 'center',
    marginBottom: spacing.sm,
    width: 38,
  },
  metricValue: {
    color: colors.espressoBrown,
    fontSize: typography.hero,
    fontWeight: fontWeight.extrabold,
  },
  metricLabel: {
    color: colors.textSecondary,
    fontSize: typography.small,
    marginTop: spacing.xxs,
  },
  card: {
    ...elevation.card,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  rangeSelector: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.pill,
    flexDirection: 'row',
    padding: spacing.xxs,
  },
  rangeChip: {
    alignItems: 'center',
    borderRadius: radius.pill,
    justifyContent: 'center',
    minHeight: 36,
    paddingHorizontal: spacing.sm,
  },
  rangeChipSelected: {backgroundColor: colors.flameRed},
  rangeChipText: {
    color: colors.textSecondary,
    fontSize: typography.tiny,
    fontWeight: fontWeight.semibold,
  },
  rangeChipTextSelected: {color: colors.white},
  chartCanvas: {
    backgroundColor: colors.surfaceBase,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: 34,
    justifyContent: 'space-between',
    marginTop: spacing.md,
    minHeight: 190,
    overflow: 'hidden',
    paddingVertical: spacing.lg,
  },
  chartGridLine: {
    backgroundColor: colors.border,
    height: 1,
    width: '100%',
  },
  chartEmptyOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  chartEmptyTitle: {
    color: colors.textPrimary,
    fontSize: typography.body,
    fontWeight: fontWeight.semibold,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  chartEmptyMessage: {
    color: colors.textSecondary,
    fontSize: typography.small,
    marginTop: spacing.xxs,
    textAlign: 'center',
  },
  quickActionGrid: {gap: spacing.sm},
  quickAction: {
    alignItems: 'center',
    backgroundColor: colors.white,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 74,
    padding: spacing.sm,
  },
  quickActionIcon: {
    alignItems: 'center',
    backgroundColor: colors.surfaceWarm,
    borderRadius: radius.md,
    height: 46,
    justifyContent: 'center',
    width: 46,
  },
  quickActionCopy: {flex: 1},
  quickActionTitle: {
    color: colors.textPrimary,
    fontSize: typography.body,
    fontWeight: fontWeight.bold,
  },
  quickActionSubtitle: {
    color: colors.textSecondary,
    fontSize: typography.tiny,
    marginTop: spacing.xxs,
  },
  orderSkeletons: {gap: spacing.sm},
  orderList: {gap: spacing.sm},
  orderCard: {
    ...elevation.card,
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 78,
    padding: spacing.md,
  },
  orderIcon: {
    alignItems: 'center',
    backgroundColor: colors.surfaceWarm,
    borderRadius: radius.md,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  orderCopy: {flex: 1},
  orderReference: {
    color: colors.textPrimary,
    fontSize: typography.body,
    fontWeight: fontWeight.bold,
  },
  orderStatus: {
    color: colors.flameRed,
    fontSize: typography.small,
    fontWeight: fontWeight.semibold,
    marginTop: spacing.xxs,
  },
  unavailableState: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  unavailableIcon: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.pill,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  unavailableCopy: {flex: 1},
  unavailableTitle: {
    color: colors.textPrimary,
    fontSize: typography.body,
    fontWeight: fontWeight.semibold,
  },
  unavailableMessage: {
    color: colors.textSecondary,
    fontSize: typography.small,
    marginTop: spacing.xxs,
  },
  inlineRetryButton: {
    alignSelf: 'flex-start',
    justifyContent: 'center',
    marginTop: spacing.sm,
    minHeight: touchTarget.minimum,
  },
  inlineRetryText: {
    color: colors.flameRed,
    fontSize: typography.small,
    fontWeight: fontWeight.bold,
  },
  insightBanner: {
    alignItems: 'flex-start',
    backgroundColor: colors.surfaceWarmStrong,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
  },
  insightIcon: {
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: radius.pill,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  insightCopy: {flex: 1},
  insightEyebrow: {
    color: colors.flameRed,
    fontSize: typography.tiny,
    fontWeight: fontWeight.bold,
    textTransform: 'uppercase',
  },
  insightTitle: {
    color: colors.espressoBrown,
    fontSize: typography.body,
    fontWeight: fontWeight.bold,
    marginTop: spacing.xxs,
  },
  insightMessage: {
    color: colors.textSecondary,
    fontSize: typography.small,
    marginTop: spacing.xxs,
  },
  pressed: {opacity: 0.65},
});
