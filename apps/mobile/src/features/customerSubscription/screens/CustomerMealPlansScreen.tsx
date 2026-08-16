import React from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import MaterialDesignIcons from '@react-native-vector-icons/material-design-icons';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import type {CustomerProfileStackParamList} from '../../../app/navigation/types';
import {useAppSelector} from '../../../app/store/hooks';
import {
  borderWidth,
  colors,
  elevation,
  fontWeight,
  radius,
  spacing,
  touchTarget,
  typography,
} from '../../../design/tokens';
import {ScreenShell} from '../../../shared/components/ScreenShell';
import {customerAddressesApi} from '../../customerAddresses/api/customerAddressesApi';
import {
  isCustomerAddressDeliveryReady,
  type CustomerAddress,
} from '../../customerAddresses/domain/customerAddressContract';
import {
  customerSubscriptionApi,
  type CustomerSubscription,
  type CustomerSubscriptionOccurrence,
  type PublicPlanSchedule,
  type PublicSubscriptionPlan,
} from '../api/customerSubscriptionApi';

type Navigation = NativeStackNavigationProp<CustomerProfileStackParamList>;
type Category = 'ALL' | 'WEIGHT_LOSS' | 'HIGH_PROTEIN' | 'VEG' | 'BALANCED' | 'CUSTOM';

const ICON_SURFACE = '#F1F5F9';
const CATEGORIES: readonly {key: Category; label: string; icon: string}[] = [
  {key: 'ALL', label: 'All Plans', icon: 'silverware-fork-knife'},
  {key: 'WEIGHT_LOSS', label: 'Weight Loss', icon: 'scale-bathroom'},
  {key: 'HIGH_PROTEIN', label: 'High Protein', icon: 'dumbbell'},
  {key: 'VEG', label: 'Veg', icon: 'leaf'},
  {key: 'BALANCED', label: 'Balanced', icon: 'scale-balance'},
  {key: 'CUSTOM', label: 'Custom', icon: 'tune-variant'},
] as const;

function FilledIcon({name, size = 22, color = colors.espressoBrown}: {name: string; size?: number; color?: string}) {
  return <MaterialDesignIcons name={name as never} size={size} color={color} />;
}

function money(plan: PublicSubscriptionPlan): string {
  const value = Number(plan.amount);
  const amount = Number.isFinite(value) ? value.toFixed(Number.isInteger(value) ? 0 : 2) : plan.amount;
  return plan.currency === 'INR' ? `₹${amount}` : `${plan.currency} ${amount}`;
}

function billingLabel(value: string): string {
  const normalized = value.replace(/_/g, ' ').toLowerCase();
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function planMatchesCategory(plan: PublicSubscriptionPlan, category: Category): boolean {
  if (category === 'ALL') return true;
  if (category === 'CUSTOM') return false;
  const haystack = `${plan.planCode} ${plan.name} ${plan.description ?? ''}`.toLowerCase();
  if (category === 'WEIGHT_LOSS') return /(weight|light|calorie|lean)/.test(haystack);
  if (category === 'HIGH_PROTEIN') return /(protein|fitness|muscle)/.test(haystack);
  if (category === 'VEG') return /(veg|vegetarian|plant)/.test(haystack);
  return /(balanced|daily|complete|regular)/.test(haystack);
}

function statusLabel(status: string): string {
  return status.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, char => char.toUpperCase());
}

function isoDate(offsetDays = 0): string {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function dateLabel(value: string): string {
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(undefined, {weekday: 'short', day: 'numeric', month: 'short'});
}

function addressLabel(address: CustomerAddress): string {
  return [address.addressLine1, address.areaName, address.city].filter(Boolean).join(', ');
}

function PlanCard({plan, onPress}: {plan: PublicSubscriptionPlan; onPress: () => void}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({pressed}) => [styles.planCard, pressed && styles.pressed]}>
      <View style={styles.planVisual}>
        <View style={styles.planTag}><Text style={styles.planTagText}>{billingLabel(plan.billingPeriod)}</Text></View>
        <View style={styles.planVisualIcon}><FilledIcon name="food-variant" size={38} color={colors.flameRed} /></View>
      </View>
      <View style={styles.planCardBody}>
        <Text numberOfLines={2} style={styles.planName}>{plan.name}</Text>
        <Text numberOfLines={2} style={styles.planDescription}>{plan.description || 'Chef-curated meal plan'}</Text>
        <View style={styles.priceRow}>
          <Text style={styles.planPrice}>{money(plan)}</Text>
          <Text style={styles.planPeriod}> / {billingLabel(plan.billingPeriod).toLowerCase()}</Text>
        </View>
        <View style={styles.planFooter}>
          <Text numberOfLines={1} style={styles.planCode}>{plan.planCode}</Text>
          <View style={styles.circleButton}><FilledIcon name="chevron-right" size={20} /></View>
        </View>
      </View>
    </Pressable>
  );
}

