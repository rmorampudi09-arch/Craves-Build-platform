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
import type {ChefOperationalOrder} from '../../chefShell/api/chefOperationalApi';
import {ChefHeader} from '../../chefShell/components/ChefHeader';
import {
  CHEF_DASHBOARD_SALES_RANGES,
  formatChefDashboardOrderStatus,
  getChefDashboardGreeting,
  shortChefDashboardOrderReference,
  type ChefDashboardSalesRange,
} from '../domain/chefDashboardPresentation';
import {useChefDashboardModel} from '../state/useChefDashboardModel';

type SourceStatus = 'pending' | 'error' | 'success';

interface MetricCardProps {
  icon: IconName;
  label: string;
  sourceStatus: SourceStatus;
  value: number;
}

function MetricCard({icon, label, sourceStatus, value}: MetricCardProps) {
  return (
    <View style={styles.metricCard}>
      <View style={styles.metricIcon}>
        <Icon color={colors.flameRed} name={icon} size={20} />
      </View>
      {sourceStatus === 'pending' ? (
        <SkeletonBlock height={28} width={44} />
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
  icon: IconName;
  onPress: () => void;
  subtitle: string;
  title: string;
}

function QuickAction({icon, onPress, subtitle, title}: QuickActionProps) {
  return (
    <Pressable
      accessibilityLabel={`${title}. ${subtitle}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({pressed}) => [styles.actionRow, pressed && styles.pressed]}>
      <View style={styles.actionIcon}>
        <Icon color={colors.flameRed} name={icon} size={22} />
      </View>
      <View style={styles.flex}>
        <Text style={styles.actionTitle}>{title}</Text>
        <Text style={styles.actionSubtitle}>{subtitle}</Text>
      </View>
      <Icon color={colors.textSecondary} name="chevron-right" size={18} />
    </Pressable>
  );
}

interface UnavailableProps {
  icon: IconName;
  message: string;
  title: string;
}

function Unavailable({icon, message, title}: UnavailableProps) {
  return (
    <View style={styles.unavailableRow}>
      <View style={styles.unavailableIcon}>
        <Icon color={colors.textSecondary} name={icon} size={21} />
      </View>
      <View style={styles.flex}>
        <Text style={styles.unavailableTitle}>{title}</Text>
        <Text style={styles.unavailableMessage}>{message}</Text>
      </View>
    </View>
  );
}

function ActiveOrderRow({
  onPress,
  order,
}: {
  onPress: () => void;
  order: ChefOperationalOrder;
}) {
  const reference = shortChefDashboardOrderReference(order.id);
  return (
    <Pressable
      accessibilityLabel={`Open Orders for active order ${reference}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({pressed}) => [styles.orderRow, pressed && styles.pressed]}>
      <View style={styles.orderIcon}>
        <Icon color={colors.flameRed} name="orders" size={20} />
      </View>
      <View style={styles.flex}>
        <Text style={styles.orderReference}>{reference}</Text>
        <Text style={styles.orderStatus}>
          {formatChefDashboardOrderStatus(order.status)}
        </Text>
      </View>
      <Icon color={colors.textSecondary} name="chevron-right" size={18} />
    </Pressable>
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

  const firstName = displayName.split(/\s+/)[0] || 'Chef';
  const greeting = React.useMemo(
    () => getChefDashboardGreeting(new Date().getHours()),
    [],
  );
  const hasSourceError = Object.values(sources).some(
    sourceStatus => sourceStatus === 'error',
  );

  const navigate = React.useCallback(
    (routeName: ChefTabRouteName) => navigation.navigate(routeName),
    [navigation],
  );
  const refreshDashboard = React.useCallback(() => {
    refresh().catch(() => undefined);
  }, [refresh]);

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      <ChefHeader title="Dashboard" />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            colors={[colors.flameRed]}
            onRefresh={refreshDashboard}
            refreshing={isRefreshing}
            tintColor={colors.flameRed}
          />
        }
        showsVerticalScrollIndicator={false}>
        <View style={styles.greetingBlock}>
          <Text accessibilityRole="header" style={styles.greeting}>
            {greeting}, {firstName}
          </Text>
          <Text style={styles.subtitle}>Here is your kitchen at a glance.</Text>
        </View>

        {hasSourceError ? (
          <View style={styles.errorBanner}>
            <Icon color={colors.error} name="wifi-off" size={20} />
            <View style={styles.flex}>
              <Text style={styles.errorTitle}>Some live data is unavailable</Text>
              <Text style={styles.errorMessage}>
                Existing dashboard information is kept where available.
              </Text>
            </View>
            <Pressable
              accessibilityLabel="Retry dashboard refresh"
              accessibilityRole="button"
              disabled={isRefreshing}
              onPress={refreshDashboard}
              style={({pressed}) => [
                styles.retryButton,
                (pressed || isRefreshing) && styles.pressed,
              ]}>
              <Text style={styles.retryText}>
                {isRefreshing ? 'Refreshing' : 'Retry'}
              </Text>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.walletCard}>
          <View style={styles.rowBetween}>
            <View>
              <Text style={styles.walletEyebrow}>Wallet balance</Text>
              <Text style={styles.walletAmount}>—</Text>
            </View>
            <View style={styles.walletIcon}>
              <Icon color={colors.white} name="analytics" size={22} />
            </View>
          </View>
          <Text style={styles.walletMessage}>
            Balance and withdrawal eligibility are unavailable from the current payout contract.
          </Text>
          <View style={styles.walletFooter}>
            <Text style={styles.walletStatus}>
              {sources.earnings === 'pending'
                ? 'Refreshing earnings ledger…'
                : sources.earnings === 'error'
                  ? 'Earnings ledger unavailable'
                  : 'Earnings ledger connected'}
            </Text>
            <Pressable
              accessibilityLabel="Withdraw unavailable"
              accessibilityRole="button"
              accessibilityState={{disabled: true}}
              disabled
              style={styles.withdrawButton}>
              <Text style={styles.withdrawText}>Withdraw</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Orders overview</Text>
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
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitleCompact}>Sales overview</Text>
            <Pressable
              accessibilityLabel="Open Analytics"
              accessibilityRole="button"
              onPress={() => navigate('Analytics')}
              style={({pressed}) => pressed && styles.pressed}>
              <Text style={styles.sectionLink}>View analytics</Text>
            </Pressable>
          </View>
          <View style={styles.card}>
            <View accessibilityRole="tablist" style={styles.rangeSelector}>
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
                        styles.rangeText,
                        selected && styles.rangeTextSelected,
                      ]}>
                      {range.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.chartState}>
              <Icon color={colors.placeholder} name="analytics" size={28} />
              <Text style={styles.chartTitle}>Sales data unavailable</Text>
              <Text style={styles.chartMessage}>
                The approved sales time-series contract is not available yet.
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick actions</Text>
          <View style={styles.actionList}>
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
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitleCompact}>Active orders</Text>
            <Pressable
              accessibilityLabel="View all orders"
              accessibilityRole="button"
              onPress={() => navigate('Orders')}
              style={({pressed}) => pressed && styles.pressed}>
              <Text style={styles.sectionLink}>View all</Text>
            </Pressable>
          </View>
          {sources.orders === 'pending' && data.orders.active.length === 0 ? (
            <View style={styles.skeletonList}>
              <SkeletonBlock borderRadius={radius.lg} height={78} />
              <SkeletonBlock borderRadius={radius.lg} height={78} />
            </View>
          ) : sources.orders === 'error' && data.orders.active.length === 0 ? (
            <View style={styles.card}>
              <Unavailable
                icon="wifi-off"
                message="Refresh the dashboard to try loading operational orders again."
                title="Active orders unavailable"
              />
              <Pressable
                accessibilityLabel="Retry active orders"
                accessibilityRole="button"
                disabled={isRefreshing}
                onPress={refreshDashboard}
                style={({pressed}) => [
                  styles.inlineRetry,
                  (pressed || isRefreshing) && styles.pressed,
                ]}>
                <Text style={styles.inlineRetryText}>
                  {isRefreshing ? 'Refreshing…' : 'Try again'}
                </Text>
              </Pressable>
            </View>
          ) : data.orders.active.length === 0 ? (
            <View style={styles.card}>
              <Unavailable
                icon="orders"
                message="New accepted orders will appear here automatically."
                title="No active orders"
              />
            </View>
          ) : (
            <View style={styles.actionList}>
              {data.orders.active.slice(0, 3).map(order => (
                <ActiveOrderRow
                  key={order.id}
                  onPress={() => navigate('Orders')}
                  order={order}
                />
              ))}
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent reviews</Text>
          <View style={styles.card}>
            <Unavailable
              icon="star"
              message="Recent reviews will appear when an approved Chef reviews read model is available."
              title="Reviews unavailable"
            />
          </View>
        </View>

        <View style={styles.insightBanner}>
          <View style={styles.insightIcon}>
            <Icon color={colors.flameRed} name="analytics" size={22} />
          </View>
          <View style={styles.flex}>
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
  safeArea: {flex: 1, backgroundColor: colors.surfaceMuted},
  content: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  flex: {flex: 1},
  pressed: {opacity: 0.65},
  greetingBlock: {marginBottom: spacing.lg},
  greeting: {
    color: colors.espressoBrown,
    fontSize: typography.hero,
    fontWeight: fontWeight.bold,
  },
  subtitle: {
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
    justifyContent: 'center',
    minHeight: touchTarget.minimum,
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
  rowBetween: {
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
    marginTop: spacing.md,
  },
  walletStatus: {
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
  section: {marginBottom: spacing.xl},
  sectionHeader: {
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
  sectionTitleCompact: {
    color: colors.espressoBrown,
    fontSize: typography.heading,
    fontWeight: fontWeight.bold,
  },
  sectionLink: {
    color: colors.flameRed,
    fontSize: typography.small,
    fontWeight: fontWeight.semibold,
    paddingVertical: spacing.xs,
  },
  metricGrid: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm},
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
    backgroundColor: colors.iconSurface,
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
  rangeText: {
    color: colors.textSecondary,
    fontSize: typography.tiny,
    fontWeight: fontWeight.semibold,
  },
  rangeTextSelected: {color: colors.white},
  chartState: {
    alignItems: 'center',
    backgroundColor: colors.surfaceBase,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    justifyContent: 'center',
    marginTop: spacing.md,
    minHeight: 190,
    paddingHorizontal: spacing.xl,
  },
  chartTitle: {
    color: colors.textPrimary,
    fontSize: typography.body,
    fontWeight: fontWeight.semibold,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  chartMessage: {
    color: colors.textSecondary,
    fontSize: typography.small,
    marginTop: spacing.xxs,
    textAlign: 'center',
  },
  actionList: {gap: spacing.sm},
  actionRow: {
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
  actionIcon: {
    alignItems: 'center',
    backgroundColor: colors.iconSurface,
    borderRadius: radius.md,
    height: 46,
    justifyContent: 'center',
    width: 46,
  },
  actionTitle: {
    color: colors.textPrimary,
    fontSize: typography.body,
    fontWeight: fontWeight.bold,
  },
  actionSubtitle: {
    color: colors.textSecondary,
    fontSize: typography.tiny,
    marginTop: spacing.xxs,
  },
  skeletonList: {gap: spacing.sm},
  orderRow: {
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
    backgroundColor: colors.iconSurface,
    borderRadius: radius.md,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
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
  unavailableRow: {alignItems: 'center', flexDirection: 'row', gap: spacing.sm},
  unavailableIcon: {
    alignItems: 'center',
    backgroundColor: colors.iconSurface,
    borderRadius: radius.pill,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
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
  inlineRetry: {
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
    backgroundColor: colors.white,
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
});
