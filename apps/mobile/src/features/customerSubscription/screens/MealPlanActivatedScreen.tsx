import React from 'react';
import {BackHandler, ScrollView, StyleSheet, Text, View} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import type {BottomTabNavigationProp} from '@react-navigation/bottom-tabs';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import type {
  CustomerMealPlanStackParamList,
  CustomerTabParamList,
} from '../../../app/navigation/types';
import {
  colors,
  fontWeight,
  radius,
  spacing,
  textDefaults,
  typography,
} from '../../../design/tokens';
import {Button, Icon, ScreenShell} from '../../../shared/components';
import {formatServiceTime} from '../../mealPlans/domain/mealPlanSchedule';
import {CardSection, InfoRow} from '../components/MealPlanUi';
import {
  firstScheduledItem,
  formatMealPlanDate,
  formatPlanPrice,
  shortSubscriptionId,
} from '../domain/mealPlanPresentation';
import {
  useLatestSubscriptionPaymentQuery,
  useMySubscriptionsQuery,
  usePlanScheduleQuery,
  usePublicMealPlansQuery,
} from '../query/mealPlanQueries';

type Props = NativeStackScreenProps<CustomerMealPlanStackParamList, 'MealPlanActivated'>;

export function MealPlanActivatedScreen({navigation, route}: Props) {
  const {subscriptionId} = route.params;
  const subscription = useMySubscriptionsQuery().data?.find(item => item.id === subscriptionId);
  const planId = subscription?.planId ?? null;
  const plan = usePublicMealPlansQuery().data?.find(candidate => candidate.id === planId);
  const payment = useLatestSubscriptionPaymentQuery(subscriptionId).data;
  const schedule = usePlanScheduleQuery(planId);

  const backToHome = React.useCallback(() => {
    // The meal-plan stack sits on `CustomerSettingsSubscription` in the Home or Profile tab stack.
    const tabStack = navigation.getParent();
    const tabs = tabStack?.getParent<BottomTabNavigationProp<CustomerTabParamList>>();
    tabStack?.goBack();
    tabs?.navigate('Home', {screen: 'CustomerHomeRoot', pop: true});
  }, [navigation]);

  // Android back must never return into the checkout.
  useFocusEffect(
    React.useCallback(() => {
      const listener = BackHandler.addEventListener('hardwareBackPress', () => {
        backToHome();
        return true;
      });
      return () => listener.remove();
    }, [backToHome]),
  );

  const planName = subscription?.planName ?? plan?.name;
  const firstMeal = subscription
    ? firstScheduledItem(schedule.data?.items ?? [], subscription.startDate)
    : null;
  const rows = [
    {label: 'Subscription ID', value: shortSubscriptionId(subscriptionId)},
    {label: 'Plan', value: planName},
    {
      label: 'Amount paid',
      value:
        payment?.status === 'PAID'
          ? formatPlanPrice(payment.amount.amount, payment.amount.currency)
          : null,
    },
    {
      label: 'Start date',
      value: subscription ? formatMealPlanDate(subscription.startDate, 'long') : null,
    },
    {
      label: 'First meal',
      value: firstMeal
        ? `${firstMeal.menuItemName} · ${formatServiceTime(firstMeal.serviceTime)}`
        : null,
    },
  ].filter((row): row is {label: string; value: string} => Boolean(row.value));

  return (
    <ScreenShell edges={['top', 'bottom']} keyboardAvoiding={false} testID="meal-plan-activated">
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.mark}>
          <View style={styles.markInner}>
            <Icon name="check" size={44} color={colors.white} surface={false} />
          </View>
        </View>
        <View>
          <Text
            accessibilityRole="header"
            allowFontScaling={textDefaults.allowFontScaling}
            style={styles.title}>
            Meal Plan Activated!
          </Text>
          <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.subtitle}>
            Your subscription has been successfully created. Get ready for homemade goodness!
          </Text>
        </View>
        <CardSection>
          {rows.map((row, index) => (
            <InfoRow key={row.label} first={index === 0} label={row.label} value={row.value} />
          ))}
        </CardSection>
        <View style={styles.actions}>
          <Button
            label="View My Plan"
            onPress={() =>
              // Back from My Meal Plan returns to the list, not to the checkout just finished.
              navigation.reset({
                index: 1,
                routes: [{name: 'MealPlans'}, {name: 'MyMealPlan', params: {subscriptionId}}],
              })
            }
          />
          <Button label="Back to Home" variant="outline" onPress={backToHome} />
        </View>
      </ScrollView>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  content: {flexGrow: 1, gap: spacing.lg, padding: spacing.md, paddingTop: spacing.xl},
  mark: {
    alignSelf: 'center',
    width: 104,
    height: 104,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.successSoft,
  },
  markInner: {
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.success,
  },
  title: {
    color: colors.textPrimary,
    fontSize: typography.hero,
    fontWeight: fontWeight.extrabold,
    textAlign: 'center',
  },
  subtitle: {
    marginTop: spacing.xs,
    color: colors.textSecondary,
    fontSize: typography.body,
    textAlign: 'center',
  },
  actions: {marginTop: 'auto', gap: spacing.sm},
});
