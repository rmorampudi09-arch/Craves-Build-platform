import React from 'react';
import {ScrollView, StyleSheet, Text, View} from 'react-native';
import type {NativeStackNavigationProp, NativeStackScreenProps} from '@react-navigation/native-stack';
import type {
  CustomerMealPlanStackParamList,
  CustomerOrderDetailStackParamList,
} from '../../../app/navigation/types';
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
  Icon,
  ListSkeleton,
  RecoverableErrorBanner,
  ScreenShell,
  TerminalState,
  type IconName,
} from '../../../shared/components';
import {useCustomerAddressesQuery} from '../../customerAddresses/query/customerAddressQueries';
import {CardSection, InfoRow, MealPlanHeader, MealPlanPhoto} from '../components/MealPlanUi';
import {
  addressAreaLine,
  formatMealPlanDate,
  occurrenceDishNames,
  occurrenceStatusPresentation,
  occurrenceTimeLabel,
  orderTrackerStep,
  todayIso,
} from '../domain/mealPlanPresentation';
import {
  useMenuItemPreview,
  useMySubscriptionsQuery,
  useOccurrenceOrderQuery,
  usePlanScheduleQuery,
  usePublicMealPlansQuery,
  useSubscriptionOccurrencesQuery,
} from '../query/mealPlanQueries';

type Props = NativeStackScreenProps<CustomerMealPlanStackParamList, 'MealPlanMeal'>;
type Step = {icon: IconName; label: string};

const ORDER_STEPS: Step[] = [
  {icon: 'chef', label: 'Preparing'},
  {icon: 'delivery', label: 'Out for delivery'},
  {icon: 'check', label: 'Delivered'},
];
const ORDER_LINES = [
  'Your meal is being prepared by the chef.',
  'Your meal is on the way.',
  'Delivered. Enjoy your meal!',
];
const PLAN_STEPS: Step[] = [
  {icon: 'calendar-check', label: 'Scheduled'},
  {icon: 'receipt', label: 'Order placed'},
];
const ENDED_LINES: Record<string, string> = {
  SKIPPED: 'You skipped this meal.',
  CANCELLED: 'This meal was cancelled.',
  FAILED: "We couldn't place the order for this meal.",
};

