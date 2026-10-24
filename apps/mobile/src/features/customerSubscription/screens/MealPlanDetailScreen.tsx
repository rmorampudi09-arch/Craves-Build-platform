import React from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
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
  touchTarget,
  typography,
} from '../../../design/tokens';
import {Badge, Icon, ScreenShell, type IconName} from '../../../shared/components';
import {customerAddressLabel} from '../../customerAddresses/domain/customerAddressContract';
import {useCustomerAddressesQuery} from '../../customerAddresses/query/customerAddressQueries';
import {
  billingPeriodLabel,
  billingUnit,
  dayLabel,
  formatMealCount,
  formatServiceTime,
  sortScheduleItems,
} from '../../mealPlans/domain/mealPlanSchedule';
import type {PublicPlanSchedule} from '../api/customerSubscriptionApi';
import {
  BottomPriceBar,
  CardSection,
  FoodTypePill,
  MealPlanHeader,
  MealPlanPhoto,
  PlanRating,
  PlanRulesList,
  PlanUnavailable,
} from '../components/MealPlanUi';
import {
  addressAreaLine,
  formatPlanPrice,
  planRules,
  upcomingStartDates,
} from '../domain/mealPlanPresentation';
import {
  useMenuItemPreview,
  usePlanCover,
  usePlanPolicyQuery,
  usePlanScheduleQuery,
  usePublicMealPlansQuery,
} from '../query/mealPlanQueries';
import {
  useMealPlanCheckout,
  useSelectedDeliveryAddress,
} from '../state/MealPlanCheckoutContext';

type Props = NativeStackScreenProps<CustomerMealPlanStackParamList, 'MealPlanDetail'>;
type ScheduleItem = PublicPlanSchedule['items'][number];

function DishRow({item, first}: {item: ScheduleItem; first: boolean}) {
  const {imageUrl} = useMenuItemPreview(item.menuItemId);
  return (
    <View style={[styles.dishRow, !first && styles.divider]}>
      <MealPlanPhoto uri={imageUrl} size={touchTarget.minimum} radius={radius.sm} />
      <View style={styles.grow}>
        <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.dishDay}>
          {dayLabel(item, 'long')}
        </Text>
        <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.secondary}>
          {item.menuItemName}
        </Text>
      </View>
      <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.secondary}>
        {formatServiceTime(item.serviceTime)}
      </Text>
    </View>
  );
}

function DeliveryAddressRow({onChange}: {onChange: () => void}) {
  const {address, loading, isError} = useSelectedDeliveryAddress();
  const {refetch} = useCustomerAddressesQuery();
  const value = address
    ? `${customerAddressLabel(address)} · ${addressAreaLine(address)}`
    : loading
      ? 'Loading…'
      : isError
        ? 'Your addresses could not be loaded.'
        : 'Add where your meals should go.';
  const retry = () => {
    refetch();
  };
  const action =
    isError && !address
      ? {label: 'Retry', onPress: retry}
      : {label: address ? 'Change' : 'Add', onPress: onChange};
  return (
    <CardSection>
      <View style={styles.addressRow}>
        <View style={styles.addressTile}>
          <Icon
            name="location-outline"
            size={iconSize.lg}
            color={colors.textPrimary}
            surface={false}
          />
        </View>
        <View style={styles.grow}>
          <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.secondary}>
            Delivery address
          </Text>
          <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.addressValue}>
            {value}
          </Text>
        </View>
        {loading ? null : (
          <Pressable
            accessibilityLabel={`${action.label} delivery address`}
            accessibilityRole="button"
            onPress={action.onPress}
            style={({pressed}) => [styles.link, pressed && styles.pressed]}>
            <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.linkText}>
              {action.label}
            </Text>
          </Pressable>
        )}
      </View>
    </CardSection>
  );
}

