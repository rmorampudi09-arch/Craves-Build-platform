import React from 'react';
import {Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import type {CustomerMealPlanStackParamList} from '../../../app/navigation/types';
import {resolveReducedMotionAnimation} from '../../../design/motion';
import {useReducedMotionPreference} from '../../../design/reducedMotion';
import {
  colors,
  elevation,
  fontWeight,
  radius,
  spacing,
  textDefaults,
  touchTarget,
  typography,
} from '../../../design/tokens';
import {ScreenShell} from '../../../shared/components';
import {useCustomerAddressesQuery} from '../../customerAddresses/query/customerAddressQueries';
import {CustomerAddressEditorModal} from '../../customerAddresses/screens/CustomerAddressEditorModal';
import {billingUnit, formatMealCount} from '../../mealPlans/domain/mealPlanSchedule';
import {
  BottomPriceBar,
  CardSection,
  InfoRow,
  MealPlanHeader,
  MealPlanPhoto,
  PlanRating,
  PlanRulesList,
  PlanUnavailable,
  RadioMark,
} from '../components/MealPlanUi';
import {
  addressAreaLine,
  formatMealPlanDate,
  formatPlanPrice,
  planRules,
  upcomingStartDates,
} from '../domain/mealPlanPresentation';
import {
  usePlanCover,
  usePlanPolicyQuery,
  usePublicMealPlansQuery,
} from '../query/mealPlanQueries';
import {
  useMealPlanCheckout,
  useSelectedDeliveryAddress,
} from '../state/MealPlanCheckoutContext';

type Props = NativeStackScreenProps<CustomerMealPlanStackParamList, 'MealPlanReview'>;

function StartDateSheet({
  dates,
  selected,
  onSelect,
  onClose,
}: {
  dates: string[];
  selected: string;
  onSelect: (date: string) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotionPreference();
  return (
    <Modal
      animationType={resolveReducedMotionAnimation('slide' as const, reduceMotion)}
      onRequestClose={onClose}
      transparent
      visible>
      <View style={styles.backdrop}>
        <Pressable
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        <View
          accessibilityViewIsModal
          onAccessibilityEscape={onClose}
          style={[styles.sheet, {paddingBottom: Math.max(insets.bottom, spacing.md)}]}>
          <View style={styles.handle} />
          <Text
            accessibilityRole="header"
            allowFontScaling={textDefaults.allowFontScaling}
            style={styles.sheetTitle}>
            Choose a start date
          </Text>
          <View accessibilityRole="radiogroup">
            {dates.map(date => (
              <Pressable
                key={date}
                accessibilityRole="radio"
                accessibilityState={{checked: date === selected}}
                onPress={() => onSelect(date)}
                style={({pressed}) => [styles.dateRow, pressed && styles.pressed]}>
                <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.dateText}>
                  {formatMealPlanDate(date, 'long')}
                </Text>
                <RadioMark checked={date === selected} />
              </Pressable>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

export function MealPlanReviewScreen({navigation, route}: Props) {
  const {planId} = route.params;
  const plansQuery = usePublicMealPlansQuery();
  const retryPlans = () => {
    plansQuery.refetch();
  };
  const plan = plansQuery.data?.find(candidate => candidate.id === planId);
  const {imageUrl, kitchenName, summary, rating} = usePlanCover(planId);
  const policy = usePlanPolicyQuery(planId);
  const {startDate, setStartDate, setDeliveryAddressId} = useMealPlanCheckout();
  const {address, loading: addressLoading, isError: addressError} = useSelectedDeliveryAddress();
  const addressesQuery = useCustomerAddressesQuery();
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [editorOpen, setEditorOpen] = React.useState(false);

  if (!plan) {
    return (
      <ScreenShell edges={['top', 'bottom']} keyboardAvoiding={false}>
        <MealPlanHeader title="Review Subscription" onBack={navigation.goBack} />
        <PlanUnavailable
          loading={plansQuery.isLoading}
          onBack={navigation.popToTop}
          onRetry={plansQuery.isError ? retryPlans : undefined}
        />
      </ScreenShell>
    );
  }

  const unit = billingUnit(plan.billingPeriod);
  const price = formatPlanPrice(plan.amount, plan.currency);
  const dates = upcomingStartDates(new Date());
  // A date picked earlier in the session can fall behind tomorrow; never offer it.
  const start = startDate && startDate >= dates[0] ? startDate : dates[0];
  const refundUrl = policy.data?.refundPolicyReference?.trim();
  const policyUrl = refundUrl && /^https?:\/\/\S+$/i.test(refundUrl) ? refundUrl : null;

  const addressRow = address
    ? {
        value: addressAreaLine(address),
        action: {label: 'Change', onPress: () => navigation.navigate('MealPlanAddress')},
      }
    : addressLoading
      ? {value: 'Loading…', action: undefined}
      : addressError
        ? {
            value: 'Could not load',
            action: {
              label: 'Retry',
              onPress: () => {
                addressesQuery.refetch();
              },
            },
          }
        : {value: '', action: {label: 'Add an address', onPress: () => setEditorOpen(true)}};

  const proceed = () => {
    if (!address) {
      return;
    }
    if (start !== startDate) {
      setStartDate(start);
    }
    navigation.navigate('MealPlanPayment', {planId});
  };

  return (
    <ScreenShell edges={['top']} keyboardAvoiding={false} testID="meal-plan-review">
      <MealPlanHeader
        title="Review Subscription"
        subtitle="Almost there! Review your plan details."
        onBack={navigation.goBack}
      />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <CardSection>
          <View style={styles.planRow}>
            <MealPlanPhoto uri={imageUrl} size={96} />
            <View style={styles.planText}>
              <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.planName}>
                {plan.name}
              </Text>
              {kitchenName ? (
                <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.secondary}>
                  {kitchenName}
                </Text>
              ) : null}
              <PlanRating rating={rating} />
              <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.price}>
                {price}
                <Text style={styles.per}> / {unit}</Text>
              </Text>
            </View>
          </View>
        </CardSection>

        <CardSection title="Subscription details">
          <InfoRow
            first
            label="Start date"
            value={formatMealPlanDate(start, 'long')}
            action={{label: 'Change', onPress: () => setSheetOpen(true)}}
          />
          <InfoRow label="Delivery address" value={addressRow.value} action={addressRow.action} />
          <InfoRow label="Plan type" value={unit === 'month' ? 'Monthly' : 'Weekly'} />
          {summary ? (
            <InfoRow
              label={`Meals per ${unit}`}
              value={[formatMealCount(summary, unit), summary.daysLabel]
                .filter(Boolean)
                .join(' · ')}
            />
          ) : null}
        </CardSection>

        {policy.data ? (
          <CardSection title="Plan rules">
            <PlanRulesList rules={planRules(policy.data)} />
            {policyUrl ? (
              <Pressable
                accessibilityRole="link"
                onPress={() => {
                  Linking.openURL(policyUrl).catch(() => undefined);
                }}
                style={({pressed}) => [styles.policyLink, pressed && styles.pressed]}>
                <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.policyText}>
                  View full policy
                </Text>
              </Pressable>
            ) : null}
          </CardSection>
        ) : null}
      </ScrollView>
      <BottomPriceBar
        price={price}
        unitLabel={`per ${unit}`}
        buttonLabel="Proceed to payment"
        onPress={proceed}
        disabled={!address}
      />

      {sheetOpen ? (
        <StartDateSheet
          dates={dates}
          selected={start}
          onClose={() => setSheetOpen(false)}
          onSelect={date => {
            setStartDate(date);
            setSheetOpen(false);
          }}
        />
      ) : null}
      {editorOpen ? (
        <CustomerAddressEditorModal
          mode="add"
          addresses={addressesQuery.addresses}
          onSaved={saved => setDeliveryAddressId(saved.id)}
          onClose={() => setEditorOpen(false)}
        />
      ) : null}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  content: {gap: spacing.md, padding: spacing.md, paddingBottom: spacing.xl},
  planRow: {flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md},
  planText: {flex: 1, minWidth: 0, gap: spacing.xxs},
  planName: {
    color: colors.textPrimary,
    fontSize: typography.button,
    fontWeight: fontWeight.bold,
  },
  secondary: {color: colors.textSecondary, fontSize: typography.small},
  price: {
    marginTop: spacing.xxs,
    color: colors.textPrimary,
    fontSize: typography.heading,
    fontWeight: fontWeight.bold,
  },
  per: {
    color: colors.textSecondary,
    fontSize: typography.small,
    fontWeight: fontWeight.regular,
  },
  policyLink: {alignSelf: 'flex-start', minHeight: touchTarget.minimum, justifyContent: 'center'},
  policyText: {
    color: colors.flameRedAccessible,
    fontSize: typography.body,
    fontWeight: fontWeight.semibold,
    textDecorationLine: 'underline',
  },
  pressed: {opacity: 0.7},
  backdrop: {flex: 1, justifyContent: 'flex-end', backgroundColor: colors.overlay},
  sheet: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    backgroundColor: colors.white,
    ...elevation.card,
  },
  handle: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    marginBottom: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.borderStrong,
  },
  sheetTitle: {
    marginBottom: spacing.xs,
    color: colors.textPrimary,
    fontSize: typography.heading,
    fontWeight: fontWeight.bold,
  },
  dateRow: {
    minHeight: touchTarget.minimum,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateText: {color: colors.textPrimary, fontSize: typography.body},
});
