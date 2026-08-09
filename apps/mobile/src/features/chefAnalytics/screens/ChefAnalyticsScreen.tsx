import React from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
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
import {ChefHeader} from '../../chefShell/components/ChefHeader';
import {
  CHEF_ANALYTICS_REFERENCE_RANGE_OPTIONS,
  chefAnalyticsUnavailableAccessibilityLabel,
  getChefAnalyticsBlockedPresentation,
  type ChefAnalyticsMetricId,
} from '../domain/chefAnalyticsPresentation';

const METRIC_ICONS: Readonly<Record<ChefAnalyticsMetricId, IconName>> = {
  earnings: 'analytics',
  orders: 'orders',
  itemsSold: 'chef',
  averageOrderValue: 'analytics',
  newCustomers: 'account',
  rating: 'star',
};

function UnavailableMetricCard({
  id,
  label,
}: {
  id: ChefAnalyticsMetricId;
  label: string;
}) {
  return (
    <View
      accessible
      accessibilityLabel={chefAnalyticsUnavailableAccessibilityLabel(label)}
      style={styles.metricCard}>
      <View style={styles.metricHeader}>
        <View style={styles.metricIcon}>
          <Icon color={colors.flameRed} name={METRIC_ICONS[id]} size={20} />
        </View>
        <Text style={styles.metricUnavailable}>Unavailable</Text>
      </View>
      <Text style={styles.metricValue}>—</Text>
      <Text style={styles.metricLabel}>{label}</Text>
      <View accessibilityElementsHidden style={styles.sparklinePlaceholder}>
        <View style={styles.sparklineRule} />
      </View>
      <Text style={styles.metricTrend}>Trend data unavailable</Text>
    </View>
  );
}

