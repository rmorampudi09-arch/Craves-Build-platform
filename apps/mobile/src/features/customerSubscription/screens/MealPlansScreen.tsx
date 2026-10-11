import React from 'react';
import {Alert, FlatList, Image, StyleSheet, Text, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import type {CustomerMealPlanStackParamList} from '../../../app/navigation/types';
import {
  borderWidth,
  colors,
  fontWeight,
  iconSize,
  radius,
  spacing,
  textDefaults,
  typography,
} from '../../../design/tokens';
import {
  Badge,
  Button,
  Chip,
  Icon,
  IconButton,
  InputField,
  ListSkeleton,
  OfflineNotice,
  PressableCard,
  RecoverableErrorBanner,
  ScreenShell,
  TerminalState,
} from '../../../shared/components';
import {
  billingUnit,
  type BillingUnit,
  type PlanScheduleSummary,
} from '../../mealPlans/domain/mealPlanSchedule';
import type {
  CustomerSubscription,
  PublicSubscriptionPlan,
} from '../api/customerSubscriptionApi';
import {
  FoodTypePill,
  MealPlanHeader,
  MealPlanPhoto,
  PlanRating,
} from '../components/MealPlanUi';
import {
  formatPlanPrice,
  subscriptionStatusPresentation,
} from '../domain/mealPlanPresentation';
import {
  useMySubscriptionsQuery,
  usePlanCover,
  usePublicMealPlansQuery,
} from '../query/mealPlanQueries';
import {
  alertProfileIncomplete,
  useInterruptedPaymentRecovery,
} from '../state/useSubscriptionCheckout';

type Props = NativeStackScreenProps<CustomerMealPlanStackParamList, 'MealPlans'>;
type Filter = 'all' | BillingUnit;

const FILTERS: {key: Filter; label: string}[] = [
  {key: 'all', label: 'All'},
  {key: 'week', label: 'Weekly'},
  {key: 'month', label: 'Monthly'},
];
const BANNER_IMAGE = require('../../../assets/home/home-kitchen-picks.jpg');

function mealMeta(summary: PlanScheduleSummary): string {
  const meals = `${summary.mealCount} ${summary.mealCount === 1 ? 'meal' : 'meals'}`;
  return [meals, summary.slotLabels.join(', ')].filter(Boolean).join(' · ');
}

function PlanCard({
  plan,
  search,
  onMatch,
  onPress,
}: {
  plan: PublicSubscriptionPlan;
  /** Lower-cased search text; the card hides itself when neither its name nor its kitchen matches. */
  search: string;
  /** Tells the list whether this card matches the search, so it can say when none do. */
  onMatch: (planId: string, matches: boolean) => void;
  onPress: () => void;
}) {
  const {imageUrl, kitchenName, summary, rating} = usePlanCover(plan.id);
  const matches = !search || `${plan.name}\n${kitchenName ?? ''}`.toLowerCase().includes(search);
  React.useEffect(() => onMatch(plan.id, matches), [matches, onMatch, plan.id]);
  if (!matches) {
    return null;
  }
  const unit = billingUnit(plan.billingPeriod);
  const price = formatPlanPrice(plan.amount, plan.currency);
  return (
    <PressableCard
      accessibilityLabel={`${plan.name}, ${price} per ${unit}`}
      onPress={onPress}
      style={styles.planCard}
      testID={`meal-plan-card-${plan.id}`}>
      <MealPlanPhoto uri={imageUrl} size={{width: 104, height: 120}} />
      <View style={styles.planBody}>
        <View style={styles.planTitleRow}>
          <Text
            allowFontScaling={textDefaults.allowFontScaling}
            numberOfLines={2}
            style={styles.planName}>
            {plan.name}
          </Text>
          <PlanRating rating={rating} />
        </View>
        {kitchenName ? (
          <Text
            allowFontScaling={textDefaults.allowFontScaling}
            numberOfLines={1}
            style={styles.secondary}>
            By {kitchenName}
          </Text>
        ) : null}
        {summary ? (
          <View style={styles.metaRow}>
            <FoodTypePill foodType={summary.foodType} />
            <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.secondary}>
              {mealMeta(summary)}
            </Text>
          </View>
        ) : null}
        <View style={styles.priceRow}>
          <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.price}>
            {price}
            <Text style={styles.per}> / {unit}</Text>
          </Text>
          <Icon
            name="chevron-right"
            size={iconSize.lg}
            color={colors.textSecondary}
            surface={false}
          />
        </View>
      </View>
    </PressableCard>
  );
}