export function CustomerMealPlansScreen() {
  const navigation = useNavigation<Navigation>();
  const location = useAppSelector(state => state.customerShell.selectedLocation);
  const [plans, setPlans] = React.useState<PublicSubscriptionPlan[]>([]);
  const [subscriptions, setSubscriptions] = React.useState<CustomerSubscription[]>([]);
  const [addresses, setAddresses] = React.useState<CustomerAddress[]>([]);
  const [selectedCategory, setSelectedCategory] = React.useState<Category>('ALL');
  const [selectedPlan, setSelectedPlan] = React.useState<PublicSubscriptionPlan | null>(null);
  const [schedule, setSchedule] = React.useState<PublicPlanSchedule | null>(null);
  const [selectedSubscription, setSelectedSubscription] = React.useState<CustomerSubscription | null>(null);
  const [occurrences, setOccurrences] = React.useState<CustomerSubscriptionOccurrence[]>([]);
  const [myPlansVisible, setMyPlansVisible] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [selectedAddressId, setSelectedAddressId] = React.useState<string | null>(null);
  const [startDate, setStartDate] = React.useState(isoDate(1));
  const [notes, setNotes] = React.useState('');
  const idempotencyKey = React.useRef<string | null>(null);

  const load = React.useCallback(async (background = false) => {
    background ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      const [nextPlans, nextSubscriptions, nextAddresses] = await Promise.all([
        customerSubscriptionApi.listPlans(),
        customerSubscriptionApi.listMine(),
        customerAddressesApi.list(),
      ]);
      const deliveryReady = nextAddresses.filter(isCustomerAddressDeliveryReady);
      setPlans(nextPlans);
      setSubscriptions(nextSubscriptions);
      setAddresses(deliveryReady);
      setSelectedAddressId(current =>
        current && deliveryReady.some(address => address.id === current)
          ? current
          : deliveryReady.find(address => address.isDefault)?.id ?? deliveryReady[0]?.id ?? null,
      );
    } catch {
      setError('Meal plans could not be refreshed. Check your connection and try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  React.useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  React.useEffect(() => {
    if (!selectedPlan) {
      setSchedule(null);
      return;
    }
    const controller = new AbortController();
    customerSubscriptionApi
      .getPlanSchedule(selectedPlan.id, controller.signal)
      .then(setSchedule)
      .catch(() => setSchedule(null));
    return () => controller.abort();
  }, [selectedPlan]);

  const openSubscription = React.useCallback(async (subscription: CustomerSubscription) => {
    setSelectedSubscription(subscription);
    setOccurrences([]);
    try {
      const next = await customerSubscriptionApi.listOccurrences(subscription.id);
      setOccurrences(next);
    } catch {
      setOccurrences([]);
    }
  }, []);

  const filteredPlans = React.useMemo(
    () => plans.filter(plan => planMatchesCategory(plan, selectedCategory)),
    [plans, selectedCategory],
  );

  const durationPlans = React.useMemo(() => {
    const weekly = plans.find(plan => /(week|7)/i.test(`${plan.billingPeriod} ${plan.name}`));
    const fortnight = plans.find(plan => /14|fortnight/i.test(`${plan.billingPeriod} ${plan.name}`));
    const monthly = plans.find(plan => /(month|30)/i.test(`${plan.billingPeriod} ${plan.name}`));
    return [
      {days: 7, title: '7 Days Plan', subtitle: 'Perfect for a week of healthy eating', plan: weekly},
      {days: 14, title: '14 Days Plan', subtitle: 'Build better habits for two weeks', plan: fortnight},
      {days: 30, title: '30 Days Plan', subtitle: 'Transform your lifestyle in a month', plan: monthly},
    ];
  }, [plans]);

  const createSubscription = React.useCallback(async () => {
    if (!selectedPlan || !selectedAddressId || busy) return;
    setBusy(true);
    try {
      idempotencyKey.current ??= `mobile-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      const created = await customerSubscriptionApi.create(
        {planId: selectedPlan.id, startDate, deliveryAddressId: selectedAddressId, notes: notes.trim() || undefined},
        idempotencyKey.current,
      );
      idempotencyKey.current = null;
      setSubscriptions(current => [created, ...current.filter(item => item.id !== created.id)]);
      setSelectedPlan(null);
      setSchedule(null);
      setNotes('');
      Alert.alert('Meal plan started', `Your subscription is ${statusLabel(created.status)}.`);
    } catch {
      Alert.alert('Could not start meal plan', 'Your request was not confirmed. Please retry with the same details.');
    } finally {
      setBusy(false);
    }
  }, [busy, notes, selectedAddressId, selectedPlan, startDate]);

  const mutateSubscription = React.useCallback(
    async (action: 'PAUSE' | 'RESUME' | 'CANCEL' | 'SKIP') => {
      const current = selectedSubscription;
      if (!current || busy) return;
      setBusy(true);
      try {
        let updated = current;
        if (action === 'PAUSE') {
          updated = await customerSubscriptionApi.pause(current.id, 'Customer requested pause in mobile app');
        } else if (action === 'RESUME') {
          updated = await customerSubscriptionApi.resume(current.id, current.nextServiceDate ?? isoDate(1), 'Customer requested resume in mobile app');
        } else if (action === 'CANCEL') {
          updated = await customerSubscriptionApi.cancel(current.id, 'Customer requested cancellation in mobile app');
        } else {
          if (!current.nextServiceDate) throw new Error('No service date');
          await customerSubscriptionApi.skip(current.id, current.nextServiceDate, 'Customer skipped next meal in mobile app');
          const nextOccurrences = await customerSubscriptionApi.listOccurrences(current.id);
          setOccurrences(nextOccurrences);
        }
        if (action !== 'SKIP') {
          setSelectedSubscription(updated);
          setSubscriptions(items => items.map(item => (item.id === updated.id ? updated : item)));
        }
      } catch {
        Alert.alert('Action could not be completed', 'The server did not confirm this subscription change. Please refresh and try again.');
      } finally {
        setBusy(false);
      }
    },
    [busy, selectedSubscription],
  );

  const confirmAction = React.useCallback(
    (action: 'PAUSE' | 'RESUME' | 'CANCEL' | 'SKIP', title: string) => {
      Alert.alert(title, 'This updates your subscription immediately after server validation.', [
        {text: 'Back', style: 'cancel'},
        {text: 'Continue', style: action === 'CANCEL' ? 'destructive' : 'default', onPress: () => mutateSubscription(action)},
      ]);
    },
    [mutateSubscription],
  );

  return (
    <ScreenShell edges={['top']} keyboardAvoiding testID="customer-meal-plans">
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.flameRed} colors={[colors.flameRed]} />}
        showsVerticalScrollIndicator={false}>
        <View style={styles.locationRow}>
          <View style={styles.locationLeft}>
            <View style={styles.iconTileSmall}><FilledIcon name="map-marker" color={colors.flameRed} /></View>
            <Text numberOfLines={1} style={styles.locationText}>{location?.displayName ?? 'Choose delivery location'}</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Open notifications" onPress={() => navigation.navigate('CustomerNotifications')} style={styles.iconTileSmall}>
            <FilledIcon name="bell" color={colors.espressoBrown} />
          </Pressable>
        </View>

        <View style={styles.heroRow}>
          <View style={styles.heroCopy}>
            <View style={styles.titleRow}>
              <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => navigation.goBack()} style={styles.backButton}>
                <FilledIcon name="arrow-left" size={26} />
              </Pressable>
              <Text accessibilityRole="header" style={styles.title}>Meal Plans</Text>
            </View>
            <Text style={styles.subtitle}>Nutritious & delicious meals, planned <Text style={styles.accentText}>just for you.</Text></Text>
            <Pressable accessibilityRole="button" onPress={() => setMyPlansVisible(true)} style={styles.myPlansButton}>
              <FilledIcon name="calendar-check" size={18} color={colors.flameRed} />
              <Text style={styles.myPlansText}>My subscriptions ({subscriptions.length})</Text>
            </Pressable>
          </View>
          <View style={styles.heroVisual}>
            <FilledIcon name="bowl-mix" size={72} color={colors.flameRed} />
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>
          {CATEGORIES.map(category => {
            const selected = selectedCategory === category.key;
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{selected}}
                key={category.key}
                onPress={() => {
                  if (category.key === 'CUSTOM') {
                    Alert.alert('Custom plan preferences', 'The current backend does not expose a customer custom-plan creation contract yet. Existing approved plans remain fully available.');
                    return;
                  }
                  setSelectedCategory(category.key);
                }}
                style={[styles.categoryCard, selected && styles.categoryCardSelected]}>
                <View style={styles.categoryIcon}><FilledIcon name={category.icon} color={selected ? colors.flameRed : colors.espressoBrown} /></View>
                <Text style={[styles.categoryLabel, selected && styles.categoryLabelSelected]}>{category.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {error ? (
          <Pressable accessibilityRole="button" onPress={() => load()} style={styles.errorCard}>
            <FilledIcon name="alert-circle" color={colors.error} />
            <Text style={styles.errorText}>{error} Tap to retry.</Text>
          </Pressable>
        ) : null}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recommended Plans</Text>
          <Pressable accessibilityRole="button" onPress={() => setSelectedCategory('ALL')}><Text style={styles.linkText}>View all</Text></Pressable>
        </View>
        {loading ? (
          <View style={styles.loadingCard}><ActivityIndicator color={colors.flameRed} /><Text style={styles.loadingText}>Loading active meal plans…</Text></View>
        ) : filteredPlans.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.planRow}>
            {filteredPlans.map(plan => <PlanCard key={plan.id} plan={plan} onPress={() => setSelectedPlan(plan)} />)}
          </ScrollView>
        ) : (
          <View style={styles.emptyCard}><Text style={styles.emptyTitle}>No active plans in this category</Text><Text style={styles.emptyCopy}>Try All Plans or pull to refresh.</Text></View>
        )}

        <Text style={styles.sectionTitle}>Plans by Duration</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.durationRow}>
          {durationPlans.map(option => (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{disabled: !option.plan}}
              disabled={!option.plan}
              key={option.days}
              onPress={() => option.plan && setSelectedPlan(option.plan)}
              style={[styles.durationCard, !option.plan && styles.disabledCard]}>
              <View style={styles.durationIcon}><FilledIcon name="calendar-month" color={colors.flameRed} /></View>
              <View style={styles.durationCopy}><Text style={styles.durationTitle}>{option.title}</Text><Text style={styles.durationSubtitle}>{option.plan ? option.subtitle : 'No matching active backend plan yet'}</Text></View>
              <FilledIcon name="chevron-right" size={18} />
            </Pressable>
          ))}
        </ScrollView>

        <View style={styles.customBanner}>
          <View style={styles.customCopy}>
            <Text style={styles.customTitle}>Customize Your Plan</Text>
            <Text style={styles.customText}>Tell us your preferences and we’ll create a plan just for you.</Text>
            <Pressable accessibilityRole="button" onPress={() => Alert.alert('Custom plans are not live yet', 'A customer preference/custom-plan backend endpoint is required before this button can submit real data.')} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>Create Custom Plan</Text>
            </Pressable>
          </View>
          <View style={styles.customVisual}><FilledIcon name="clipboard-check" size={54} color={colors.flameRed} /></View>
        </View>

        <Text style={styles.sectionTitle}>Why Choose Meal Plans?</Text>
        <View style={styles.benefitGrid}>
          {[
            ['heart-circle', 'Homemade & Hygienic', 'Made by trusted home chefs'],
            ['sprout', 'Nutritious & Balanced', 'Chef-planned meals'],
            ['calendar-clock', 'Hassle-free Ordering', 'Scheduled meal service'],
            ['currency-inr', 'Save Time & Money', 'One plan, predictable pricing'],
          ].map(([icon, titleText, body]) => (
            <View key={titleText} style={styles.benefitItem}>
              <View style={styles.benefitIcon}><FilledIcon name={icon} color={colors.flameRed} /></View>
              <Text style={styles.benefitTitle}>{titleText}</Text>
              <Text style={styles.benefitText}>{body}</Text>
            </View>
          ))}
        </View>
      </ScrollView>

      <Modal animationType="slide" visible={selectedPlan !== null} onRequestClose={() => setSelectedPlan(null)}>
        <ScreenShell edges={['top', 'bottom']} keyboardAvoiding testID="customer-meal-plan-detail">
          <ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
            <View style={styles.modalHeader}>
              <Pressable accessibilityRole="button" onPress={() => setSelectedPlan(null)} style={styles.iconTileSmall}><FilledIcon name="close" /></Pressable>
              <Text style={styles.modalTitle}>Plan details</Text>
            </View>
            {selectedPlan ? (
              <>
                <View style={styles.detailHero}>
                  <View style={styles.planVisualIcon}><FilledIcon name="food-variant" size={42} color={colors.flameRed} /></View>
                  <Text style={styles.detailTitle}>{selectedPlan.name}</Text>
                  <Text style={styles.detailDescription}>{selectedPlan.description || 'Chef-curated meal plan.'}</Text>
                  <Text style={styles.detailPrice}>{money(selectedPlan)} · {billingLabel(selectedPlan.billingPeriod)}</Text>
                </View>
                <Text style={styles.sectionTitle}>What you’ll receive</Text>
                {schedule?.items.length ? schedule.items.map(item => (
                  <View key={`${item.menuItemId}-${item.sequenceNumber}`} style={styles.scheduleRow}>
                    <View style={styles.iconTileSmall}><FilledIcon name="food" color={colors.flameRed} /></View>
                    <View style={styles.scheduleCopy}>
                      <Text style={styles.scheduleTitle}>{item.menuItemName}</Text>
                      <Text style={styles.scheduleMeta}>{item.mealSlotCode.replace(/_/g, ' ')} · Qty {item.quantity} · {item.serviceTime.slice(0, 5)}</Text>
                    </View>
                  </View>
                )) : <Text style={styles.helperText}>Schedule details are not published for this plan yet.</Text>}

                <Text style={styles.sectionTitle}>Start date</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateRow}>
                  {Array.from({length: 7}, (_, index) => isoDate(index + 1)).map(date => (
                    <Pressable key={date} accessibilityRole="button" accessibilityState={{selected: startDate === date}} onPress={() => setStartDate(date)} style={[styles.dateChip, startDate === date && styles.dateChipSelected]}>
                      <Text style={[styles.dateChipText, startDate === date && styles.dateChipTextSelected]}>{dateLabel(date)}</Text>
                    </Pressable>
                  ))}
                </ScrollView>

                <Text style={styles.sectionTitle}>Deliver to</Text>
                {addresses.length ? addresses.map(address => (
                  <Pressable key={address.id} accessibilityRole="radio" accessibilityState={{checked: selectedAddressId === address.id}} onPress={() => setSelectedAddressId(address.id)} style={[styles.addressCard, selectedAddressId === address.id && styles.addressCardSelected]}>
                    <View style={styles.iconTileSmall}><FilledIcon name="map-marker" color={colors.flameRed} /></View>
                    <View style={styles.addressCopy}><Text style={styles.addressTitle}>{address.addressLabel ?? (address.isDefault ? 'Default address' : 'Saved address')}</Text><Text style={styles.addressText}>{addressLabel(address)}</Text></View>
                    {selectedAddressId === address.id ? <FilledIcon name="check-circle" color={colors.flameRed} /> : null}
                  </Pressable>
                )) : <Text style={styles.helperText}>Add a delivery-ready saved address before starting a meal plan.</Text>}

                <Text style={styles.sectionTitle}>Notes (optional)</Text>
                <TextInput multiline value={notes} onChangeText={setNotes} maxLength={2000} placeholder="Dietary or delivery notes for this plan" placeholderTextColor={colors.placeholder} style={styles.notesInput} />
                <Pressable accessibilityRole="button" disabled={!selectedAddressId || busy} onPress={createSubscription} style={[styles.primaryButton, (!selectedAddressId || busy) && styles.primaryButtonDisabled]}>
                  {busy ? <ActivityIndicator color={colors.white} /> : <Text style={styles.primaryButtonText}>Start Meal Plan</Text>}
                </Pressable>
                <Text style={styles.helperText}>Craves creates the subscription only after the backend accepts this plan, date and saved address. Any payment-required state remains server authoritative.</Text>
              </>
            ) : null}
          </ScrollView>
        </ScreenShell>
      </Modal>

      <Modal animationType="slide" visible={myPlansVisible} onRequestClose={() => setMyPlansVisible(false)}>
        <ScreenShell edges={['top', 'bottom']} keyboardAvoiding={false} testID="customer-my-subscriptions">
          <ScrollView contentContainerStyle={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Pressable accessibilityRole="button" onPress={() => setMyPlansVisible(false)} style={styles.iconTileSmall}><FilledIcon name="close" /></Pressable>
              <Text style={styles.modalTitle}>My Meal Plans</Text>
            </View>
            {subscriptions.length ? subscriptions.map(subscription => {
              const plan = plans.find(candidate => candidate.id === subscription.planId);
              return (
                <Pressable key={subscription.id} accessibilityRole="button" onPress={() => openSubscription(subscription)} style={styles.subscriptionCard}>
                  <View style={styles.subscriptionIcon}><FilledIcon name="calendar-check" color={colors.flameRed} /></View>
                  <View style={styles.subscriptionCopy}>
                    <Text style={styles.subscriptionTitle}>{plan?.name ?? 'Meal plan'}</Text>
                    <Text style={styles.subscriptionStatus}>{statusLabel(subscription.status)}</Text>
                    <Text style={styles.subscriptionMeta}>Started {dateLabel(subscription.startDate)}{subscription.nextServiceDate ? ` · Next ${dateLabel(subscription.nextServiceDate)}` : ''}</Text>
                  </View>
                  <FilledIcon name="chevron-right" />
                </Pressable>
              );
            }) : <View style={styles.emptyCard}><Text style={styles.emptyTitle}>No subscriptions yet</Text><Text style={styles.emptyCopy}>Choose an active meal plan to get started.</Text></View>}
          </ScrollView>
        </ScreenShell>
      </Modal>

      <Modal animationType="slide" visible={selectedSubscription !== null} onRequestClose={() => setSelectedSubscription(null)}>
        <ScreenShell edges={['top', 'bottom']} keyboardAvoiding={false} testID="customer-subscription-detail">
          <ScrollView contentContainerStyle={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Pressable accessibilityRole="button" onPress={() => setSelectedSubscription(null)} style={styles.iconTileSmall}><FilledIcon name="arrow-left" /></Pressable>
              <Text style={styles.modalTitle}>Subscription</Text>
            </View>
            {selectedSubscription ? (
              <>
                <View style={styles.detailHero}>
                  <Text style={styles.detailTitle}>{plans.find(plan => plan.id === selectedSubscription.planId)?.name ?? 'Meal plan'}</Text>
                  <Text style={styles.detailPrice}>{statusLabel(selectedSubscription.status)}</Text>
                  <Text style={styles.detailDescription}>Start {dateLabel(selectedSubscription.startDate)}{selectedSubscription.nextServiceDate ? ` · Next service ${dateLabel(selectedSubscription.nextServiceDate)}` : ''}</Text>
                </View>
                <View style={styles.actionRow}>
                  {selectedSubscription.status === 'ACTIVE' ? <Pressable onPress={() => confirmAction('PAUSE', 'Pause meal plan?')} style={styles.secondaryButton}><FilledIcon name="pause" size={18} /><Text style={styles.secondaryButtonText}>Pause</Text></Pressable> : null}
                  {selectedSubscription.status === 'PAUSED' ? <Pressable onPress={() => confirmAction('RESUME', 'Resume meal plan?')} style={styles.secondaryButton}><FilledIcon name="play" size={18} /><Text style={styles.secondaryButtonText}>Resume</Text></Pressable> : null}
                  {selectedSubscription.status === 'ACTIVE' && selectedSubscription.nextServiceDate ? <Pressable onPress={() => confirmAction('SKIP', 'Skip next meal date?')} style={styles.secondaryButton}><FilledIcon name="calendar-remove" size={18} /><Text style={styles.secondaryButtonText}>Skip next</Text></Pressable> : null}
                  {['ACTIVE', 'PAUSED'].includes(selectedSubscription.status) ? <Pressable onPress={() => confirmAction('CANCEL', 'Cancel meal plan?')} style={[styles.secondaryButton, styles.dangerButton]}><FilledIcon name="close-circle" size={18} color={colors.error} /><Text style={styles.dangerButtonText}>Cancel</Text></Pressable> : null}
                </View>
                <Text style={styles.sectionTitle}>Upcoming & recent meals</Text>
                {occurrences.length ? occurrences.map(occurrence => (
                  <View key={occurrence.id} style={styles.scheduleRow}>
                    <View style={styles.iconTileSmall}><FilledIcon name="calendar" color={colors.flameRed} /></View>
                    <View style={styles.scheduleCopy}><Text style={styles.scheduleTitle}>{dateLabel(occurrence.serviceDate)}</Text><Text style={styles.scheduleMeta}>{occurrence.mealSlotCode.replace(/_/g, ' ')} · {statusLabel(occurrence.status)} · {occurrence.items.length} item{occurrence.items.length === 1 ? '' : 's'}</Text></View>
                  </View>
                )) : <Text style={styles.helperText}>No generated meal occurrences are available yet.</Text>}
              </>
            ) : null}
          </ScrollView>
        </ScreenShell>
      </Modal>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  content: {paddingHorizontal: spacing.md, paddingBottom: spacing.xxxl, gap: spacing.lg, backgroundColor: colors.white},
  locationRow: {minHeight: 60, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm},
  locationLeft: {minWidth: 0, flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.xs},
  locationText: {minWidth: 0, flex: 1, color: colors.espressoBrown, fontSize: typography.body, fontWeight: fontWeight.semibold},
  iconTileSmall: {width: touchTarget.minimum, height: touchTarget.minimum, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: ICON_SURFACE},
  heroRow: {minHeight: 180, flexDirection: 'row', alignItems: 'center', gap: spacing.md},
  heroCopy: {minWidth: 0, flex: 1},
  titleRow: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm},
  backButton: {width: touchTarget.minimum, height: touchTarget.minimum, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: ICON_SURFACE},
  title: {color: colors.espressoBrown, fontSize: typography.title, fontWeight: fontWeight.extrabold},
  subtitle: {marginTop: spacing.xs, color: colors.textSecondary, fontSize: typography.body, lineHeight: 22},
  accentText: {color: colors.flameRedAccessible, fontWeight: fontWeight.semibold},
  myPlansButton: {alignSelf: 'flex-start', marginTop: spacing.sm, minHeight: touchTarget.minimum, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.sm, borderRadius: radius.pill, backgroundColor: ICON_SURFACE},
  myPlansText: {color: colors.flameRedAccessible, fontSize: typography.small, fontWeight: fontWeight.semibold},
  heroVisual: {width: 124, height: 124, alignItems: 'center', justifyContent: 'center', borderRadius: radius.xl, backgroundColor: ICON_SURFACE},
  categoryRow: {gap: spacing.sm, paddingVertical: spacing.xxs},
  categoryCard: {width: 92, minHeight: 104, alignItems: 'center', justifyContent: 'center', gap: spacing.xs, padding: spacing.xs, borderRadius: radius.lg, borderWidth: borderWidth.standard, borderColor: colors.border, backgroundColor: colors.white},
  categoryCardSelected: {borderColor: colors.flameRed, borderWidth: borderWidth.strong},
  categoryIcon: {width: 52, height: 52, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: ICON_SURFACE},
  categoryLabel: {color: colors.espressoBrown, fontSize: typography.tiny, fontWeight: fontWeight.semibold, textAlign: 'center'},
  categoryLabelSelected: {color: colors.flameRedAccessible},
  errorCard: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.errorSoft},
  errorText: {minWidth: 0, flex: 1, color: colors.error, fontSize: typography.small},
  sectionHeader: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  sectionTitle: {color: colors.espressoBrown, fontSize: typography.heading, fontWeight: fontWeight.bold},
  linkText: {color: colors.flameRedAccessible, fontSize: typography.small, fontWeight: fontWeight.bold},
  loadingCard: {minHeight: 120, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, borderRadius: radius.lg, backgroundColor: colors.surfaceMuted},
  loadingText: {color: colors.textSecondary, fontSize: typography.small},
  planRow: {gap: spacing.md, paddingBottom: spacing.xs},
  planCard: {width: 248, overflow: 'hidden', borderRadius: radius.lg, borderWidth: borderWidth.standard, borderColor: colors.border, backgroundColor: colors.white, ...elevation.card},
  planVisual: {height: 132, padding: spacing.sm, justifyContent: 'space-between', backgroundColor: ICON_SURFACE},
  planTag: {alignSelf: 'flex-start', paddingHorizontal: spacing.xs, paddingVertical: spacing.xxs, borderRadius: radius.pill, backgroundColor: colors.white},
  planTagText: {color: colors.flameRedAccessible, fontSize: typography.tiny, fontWeight: fontWeight.semibold},
  planVisualIcon: {alignSelf: 'center', width: 72, height: 72, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, backgroundColor: colors.white},
  planCardBody: {padding: spacing.sm},
  planName: {color: colors.espressoBrown, fontSize: typography.body, fontWeight: fontWeight.bold},
  planDescription: {minHeight: 36, marginTop: spacing.xxs, color: colors.textSecondary, fontSize: typography.tiny, lineHeight: 18},
  priceRow: {marginTop: spacing.xs, flexDirection: 'row', alignItems: 'baseline'},
  planPrice: {color: colors.flameRedAccessible, fontSize: typography.heading, fontWeight: fontWeight.bold},
  planPeriod: {color: colors.textSecondary, fontSize: typography.tiny},
  planFooter: {marginTop: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.xs},
  planCode: {minWidth: 0, flex: 1, color: colors.textSecondary, fontSize: typography.tiny},
  circleButton: {width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, backgroundColor: ICON_SURFACE},
  pressed: {opacity: 0.76},
  emptyCard: {padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.surfaceMuted},
  emptyTitle: {color: colors.espressoBrown, fontSize: typography.body, fontWeight: fontWeight.bold},
  emptyCopy: {marginTop: spacing.xxs, color: colors.textSecondary, fontSize: typography.small},
  durationRow: {gap: spacing.sm},
  durationCard: {width: 250, minHeight: 104, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm, borderRadius: radius.lg, borderWidth: borderWidth.standard, borderColor: colors.border, backgroundColor: colors.white},
  disabledCard: {opacity: 0.5},
  durationIcon: {width: 54, height: 54, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: ICON_SURFACE},
  durationCopy: {minWidth: 0, flex: 1},
  durationTitle: {color: colors.espressoBrown, fontSize: typography.body, fontWeight: fontWeight.bold},
  durationSubtitle: {marginTop: spacing.xxs, color: colors.textSecondary, fontSize: typography.tiny, lineHeight: 17},
  customBanner: {minHeight: 180, flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, borderRadius: radius.lg, borderWidth: borderWidth.standard, borderColor: colors.border, backgroundColor: colors.white},
  customCopy: {minWidth: 0, flex: 1},
  customTitle: {color: colors.espressoBrown, fontSize: typography.heading, fontWeight: fontWeight.bold},
  customText: {marginTop: spacing.xs, color: colors.textSecondary, fontSize: typography.small, lineHeight: 20},
  customVisual: {width: 100, height: 100, alignItems: 'center', justifyContent: 'center', borderRadius: radius.xl, backgroundColor: ICON_SURFACE},
  primaryButton: {minHeight: touchTarget.minimum, marginTop: spacing.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md, borderRadius: radius.md, backgroundColor: colors.flameRed},
  primaryButtonDisabled: {opacity: 0.45},
  primaryButtonText: {color: colors.white, fontSize: typography.body, fontWeight: fontWeight.bold},
  benefitGrid: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm},
  benefitItem: {width: '47%', minHeight: 132, padding: spacing.sm, borderRadius: radius.lg, backgroundColor: colors.white, borderWidth: borderWidth.standard, borderColor: colors.border},
  benefitIcon: {width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: ICON_SURFACE},
  benefitTitle: {marginTop: spacing.xs, color: colors.espressoBrown, fontSize: typography.small, fontWeight: fontWeight.bold},
  benefitText: {marginTop: spacing.xxs, color: colors.textSecondary, fontSize: typography.tiny, lineHeight: 17},
  modalContent: {padding: spacing.md, paddingBottom: spacing.xxxl, gap: spacing.md, backgroundColor: colors.white},
  modalHeader: {minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: spacing.sm},
  modalTitle: {color: colors.espressoBrown, fontSize: typography.hero, fontWeight: fontWeight.bold},
  detailHero: {padding: spacing.lg, alignItems: 'center', borderRadius: radius.lg, backgroundColor: ICON_SURFACE},
  detailTitle: {marginTop: spacing.sm, color: colors.espressoBrown, fontSize: typography.hero, fontWeight: fontWeight.bold, textAlign: 'center'},
  detailDescription: {marginTop: spacing.xs, color: colors.textSecondary, fontSize: typography.small, lineHeight: 20, textAlign: 'center'},
  detailPrice: {marginTop: spacing.sm, color: colors.flameRedAccessible, fontSize: typography.heading, fontWeight: fontWeight.bold},
  scheduleRow: {minHeight: 74, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm, borderRadius: radius.md, borderWidth: borderWidth.standard, borderColor: colors.border, backgroundColor: colors.white},
  scheduleCopy: {minWidth: 0, flex: 1},
  scheduleTitle: {color: colors.espressoBrown, fontSize: typography.small, fontWeight: fontWeight.bold},
  scheduleMeta: {marginTop: spacing.xxs, color: colors.textSecondary, fontSize: typography.tiny},
  helperText: {color: colors.textSecondary, fontSize: typography.small, lineHeight: 20},
  dateRow: {gap: spacing.xs},
  dateChip: {minHeight: touchTarget.minimum, justifyContent: 'center', paddingHorizontal: spacing.sm, borderRadius: radius.pill, borderWidth: borderWidth.standard, borderColor: colors.border, backgroundColor: colors.white},
  dateChipSelected: {borderColor: colors.flameRed, backgroundColor: colors.flameRed},
  dateChipText: {color: colors.espressoBrown, fontSize: typography.small, fontWeight: fontWeight.semibold},
  dateChipTextSelected: {color: colors.white},
  addressCard: {minHeight: 84, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm, borderRadius: radius.md, borderWidth: borderWidth.standard, borderColor: colors.border, backgroundColor: colors.white},
  addressCardSelected: {borderColor: colors.flameRed, borderWidth: borderWidth.strong},
  addressCopy: {minWidth: 0, flex: 1},
  addressTitle: {color: colors.espressoBrown, fontSize: typography.small, fontWeight: fontWeight.bold},
  addressText: {marginTop: spacing.xxs, color: colors.textSecondary, fontSize: typography.tiny, lineHeight: 17},
  notesInput: {minHeight: 96, padding: spacing.sm, borderRadius: radius.md, borderWidth: borderWidth.standard, borderColor: colors.border, color: colors.espressoBrown, backgroundColor: colors.white, textAlignVertical: 'top'},
  subscriptionCard: {minHeight: 96, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radius.lg, borderWidth: borderWidth.standard, borderColor: colors.border, backgroundColor: colors.white},
  subscriptionIcon: {width: 52, height: 52, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: ICON_SURFACE},
  subscriptionCopy: {minWidth: 0, flex: 1},
  subscriptionTitle: {color: colors.espressoBrown, fontSize: typography.body, fontWeight: fontWeight.bold},
  subscriptionStatus: {marginTop: spacing.xxs, color: colors.flameRedAccessible, fontSize: typography.small, fontWeight: fontWeight.semibold},
  subscriptionMeta: {marginTop: spacing.xxs, color: colors.textSecondary, fontSize: typography.tiny},
  actionRow: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs},
  secondaryButton: {minHeight: touchTarget.minimum, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, paddingHorizontal: spacing.md, borderRadius: radius.md, backgroundColor: ICON_SURFACE},
  secondaryButtonText: {color: colors.espressoBrown, fontSize: typography.small, fontWeight: fontWeight.bold},
  dangerButton: {borderWidth: borderWidth.standard, borderColor: colors.error},
  dangerButtonText: {color: colors.error, fontSize: typography.small, fontWeight: fontWeight.bold},
});
