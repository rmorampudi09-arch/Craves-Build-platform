import React from 'react';
import {Alert, FlatList, Image, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {
  borderWidth,
  colors,
  elevation,
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
  type IconName,
} from '../../../shared/components';
import {UnderlineTabs} from '../../../shared/components/UnderlineTabs';
import {
  billingPeriodLabel,
  billingUnit,
  weeksPerBill,
  type BillingUnit,
  type PlanScheduleSummary,
} from '../../mealPlans/domain/mealPlanSchedule';
import type {
  CustomerSubscription,
  CustomerSubscriptionOccurrence,
  PublicSubscriptionPlan,
} from '../api/customerSubscriptionApi';
import {
  FoodTypePill,
  IconTile,
  MealPlanPageHeader,
  MealPlanPhoto,
  PlanRating,
} from '../components/MealPlanUi';
import {
  formatMealPlanDate,
  formatPlanPrice,
  isPastSubscription,
  nextOccurrence,
  occurrenceDishNames,
  occurrenceTimeLabel,
  subscriptionStatusPresentation,
  todayIso,
} from '../domain/mealPlanPresentation';
import type {MealPlanStackParamList} from '../navigation/CustomerMealPlanNavigator';
import {
  resolveApiImageUrl,
  useMySubscriptionsQuery,
  usePlanCover,
  usePublicMealPlansQuery,
  useHasMealPlanLocation,
  useNearbyMealPlansQuery,
} from '../query/mealPlanQueries';
import {usePlanControls} from '../state/usePlanControls';
import {
  alertProfileIncomplete,
  useInterruptedPaymentRecovery,
} from '../state/useSubscriptionCheckout';

type Props = NativeStackScreenProps<MealPlanStackParamList, 'MealPlans'>;
type Filter = 'all' | BillingUnit;
type Tab = 'mine' | 'explore';

const TABS: {key: Tab; label: string}[] = [
  {key: 'mine', label: 'My plans'},
  {key: 'explore', label: 'Explore plans'},
];
const FILTERS: {key: Filter; label: string; empty: string}[] = [
  {key: 'all', label: 'All', empty: 'No meal plans near you yet'},
  {key: 'week', label: 'Weekly', empty: 'No weekly meal plans near you yet'},
  {key: '14 days', label: '14 days', empty: 'No 14-day meal plans near you yet'},
  {key: '28 days', label: 'Monthly', empty: 'No monthly meal plans near you yet'},
];

function mealMeta(summary: PlanScheduleSummary, unit: BillingUnit): string {
  const count = summary.weekly ? summary.mealCount * weeksPerBill(unit) : summary.mealCount;
  const meals = `${count} ${count === 1 ? 'meal' : 'meals'}`;
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
  const [failedUri, setFailedUri] = React.useState<string | null>(null);
  const matches = !search || `${plan.name}\n${kitchenName ?? ''}`.toLowerCase().includes(search);
  React.useEffect(() => onMatch(plan.id, matches), [matches, onMatch, plan.id]);
  if (!matches) {
    return null;
  }
  const unit = billingUnit(plan.billingPeriod);
  const price = formatPlanPrice(plan.amount, plan.currency);
  // A photo sits on top; without one the card is a row with a chef-hat tile.
  const photo = imageUrl && imageUrl !== failedUri ? imageUrl : null;
  const meta = [kitchenName ? `By ${kitchenName}` : null, summary ? mealMeta(summary, unit) : null]
    .filter(Boolean)
    .join(' · ');
  return (
    <PressableCard
      accessibilityLabel={`${plan.name}, ${price} per ${unit}`}
      onPress={onPress}
      style={[styles.planCard, photo ? styles.planCardPhoto : styles.planCardRow]}
      testID={`meal-plan-card-${plan.id}`}>
      {photo ? (
        <Image
          accessibilityIgnoresInvertColors
          accessible={false}
          onError={() => setFailedUri(photo)}
          resizeMode="cover"
          source={{uri: photo}}
          style={styles.cover}
        />
      ) : (
        <IconTile icon="chef" size={64} glyph={iconSize.lg} square background={colors.surfaceMuted} />
      )}
      <View style={photo ? styles.planBodyUnderPhoto : styles.planBodyRow}>
        <View style={styles.planTitleRow}>
          <Text
            allowFontScaling={textDefaults.allowFontScaling}
            numberOfLines={2}
            style={styles.planName}>
            {plan.name}
          </Text>
          <FoodTypePill foodType={summary?.foodType} />
        </View>
        {meta ? (
          <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.secondary}>
            {meta}
          </Text>
        ) : null}
        <View style={styles.priceRow}>
          <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.price}>
            {price}
            <Text style={styles.per}> / {unit}</Text>
          </Text>
          <PlanRating rating={rating} />
        </View>
      </View>
    </PressableCard>
  );
}