function SubscriptionCard({
  subscription,
  planName,
  onPress,
}: {
  subscription: CustomerSubscription;
  planName: string;
  onPress: () => void;
}) {
  const status = subscriptionStatusPresentation(subscription.status);
  return (
    <PressableCard
      accessibilityLabel={`${planName}, ${status.label}`}
      onPress={onPress}
      style={styles.subscriptionCard}>
      <Text
        allowFontScaling={textDefaults.allowFontScaling}
        numberOfLines={1}
        style={styles.subscriptionName}>
        {planName}
      </Text>
      <Badge label={status.label} tone={status.tone} />
      <Icon
        name="chevron-right"
        size={iconSize.md}
        color={colors.textSecondary}
        surface={false}
      />
    </PressableCard>
  );
}

export function MealPlansScreen({navigation}: Props) {
  const plansQuery = usePublicMealPlansQuery();
  const subscriptionsQuery = useMySubscriptionsQuery();
  const [filter, setFilter] = React.useState<Filter>('all');
  const [searchText, setSearchText] = React.useState('');
  const recovery = useInterruptedPaymentRecovery();
  const search = searchText.trim().toLowerCase();
  const [unmatched, setUnmatched] = React.useState<ReadonlySet<string>>(() => new Set());
  const onMatch = React.useCallback((planId: string, matches: boolean) => {
    setUnmatched(current => {
      if (current.has(planId) !== matches) {
        return current;
      }
      const next = new Set(current);
      if (matches) {
        next.delete(planId);
      } else {
        next.add(planId);
      }
      return next;
    });
  }, []);

  const plans = plansQuery.data ?? [];
  const visiblePlans =
    filter === 'all' ? plans : plans.filter(plan => billingUnit(plan.billingPeriod) === filter);
  const noMatches =
    search !== '' && visiblePlans.length > 0 && visiblePlans.every(plan => unmatched.has(plan.id));

  const subscriptions = subscriptionsQuery.data ?? [];
  const current = subscriptions.filter(subscription => subscription.status !== 'CANCELLED');
  // One plan: a header shortcut. Several: compact cards instead.
  const myPlanTarget = current.length > 1 ? null : current[0] ?? subscriptions[0] ?? null;
  const openMyPlan = (subscription: CustomerSubscription) =>
    navigation.navigate('MyMealPlan', {subscriptionId: subscription.id});
  const planNameOf = (subscription: CustomerSubscription) =>
    subscription.planName ??
    plans.find(plan => plan.id === subscription.planId)?.name ??
    'Meal plan';

  const resumePayment = async () => {
    const outcome = await recovery.resume();
    if (outcome?.kind === 'paid') {
      navigation.navigate('MealPlanActivated', {subscriptionId: outcome.subscriptionId});
    } else if (outcome?.kind === 'profile-incomplete') {
      alertProfileIncomplete();
    } else if (outcome?.kind === 'processing') {
      Alert.alert('Payment processing', "Payment is processing. We'll update your plan shortly.");
    } else if (outcome) {
      Alert.alert('Meal-plan payment', outcome.message);
    }
  };

  const settled = recovery.settled;
  const header = (
    <View style={styles.listHeader}>
      {recovery.pending ? (
        <OfflineNotice
          message="Payment in progress. You have an unfinished meal-plan payment."
          retryLabel={recovery.busy ? 'Resuming payment…' : 'Resume payment'}
          onRetry={() => {
            if (!recovery.busy) {
              resumePayment();
            }
          }}
        />
      ) : null}
      {settled ? (
        <View
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
          style={[styles.recovered, settled.kind === 'paid' && styles.recoveredPaid]}>
          <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.recoveredText}>
            {settled.kind === 'paid'
              ? 'Your meal plan payment went through.'
              : "Your last meal plan payment didn't complete. You can try again safely."}
          </Text>
          <View style={styles.recoveredActions}>
            {settled.kind === 'paid' ? (
              <Button
                label="View My Plan"
                onPress={() => {
                  recovery.dismissSettled();
                  navigation.navigate('MyMealPlan', {subscriptionId: settled.subscriptionId});
                }}
                style={styles.recoveredAction}
                variant="ghost"
              />
            ) : null}
            <Button
              label="Dismiss"
              onPress={recovery.dismissSettled}
              style={styles.recoveredAction}
              variant="ghost"
            />
          </View>
        </View>
      ) : null}
      {current.length > 1 ? (
        <View style={styles.subscriptions}>
          <Text
            accessibilityRole="header"
            allowFontScaling={textDefaults.allowFontScaling}
            style={styles.sectionTitle}>
            My plans
          </Text>
          {current.map(subscription => (
            <SubscriptionCard
              key={subscription.id}
              subscription={subscription}
              planName={planNameOf(subscription)}
              onPress={() => openMyPlan(subscription)}
            />
          ))}
        </View>
      ) : null}
      <InputField
        accessibilityLabel="Search meal plans"
        autoCapitalize="none"
        autoCorrect={false}
        leftIcon="search"
        onChangeText={setSearchText}
        placeholder="Search meal plans, chefs…"
        returnKeyType="search"
        value={searchText}
      />
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
      <View style={styles.banner}>
        <View style={styles.bannerCopy}>
          <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.bannerTitle}>
            Healthy homemade meals, every day
          </Text>
          <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.secondary}>
            Wholesome. Fresh. Crafted with love.
          </Text>
        </View>
        <Image
          accessibilityIgnoresInvertColors
          accessible={false}
          resizeMode="cover"
          source={BANNER_IMAGE}
          style={styles.bannerImage}
        />
      </View>
      {plansQuery.isError ? (
        <RecoverableErrorBanner
          message="Meal plans could not be loaded. Check your connection and try again."
          onRetry={() => {
            plansQuery.refetch();
          }}
        />
      ) : null}
    </View>
  );

  return (
    <ScreenShell edges={['top', 'bottom']} keyboardAvoiding={false} testID="meal-plans">
      <MealPlanHeader
        title="Meal Plans"
        onBack={() => navigation.getParent()?.goBack()}
        right={
          myPlanTarget ? (
            <IconButton
              accessibilityLabel="My plans"
              icon="calendar-check"
              onPress={() => openMyPlan(myPlanTarget)}
            />
          ) : undefined
        }
      />
      <FlatList
        contentContainerStyle={styles.content}
        data={visiblePlans}
        keyExtractor={plan => plan.id}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          plansQuery.isLoading ? (
            <ListSkeleton count={3} />
          ) : plansQuery.isError ? null : (
            <TerminalState
              title={
                filter === 'all'
                  ? 'No meal plans yet'
                  : `No ${filter === 'week' ? 'weekly' : 'monthly'} meal plans yet`
              }
            />
          )
        }
        ListFooterComponent={
          noMatches ? <TerminalState title={`No plans match "${searchText.trim()}".`} /> : null
        }
        ListHeaderComponent={header}
        renderItem={({item}) => (
          <PlanCard
            plan={item}
            search={search}
            onMatch={onMatch}
            onPress={() => navigation.navigate('MealPlanDetail', {planId: item.id})}
          />
        )}
        showsVerticalScrollIndicator={false}
      />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
  },
  listHeader: {gap: spacing.md, paddingTop: spacing.xs, paddingBottom: spacing.md},
  recovered: {
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: borderWidth.standard,
    borderColor: colors.warning,
    backgroundColor: colors.warningSoft,
  },
  recoveredPaid: {borderColor: colors.success, backgroundColor: colors.successSoft},
  recoveredText: {color: colors.textPrimary, fontSize: typography.small},
  recoveredActions: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md},
  recoveredAction: {paddingHorizontal: spacing.none},
  subscriptions: {gap: spacing.xs},
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: typography.button,
    fontWeight: fontWeight.bold,
  },
  subscriptionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  subscriptionName: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: typography.body,
    fontWeight: fontWeight.semibold,
  },
  chips: {flexDirection: 'row', gap: spacing.xs},
  banner: {
    minHeight: 104,
    flexDirection: 'row',
    overflow: 'hidden',
    borderRadius: radius.lg,
    backgroundColor: colors.cream,
  },
  bannerCopy: {flex: 1, justifyContent: 'center', gap: spacing.xxs, padding: spacing.md},
  bannerTitle: {
    color: colors.textPrimary,
    fontSize: typography.heading,
    fontWeight: fontWeight.extrabold,
  },
  bannerImage: {width: 128, alignSelf: 'stretch'},
  // Bottom margin, not list gap: a card hidden by search must not leave a gap behind.
  planCard: {flexDirection: 'row', gap: spacing.sm, padding: spacing.sm, marginBottom: spacing.md},
  planBody: {flex: 1, minWidth: 0, gap: spacing.xxs},
  planTitleRow: {flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs},
  planName: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: typography.button,
    fontWeight: fontWeight.bold,
  },
  secondary: {color: colors.textSecondary, fontSize: typography.small},
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xxs,
  },
  priceRow: {
    marginTop: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  price: {
    color: colors.flameRedAccessible,
    fontSize: typography.heading,
    fontWeight: fontWeight.bold,
  },
  per: {
    color: colors.textSecondary,
    fontSize: typography.small,
    fontWeight: fontWeight.regular,
  },
});
