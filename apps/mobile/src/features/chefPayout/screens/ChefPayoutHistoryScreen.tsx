import React from 'react';
import {Alert, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {ChefProfileStackParamList} from '../../../app/navigation/types';
import {
  borderWidth,
  colors,
  elevation,
  fontWeight,
  iconSize,
  radius,
  spacing,
  touchTarget,
  typography,
} from '../../../design/tokens';
import {Icon} from '../../../shared/components/Icon';
import {ChefHeader} from '../../chefShell/components/ChefHeader';
import {
  CHEF_PAYOUT_HISTORY_MESSAGES,
  createChefPayoutHistoryBoundaryState,
  selectChefPayoutHistoryTab,
  type ChefPayoutHistoryTab,
} from '../domain/chefPayoutHistoryBoundary';

type PayoutNavigation = NativeStackNavigationProp<
  ChefProfileStackParamList,
  'ChefPayoutHistory'
>;

function MetricCard({label, message}: {label: string; message: string}) {
  return (
    <View accessibilityLabel={`${label} unavailable. ${message}`} style={styles.metricCard}>
      <Text style={styles.metricValue}>—</Text>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text numberOfLines={3} style={styles.metricReason}>
        Unavailable
      </Text>
    </View>
  );
}

function TabButton({
  label,
  tab,
  selectedTab,
  onPress,
}: {
  label: string;
  tab: ChefPayoutHistoryTab;
  selectedTab: ChefPayoutHistoryTab;
  onPress: (tab: ChefPayoutHistoryTab) => void;
}) {
  const selected = tab === selectedTab;
  return (
    <Pressable
      accessibilityLabel={`${label} tab`}
      accessibilityRole="tab"
      accessibilityState={{selected}}
      onPress={() => onPress(tab)}
      style={({pressed}) => [
        styles.tabButton,
        selected && styles.tabButtonSelected,
        pressed && styles.pressed,
      ]}>
      <Text style={[styles.tabText, selected && styles.tabTextSelected]}>{label}</Text>
    </Pressable>
  );
}

function BoundaryAction({
  label,
  message,
  onExplain,
}: {
  label: string;
  message: string;
  onExplain: (title: string, message: string) => void;
}) {
  return (
    <Pressable
      accessibilityLabel={`${label}. Currently unavailable`}
      accessibilityHint="Opens the exact backend-contract reason"
      accessibilityRole="button"
      onPress={() => onExplain(`${label} unavailable`, message)}
      style={({pressed}) => [styles.boundaryAction, pressed && styles.pressed]}>
      <Text style={styles.boundaryActionText}>{label}</Text>
      <Icon name="chevron-right" size={iconSize.xs} color={colors.textSecondary} />
    </Pressable>
  );
}

export function ChefPayoutHistoryScreen() {
  const navigation = useNavigation<PayoutNavigation>();
  const [viewState, setViewState] = React.useState(createChefPayoutHistoryBoundaryState);

  const explain = React.useCallback((title: string, message: string) => {
    Alert.alert(title, message, [{text: 'OK'}]);
  }, []);

  const selectTab = React.useCallback((tab: ChefPayoutHistoryTab) => {
    setViewState(current => selectChefPayoutHistoryTab(current, tab));
  }, []);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <ChefHeader title="Payout history" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Pressable
          accessibilityLabel="Back to Chef profile"
          accessibilityRole="button"
          hitSlop={spacing.xs}
          onPress={() => navigation.goBack()}
          style={({pressed}) => [styles.backButton, pressed && styles.pressed]}>
          <Icon name="arrow-left" size={iconSize.sm} color={colors.espressoBrown} />
          <Text style={styles.backText}>Profile</Text>
        </Pressable>

        <View style={styles.titleBlock}>
          <Text accessibilityRole="header" style={styles.title}>
            Earnings & payouts
          </Text>
          <Text style={styles.subtitle}>
            Financial values stay empty until Craves has exact approved payout contracts for this Chef account.
          </Text>
        </View>

        <View accessibilityRole="tablist" style={styles.tabs}>
          <TabButton
            label="Earnings Overview"
            tab="overview"
            selectedTab={viewState.selectedTab}
            onPress={selectTab}
          />
          <TabButton
            label="Transactions"
            tab="transactions"
            selectedTab={viewState.selectedTab}
            onPress={selectTab}
          />
        </View>

        {viewState.selectedTab === 'overview' ? (
          <>
            <View accessibilityRole="summary" style={styles.balanceCard}>
              <View style={styles.balanceHeader}>
                <View style={styles.balanceIcon}>
                  <Icon name="analytics" size={iconSize.lg} color={colors.white} />
                </View>
                <Text style={styles.balanceEyebrow}>Available balance</Text>
              </View>
              <Text style={styles.balanceValue}>—</Text>
              <Text style={styles.balanceMessage}>
                {CHEF_PAYOUT_HISTORY_MESSAGES.availableBalance}
              </Text>
              <Pressable
                accessibilityLabel="Withdraw Now unavailable"
                accessibilityHint={CHEF_PAYOUT_HISTORY_MESSAGES.withdraw}
                accessibilityRole="button"
                accessibilityState={{disabled: true}}
                disabled
                style={styles.withdrawButton}>
                <Text style={styles.withdrawButtonText}>Withdraw Now</Text>
              </Pressable>
              <Text style={styles.withdrawReason}>
                Withdrawal is disabled until authoritative balance, eligibility, confirmation, authentication and initiation contracts exist.
              </Text>
            </View>

            <View style={styles.metricRow}>
              <MetricCard
                label="Earnings"
                message={CHEF_PAYOUT_HISTORY_MESSAGES.earningsSummary}
              />
              <MetricCard
                label="Paid out"
                message={CHEF_PAYOUT_HISTORY_MESSAGES.payoutTransactions}
              />
              <MetricCard
                label="Balance"
                message={CHEF_PAYOUT_HISTORY_MESSAGES.availableBalance}
              />
            </View>

            <View style={styles.sectionCard}>
              <View style={styles.sectionHeadingRow}>
                <View style={styles.sectionHeadingCopy}>
                  <Text style={styles.sectionTitle}>Recent payout</Text>
                  <Text style={styles.sectionCaption}>Latest settlement</Text>
                </View>
                <View style={styles.unavailablePill}>
                  <Text style={styles.unavailablePillText}>Unavailable</Text>
                </View>
              </View>
              <Text style={styles.sectionMessage}>
                {CHEF_PAYOUT_HISTORY_MESSAGES.payoutTransactions}
              </Text>
            </View>

            <View style={styles.sectionCard}>
              <View style={styles.sectionHeadingRow}>
                <View style={styles.sectionHeadingCopy}>
                  <Text style={styles.sectionTitle}>Payout trend</Text>
                  <Text style={styles.sectionCaption}>Authoritative payout series only</Text>
                </View>
                <BoundaryAction
                  label="Date range"
                  message={CHEF_PAYOUT_HISTORY_MESSAGES.dateFilter}
                  onExplain={explain}
                />
              </View>
              <View accessibilityRole="alert" style={styles.chartUnavailable}>
                <Icon name="analytics" size={iconSize.xl} color={colors.placeholder} />
                <Text style={styles.chartTitle}>Payout trend unavailable</Text>
                <Text style={styles.chartMessage}>
                  {CHEF_PAYOUT_HISTORY_MESSAGES.payoutSeries}
                </Text>
              </View>
            </View>
          </>
        ) : (
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeadingRow}>
              <View style={styles.sectionHeadingCopy}>
                <Text style={styles.sectionTitle}>Transactions</Text>
                <Text style={styles.sectionCaption}>Settlement and payout status history</Text>
              </View>
              <BoundaryAction
                label="Date range"
                message={CHEF_PAYOUT_HISTORY_MESSAGES.dateFilter}
                onExplain={explain}
              />
            </View>
            <View accessibilityRole="alert" style={styles.transactionUnavailable}>
              <View style={styles.transactionIcon}>
                <Icon name="orders" size={iconSize.lg} color={colors.flameRed} />
              </View>
              <Text style={styles.chartTitle}>Transaction history unavailable</Text>
              <Text style={styles.chartMessage}>
                {CHEF_PAYOUT_HISTORY_MESSAGES.payoutTransactions}
              </Text>
              <Text style={styles.detailBoundaryText}>
                {CHEF_PAYOUT_HISTORY_MESSAGES.transactionDetail}
              </Text>
            </View>
          </View>
        )}

        <View style={styles.integrationCard}>
          <Icon name="shield" size={iconSize.lg} color={colors.warning} />
          <View style={styles.integrationCopy}>
            <Text style={styles.integrationTitle}>Protected financial boundary</Text>
            <Text style={styles.integrationText}>{CHEF_PAYOUT_HISTORY_MESSAGES.source}</Text>
          </View>
        </View>

        <View style={styles.secondaryActions}>
          <BoundaryAction
            label="Refresh payout data"
            message={CHEF_PAYOUT_HISTORY_MESSAGES.source}
            onExplain={explain}
          />
          <BoundaryAction
            label="Payout help"
            message={`${CHEF_PAYOUT_HISTORY_MESSAGES.source} ${CHEF_PAYOUT_HISTORY_MESSAGES.withdraw}`}
            onExplain={explain}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {flex: 1, backgroundColor: colors.surfaceWarm},
  content: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  backButton: {
    alignSelf: 'flex-start',
    minHeight: touchTarget.minimum,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingRight: spacing.md,
  },
  backText: {
    color: colors.espressoBrown,
    fontSize: typography.body,
    fontWeight: fontWeight.semibold,
  },
  titleBlock: {gap: spacing.xs},
  title: {
    color: colors.espressoBrown,
    fontSize: typography.hero,
    fontWeight: fontWeight.extrabold,
  },
  subtitle: {color: colors.textSecondary, fontSize: typography.small},
  tabs: {
    flexDirection: 'row',
    borderRadius: radius.pill,
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
    backgroundColor: colors.white,
    padding: spacing.xxs,
  },
  tabButton: {
    flex: 1,
    minHeight: touchTarget.minimum,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
  },
  tabButtonSelected: {backgroundColor: colors.flameRed},
  tabText: {
    color: colors.textSecondary,
    fontSize: typography.small,
    fontWeight: fontWeight.semibold,
    textAlign: 'center',
  },
  tabTextSelected: {color: colors.white},
  balanceCard: {
    borderRadius: radius.xl,
    backgroundColor: colors.espressoBrown,
    padding: spacing.lg,
    ...elevation.card,
  },
  balanceHeader: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm},
  balanceIcon: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  balanceEyebrow: {
    color: colors.creamDeep,
    fontSize: typography.body,
    fontWeight: fontWeight.semibold,
  },
  balanceValue: {
    marginTop: spacing.md,
    color: colors.white,
    fontSize: typography.title,
    fontWeight: fontWeight.extrabold,
  },
  balanceMessage: {
    marginTop: spacing.xs,
    color: colors.creamDeep,
    fontSize: typography.small,
  },
  withdrawButton: {
    minHeight: touchTarget.comfortable,
    marginTop: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    opacity: 0.62,
  },
  withdrawButtonText: {
    color: colors.textSecondary,
    fontSize: typography.button,
    fontWeight: fontWeight.bold,
  },
  withdrawReason: {
    marginTop: spacing.sm,
    color: colors.creamDeep,
    fontSize: typography.tiny,
    textAlign: 'center',
  },
  metricRow: {flexDirection: 'row', gap: spacing.xs},
  metricCard: {
    flex: 1,
    minHeight: 108,
    borderRadius: radius.lg,
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
    backgroundColor: colors.white,
    padding: spacing.sm,
  },
  metricValue: {
    color: colors.espressoBrown,
    fontSize: typography.hero,
    fontWeight: fontWeight.extrabold,
  },
  metricLabel: {
    marginTop: spacing.xxs,
    color: colors.textPrimary,
    fontSize: typography.small,
    fontWeight: fontWeight.semibold,
  },
  metricReason: {marginTop: spacing.xs, color: colors.textSecondary, fontSize: typography.tiny},
  sectionCard: {
    borderRadius: radius.lg,
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
    backgroundColor: colors.white,
    padding: spacing.md,
    ...elevation.card,
  },
  sectionHeadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  sectionHeadingCopy: {flex: 1, minWidth: 0},
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: typography.heading,
    fontWeight: fontWeight.bold,
  },
  sectionCaption: {marginTop: spacing.xxs, color: colors.textSecondary, fontSize: typography.tiny},
  sectionMessage: {marginTop: spacing.md, color: colors.textSecondary, fontSize: typography.small},
  unavailablePill: {
    borderRadius: radius.pill,
    backgroundColor: colors.warningSoft,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  unavailablePillText: {
    color: colors.warning,
    fontSize: typography.tiny,
    fontWeight: fontWeight.bold,
  },
  boundaryAction: {
    minHeight: touchTarget.minimum,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xxs,
    paddingHorizontal: spacing.xs,
  },
  boundaryActionText: {
    color: colors.flameRed,
    fontSize: typography.small,
    fontWeight: fontWeight.semibold,
  },
  chartUnavailable: {
    minHeight: 190,
    marginTop: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    padding: spacing.lg,
  },
  chartTitle: {
    marginTop: spacing.sm,
    color: colors.textPrimary,
    fontSize: typography.body,
    fontWeight: fontWeight.bold,
    textAlign: 'center',
  },
  chartMessage: {
    marginTop: spacing.xs,
    color: colors.textSecondary,
    fontSize: typography.small,
    textAlign: 'center',
  },
  transactionUnavailable: {
    minHeight: 240,
    marginTop: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    padding: spacing.lg,
  },
  transactionIcon: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceWarmStrong,
  },
  detailBoundaryText: {
    marginTop: spacing.sm,
    color: colors.textSecondary,
    fontSize: typography.tiny,
    textAlign: 'center',
  },
  integrationCard: {
    flexDirection: 'row',
    gap: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: borderWidth.standard,
    borderColor: colors.warning,
    backgroundColor: colors.warningSoft,
    padding: spacing.md,
  },
  integrationCopy: {flex: 1},
  integrationTitle: {
    color: colors.textPrimary,
    fontSize: typography.body,
    fontWeight: fontWeight.bold,
  },
  integrationText: {marginTop: spacing.xxs, color: colors.textSecondary, fontSize: typography.small},
  secondaryActions: {
    borderRadius: radius.lg,
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
    backgroundColor: colors.white,
    overflow: 'hidden',
  },
  pressed: {opacity: 0.62},
});
