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
  createChefSubscriptionPlanBoundaryState,
  type ChefSubscriptionPlanBoundaryState,
} from '../domain/chefSubscriptionPlanBoundary';

type SubscriptionNavigation = NativeStackNavigationProp<
  ChefProfileStackParamList,
  'ChefSubscriptionPlan'
>;

type BoundaryReason = {
  reason: string;
};

function UnavailablePill() {
  return (
    <View accessibilityLabel="Unavailable" style={styles.unavailablePill}>
      <Text style={styles.unavailablePillText}>Unavailable</Text>
    </View>
  );
}

function CapabilityRow({
  label,
  boundary,
  last = false,
}: {
  label: string;
  boundary: BoundaryReason;
  last?: boolean;
}) {
  return (
    <View style={[styles.capabilityRow, !last && styles.capabilityRowBorder]}>
      <View style={styles.capabilityCopy}>
        <Text style={styles.capabilityLabel}>{label}</Text>
        <Text style={styles.capabilityReason}>{boundary.reason}</Text>
      </View>
      <Text accessibilityLabel={`${label} unavailable`} style={styles.capabilityValue}>
        —
      </Text>
    </View>
  );
}

function ExplainAction({
  label,
  reason,
  onExplain,
}: {
  label: string;
  reason: string;
  onExplain: (title: string, reason: string) => void;
}) {
  return (
    <Pressable
      accessibilityHint="Shows why this subscription action cannot run yet"
      accessibilityLabel={`${label}, unavailable`}
      accessibilityRole="button"
      onPress={() => onExplain(`${label} unavailable`, reason)}
      style={({pressed}) => [styles.explainAction, pressed && styles.pressed]}>
      <View style={styles.explainActionCopy}>
        <Text style={styles.explainActionTitle}>{label}</Text>
        <Text style={styles.explainActionSubtitle}>Backend contract required</Text>
      </View>
      <Icon name="chevron-right" size={iconSize.xs} color={colors.textSecondary} />
    </Pressable>
  );
}

function PlanCatalogueUnavailable({
  boundary,
}: {
  boundary: ChefSubscriptionPlanBoundaryState['plans'];
}) {
  return (
    <View accessibilityRole="alert" style={styles.planUnavailableCard}>
      <View style={styles.planUnavailableIcon}>
        <Icon name="ticket" size={iconSize.xl} color={colors.flameRed} />
      </View>
      <Text style={styles.planUnavailableTitle}>Plan options unavailable</Text>
      <Text style={styles.planUnavailableText}>{boundary.reason}</Text>
      <Text style={styles.planUnavailableFootnote}>
        Craves will not copy reference-only tier names, prices or benefits into live Chef account data.
      </Text>
    </View>
  );
}