function SectionHeading({title, subtitle}: {title: string; subtitle?: string}) {
  return (
    <View style={styles.sectionHeading}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>
        {title}
      </Text>
      {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

function EarningsUnavailableCard() {
  return (
    <View
      accessible
      accessibilityLabel="Earnings trend unavailable. No chart values are shown because complete analytics data is not available."
      style={styles.chartCard}>
      <View style={styles.chartHeader}>
        <View>
          <Text style={styles.chartEyebrow}>Earnings</Text>
          <Text style={styles.chartValue}>—</Text>
        </View>
        <View style={styles.chartIcon}>
          <Icon color={colors.flameRed} name="analytics" size={22} />
        </View>
      </View>
      <View accessibilityElementsHidden style={styles.chartPlaceholder}>
        <View style={styles.chartGridLine} />
        <View style={styles.chartGridLine} />
        <View style={styles.chartGridLine} />
        <View style={styles.chartNoSeriesMarker}>
          <Icon color={colors.placeholder} name="analytics" size={28} />
        </View>
      </View>
      <Text style={styles.unavailableTitle}>Earnings trend unavailable</Text>
      <Text style={styles.unavailableCopy}>
        No estimated series or comparison trend is shown.
      </Text>
    </View>
  );
}

function OrderStatusUnavailableCard() {
  return (
    <View
      accessible
      accessibilityLabel="Order status breakdown unavailable. No status percentages or counts are estimated."
      style={styles.chartCard}>
      <View style={styles.chartHeader}>
        <View>
          <Text style={styles.chartEyebrow}>Orders</Text>
          <Text style={styles.chartTitle}>Order status</Text>
        </View>
        <View style={styles.chartIcon}>
          <Icon color={colors.flameRed} name="orders" size={22} />
        </View>
      </View>
      <View style={styles.donutState}>
        <View accessibilityElementsHidden style={styles.donutPlaceholder}>
          <Text style={styles.donutDash}>—</Text>
        </View>
        <View style={styles.donutCopy}>
          <Text style={styles.unavailableTitle}>Breakdown unavailable</Text>
          <Text style={styles.unavailableCopy}>
            Status totals remain blank until complete date-ranged reporting data is available.
          </Text>
        </View>
      </View>
    </View>
  );
}

function TopItemsUnavailableCard() {
  return (
    <View
      accessible
      accessibilityLabel="Top selling items unavailable. No item ranking is shown without complete item-performance data."
      style={styles.listCard}>
      <View style={styles.emptyIcon}>
        <Icon color={colors.flameRed} name="chef" size={24} />
      </View>
      <View style={styles.flex}>
        <Text style={styles.unavailableTitle}>Item performance unavailable</Text>
        <Text style={styles.unavailableCopy}>
          No ranking is shown without complete item-performance data.
        </Text>
      </View>
    </View>
  );
}

function DetailedReportUnavailableBanner() {
  return (
    <View style={styles.insightBanner}>
      <View style={styles.insightIcon}>
        <Icon color={colors.espressoBrown} name="analytics" size={22} />
      </View>
      <View style={styles.flex}>
        <Text style={styles.insightTitle}>Detailed reports unavailable</Text>
        <Text style={styles.insightCopy}>
          Report details and export are disabled until complete analytics reporting is supported.
        </Text>
        <Pressable
          accessibilityHint="Detailed analytics reports are unavailable right now."
          accessibilityLabel="View detailed report unavailable"
          accessibilityRole="button"
          accessibilityState={{disabled: true}}
          disabled
          style={styles.disabledReportButton}>
          <Text style={styles.disabledReportButtonText}>View detailed report</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function ChefAnalyticsScreen() {
  const model = React.useMemo(getChefAnalyticsBlockedPresentation, []);

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      <ChefHeader title="Analytics" />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>
        <View style={styles.intro}>
          <Text accessibilityRole="header" style={styles.title}>
            Analytics
          </Text>
          <Text style={styles.subtitle}>
            Track earnings, orders, sales and customer activity from one place.
          </Text>
        </View>

        <View
          accessible
          accessibilityLabel="Analytics data unavailable. No estimated business metrics are shown."
          accessibilityLiveRegion="polite"
          style={styles.blockedBanner}>
          <View style={styles.blockedIcon}>
            <Icon color={colors.warning} name="analytics" size={22} />
          </View>
          <View style={styles.flex}>
            <Text style={styles.blockedTitle}>Analytics data is unavailable</Text>
            <Text style={styles.blockedCopy}>
              Complete summary and date-range data is not available yet. Craves will not estimate missing business metrics.
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <SectionHeading
            subtitle="The reference state is this week. Range changes are unavailable until date filtering is supported."
            title="Date range"
          />
          <ScrollView
            accessibilityRole="tablist"
            contentContainerStyle={styles.rangeRow}
            horizontal
            showsHorizontalScrollIndicator={false}>
            {CHEF_ANALYTICS_REFERENCE_RANGE_OPTIONS.map(option => {
              const selected = model.selectedReferenceRange === option.id;
              return (
                <Pressable
                  accessibilityHint="Date filtering is unavailable right now."
                  accessibilityRole="tab"
                  accessibilityState={{
                    disabled: !model.dateRangeInteractionAvailable,
                    selected,
                  }}
                  disabled={!model.dateRangeInteractionAvailable}
                  key={option.id}
                  style={[
                    styles.rangeChip,
                    selected && styles.rangeChipSelected,
                    !model.dateRangeInteractionAvailable && styles.rangeChipDisabled,
                  ]}>
                  <Text
                    style={[
                      styles.rangeChipText,
                      selected && styles.rangeChipTextSelected,
                    ]}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        <View style={styles.section}>
          <SectionHeading
            subtitle="Values remain blank rather than using guessed totals or trends."
            title="Performance overview"
          />
          <View style={styles.metricGrid}>
            {model.metrics.map(metric => (
              <UnavailableMetricCard
                id={metric.id}
                key={metric.id}
                label={metric.label}
              />
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <SectionHeading
            subtitle="No chart points are rendered without complete reporting data."
            title="Earnings trend"
          />
          <EarningsUnavailableCard />
        </View>

        <View style={styles.section}>
          <SectionHeading title="Order status" />
          <OrderStatusUnavailableCard />
        </View>

        <View style={styles.section}>
          <SectionHeading
            subtitle="Rankings require complete item-performance data."
            title="Top selling items"
          />
          <TopItemsUnavailableCard />
        </View>

        <View style={styles.section}>
          <DetailedReportUnavailableBanner />
        </View>

        <View style={styles.contractFootnote}>
          <Icon color={colors.textSecondary} name="shield" size={18} />
          <Text style={styles.contractFootnoteText}>
            Complete analytics reporting is not available yet. Existing Chef Orders, Earnings and Menu data remains available in their own operational screens.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.surfaceWarm,
  },
  content: {
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  flex: {flex: 1},
  intro: {marginBottom: spacing.md},
  title: {
    color: colors.espressoBrown,
    fontSize: typography.hero,
    fontWeight: fontWeight.bold,
  },
  subtitle: {
    marginTop: spacing.xs,
    color: colors.textSecondary,
    fontSize: typography.body,
  },
  blockedBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.warning,
    borderRadius: radius.lg,
    backgroundColor: colors.warningSoft,
    padding: spacing.md,
    ...elevation.card,
  },
  blockedIcon: {
    width: touchTarget.minimum,
    height: touchTarget.minimum,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.white,
  },
  blockedTitle: {
    color: colors.espressoBrown,
    fontSize: typography.body,
    fontWeight: fontWeight.bold,
  },
  blockedCopy: {
    marginTop: spacing.xxs,
    color: colors.textSecondary,
    fontSize: typography.small,
  },
  section: {marginTop: spacing.xl},
  sectionHeading: {marginBottom: spacing.sm},
  sectionTitle: {
    color: colors.espressoBrown,
    fontSize: typography.heading,
    fontWeight: fontWeight.bold,
  },
  sectionSubtitle: {
    marginTop: spacing.xxs,
    color: colors.textSecondary,
    fontSize: typography.small,
  },
  rangeRow: {gap: spacing.xs, paddingRight: spacing.md},
  rangeChip: {
    minHeight: touchTarget.minimum,
    minWidth: 104,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.pill,
    backgroundColor: colors.white,
  },
  rangeChipSelected: {
    borderColor: colors.flameRed,
    backgroundColor: colors.errorSoft,
  },
  rangeChipDisabled: {opacity: 0.72},
  rangeChipText: {
    color: colors.textSecondary,
    fontSize: typography.small,
    fontWeight: fontWeight.semibold,
  },
  rangeChipTextSelected: {color: colors.flameRed},
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  metricCard: {
    width: '48%',
    minWidth: 152,
    flexGrow: 1,
    minHeight: 164,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    padding: spacing.md,
    ...elevation.card,
  },
  metricHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.xs,
  },
  metricIcon: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.errorSoft,
  },
  metricUnavailable: {
    color: colors.textSecondary,
    fontSize: typography.tiny,
    fontWeight: fontWeight.semibold,
  },
  metricValue: {
    marginTop: spacing.sm,
    color: colors.espressoBrown,
    fontSize: typography.hero,
    fontWeight: fontWeight.bold,
  },
  metricLabel: {
    marginTop: spacing.xxs,
    color: colors.textPrimary,
    fontSize: typography.small,
    fontWeight: fontWeight.semibold,
  },
  sparklinePlaceholder: {
    height: 16,
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  sparklineRule: {
    width: '100%',
    borderTopWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
  },
  metricTrend: {
    marginTop: spacing.xxs,
    color: colors.placeholder,
    fontSize: typography.tiny,
  },
  chartCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    padding: spacing.md,
    ...elevation.card,
  },
  chartHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  chartEyebrow: {
    color: colors.textSecondary,
    fontSize: typography.small,
    fontWeight: fontWeight.semibold,
  },
  chartValue: {
    marginTop: spacing.xxs,
    color: colors.espressoBrown,
    fontSize: typography.hero,
    fontWeight: fontWeight.bold,
  },
  chartTitle: {
    marginTop: spacing.xxs,
    color: colors.espressoBrown,
    fontSize: typography.body,
    fontWeight: fontWeight.bold,
  },
  chartIcon: {
    width: touchTarget.minimum,
    height: touchTarget.minimum,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.errorSoft,
  },
  chartPlaceholder: {
    height: 170,
    justifyContent: 'space-evenly',
    marginTop: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    overflow: 'hidden',
  },
  chartGridLine: {
    marginHorizontal: spacing.md,
    borderTopWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
  },
  chartNoSeriesMarker: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unavailableTitle: {
    marginTop: spacing.sm,
    color: colors.espressoBrown,
    fontSize: typography.body,
    fontWeight: fontWeight.bold,
  },
  unavailableCopy: {
    marginTop: spacing.xxs,
    color: colors.textSecondary,
    fontSize: typography.small,
  },
  donutState: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  donutPlaceholder: {
    width: 104,
    height: 104,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: spacing.sm,
    borderColor: colors.border,
    borderRadius: radius.pill,
    backgroundColor: colors.white,
  },
  donutDash: {
    color: colors.placeholder,
    fontSize: typography.heading,
    fontWeight: fontWeight.bold,
  },
  donutCopy: {flex: 1},
  listCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    padding: spacing.md,
    ...elevation.card,
  },
  emptyIcon: {
    width: touchTarget.minimum,
    height: touchTarget.minimum,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.errorSoft,
  },
  insightBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.lg,
    backgroundColor: colors.creamDeep,
    padding: spacing.md,
  },
  insightIcon: {
    width: touchTarget.minimum,
    height: touchTarget.minimum,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.white,
  },
  insightTitle: {
    color: colors.espressoBrown,
    fontSize: typography.body,
    fontWeight: fontWeight.bold,
  },
  insightCopy: {
    marginTop: spacing.xxs,
    color: colors.textSecondary,
    fontSize: typography.small,
  },
  disabledReportButton: {
    minHeight: touchTarget.minimum,
    alignSelf: 'flex-start',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.muted,
  },
  disabledReportButtonText: {
    color: colors.placeholder,
    fontSize: typography.small,
    fontWeight: fontWeight.semibold,
  },
  contractFootnote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    marginTop: spacing.xl,
    paddingHorizontal: spacing.xs,
  },
  contractFootnoteText: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: typography.tiny,
  },
});