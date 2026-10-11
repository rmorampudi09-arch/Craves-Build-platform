import React from 'react';
import {Alert, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import type {CustomerMealPlanStackParamList} from '../../../app/navigation/types';
import {toAppApiError} from '../../../core/http/apiError';
import {
  borderWidth,
  colors,
  elevation,
  fontWeight,
  iconSize,
  radius,
  spacing,
  textDefaults,
  touchTarget,
  typography,
} from '../../../design/tokens';
import {Badge, Button, Icon, ScreenShell, type IconName} from '../../../shared/components';
import {useCustomerAddressesQuery} from '../../customerAddresses/query/customerAddressQueries';
import {billingUnit} from '../../mealPlans/domain/mealPlanSchedule';
import type {CustomerSubscriptionOccurrence} from '../api/customerSubscriptionApi';
import {
  CardSection,
  DateSheet,
  MealPlanHeader,
  MealPlanPhoto,
  PlanUnavailable,
} from '../components/MealPlanUi';
import {
  formatMealPlanDate,
  formatPlanPrice,
  nextOccurrence,
  occurrenceDishNames,
  occurrenceStatusPresentation,
  occurrenceTimeLabel,
  resumeDateFor,
  skippableDates,
  subscriptionStatusPresentation,
  todayIso,
  weekOccurrences,
} from '../domain/mealPlanPresentation';
import {
  resolveApiImageUrl,
  useLatestSubscriptionPaymentQuery,
  useMenuItemPreview,
  useMySubscriptionsQuery,
  usePlanCover,
  usePlanPolicyQuery,
  usePlanScheduleQuery,
  usePublicMealPlansQuery,
  useSubscriptionActions,
  useSubscriptionOccurrencesQuery,
} from '../query/mealPlanQueries';

type Props = NativeStackScreenProps<CustomerMealPlanStackParamList, 'MyMealPlan'>;

const CANCEL_COPY =
  'Cancelling stops upcoming meals right away. Meals already being prepared will still be delivered.';

function NextMealCard({
  occurrence,
  dishes,
  today,
  onOpen,
}: {
  occurrence: CustomerSubscriptionOccurrence;
  dishes: string;
  today: string;
  onOpen: () => void;
}) {
  const {imageUrl} = useMenuItemPreview(occurrence.items[0]?.menuItemId ?? null);
  const status = occurrenceStatusPresentation(occurrence.status);
  const day =
    occurrence.serviceDate === today ? 'Today' : formatMealPlanDate(occurrence.serviceDate, 'short');
  return (
    <CardSection>
      <View style={styles.row}>
        <MealPlanPhoto uri={imageUrl} size={80} />
        <View style={styles.grow}>
          <View style={styles.titleRow}>
            <Text allowFontScaling={textDefaults.allowFontScaling} style={[styles.secondary, styles.grow]}>
              {`${day} · ${occurrenceTimeLabel(occurrence.serviceAt)}`}
            </Text>
            <Badge label={status.label} tone={status.tone} />
          </View>
          <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.title}>
            {dishes}
          </Text>
          <Pressable
            accessibilityLabel="View meal details"
            accessibilityRole="button"
            onPress={onOpen}
            style={({pressed}) => [styles.link, pressed && styles.pressed]}>
            <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.linkText}>
              View details
            </Text>
            <Icon name="chevron-right" size={iconSize.md} color={colors.flameRedAccessible} surface={false} />
          </Pressable>
        </View>
      </View>
    </CardSection>
  );
}