export function ChefSubscriptionPlanScreen() {
  const navigation = useNavigation<SubscriptionNavigation>();
  const boundary = React.useMemo(createChefSubscriptionPlanBoundaryState, []);

  const explain = React.useCallback((title: string, reason: string) => {
    Alert.alert(title, reason, [{text: 'OK'}]);
  }, []);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <ChefHeader title="Subscription plan" />
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
            Choose the right plan for your kitchen
          </Text>
          <Text style={styles.subtitle}>
            Plan details stay empty until Craves can read an approved Chef platform-subscription contract.
          </Text>
        </View>

        <View accessibilityRole="alert" style={styles.contractBanner}>
          <Icon name="shield" size={iconSize.lg} color={colors.warning} />
          <View style={styles.contractBannerCopy}>
            <Text style={styles.contractBannerTitle}>Protected subscription boundary</Text>
            <Text style={styles.contractBannerText}>
              Customer meal-plan APIs are not used here because they describe a different product contract.
            </Text>
          </View>
        </View>

        <View style={styles.currentPlanCard}>
          <View style={styles.currentPlanHeader}>
            <View style={styles.currentPlanIcon}>
              <Icon name="ticket" size={iconSize.lg} color={colors.white} />
            </View>
            <View style={styles.currentPlanHeaderCopy}>
              <Text style={styles.currentPlanEyebrow}>Current plan</Text>
              <Text style={styles.currentPlanName}>—</Text>
            </View>
            <UnavailablePill />
          </View>
          <Text style={styles.currentPlanReason}>{boundary.currentPlan.reason}</Text>
          <View style={styles.currentPlanMetaRow}>
            <View style={styles.currentPlanMeta}>
              <Text style={styles.currentPlanMetaLabel}>Billing cycle</Text>
              <Text style={styles.currentPlanMetaValue}>—</Text>
            </View>
            <View style={styles.currentPlanMetaDivider} />
            <View style={styles.currentPlanMeta}>
              <Text style={styles.currentPlanMetaLabel}>Status</Text>
              <Text style={styles.currentPlanMetaValue}>—</Text>
            </View>
          </View>
        </View>

        <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>Plans</Text>
          <Text style={styles.sectionCaption}>
            Pricing and eligibility must come from the Chef subscription service.
          </Text>
        </View>
        <PlanCatalogueUnavailable boundary={boundary.plans} />

        <View style={styles.savingsBanner}>
          <View style={styles.savingsIcon}>
            <Icon name="ticket" size={iconSize.lg} color={colors.flameRed} />
          </View>
          <View style={styles.savingsCopy}>
            <Text style={styles.savingsTitle}>Annual savings</Text>
            <Text style={styles.savingsText}>
              Savings cannot be calculated or advertised until billing-cycle pricing is authoritative.
            </Text>
          </View>
          <Text accessibilityLabel="Annual savings unavailable" style={styles.savingsValue}>
            —
          </Text>
        </View>

        <View style={styles.comparisonCard}>
          <View style={styles.sectionHeadingCompact}>
            <Text style={styles.sectionTitle}>Compare plan benefits</Text>
            <Text style={styles.sectionCaption}>
              No entitlement is presented as active unless the backend enforces it.
            </Text>
          </View>
          <View style={styles.comparisonBody}>
            <CapabilityRow label="Pricing & billing" boundary={boundary.pricing} />
            <CapabilityRow label="Eligibility" boundary={boundary.eligibility} />
            <CapabilityRow label="Benefits & entitlements" boundary={boundary.featureMatrix} last />
          </View>
        </View>

        <View style={styles.manageCard}>
          <View style={styles.manageHeadingRow}>
            <View style={styles.manageHeadingCopy}>
              <Text style={styles.sectionTitle}>Manage your plan</Text>
              <Text style={styles.sectionCaption}>
                Changes stay non-runnable until confirmation, proration, effective-date and idempotency semantics exist.
              </Text>
            </View>
            <Icon name="shield" size={iconSize.lg} color={colors.warning} />
          </View>

          <Pressable
            accessibilityLabel="Manage plan unavailable"
            accessibilityHint={boundary.purchaseManageState.changePlan.reason}
            accessibilityRole="button"
            accessibilityState={{disabled: true}}
            disabled
            style={styles.manageDisabledButton}>
            <Text style={styles.manageDisabledButtonText}>Manage plan</Text>
          </Pressable>

          <View style={styles.manageActions}>
            <ExplainAction
              label="Change plan"
              reason={boundary.purchaseManageState.changePlan.reason}
              onExplain={explain}
            />
            <View style={styles.divider} />
            <ExplainAction
              label="Cancel plan"
              reason={boundary.purchaseManageState.cancelPlan.reason}
              onExplain={explain}
            />
            <View style={styles.divider} />
            <ExplainAction
              label="Renew plan"
              reason={boundary.purchaseManageState.renewPlan.reason}
              onExplain={explain}
            />
          </View>
        </View>

        <Pressable
          accessibilityHint="Shows why Chef subscription support is not connected yet"
          accessibilityLabel="Get subscription help, unavailable"
          accessibilityRole="button"
          onPress={() => explain('Subscription help unavailable', boundary.support.reason)}
          style={({pressed}) => [styles.supportCard, pressed && styles.pressed]}>
          <View style={styles.supportIcon}>
            <Icon name="phone" size={iconSize.lg} color={colors.flameRed} />
          </View>
          <View style={styles.supportCopy}>
            <Text style={styles.supportTitle}>Need help with your plan?</Text>
            <Text style={styles.supportText}>
              Open the current integration reason before attempting support from this screen.
            </Text>
          </View>
          <Icon name="chevron-right" size={iconSize.sm} color={colors.textSecondary} />
        </Pressable>
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
  subtitle: {
    color: colors.textSecondary,
    fontSize: typography.small,
  },
  contractBanner: {
    flexDirection: 'row',
    gap: spacing.sm,
    borderRadius: radius.md,
    borderWidth: borderWidth.standard,
    borderColor: colors.warning,
    backgroundColor: colors.warningSoft,
    padding: spacing.md,
  },
  contractBannerCopy: {flex: 1, minWidth: 0},
  contractBannerTitle: {
    color: colors.textPrimary,
    fontSize: typography.body,
    fontWeight: fontWeight.bold,
  },
  contractBannerText: {
    marginTop: spacing.xxs,
    color: colors.textSecondary,
    fontSize: typography.small,
  },
  currentPlanCard: {
    borderRadius: radius.xl,
    backgroundColor: colors.espressoBrown,
    padding: spacing.lg,
    ...elevation.card,
  },
  currentPlanHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  currentPlanIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  currentPlanHeaderCopy: {flex: 1, minWidth: 0},
  currentPlanEyebrow: {
    color: colors.creamDeep,
    fontSize: typography.small,
    fontWeight: fontWeight.semibold,
  },
  currentPlanName: {
    marginTop: spacing.xxs,
    color: colors.white,
    fontSize: typography.hero,
    fontWeight: fontWeight.extrabold,
  },
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
  currentPlanReason: {
    marginTop: spacing.md,
    color: colors.creamDeep,
    fontSize: typography.small,
  },
  currentPlanMetaRow: {
    minHeight: 70,
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: spacing.md,
  },
  currentPlanMeta: {flex: 1},
  currentPlanMetaDivider: {
    width: borderWidth.standard,
    height: 34,
    marginHorizontal: spacing.md,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  currentPlanMetaLabel: {
    color: colors.creamDeep,
    fontSize: typography.tiny,
  },
  currentPlanMetaValue: {
    marginTop: spacing.xxs,
    color: colors.white,
    fontSize: typography.heading,
    fontWeight: fontWeight.bold,
  },
  sectionHeading: {gap: spacing.xxs, marginTop: spacing.xs},
  sectionHeadingCompact: {gap: spacing.xxs},
  sectionTitle: {
    color: colors.espressoBrown,
    fontSize: typography.heading,
    fontWeight: fontWeight.bold,
  },
  sectionCaption: {
    color: colors.textSecondary,
    fontSize: typography.small,
  },
  planUnavailableCard: {
    minHeight: 210,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.lg,
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
    backgroundColor: colors.white,
    padding: spacing.lg,
    ...elevation.card,
  },
  planUnavailableIcon: {
    width: 58,
    height: 58,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceWarm,
  },
  planUnavailableTitle: {
    marginTop: spacing.md,
    color: colors.textPrimary,
    fontSize: typography.heading,
    fontWeight: fontWeight.bold,
    textAlign: 'center',
  },
  planUnavailableText: {
    marginTop: spacing.xs,
    color: colors.textSecondary,
    fontSize: typography.small,
    textAlign: 'center',
  },
  planUnavailableFootnote: {
    marginTop: spacing.sm,
    color: colors.warning,
    fontSize: typography.tiny,
    fontWeight: fontWeight.semibold,
    textAlign: 'center',
  },
  savingsBanner: {
    minHeight: 92,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: borderWidth.standard,
    borderColor: colors.borderStrong,
    backgroundColor: colors.creamDeep,
    padding: spacing.md,
  },
  savingsIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
  },
  savingsCopy: {flex: 1, minWidth: 0},
  savingsTitle: {
    color: colors.espressoBrown,
    fontSize: typography.body,
    fontWeight: fontWeight.bold,
  },
  savingsText: {
    marginTop: spacing.xxs,
    color: colors.textSecondary,
    fontSize: typography.small,
  },
  savingsValue: {
    color: colors.flameRed,
    fontSize: typography.hero,
    fontWeight: fontWeight.extrabold,
  },
  comparisonCard: {
    borderRadius: radius.lg,
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
    backgroundColor: colors.white,
    padding: spacing.md,
    ...elevation.card,
  },
  comparisonBody: {
    marginTop: spacing.md,
    borderRadius: radius.md,
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  capabilityRow: {
    minHeight: 92,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surfaceBase,
  },
  capabilityRowBorder: {
    borderBottomWidth: borderWidth.standard,
    borderBottomColor: colors.border,
  },
  capabilityCopy: {flex: 1, minWidth: 0},
  capabilityLabel: {
    color: colors.textPrimary,
    fontSize: typography.body,
    fontWeight: fontWeight.semibold,
  },
  capabilityReason: {
    marginTop: spacing.xxs,
    color: colors.textSecondary,
    fontSize: typography.tiny,
  },
  capabilityValue: {
    color: colors.placeholder,
    fontSize: typography.hero,
    fontWeight: fontWeight.bold,
  },
  manageCard: {
    borderRadius: radius.lg,
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
    backgroundColor: colors.white,
    padding: spacing.md,
    ...elevation.card,
  },
  manageHeadingRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  manageHeadingCopy: {flex: 1, minWidth: 0},
  manageDisabledButton: {
    minHeight: touchTarget.comfortable,
    marginTop: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    opacity: 0.65,
  },
  manageDisabledButtonText: {
    color: colors.textSecondary,
    fontSize: typography.button,
    fontWeight: fontWeight.bold,
  },
  manageActions: {
    marginTop: spacing.sm,
    borderRadius: radius.md,
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  explainAction: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surfaceBase,
  },
  explainActionCopy: {flex: 1, minWidth: 0},
  explainActionTitle: {
    color: colors.textPrimary,
    fontSize: typography.body,
    fontWeight: fontWeight.semibold,
  },
  explainActionSubtitle: {
    marginTop: spacing.xxs,
    color: colors.textSecondary,
    fontSize: typography.tiny,
  },
  divider: {
    height: borderWidth.standard,
    backgroundColor: colors.border,
  },
  supportCard: {
    minHeight: 92,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
    backgroundColor: colors.white,
    padding: spacing.md,
  },
  supportIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceWarm,
  },
  supportCopy: {flex: 1, minWidth: 0},
  supportTitle: {
    color: colors.textPrimary,
    fontSize: typography.body,
    fontWeight: fontWeight.bold,
  },
  supportText: {
    marginTop: spacing.xxs,
    color: colors.textSecondary,
    fontSize: typography.small,
  },
  pressed: {opacity: 0.62},
});
