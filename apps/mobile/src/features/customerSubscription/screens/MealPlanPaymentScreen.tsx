import React from 'react';
import {Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import type {CustomerMealPlanStackParamList} from '../../../app/navigation/types';
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
import {
  Badge,
  Button,
  Icon,
  OfflineNotice,
  RecoverableErrorBanner,
  ScreenShell,
} from '../../../shared/components';
import {
  customerAddressDisplayLine,
  customerAddressLabel,
} from '../../customerAddresses/domain/customerAddressContract';
import {useCustomerAddressesQuery} from '../../customerAddresses/query/customerAddressQueries';
import {CustomerAddressEditorModal} from '../../customerAddresses/screens/CustomerAddressEditorModal';
import {
  billingUnit,
  dayLabel,
  formatMealCount,
  sortScheduleItems,
} from '../../mealPlans/domain/mealPlanSchedule';
import {
  CardSection,
  InfoRow,
  MealPlanHeader,
  MealPlanPhoto,
  PlanRating,
  PlanUnavailable,
} from '../components/MealPlanUi';
import {
  formatMealPlanDate,
  formatPlanPrice,
  upcomingStartDates,
} from '../domain/mealPlanPresentation';
import {
  useLatestSubscriptionPaymentQuery,
  useMySubscriptionsQuery,
  usePlanCover,
  usePlanPolicyQuery,
  usePlanScheduleQuery,
  usePublicMealPlansQuery,
} from '../query/mealPlanQueries';
import {
  useMealPlanCheckout,
  useSelectedDeliveryAddress,
} from '../state/MealPlanCheckoutContext';
import {
  alertProfileIncomplete,
  useSubscriptionCheckout,
  type CheckoutOutcome,
} from '../state/useSubscriptionCheckout';

type Props = NativeStackScreenProps<CustomerMealPlanStackParamList, 'MealPlanPayment'>;
type Notice = Extract<CheckoutOutcome, {kind: 'processing' | 'not-completed'}>;

export function MealPlanPaymentScreen({navigation, route}: Props) {
  const {planId, subscriptionId} = route.params;
  const insets = useSafeAreaInsets();
  const plansQuery = usePublicMealPlansQuery();
  const plan = plansQuery.data?.find(candidate => candidate.id === planId);
  const {imageUrl, kitchenName, summary, rating} = usePlanCover(planId);
  const schedule = usePlanScheduleQuery(planId);
  const policy = usePlanPolicyQuery(planId);
  // Completing payment for an existing subscription shows its own date, address and invoice, and
  // does not need the plan to still be listed.
  const subscriptionsQuery = useMySubscriptionsQuery();
  const existing = subscriptionsQuery.data?.find(item => item.id === subscriptionId);
  const invoiceQuery = useLatestSubscriptionPaymentQuery(subscriptionId ?? null);
  const {startDate, setDeliveryAddressId} = useMealPlanCheckout();
  const {address: selected, addresses, loading: addressLoading, isError: addressError} =
    useSelectedDeliveryAddress();
  const addressesQuery = useCustomerAddressesQuery();
  const {payNew, payExisting, busy} = useSubscriptionCheckout();
  const [notice, setNotice] = React.useState<Notice | null>(null);
  const [editorOpen, setEditorOpen] = React.useState(false);
  const checkoutOpen = React.useRef(false);

  // Leaving mid-checkout would drop a paid result and let a second payment start. `pay` releases
  // this guard before it navigates on its own, so its `replace` is never blocked.
  React.useEffect(
    () =>
      navigation.addListener('beforeRemove', event => {
        if (checkoutOpen.current) {
          event.preventDefault();
        }
      }),
    [navigation],
  );
  // The iOS swipe-back is native and does not wait for the guard above.
  React.useEffect(() => {
    navigation.setOptions({gestureEnabled: !busy});
  }, [busy, navigation]);

  const invoice = invoiceQuery.data;
  const name = plan?.name ?? existing?.planName ?? (subscriptionId ? 'Meal plan' : null);
  const period = plan?.billingPeriod ?? existing?.billingPeriod;
  const price =
    subscriptionId && invoice
      ? formatPlanPrice(invoice.amount.amount, invoice.amount.currency)
      : plan
        ? formatPlanPrice(plan.amount, plan.currency)
        : existing?.amount && existing.currency
          ? formatPlanPrice(existing.amount, existing.currency)
          : null;

  if (!name || !price) {
    const sources = subscriptionId ? [plansQuery, subscriptionsQuery, invoiceQuery] : [plansQuery];
    return (
      <ScreenShell edges={['top', 'bottom']} keyboardAvoiding={false}>
        <MealPlanHeader title="Payment" onBack={navigation.goBack} />
        <PlanUnavailable
          loading={sources.some(source => source.isLoading)}
          onBack={navigation.popToTop}
          onRetry={
            sources.some(source => source.isError)
              ? () => {
                  sources.forEach(source => {
                    source.refetch();
                  });
                }
              : undefined
          }
        />
      </ScreenShell>
    );
  }

  const unit = period ? billingUnit(period) : null;
  const tomorrow = upcomingStartDates(new Date())[0];
  // Same rule as Review: a date that has fallen behind tomorrow is never sent.
  const start = subscriptionId
    ? existing?.startDate
    : startDate && startDate >= tomorrow
      ? startDate
      : tomorrow;
  const address = subscriptionId
    ? addresses.find(candidate => candidate.id === existing?.deliveryAddressId) ?? null
    : selected;

  const menu: {label: string; value: string}[] = [];
  const items = sortScheduleItems(schedule.data?.items ?? []);
  for (const item of unit === 'month' ? items.slice(0, 7) : items) {
    const label = dayLabel(item, 'short');
    const last = menu[menu.length - 1];
    if (last?.label === label) {
      last.value = `${last.value}, ${item.menuItemName}`;
    } else {
      menu.push({label, value: item.menuItemName});
    }
  }

  const pay = async () => {
    const checkout = subscriptionId
      ? payExisting(subscriptionId)
      : selected && start
        ? payNew({planId, startDate: start, deliveryAddressId: selected.id})
        : null;
    if (!checkout) {
      return;
    }
    checkoutOpen.current = true;
    setNotice(null);
    const outcome = await checkout.finally(() => {
      checkoutOpen.current = false;
    });
    if (outcome.kind === 'paid') {
      navigation.replace('MealPlanActivated', {subscriptionId: outcome.subscriptionId});
    } else if (outcome.kind === 'profile-incomplete') {
      alertProfileIncomplete();
    } else {
      setNotice(outcome);
    }
  };

  const addressAction = subscriptionId
    ? undefined
    : address
      ? {label: 'Change', onPress: () => navigation.navigate('MealPlanAddress')}
      : addressLoading
        ? undefined
        : addressError
          ? {
              label: 'Retry',
              onPress: () => {
                addressesQuery.refetch();
              },
            }
          : {label: 'Add an address', onPress: () => setEditorOpen(true)};

  return (
    <ScreenShell edges={['top']} keyboardAvoiding={false} testID="meal-plan-payment">
      <MealPlanHeader title="Payment" onBack={navigation.goBack} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <CardSection>
          <View style={styles.planRow}>
            <MealPlanPhoto uri={imageUrl} size={88} />
            <View style={styles.grow}>
              {unit ? <Badge label={unit === 'month' ? 'Monthly' : 'Weekly'} tone="error" /> : null}
              <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.planName}>
                {name}
              </Text>
              {kitchenName || rating ? (
                <View style={styles.kitchenRow}>
                  {kitchenName ? (
                    <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.secondary}>
                      {kitchenName}
                    </Text>
                  ) : null}
                  <PlanRating rating={rating} />
                </View>
              ) : null}
            </View>
          </View>
          {summary ? (
            <InfoRow
              icon="meal"
              label="Meals"
              value={[formatMealCount(summary, unit ?? 'week'), summary.daysLabel]
                .filter(Boolean)
                .join(' · ')}
            />
          ) : null}
          {summary?.timeLabel ? (
            <InfoRow icon="clock" label="Delivery time" value={summary.timeLabel} />
          ) : null}
          {start ? (
            <InfoRow icon="calendar" label="Starts" value={formatMealPlanDate(start, 'long')} />
          ) : null}
          {unit ? <InfoRow icon="wallet" label="Billing" value={`Every ${unit}`} /> : null}
        </CardSection>

        {menu.length > 0 ? (
          <CardSection title={unit === 'month' ? 'Menu' : "This week's menu"}>
            {menu.map((row, index) => (
              <InfoRow key={row.label} first={index === 0} label={row.label} value={row.value} />
            ))}
          </CardSection>
        ) : null}

        {address || addressAction ? (
          <CardSection>
            <View style={styles.addressRow}>
              <View style={styles.addressTile}>
                <Icon
                  name="location-outline"
                  size={iconSize.lg}
                  color={colors.flameRedAccessible}
                  surface={false}
                />
              </View>
              <View style={styles.grow}>
                <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.secondary}>
                  Delivering to
                </Text>
                {address ? (
                  <>
                    <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.addressLabel}>
                      {customerAddressLabel(address)}
                    </Text>
                    <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.secondary}>
                      {customerAddressDisplayLine(address)}
                    </Text>
                  </>
                ) : addressError ? (
                  <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.secondary}>
                    Your addresses could not be loaded.
                  </Text>
                ) : null}
              </View>
              {addressAction ? (
                <Pressable
                  accessibilityLabel={`${addressAction.label} delivery address`}
                  accessibilityRole="button"
                  onPress={addressAction.onPress}
                  style={({pressed}) => [styles.link, pressed && styles.pressed]}>
                  <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.linkText}>
                    {addressAction.label}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </CardSection>
        ) : null}

        <View style={styles.secureNote}>
          <Icon name="shield" size={iconSize.md} color={colors.successText} surface={false} />
          <View style={styles.grow}>
            <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.secureTitle}>
              Secure payment with Razorpay
            </Text>
            <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.secureBody}>
              Pay with UPI, card, net banking or wallet on the next step.
            </Text>
          </View>
        </View>
      </ScrollView>

      <View style={[styles.bar, {paddingBottom: Math.max(insets.bottom, spacing.sm) + spacing.xs}]}>
        {notice?.kind === 'processing' ? (
          <OfflineNotice
            message="Payment is processing. We'll update your plan shortly."
            retryLabel="Go to My Meal Plan"
            onRetry={() =>
              // Back from My Meal Plan returns to the list, not to this checkout.
              navigation.reset({
                index: 1,
                routes: [
                  {name: 'MealPlans'},
                  {name: 'MyMealPlan', params: {subscriptionId: notice.subscriptionId}},
                ],
              })
            }
          />
        ) : notice ? (
          <RecoverableErrorBanner message={notice.message} />
        ) : null}
        <View
          accessible
          accessibilityLabel={`Total amount ${price}${unit ? ` per ${unit}` : ''}`}
          style={styles.totalRow}>
          <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.secondary}>
            Total amount
          </Text>
          <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.total}>
            {price}
            {unit ? <Text style={styles.per}> / {unit}</Text> : null}
          </Text>
        </View>
        <Button
          label="Pay & Subscribe"
          loading={busy}
          disabled={!subscriptionId && !selected}
          onPress={() => {
            pay();
          }}
        />
        {policy.data?.customerCancelEnabled ? (
          <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.footnote}>
            You can cancel anytime. No lock-in period.
          </Text>
        ) : null}
      </View>

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
  grow: {flex: 1, minWidth: 0},
  planRow: {flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, marginBottom: spacing.sm},
  planName: {
    marginTop: spacing.xs,
    color: colors.textPrimary,
    fontSize: typography.button,
    fontWeight: fontWeight.bold,
  },
  kitchenRow: {flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: 2},
  secondary: {color: colors.textSecondary, fontSize: typography.small},
  addressRow: {flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm},
  addressTile: {
    width: touchTarget.minimum,
    height: touchTarget.minimum,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.errorSoft,
  },
  addressLabel: {
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
  secureNote: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.successSoft,
  },
  secureTitle: {
    color: colors.successText,
    fontSize: typography.body,
    fontWeight: fontWeight.semibold,
  },
  secureBody: {color: colors.successText, fontSize: typography.small},
  bar: {
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    backgroundColor: colors.white,
    borderTopWidth: borderWidth.standard,
    borderTopColor: colors.border,
    ...elevation.card,
    shadowOpacity: 0.05,
    shadowOffset: {width: 0, height: -6},
  },
  totalRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  total: {
    color: colors.textPrimary,
    fontSize: typography.heading,
    fontWeight: fontWeight.bold,
  },
  per: {
    color: colors.textSecondary,
    fontSize: typography.small,
    fontWeight: fontWeight.regular,
  },
  footnote: {color: colors.textSecondary, fontSize: typography.small, textAlign: 'center'},
});