function WeekRow({
  occurrence,
  dishes,
  today,
  first,
}: {
  occurrence: CustomerSubscriptionOccurrence;
  dishes: string;
  today: string;
  first: boolean;
}) {
  const {imageUrl} = useMenuItemPreview(occurrence.items[0]?.menuItemId ?? null);
  const skipped = occurrence.status === 'SKIPPED';
  return (
    <View style={[styles.weekRow, !first && styles.divider]}>
      <MealPlanPhoto uri={imageUrl} size={touchTarget.minimum} radius={radius.sm} />
      <View style={styles.grow}>
        <View style={styles.inline}>
          <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.secondary}>
            {formatMealPlanDate(occurrence.serviceDate, 'short')}
          </Text>
          {occurrence.serviceDate === today ? <Badge label="Today" tone="error" /> : null}
        </View>
        <Text allowFontScaling={textDefaults.allowFontScaling} style={[styles.dish, skipped && styles.struck]}>
          {dishes}
        </Text>
      </View>
      <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.secondary}>
        {skipped ? 'Skipped' : occurrenceTimeLabel(occurrence.serviceAt)}
      </Text>
    </View>
  );
}

function ActionTile({icon, label, onPress, disabled}: {icon: IconName; label: string; onPress: () => void; disabled: boolean}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{disabled}}
      disabled={disabled}
      onPress={onPress}
      style={({pressed}) => [styles.tile, pressed && styles.pressed]}>
      <View style={styles.tileIcon}>
        <Icon name={icon} size={iconSize.lg} color={colors.flameRedAccessible} surface={false} />
      </View>
      <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.tileLabel}>
        {label}
      </Text>
    </Pressable>
  );
}