/** Steps up to `active` are filled; -1 fills none. */
function Tracker({steps, active}: {steps: Step[]; active: number}) {
  return (
    <View style={styles.tracker}>
      <View style={[styles.track, {left: `${50 / steps.length}%`, right: `${50 / steps.length}%`}]} />
      {steps.map((step, index) => (
        <View
          key={step.label}
          accessible
          accessibilityLabel={index === active ? `${step.label}, current step` : step.label}
          style={styles.step}>
          <View style={[styles.dot, index <= active && styles.dotOn]}>
            <Icon
              name={step.icon}
              size={iconSize.lg}
              color={index <= active ? colors.white : colors.textSecondary}
              surface={false}
            />
          </View>
          <Text
            allowFontScaling={textDefaults.allowFontScaling}
            style={[styles.stepLabel, index === active && styles.stepLabelOn]}>
            {step.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function MealPlanMealScreen({navigation, route}: Props) {
  const {subscriptionId, occurrenceId} = route.params;
  const subscription = useMySubscriptionsQuery().data?.find(item => item.id === subscriptionId);
  const planId = subscription?.planId ?? null;
  const plan = usePublicMealPlansQuery().data?.find(candidate => candidate.id === planId);
  const scheduleItems = usePlanScheduleQuery(planId).data?.items ?? [];
  const occurrencesQuery = useSubscriptionOccurrencesQuery(subscriptionId);
  const occurrence = occurrencesQuery.data?.find(item => item.id === occurrenceId);
  const order = useOccurrenceOrderQuery(occurrence?.orderId ?? null).data;
  const {imageUrl, kitchenName} = useMenuItemPreview(occurrence?.items[0]?.menuItemId ?? null);
  const {addresses} = useCustomerAddressesQuery();

  if (!occurrence) {
    return (
      <ScreenShell edges={['top', 'bottom']} keyboardAvoiding={false}>
        <MealPlanHeader title="Meal" onBack={navigation.goBack} />
        {occurrencesQuery.isLoading ? (
          <ListSkeleton count={3} style={styles.fallback} />
        ) : occurrencesQuery.isError ? (
          <RecoverableErrorBanner
            message="This meal could not be loaded. Check your connection and try again."
            onRetry={() => {
              occurrencesQuery.refetch();
            }}
            style={styles.fallback}
          />
        ) : (
          <TerminalState
            title="This meal is no longer available"
            actionLabel="Back to My Meal Plan"
            onAction={navigation.goBack}
          />
        )}
      </ScreenShell>
    );
  }

  const status = occurrenceStatusPresentation(occurrence.status);
  const address = addresses.find(candidate => candidate.id === subscription?.deliveryAddressId);
  const servings = occurrence.items.reduce((sum, item) => sum + item.quantity, 0);
  const orderId = occurrence.orderId;
  const orderStep = order ? orderTrackerStep(order.status) : undefined;
  const trackOrder = (id: string) =>
    // The meal-plan stack sits on `CustomerSettingsSubscription` in the Home or Profile stack, which owns tracking.
    navigation
      .getParent<NativeStackNavigationProp<CustomerOrderDetailStackParamList>>()
      ?.navigate('CustomerOrderTracking', {orderId: id});

  let statusBody: React.ReactNode;
  if (status.step === null) {
    statusBody = (
      <>
        <Badge label={status.label} tone={status.tone} />
        {ENDED_LINES[occurrence.status] ? (
          <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.statusLine}>
            {ENDED_LINES[occurrence.status]}
          </Text>
        ) : null}
      </>
    );
  } else if (orderStep === null) {
    statusBody = <Badge label="Order cancelled" tone="error" />;
  } else if (orderStep !== undefined) {
    statusBody = (
      <>
        <Tracker steps={ORDER_STEPS} active={orderStep} />
        <View style={styles.divider} />
        <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.statusLine}>
          {ORDER_LINES[orderStep]}
        </Text>
      </>
    );
  } else {
    // No order yet (or it is still loading): Scheduled → Order placed from the occurrence itself.
    statusBody = (
      <>
        <Tracker steps={PLAN_STEPS} active={status.step - 1} />
        <View style={styles.divider} />
        <Badge label={status.label} tone={status.tone} />
      </>
    );
  }

  return (
    <ScreenShell edges={['top', 'bottom']} keyboardAvoiding={false} testID="meal-plan-meal">
      <MealPlanHeader
        title={occurrence.serviceDate === todayIso(new Date()) ? "Today's Meal" : 'Upcoming Meal'}
        onBack={navigation.goBack}
      />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <CardSection>
          <View style={styles.mealRow}>
            <MealPlanPhoto uri={imageUrl} size={104} />
            <View style={styles.grow}>
              <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.dish}>
                {occurrenceDishNames(occurrence, scheduleItems).join(' + ')}
              </Text>
              {subscription?.planName ?? plan?.name ? (
                <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.secondary}>
                  {subscription?.planName ?? plan?.name}
                </Text>
              ) : null}
              {kitchenName ? (
                <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.secondary}>
                  {`by ${kitchenName}`}
                </Text>
              ) : null}
            </View>
          </View>
        </CardSection>

        <CardSection>
          <View style={styles.status}>
            {statusBody}
            {orderId && status.step !== null ? (
              <Button label="Track order" variant="ghost" onPress={() => trackOrder(orderId)} />
            ) : null}
          </View>
        </CardSection>

        <CardSection>
          <InfoRow first icon="calendar" label="Date" value={formatMealPlanDate(occurrence.serviceDate, 'long')} />
          <InfoRow icon="clock" label="Time" value={occurrenceTimeLabel(occurrence.serviceAt)} />
          {address ? (
            <InfoRow icon="location-outline" label="Delivery address" value={addressAreaLine(address)} />
          ) : null}
          <InfoRow icon="meal" label="Quantity" value={`${servings} serving${servings === 1 ? '' : 's'}`} />
        </CardSection>
      </ScrollView>
    </ScreenShell>
  );
}

const DOT = 56;

const styles = StyleSheet.create({
  content: {gap: spacing.md, padding: spacing.md, paddingBottom: spacing.xl},
  fallback: {margin: spacing.md},
  grow: {flex: 1, minWidth: 0, gap: spacing.xxs},
  mealRow: {flexDirection: 'row', alignItems: 'center', gap: spacing.md},
  dish: {color: colors.textPrimary, fontSize: typography.heading, fontWeight: fontWeight.bold},
  secondary: {color: colors.textSecondary, fontSize: typography.small},
  status: {gap: spacing.sm},
  statusLine: {color: colors.textPrimary, fontSize: typography.body, fontWeight: fontWeight.semibold},
  divider: {height: borderWidth.standard, backgroundColor: colors.border},
  tracker: {flexDirection: 'row'},
  track: {
    position: 'absolute',
    top: DOT / 2 - 1,
    height: 2,
    backgroundColor: colors.border,
  },
  step: {flex: 1, alignItems: 'center', gap: spacing.xs},
  dot: {
    width: DOT,
    height: DOT,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
  },
  dotOn: {backgroundColor: colors.flameRedAccessible},
  stepLabel: {color: colors.textSecondary, fontSize: typography.small, textAlign: 'center'},
  stepLabelOn: {color: colors.flameRedAccessible, fontWeight: fontWeight.bold},
});