export function MealPlanDetailScreen({navigation, route}: Props) {
  const {planId} = route.params;
  const plansQuery = usePublicMealPlansQuery();
  const retryPlans = () => {
    plansQuery.refetch();
  };
  const plan = plansQuery.data?.find(candidate => candidate.id === planId);
  const {imageUrl, kitchenName, summary, rating} = usePlanCover(planId);
  const schedule = usePlanScheduleQuery(planId);
  const policy = usePlanPolicyQuery(planId);
  const {startDate, setStartDate} = useMealPlanCheckout();
  const {width} = useWindowDimensions();

  if (!plan) {
    return (
      <ScreenShell edges={['top', 'bottom']} keyboardAvoiding={false}>
        <MealPlanHeader title="Meal Plan" onBack={navigation.goBack} />
        <PlanUnavailable
          loading={plansQuery.isLoading}
          onBack={navigation.goBack}
          onRetry={plansQuery.isError ? retryPlans : undefined}
        />
      </ScreenShell>
    );
  }

  const unit = billingUnit(plan.billingPeriod);
  const price = formatPlanPrice(plan.amount, plan.currency);
  const items = sortScheduleItems(schedule.data?.items ?? []);
  const allFacts: {icon: IconName; value: string | null; caption: string}[] = summary
    ? [
        {icon: 'meal', value: formatMealCount(summary, unit), caption: `per ${unit}`},
        {icon: 'calendar', value: summary.daysLabel, caption: 'delivery days'},
        {icon: 'clock', value: summary.timeLabel, caption: 'delivery time'},
      ]
    : [];
  const facts = allFacts.filter(fact => fact.value);

  const choosePlan = () => {
    if (!startDate) {
      setStartDate(upcomingStartDates(new Date())[0]);
    }
    navigation.navigate('MealPlanReview', {planId});
  };

  return (
    <ScreenShell edges={['top']} keyboardAvoiding={false} testID="meal-plan-detail">
      <MealPlanHeader title="Meal Plan" onBack={navigation.goBack} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <MealPlanPhoto
          uri={imageUrl}
          size={{width: width - spacing.md * 2, height: 188}}
          radius={radius.lg}
        />
        <View>
          <View style={styles.badgeRow}>
            <Badge label={billingPeriodLabel(plan.billingPeriod)} tone="error" />
            <FoodTypePill foodType={summary?.foodType} />
          </View>
          <Text
            accessibilityRole="header"
            allowFontScaling={textDefaults.allowFontScaling}
            style={styles.name}>
            {plan.name}
          </Text>
          {kitchenName || rating ? (
            <View style={styles.kitchenRow}>
              {kitchenName ? (
                <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.kitchen}>
                  {kitchenName}
                </Text>
              ) : null}
              <PlanRating rating={rating} />
            </View>
          ) : null}
          {plan.description ? (
            <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.description}>
              {plan.description}
            </Text>
          ) : null}
        </View>

        {facts.length > 0 ? (
          <View style={styles.facts}>
            {facts.map((fact, index) => (
              <View key={fact.caption} style={[styles.fact, index > 0 && styles.factDivider]}>
                <Icon
                  name={fact.icon}
                  size={iconSize.sm}
                  color={colors.flameRedAccessible}
                  surface={false}
                />
                <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.factValue}>
                  {fact.value}
                </Text>
                <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.secondary}>
                  {fact.caption}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {items.length > 0 ? (
          <CardSection title="What's included">
            {summary?.weekly ? (
              <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.secondary}>
                Repeats every week
              </Text>
            ) : null}
            {items.map((item, index) => (
              <DishRow
                key={`${item.isoDayOfWeek ?? item.dayOfMonth}-${item.mealSlotCode}-${item.sequenceNumber}`}
                item={item}
                first={index === 0}
              />
            ))}
          </CardSection>
        ) : null}

        <DeliveryAddressRow onChange={() => navigation.navigate('MealPlanAddress')} />

        {policy.data ? (
          <CardSection title="Plan rules">
            <PlanRulesList rules={planRules(policy.data)} />
          </CardSection>
        ) : null}
      </ScrollView>
      <BottomPriceBar
        price={price}
        unitLabel={`per ${unit}`}
        buttonLabel="Choose plan"
        onPress={choosePlan}
      />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  content: {gap: spacing.md, padding: spacing.md, paddingBottom: spacing.xl},
  grow: {flex: 1, minWidth: 0},
  secondary: {color: colors.textSecondary, fontSize: typography.small},
  badgeRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  name: {
    marginTop: spacing.sm,
    color: colors.textPrimary,
    fontSize: typography.hero,
    fontWeight: fontWeight.bold,
  },
  kitchenRow: {
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xxs,
  },
  kitchen: {
    color: colors.textPrimary,
    fontSize: typography.small,
    fontWeight: fontWeight.semibold,
  },
  description: {marginTop: spacing.xs, color: colors.textSecondary, fontSize: typography.body},
  facts: {flexDirection: 'row', borderRadius: radius.md, backgroundColor: colors.surfaceMuted},
  fact: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.sm,
  },
  factDivider: {borderLeftWidth: borderWidth.standard, borderLeftColor: colors.border},
  factValue: {
    color: colors.textPrimary,
    fontSize: typography.body,
    fontWeight: fontWeight.bold,
    textAlign: 'center',
  },
  dishRow: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  divider: {borderTopWidth: borderWidth.standard, borderTopColor: colors.border},
  dishDay: {color: colors.textPrimary, fontSize: typography.body, fontWeight: fontWeight.semibold},
  addressRow: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm},
  addressTile: {
    width: touchTarget.minimum,
    height: touchTarget.minimum,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
  addressValue: {
    color: colors.textPrimary,
    fontSize: typography.body,
    fontWeight: fontWeight.semibold,
  },
  link: {
    minWidth: touchTarget.minimum,
    minHeight: touchTarget.minimum,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkText: {
    color: colors.flameRedAccessible,
    fontSize: typography.body,
    fontWeight: fontWeight.semibold,
  },
  pressed: {opacity: 0.7},
});