/** "Tomorrow, 4:30 PM · Samosa". */
function nextMealLine(occurrence: CustomerSubscriptionOccurrence, dishes: string, now: Date): string {
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const day =
    occurrence.serviceDate === todayIso(now)
      ? 'Today'
      : occurrence.serviceDate === todayIso(tomorrow)
        ? 'Tomorrow'
        : formatMealPlanDate(occurrence.serviceDate, 'short');
  return `${day}, ${occurrenceTimeLabel(occurrence.serviceAt)} · ${dishes}`;
}

interface CardAction {
  icon: IconName;
  label: string;
  accessibilityLabel: string;
  onPress: () => void;
  disabled: boolean;
}

/** One current plan; Pause, Resume and Skip run the same flows as the plan page. */
function MyPlanCard({subscription, onOpen}: {subscription: CustomerSubscription; onOpen: () => void}) {
  const plan = usePublicMealPlansQuery().data?.find(candidate => candidate.id === subscription.planId);
  const cover = usePlanCover(subscription.planId);
  const controls = usePlanControls(subscription.id, subscription);
  const {pausing, actions} = controls;
  const name = subscription.planName ?? plan?.name ?? 'Meal plan';
  const period = subscription.billingPeriod ?? plan?.billingPeriod;
  const status = subscriptionStatusPresentation(subscription.status);
  const byLine = [cover.kitchenName, period ? billingPeriodLabel(period) : null].filter(Boolean).join(' · ');
  const when =
    subscription.status === 'ACTIVE' && subscription.nextBillingDate
      ? `Renews ${formatMealPlanDate(subscription.nextBillingDate, 'short')}`
      : pausing.restartNote;
  const next = nextOccurrence(controls.occurrences, controls.now);
  const nextLine = next
    ? nextMealLine(next, occurrenceDishNames(next, controls.scheduleItems).join(' + '), controls.now)
    : null;
  const left = subscription.pauseDaysLeft;
  const pauseLine =
    typeof left === 'number' && (subscription.status === 'ACTIVE' || subscription.status === 'PAUSED')
      ? left === 0
        ? 'No pause days left this bill.'
        : `${left} pause ${left === 1 ? 'day' : 'days'} left this bill. Your plan restarts by itself after a pause.`
      : null;

  const buttons: CardAction[] = [];
  if (controls.canPause) {
    buttons.push({
      icon: 'pause',
      label: 'Pause',
      accessibilityLabel: pausing.pauseDisabledLabel ?? 'Pause plan',
      onPress: controls.pause,
      disabled: actions.pending || pausing.pauseDisabledLabel !== null,
    });
  }
  if (controls.canResume && pausing.resumeOffered) {
    buttons.push({
      icon: 'play',
      label: 'Resume',
      accessibilityLabel: 'Resume plan',
      onPress: controls.resume,
      disabled: actions.pending,
    });
  }
  if (controls.canSkip) {
    buttons.push({
      icon: 'calendar-remove',
      label: 'Skip a meal',
      accessibilityLabel: 'Skip a meal',
      onPress: controls.openSkip,
      disabled: actions.pending,
    });
  }
  buttons.push({
    icon: 'chevron-right',
    label: 'Open plan',
    accessibilityLabel: `Open ${name}`,
    onPress: onOpen,
    disabled: false,
  });

  return (
    <View style={styles.mineItem}>
      <View style={styles.mineCard}>
        <Pressable
          accessibilityLabel={`${name}, ${status.label}`}
          accessibilityRole="button"
          onPress={onOpen}
          style={({pressed}) => [styles.mineTop, pressed && styles.pressed]}>
          <MealPlanPhoto uri={resolveApiImageUrl(subscription.planImageUrl) ?? cover.imageUrl} size={72} />
          <View style={styles.grow}>
            <View style={styles.mineTitleRow}>
              <Text
                allowFontScaling={textDefaults.allowFontScaling}
                numberOfLines={2}
                style={[styles.planName, styles.grow]}>
                {name}
              </Text>
              <Badge label={status.label} tone={status.tone} />
            </View>
            {byLine ? (
              <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.secondary}>
                {byLine}
              </Text>
            ) : null}
            {when ? (
              <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.secondary}>
                {when}
              </Text>
            ) : null}
          </View>
        </Pressable>
        {nextLine ? (
          <View accessible accessibilityLabel={`Next meal: ${nextLine}`} style={[styles.nextMeal, styles.cardDivider]}>
            <IconTile icon="clock" />
            <View style={styles.grow}>
              <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.overline}>
                Next meal
              </Text>
              <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.nextText}>
                {nextLine}
              </Text>
            </View>
          </View>
        ) : null}
        <View style={[styles.cardActions, styles.cardDivider]}>
          {buttons.map((button, index) => (
            <Pressable
              key={button.label}
              accessibilityLabel={button.accessibilityLabel}
              accessibilityRole="button"
              accessibilityState={{disabled: button.disabled}}
              disabled={button.disabled}
              onPress={button.onPress}
              style={({pressed}) => [
                styles.cardAction,
                index > 0 && styles.cardActionDivider,
                button.disabled && styles.disabled,
                pressed && styles.pressed,
              ]}>
              <Icon name={button.icon} size={iconSize.md} color={colors.flameRed} surface={false} />
              <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.cardActionText}>
                {button.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
      {pauseLine ? (
        <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.secondary}>
          {pauseLine}
        </Text>
      ) : null}
      {controls.skipSheet}
    </View>
  );
}

