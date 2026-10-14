import React from 'react';
import {ScrollView, StyleSheet, Text, View} from 'react-native';
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
import {ScreenShell, type IconName} from '../../../shared/components';
import {IconTile, MealPlanPageHeader} from '../components/MealPlanUi';
import type {MealPlanStackParamList} from '../navigation/CustomerMealPlanNavigator';

type Props = NativeStackScreenProps<MealPlanStackParamList, 'MealPlanHowItWorks'>;

interface Step {
  icon: IconName;
  title: string;
  body: string;
  /** Pause only: the allowance tiles and the restart line. */
  allowance?: boolean;
}

// The product rules, worded as on the approved board.
const BASICS: Step[] = [
  {
    icon: 'calendar-check',
    title: 'Choose a plan',
    body: 'Weekly (7 days), 14 days or monthly (28 days). The chef cooks one weekly menu, Sunday to Saturday, and it repeats for every week of your bill.',
  },
  {
    icon: 'wallet',
    title: 'Pay once per bill',
    body: 'You pay for the whole bill before it starts. My plans shows the date your next bill renews.',
  },
  {
    icon: 'chef',
    title: 'When the chef gets your order',
    body: 'Lunch, snack and dinner orders reach the chef at 7:00 AM on the meal day. Breakfast orders reach the chef at 8:00 PM the night before. The chef accepts each meal at least 1 hour before it is due.',
  },
  {
    icon: 'renew',
    title: "If the chef can't cook",
    body: "If the chef declines a meal, or doesn't accept it in time, that day is added to the end of your plan and you get a notification. You never pay for a day that wasn't cooked.",
  },
];

const CONTROLS: Step[] = [
  {
    icon: 'pause',
    title: 'Pause',
    body: 'Pause any time. Meals already sent to the chef are still delivered. Your paused days are added to the end of your plan.',
    allowance: true,
  },
  {
    icon: 'calendar-remove',
    title: 'Skip a meal',
    body: "Skip any single meal up to 24 hours before it. A skipped meal is not added back to your plan, so pause instead if you'll be away for a full day.",
  },
  {
    icon: 'close',
    title: 'Cancel',
    body: 'Cancel any time. Upcoming meals stop right away; a meal the chef is already preparing is still delivered.',
  },
];

const PAUSE_DAYS = [
  {days: '1', label: 'day per weekly bill'},
  {days: '3', label: 'days per 14-day bill'},
  {days: '7', label: 'days per monthly bill'},
];

function StepList({steps}: {steps: Step[]}) {
  return (
    <View style={styles.card}>
      {steps.map((step, index) => (
        <View key={step.title} style={[styles.step, index > 0 && styles.divider]}>
          <IconTile icon={step.icon} />
          <View style={styles.stepText}>
            <Text
              accessibilityRole="header"
              allowFontScaling={textDefaults.allowFontScaling}
              style={styles.stepTitle}>
              {step.title}
            </Text>
            <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.body}>
              {step.body}
            </Text>
            {step.allowance ? (
              <>
                <View style={styles.allowance}>
                  {PAUSE_DAYS.map(item => (
                    <View
                      key={item.days}
                      accessible
                      accessibilityLabel={`${item.days} ${item.label}`}
                      style={styles.allowanceTile}>
                      <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.allowanceDays}>
                        {item.days}
                      </Text>
                      <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.allowanceLabel}>
                        {item.label}
                      </Text>
                    </View>
                  ))}
                </View>
                <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.body}>
                  When your pause days run out, your plan restarts by itself. To restart sooner, tap Resume at
                  least 24 hours before the next meal.
                </Text>
              </>
            ) : null}
          </View>
        </View>
      ))}
    </View>
  );
}

export function MealPlanHowItWorksScreen({navigation}: Props) {
  return (
    <ScreenShell edges={['top', 'bottom']} keyboardAvoiding={false} testID="meal-plan-how-it-works">
      <MealPlanPageHeader title="How meal plans work" onBack={navigation.goBack} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.intro}>
          Homemade meals from one chef, on the days you pick, paid once per bill.
        </Text>
        <StepList steps={BASICS} />
        <Text
          accessibilityRole="header"
          allowFontScaling={textDefaults.allowFontScaling}
          style={styles.sectionTitle}>
          Your controls
        </Text>
        <StepList steps={CONTROLS} />
        <View style={styles.delivery}>
          <Text
            accessibilityRole="header"
            allowFontScaling={textDefaults.allowFontScaling}
            style={styles.deliveryTitle}>
            Delivery
          </Text>
          <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.body}>
            Meals come to your saved address. You can choose from chefs within 10 km of it. Each plan's page lists
            its own meal times and rules.
          </Text>
        </View>
      </ScrollView>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  content: {gap: spacing.md, paddingHorizontal: spacing.md, paddingBottom: spacing.xxl},
  intro: {paddingHorizontal: spacing.xxs, color: colors.textSecondary, fontSize: typography.body},
  card: {
    overflow: 'hidden',
    borderRadius: radius.lg,
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  step: {flexDirection: 'row', gap: 14, padding: spacing.md},
  divider: {borderTopWidth: borderWidth.standard, borderTopColor: colors.border},
  stepText: {flex: 1, minWidth: 0, gap: spacing.xs},
  stepTitle: {color: colors.textPrimary, fontSize: typography.heading, fontWeight: fontWeight.bold},
  body: {color: colors.textSecondary, fontSize: typography.small, lineHeight: 21},
  sectionTitle: {
    marginTop: spacing.sm,
    paddingHorizontal: spacing.xxs,
    color: colors.textPrimary,
    fontSize: typography.heading,
    fontWeight: fontWeight.bold,
  },
  allowance: {flexDirection: 'row', gap: spacing.xs},
  allowanceTile: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    padding: 10,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
  },
  allowanceDays: {color: colors.flameRedAccessible, fontSize: 22, fontWeight: fontWeight.bold},
  allowanceLabel: {color: colors.textSecondary, fontSize: typography.tiny, textAlign: 'center'},
  delivery: {gap: spacing.xxs, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.cream},
  deliveryTitle: {color: colors.textPrimary, fontSize: typography.body, fontWeight: fontWeight.bold},
});