export function MyMealPlanScreen({navigation, route}: Props) {
  const {subscriptionId} = route.params;
  const subscriptionsQuery = useMySubscriptionsQuery();
  const subscription = subscriptionsQuery.data?.find(item => item.id === subscriptionId);
  const planId = subscription?.planId ?? null;
  const plan = usePublicMealPlansQuery().data?.find(candidate => candidate.id === planId);
  const cover = usePlanCover(planId);
  const scheduleItems = usePlanScheduleQuery(planId).data?.items ?? [];
  const policy = usePlanPolicyQuery(planId).data;
  const occurrences = useSubscriptionOccurrencesQuery(subscriptionId).data ?? [];
  const payment = useLatestSubscriptionPaymentQuery(subscriptionId).data;
  const {addresses} = useCustomerAddressesQuery();
  const actions = useSubscriptionActions(subscriptionId);
  const [skipDates, setSkipDates] = React.useState<string[] | null>(null);

  if (!subscription) {
    return (
      <ScreenShell edges={['top', 'bottom']} keyboardAvoiding={false}>
        <MealPlanHeader title="My Meal Plan" onBack={navigation.goBack} />
        <PlanUnavailable
          loading={subscriptionsQuery.isLoading}
          onBack={navigation.popToTop}
          onRetry={
            subscriptionsQuery.isError
              ? () => {
                  subscriptionsQuery.refetch();
                }
              : undefined
          }
        />
      </ScreenShell>
    );
  }

  const now = new Date();
  const today = todayIso(now);
  const {status} = subscription;
  const badge = subscriptionStatusPresentation(status);
  const period = subscription.billingPeriod ?? plan?.billingPeriod;
  const amount = subscription.amount ?? plan?.amount;
  const currency = subscription.currency ?? plan?.currency;
  const address = addresses.find(candidate => candidate.id === subscription.deliveryAddressId);
  const billing =
    status === 'ACTIVE' && subscription.nextBillingDate
      ? {label: 'Renews', date: subscription.nextBillingDate}
      : payment?.status === 'PAID'
        ? {label: 'Paid until', date: payment.cycleEnd}
        : null;
  const next = nextOccurrence(occurrences, now);
  const week = weekOccurrences(occurrences, now);
  const dishes = (occurrence: CustomerSubscriptionOccurrence) =>
    occurrenceDishNames(occurrence, scheduleItems).join(' + ');

  // Controls follow the plan policy; with no policy loaded nothing is offered (no 403 taps).
  const canPause = status === 'ACTIVE' && policy?.customerPauseEnabled === true;
  const canResume = status === 'PAUSED' && policy?.customerResumeEnabled === true;
  const canSkip = status === 'ACTIVE' && policy?.customerSkipEnabled === true;
  const canCancel =
    (status === 'ACTIVE' || status === 'PAUSED') && policy?.customerCancelEnabled === true;

  const confirm = (
    title: string,
    message: string,
    actionLabel: string,
    action: () => Promise<void>,
    destructive = false,
  ) =>
    Alert.alert(title, message, [
      {text: 'Not now', style: 'cancel'},
      {
        text: actionLabel,
        style: destructive ? 'destructive' : 'default',
        onPress: () => {
          action().catch(error => Alert.alert('Plan not updated', toAppApiError(error).message));
        },
      },
    ]);

  const pause = () =>
    confirm('Pause your plan?', 'Upcoming meals stop until you resume the plan.', 'Pause plan', actions.pause);
  const resume = () => {
    const earliestTime = scheduleItems.map(item => item.serviceTime).sort()[0] ?? null;
    const date = resumeDateFor(now, policy?.resumeLeadMinutes ?? 0, earliestTime);
    confirm(
      'Resume your plan?',
      `Meals start again from ${formatMealPlanDate(date, 'long')}.`,
      'Resume plan',
      () => actions.resume(date),
    );
  };
  const openSkip = () => {
    // shortcut: the sheet lists only the next 7 skippable dates; add scrolling if plans need more.
    const dates = skippableDates(occurrences, now, policy?.skipCutoffMinutes ?? 0).slice(0, 7);
    if (dates.length === 0) {
      Alert.alert('No meals to skip', 'There are no upcoming meals you can skip right now.');
      return;
    }
    setSkipDates(dates);
  };
  const skip = (date: string) => {
    setSkipDates(null);
    confirm(
      'Skip this meal?',
      `You won't get meals on ${formatMealPlanDate(date, 'long')}.`,
      'Skip meal',
      () => actions.skip(date),
    );
  };
  const cancel = () => confirm('Cancel your plan?', CANCEL_COPY, 'Cancel plan', actions.cancel, true);

  return (
    <ScreenShell edges={['top']} keyboardAvoiding={false} testID="my-meal-plan">
      <MealPlanHeader title="My Meal Plan" onBack={navigation.goBack} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {status === 'PENDING_PAYMENT' || status === 'PAYMENT_FAILED' ? (
          <View style={styles.banner}>
            <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.bannerText}>
              {status === 'PAYMENT_FAILED'
                ? "Your payment didn't go through. Complete payment to start your meals."
                : 'Complete payment to start your meals.'}
            </Text>
            <Button
              label="Complete payment"
              onPress={() =>
                navigation.navigate('MealPlanPayment', {planId: subscription.planId, subscriptionId})
              }
            />
          </View>
        ) : null}

        <CardSection>
          <View style={styles.row}>
            <MealPlanPhoto uri={resolveApiImageUrl(subscription.planImageUrl) ?? cover.imageUrl} size={80} />
            <View style={styles.grow}>
              <View style={styles.titleRow}>
                <Text allowFontScaling={textDefaults.allowFontScaling} style={[styles.title, styles.grow]}>
                  {subscription.planName ?? plan?.name ?? 'Meal plan'}
                </Text>
                <Badge label={badge.label} tone={badge.tone} />
              </View>
              {cover.kitchenName ? (
                <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.secondary}>
                  {cover.kitchenName}
                </Text>
              ) : null}
              {amount != null && currency ? (
                <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.price}>
                  {formatPlanPrice(amount, currency)}
                  {period ? <Text style={styles.per}> / {billingUnit(period)}</Text> : null}
                </Text>
              ) : null}
            </View>
          </View>
          {billing || address ? (
            <View style={styles.planFooter}>
              {billing ? (
                <View style={styles.inline}>
                  <Icon name="renew" size={iconSize.md} color={colors.textSecondary} surface={false} />
                  <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.secondary}>
                    {`${billing.label} `}
                    <Text style={styles.strong}>{formatMealPlanDate(billing.date, 'short')}</Text>
                  </Text>
                </View>
              ) : (
                <View />
              )}
              {address ? (
                <View style={styles.inline}>
                  <Icon name="location-outline" size={iconSize.md} color={colors.textSecondary} surface={false} />
                  <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.strong}>
                    {address.areaName ?? address.city}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </CardSection>

        {next ? (
          <NextMealCard
            occurrence={next}
            dishes={dishes(next)}
            today={today}
            onOpen={() => navigation.navigate('MealPlanMeal', {subscriptionId, occurrenceId: next.id})}
          />
        ) : null}

        {canPause || canResume || canSkip ? (
          <View style={styles.tiles}>
            {canPause ? <ActionTile icon="pause" label="Pause plan" onPress={pause} disabled={actions.pending} /> : null}
            {canResume ? <ActionTile icon="play" label="Resume plan" onPress={resume} disabled={actions.pending} /> : null}
            {canSkip ? (
              <ActionTile icon="calendar-remove" label="Skip a meal" onPress={openSkip} disabled={actions.pending} />
            ) : null}
          </View>
        ) : null}

        <CardSection title="This week's schedule">
          {week.length === 0 ? (
            <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.secondary}>
              Your meals will show here once they're scheduled.
            </Text>
          ) : (
            week.map((occurrence, index) => (
              <WeekRow
                key={occurrence.id}
                occurrence={occurrence}
                dishes={dishes(occurrence)}
                today={today}
                first={index === 0}
              />
            ))
          )}
        </CardSection>

        {canCancel ? (
          <View style={styles.cancel}>
            <Button label="Cancel plan" variant="ghost" leftIcon="close" loading={actions.pending} onPress={cancel} />
            <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.helper}>
              {CANCEL_COPY}
            </Text>
          </View>
        ) : null}
      </ScrollView>

      {skipDates ? (
        <DateSheet
          title="Skip a meal"
          dates={skipDates}
          onSelect={skip}
          onClose={() => setSkipDates(null)}
        />
      ) : null}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  content: {gap: spacing.md, padding: spacing.md, paddingBottom: spacing.xl},
  grow: {flex: 1, minWidth: 0},
  row: {flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md},
  titleRow: {flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs},
  inline: {flexDirection: 'row', alignItems: 'center', gap: spacing.xs},
  title: {
    color: colors.textPrimary,
    fontSize: typography.button,
    fontWeight: fontWeight.bold,
  },
  secondary: {color: colors.textSecondary, fontSize: typography.small},
  strong: {color: colors.textPrimary, fontSize: typography.small, fontWeight: fontWeight.bold},
  price: {
    marginTop: spacing.xxs,
    color: colors.textPrimary,
    fontSize: typography.heading,
    fontWeight: fontWeight.bold,
  },
  per: {color: colors.textSecondary, fontSize: typography.small, fontWeight: fontWeight.regular},
  planFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: borderWidth.standard,
    borderTopColor: colors.border,
  },
  banner: {gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.warningSoft},
  bannerText: {color: colors.warningText, fontSize: typography.body, fontWeight: fontWeight.semibold},
  link: {
    alignSelf: 'flex-start',
    minHeight: touchTarget.minimum,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
  },
  linkText: {color: colors.flameRedAccessible, fontSize: typography.body, fontWeight: fontWeight.semibold},
  pressed: {opacity: 0.7},
  tiles: {flexDirection: 'row', gap: spacing.sm},
  tile: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
    backgroundColor: colors.white,
    ...elevation.card,
  },
  tileIcon: {
    width: touchTarget.minimum,
    height: touchTarget.minimum,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.errorSoft,
  },
  tileLabel: {color: colors.flameRedAccessible, fontSize: typography.body, fontWeight: fontWeight.semibold},
  weekRow: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  divider: {borderTopWidth: borderWidth.standard, borderTopColor: colors.border},
  dish: {color: colors.textPrimary, fontSize: typography.body, fontWeight: fontWeight.semibold},
  struck: {color: colors.textSecondary, textDecorationLine: 'line-through'},
  cancel: {alignItems: 'center', gap: spacing.xxs},
  helper: {color: colors.textSecondary, fontSize: typography.small, textAlign: 'center'},
});