export function MealPlansScreen({navigation}: Props) {
  const plansQuery = useNearbyMealPlansQuery();
  const hasLocation = useHasMealPlanLocation();
  const subscriptionsQuery = useMySubscriptionsQuery();
  const [chosenTab, setTab] = React.useState<Tab | null>(null);
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
  const current = subscriptions.filter(subscription => !isPastSubscription(subscription.status));
  const pastCount = subscriptions.length - current.length;
  // Until the customer picks a tab: My plans when a plan is running, else Explore.
  const tab =
    chosenTab ??
    (subscriptions.some(subscription => subscription.status === 'ACTIVE' || subscription.status === 'PAUSED')
      ? 'mine'
      : 'explore');
  const openMyPlan = (subscription: CustomerSubscription) =>
    navigation.navigate('MyMealPlan', {subscriptionId: subscription.id});

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
  const notices = (
    <>
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
    </>
  );

  const header = (
    <View style={styles.listHeader}>
      {notices}
      <Pressable
        accessibilityLabel="How meal plans work. Pause, skip, cancel and chef timings"
        accessibilityRole="button"
        onPress={() => navigation.navigate('MealPlanHowItWorks')}
        style={({pressed}) => [styles.howCard, pressed && styles.pressed]}>
        <IconTile icon="clock" square background={colors.white} />
        <View style={styles.grow}>
          <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.howTitle}>
            How meal plans work
          </Text>
          <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.secondary}>
            Pause, skip, cancel and chef timings
          </Text>
        </View>
        <Icon name="chevron-right" size={iconSize.sm} color={colors.flameRed} surface={false} />
      </Pressable>
      <InputField
        accessibilityLabel="Search meal plans or chefs"
        autoCapitalize="none"
        autoCorrect={false}
        leftIcon="search"
        onChangeText={setSearchText}
        placeholder="Search meal plans or chefs"
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

  const mine = (
    <ScrollView contentContainerStyle={styles.mineContent} showsVerticalScrollIndicator={false}>
      {notices}
      {subscriptionsQuery.isLoading ? (
        <ListSkeleton count={2} />
      ) : subscriptionsQuery.isError ? (
        <RecoverableErrorBanner
          message="Your plans could not be loaded. Check your connection and try again."
          onRetry={() => {
            subscriptionsQuery.refetch();
          }}
        />
      ) : current.length === 0 ? (
        <TerminalState
          illustration="mealPlans"
          title="No meal plans yet"
          description="Get home food every day from a chef near you. Pick a weekly, 14-day or monthly plan."
          actionLabel="Explore plans"
          onAction={() => setTab('explore')}
          secondaryActionLabel="How meal plans work"
          onSecondaryAction={() => navigation.navigate('MealPlanHowItWorks')}
        />
      ) : (
        current.map(subscription => (
          <MyPlanCard key={subscription.id} subscription={subscription} onOpen={() => openMyPlan(subscription)} />
        ))
      )}
      {pastCount > 0 ? (
        <Pressable
          accessibilityLabel={`History, ${pastCount} ended and cancelled ${pastCount === 1 ? 'plan' : 'plans'}`}
          accessibilityRole="button"
          onPress={() => navigation.navigate('MealPlanHistory')}
          style={({pressed}) => [styles.historyRow, pressed && styles.pressed]}>
          <IconTile icon="clock" square />
          <View style={styles.grow}>
            <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.howTitle}>
              History
            </Text>
            <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.secondary}>
              {`Ended and cancelled plans · ${pastCount}`}
            </Text>
          </View>
          <Icon name="chevron-right" size={iconSize.sm} color={colors.textSecondary} surface={false} />
        </Pressable>
      ) : null}
    </ScrollView>
  );

  return (
    <ScreenShell edges={['top', 'bottom']} keyboardAvoiding={false} testID="meal-plans">
      <MealPlanPageHeader
        title="Meal plans"
        onBack={() => navigation.getParent()?.goBack()}
        right={
          <IconButton
            accessibilityLabel="How meal plans work"
            icon="info"
            onPress={() => navigation.navigate('MealPlanHowItWorks')}
          />
        }
      />
      <UnderlineTabs
        accessibilityLabel="Meal plan sections"
        fill
        onSelect={setTab}
        selected={tab}
        tabs={TABS}
      />
      {tab === 'mine' ? (
        mine
      ) : (
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
                illustration={hasLocation ? 'comingSoonArea' : 'location'}
                title={
                  !hasLocation
                    ? 'Choose a delivery location to see meal plans near you'
                    : FILTERS.find(option => option.key === filter)!.empty
                }
              />
            )
          }
          ListFooterComponent={
            noMatches ? (
              <TerminalState illustration="search" title={`No plans match "${searchText.trim()}".`} />
            ) : null
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
      )}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
  },
  listHeader: {gap: 14, paddingTop: spacing.md, paddingBottom: 14},
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
  grow: {flex: 1, minWidth: 0},
  pressed: {opacity: 0.7},
  disabled: {opacity: 0.48},
  howCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: 14,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.cream,
  },
  howTitle: {color: colors.textPrimary, fontSize: typography.body, fontWeight: fontWeight.bold},
  chips: {flexDirection: 'row', gap: spacing.xs},
  // Bottom margin, not list gap: a card hidden by search must not leave a gap behind.
  planCard: {marginBottom: 14},
  planCardPhoto: {padding: 0, overflow: 'hidden'},
  planCardRow: {flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14},
  cover: {width: '100%', height: 140, backgroundColor: colors.surfaceMuted},
  planBodyUnderPhoto: {gap: spacing.xxs, paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: 14},
  planBodyRow: {flex: 1, minWidth: 0, gap: spacing.xxs},
  planTitleRow: {flexDirection: 'row', alignItems: 'center', gap: spacing.xs},
  planName: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: typography.heading,
    fontWeight: fontWeight.bold,
  },
  secondary: {color: colors.textSecondary, fontSize: typography.small},
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  price: {
    color: colors.flameRedAccessible,
    fontSize: typography.body,
    fontWeight: fontWeight.bold,
  },
  per: {
    color: colors.textSecondary,
    fontSize: typography.small,
    fontWeight: fontWeight.medium,
  },
  mineContent: {gap: 14, padding: spacing.md, paddingBottom: spacing.xl},
  mineItem: {gap: spacing.sm},
  mineCard: {
    overflow: 'hidden',
    borderRadius: radius.lg,
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
    backgroundColor: colors.white,
    ...elevation.card,
  },
  mineTop: {flexDirection: 'row', gap: 14, paddingHorizontal: spacing.md, paddingVertical: 14},
  mineTitleRow: {flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs},
  cardDivider: {borderTopWidth: borderWidth.standard, borderTopColor: colors.border},
  nextMeal: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  overline: {
    color: colors.textSecondary,
    fontSize: typography.tiny,
    fontWeight: fontWeight.bold,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  nextText: {color: colors.textPrimary, fontSize: typography.body, fontWeight: fontWeight.semibold},
  cardActions: {flexDirection: 'row'},
  cardAction: {
    flex: 1,
    minHeight: 64,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xxs,
    paddingHorizontal: spacing.xxs,
  },
  cardActionDivider: {borderLeftWidth: borderWidth.standard, borderLeftColor: colors.border},
  cardActionText: {
    color: colors.textPrimary,
    fontSize: typography.small,
    fontWeight: fontWeight.semibold,
    textAlign: 'center',
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    borderRadius: radius.lg,
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
});
