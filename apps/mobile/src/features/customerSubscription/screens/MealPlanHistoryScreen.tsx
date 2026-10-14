import React from 'react';
import {Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {
  borderWidth,
  colors,
  fontWeight,
  radius,
  spacing,
  textDefaults,
  typography,
} from '../../../design/tokens';
import {
  Badge,
  Chip,
  ListSkeleton,
  RecoverableErrorBanner,
  ScreenShell,
  TerminalState,
} from '../../../shared/components';
import {billingPeriodLabel} from '../../mealPlans/domain/mealPlanSchedule';
import {IconTile, MealPlanPageHeader} from '../components/MealPlanUi';
import {isPastSubscription, subscriptionStatusPresentation} from '../domain/mealPlanPresentation';
import type {MealPlanStackParamList} from '../navigation/CustomerMealPlanNavigator';
import {useMySubscriptionsQuery, usePublicMealPlansQuery} from '../query/mealPlanQueries';

type Props = NativeStackScreenProps<MealPlanStackParamList, 'MealPlanHistory'>;
type Filter = 'all' | 'EXPIRED' | 'CANCELLED';

const FILTERS: {key: Filter; label: string; empty: string}[] = [
  {key: 'all', label: 'All', empty: 'No past plans yet'},
  {key: 'EXPIRED', label: 'Completed', empty: 'No completed plans yet'},
  {key: 'CANCELLED', label: 'Cancelled', empty: 'No cancelled plans yet'},
];

/** Ended and cancelled plans; each opens the plan page, which has no controls for them. */
export function MealPlanHistoryScreen({navigation}: Props) {
  const subscriptionsQuery = useMySubscriptionsQuery();
  const plans = usePublicMealPlansQuery().data ?? [];
  const [filter, setFilter] = React.useState<Filter>('all');
  const past = (subscriptionsQuery.data ?? [])
    .filter(item => isPastSubscription(item.status) && (filter === 'all' || item.status === filter))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return (
    <ScreenShell edges={['top', 'bottom']} keyboardAvoiding={false} testID="meal-plan-history">
      <MealPlanPageHeader title="History" onBack={navigation.goBack} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.chips}>
          {FILTERS.map(option => (
            <Chip
              key={option.key}
              label={option.label}
              onPress={() => setFilter(option.key)}
              selected={filter === option.key}
            />
          ))}
        </View>
        {subscriptionsQuery.isLoading ? (
          <ListSkeleton count={3} />
        ) : subscriptionsQuery.isError ? (
          <RecoverableErrorBanner
            message="Your plans could not be loaded. Check your connection and try again."
            onRetry={() => {
              subscriptionsQuery.refetch();
            }}
          />
        ) : past.length === 0 ? (
          <TerminalState title={FILTERS.find(option => option.key === filter)!.empty} />
        ) : (
          <View style={styles.list}>
            {past.map((subscription, index) => {
              const plan = plans.find(candidate => candidate.id === subscription.planId);
              const name = subscription.planName ?? plan?.name ?? 'Meal plan';
              const period = subscription.billingPeriod ?? plan?.billingPeriod;
              const frequency = period ? billingPeriodLabel(period) : null;
              const status = subscriptionStatusPresentation(subscription.status);
              return (
                <Pressable
                  key={subscription.id}
                  accessibilityLabel={[name, frequency, status.label].filter(Boolean).join(', ')}
                  accessibilityRole="button"
                  onPress={() => navigation.navigate('MyMealPlan', {subscriptionId: subscription.id})}
                  style={({pressed}) => [styles.row, index > 0 && styles.divider, pressed && styles.pressed]}>
                  <IconTile
                    icon="calendar"
                    square
                    background={colors.surfaceMuted}
                    color={colors.textSecondary}
                  />
                  <View style={styles.rowText}>
                    <Text
                      allowFontScaling={textDefaults.allowFontScaling}
                      numberOfLines={1}
                      style={styles.name}>
                      {name}
                    </Text>
                    {frequency ? (
                      <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.secondary}>
                        {frequency}
                      </Text>
                    ) : null}
                  </View>
                  <Badge label={status.label} tone="neutral" style={styles.badge} />
                </Pressable>
              );
            })}
          </View>
        )}
        <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.note}>
          Tap a plan to see its meals, payments and receipts. To order from the same chef again, use Explore plans.
        </Text>
      </ScrollView>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  content: {gap: spacing.md, padding: spacing.md, paddingBottom: spacing.xl},
  chips: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs},
  list: {
    overflow: 'hidden',
    borderRadius: radius.lg,
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  row: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
  },
  divider: {borderTopWidth: borderWidth.standard, borderTopColor: colors.border},
  pressed: {backgroundColor: colors.surfaceMuted},
  rowText: {flex: 1, minWidth: 0},
  name: {color: colors.textPrimary, fontSize: typography.body, fontWeight: fontWeight.semibold},
  secondary: {color: colors.textSecondary, fontSize: typography.small},
  badge: {alignSelf: 'center'},
  note: {paddingHorizontal: spacing.xxs, color: colors.textSecondary, fontSize: typography.small},
});
