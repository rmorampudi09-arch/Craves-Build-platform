import React from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import MaterialDesignIcons from '@react-native-vector-icons/material-design-icons';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {ChefProfileStackParamList} from '../../../app/navigation/types';
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
import {ChefHeader} from '../../chefShell/components/ChefHeader';
import {chefMenuApi, type ChefMenuItem} from '../../chefMenu/api/chefMenuApi';
import {
  chefSubscriptionApi,
  type ChefCapacitySummary,
  type ChefMealPlan,
  type ChefMealPlanInput,
  type PutChefScheduleRequest,
} from '../api/chefSubscriptionApi';

type Navigation = NativeStackNavigationProp<ChefProfileStackParamList, 'ChefSubscriptionPlan'>;
type BillingPeriod = ChefMealPlanInput['billingPeriod'];
type MealSlot = 'BREAKFAST' | 'LUNCH' | 'SNACK' | 'DINNER';

type PlanForm = {
  name: string;
  description: string;
  billingPeriod: BillingPeriod;
  amount: string;
};

type MealRow = {
  day: string;
  mealSlotCode: MealSlot;
  serviceTime: string;
  menuItemId: string;
  quantity: string;
};

const ICON_SURFACE = '#F1F5F9';
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
const MEAL_SLOTS: readonly MealSlot[] = ['BREAKFAST', 'LUNCH', 'SNACK', 'DINNER'];
const SLOT_DEFAULT_TIME: Record<MealSlot, string> = {
  BREAKFAST: '08:30',
  LUNCH: '12:30',
  SNACK: '16:30',
  DINNER: '19:30',
};
const EMPTY_FORM: PlanForm = {
  name: '',
  description: '',
  billingPeriod: 'WEEKLY',
  amount: '',
};

function emptyMeal(): MealRow {
  return {
    day: '1',
    mealSlotCode: 'LUNCH',
    serviceTime: SLOT_DEFAULT_TIME.LUNCH,
    menuItemId: '',
    quantity: '1',
  };
}

function FilledIcon({name, size = 22, color = colors.espressoBrown}: {name: string; size?: number; color?: string}) {
  return <MaterialDesignIcons name={name as never} size={size} color={color} />;
}

function planStatusLabel(status: ChefMealPlan['status']): string {
  switch (status) {
    case 'PENDING_APPROVAL':
      return 'Waiting for admin approval';
    case 'ACTIVE':
      return 'Approved · Live for customers';
    case 'REJECTED':
      return 'Changes requested';
    case 'INACTIVE':
      return 'Inactive';
    case 'DRAFT':
      return 'Draft';
  }
}

function money(plan: ChefMealPlan): string {
  const numeric = Number(plan.amount);
  const amount = Number.isFinite(numeric) ? numeric.toFixed(Number.isInteger(numeric) ? 0 : 2) : plan.amount;
  return plan.currency === 'INR' ? `₹${amount}` : `${plan.currency} ${amount}`;
}

function scheduleRowsFromPlan(
  period: BillingPeriod,
  items: Array<{
    menuItemId: string;
    quantity: number;
    isoDayOfWeek: number | null;
    dayOfMonth: number | null;
    mealSlotCode: string;
    serviceTime: string;
  }>,
): MealRow[] {
  const parsed = items.flatMap(item => {
    if (!MEAL_SLOTS.includes(item.mealSlotCode as MealSlot)) return [];
    const day = period === 'WEEKLY' ? item.isoDayOfWeek : item.dayOfMonth;
    if (!day) return [];
    return [{
      day: String(day),
      mealSlotCode: item.mealSlotCode as MealSlot,
      serviceTime: item.serviceTime.slice(0, 5),
      menuItemId: item.menuItemId,
      quantity: String(item.quantity),
    }];
  });
  return parsed.length ? parsed : [emptyMeal()];
}

function PlanStatusPill({status}: {status: ChefMealPlan['status']}) {
  const active = status === 'ACTIVE';
  const warning = status === 'PENDING_APPROVAL';
  return (
    <View style={[styles.statusPill, active && styles.statusPillActive, warning && styles.statusPillWarning]}>
      <Text style={[styles.statusPillText, active && styles.statusPillTextActive, warning && styles.statusPillTextWarning]}>
        {planStatusLabel(status)}
      </Text>
    </View>
  );
}

function Field({label, value, onChangeText, placeholder, keyboardType, multiline = false}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  keyboardType?: 'default' | 'decimal-pad' | 'number-pad';
  multiline?: boolean;
}) {
  return (
    <View style={styles.fieldBlock}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.placeholder}
        keyboardType={keyboardType}
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'}
        style={[styles.input, multiline && styles.multilineInput]}
      />
    </View>
  );
}

export function ChefSubscriptionPlanScreen() {
  const navigation = useNavigation<Navigation>();
  const [plans, setPlans] = React.useState<ChefMealPlan[]>([]);
  const [menu, setMenu] = React.useState<ChefMenuItem[]>([]);
  const [capacity, setCapacity] = React.useState<ChefCapacitySummary | null>(null);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [form, setForm] = React.useState<PlanForm>(EMPTY_FORM);
  const [rows, setRows] = React.useState<MealRow[]>([emptyMeal()]);
  const [leadHours, setLeadHours] = React.useState('24');
  const [submitNote, setSubmitNote] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [capacityDay, setCapacityDay] = React.useState('1');
  const [capacitySlot, setCapacitySlot] = React.useState<MealSlot>('LUNCH');
  const [totalCapacity, setTotalCapacity] = React.useState('20');
  const [subscriptionCapacity, setSubscriptionCapacity] = React.useState('10');
  const [capacitySalesEnabled, setCapacitySalesEnabled] = React.useState(true);

  const selected = React.useMemo(
    () => plans.find(plan => plan.id === selectedId) ?? null,
    [plans, selectedId],
  );
  const editable = selected ? selected.status === 'DRAFT' || selected.status === 'REJECTED' : creating;
  const availableMenu = React.useMemo(
    () => menu.filter(item => item.status === 'ACTIVE' && item.available),
    [menu],
  );

  const load = React.useCallback(async (background = false) => {
    background ? setRefreshing(true) : setLoading(true);
    setMessage(null);
    try {
      const [nextPlans, nextMenu, nextCapacity] = await Promise.all([
        chefSubscriptionApi.listPlans(),
        chefMenuApi.listItems(),
        chefSubscriptionApi.getCapacity(),
      ]);
      setPlans(nextPlans);
      setMenu(nextMenu);
      setCapacity(nextCapacity);
      setSelectedId(current => current && nextPlans.some(plan => plan.id === current) ? current : nextPlans[0]?.id ?? null);
    } catch {
      setMessage('Meal-plan workspace could not be refreshed. Pull to retry.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  React.useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  React.useEffect(() => {
    if (!selected || creating) return;
    setForm({
      name: selected.name,
      description: selected.description ?? '',
      billingPeriod: selected.billingPeriod,
      amount: selected.amount,
    });
    let cancelled = false;
    chefSubscriptionApi.getSchedule(selected.id)
      .then(schedule => {
        if (!cancelled) {
          setRows(scheduleRowsFromPlan(selected.billingPeriod, schedule.items));
          setLeadHours(String(schedule.generationLeadHours));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRows([emptyMeal()]);
          setLeadHours('24');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [creating, selected]);

  const validatePlan = React.useCallback((): ChefMealPlanInput | null => {
    const amount = Number(form.amount);
    if (!form.name.trim() || !Number.isFinite(amount) || amount < 0) {
      setMessage('Enter a plan name and a valid non-negative plan price.');
      return null;
    }
    return {
      name: form.name.trim(),
      description: form.description.trim() || null,
      billingPeriod: form.billingPeriod,
      amount,
      currency: 'INR',
    };
  }, [form]);

  const beginCreate = React.useCallback(() => {
    setCreating(true);
    setSelectedId(null);
    setForm(EMPTY_FORM);
    setRows([emptyMeal()]);
    setLeadHours('24');
    setSubmitNote('');
    setMessage(
      availableMenu.length
        ? 'Create the plan details, then build its schedule from your live menu.'
        : 'Activate at least one available menu item before building a meal schedule.',
    );
  }, [availableMenu.length]);

  const createPlan = React.useCallback(async () => {
    if (busy) return;
    const payload = validatePlan();
    if (!payload) return;
    setBusy(true);
    setMessage(null);
    try {
      const created = await chefSubscriptionApi.createPlan(payload);
      setPlans(current => [created, ...current]);
      setSelectedId(created.id);
      setCreating(false);
      setMessage('Draft created. Add meals and capacity before submitting for approval.');
    } catch {
      setMessage('Meal-plan draft could not be created. Please retry.');
    } finally {
      setBusy(false);
    }
  }, [busy, validatePlan]);

  const savePlanDetails = React.useCallback(async () => {
    if (!selected || !editable || busy) return;
    const payload = validatePlan();
    if (!payload) return;
    setBusy(true);
    try {
      const updated = await chefSubscriptionApi.updatePlan(selected.id, payload);
      setPlans(current => current.map(plan => plan.id === updated.id ? updated : plan));
      setMessage('Plan details saved.');
    } catch {
      setMessage('Plan details could not be saved.');
    } finally {
      setBusy(false);
    }
  }, [busy, editable, selected, validatePlan]);

  const updateRow = React.useCallback((index: number, patch: Partial<MealRow>) => {
    setRows(current => current.map((row, rowIndex) => rowIndex === index ? {...row, ...patch} : row));
  }, []);

  const schedulePayload = React.useCallback((): PutChefScheduleRequest | null => {
    const plan = selected;
    const lead = Number(leadHours);
    if (!plan || !Number.isInteger(lead) || lead < 1 || lead > 168) {
      setMessage('Preparation lead time must be between 1 and 168 hours.');
      return null;
    }
    if (!rows.length) {
      setMessage('Add at least one meal to the schedule.');
      return null;
    }
    const items = rows.map((row, index) => {
      const day = Number(row.day);
      const quantity = Number(row.quantity);
      const dayValid = plan.billingPeriod === 'WEEKLY'
        ? Number.isInteger(day) && day >= 1 && day <= 7
        : Number.isInteger(day) && day >= 1 && day <= 28;
      if (!row.menuItemId || !dayValid || !Number.isInteger(quantity) || quantity < 1 || quantity > 100 || !/^\d{2}:\d{2}$/.test(row.serviceTime)) {
        return null;
      }
      return {
        menuItemId: row.menuItemId,
        quantity,
        isoDayOfWeek: plan.billingPeriod === 'WEEKLY' ? day : null,
        dayOfMonth: plan.billingPeriod === 'MONTHLY' ? day : null,
        mealSlotCode: row.mealSlotCode,
        serviceTime: row.serviceTime,
        sequenceNumber: index + 1,
      };
    });
    if (items.some(item => item === null)) {
      setMessage('Complete every meal row with a valid day, live dish, quantity and HH:mm service time.');
      return null;
    }
    return {
      recurrenceType: plan.billingPeriod,
      timezone: 'Asia/Kolkata',
      generationLeadHours: lead,
      items: items as PutChefScheduleRequest['items'],
    };
  }, [leadHours, rows, selected]);

  const saveSchedule = React.useCallback(async (submitAfterSave: boolean) => {
    if (!selected || !editable || busy) return;
    const payload = schedulePayload();
    if (!payload) return;
    setBusy(true);
    try {
      await chefSubscriptionApi.putSchedule(selected.id, payload);
      if (!submitAfterSave) {
        setMessage('Meal schedule saved.');
        return;
      }
      const submitted = await chefSubscriptionApi.submit(selected.id, submitNote);
      setPlans(current => current.map(plan => plan.id === submitted.id ? submitted : plan));
      setSubmitNote('');
      setMessage('Submitted for admin approval. Editing is locked while the plan is under review.');
    } catch {
      setMessage('The schedule or submission was not accepted. Verify that every selected dish is still active and available.');
    } finally {
      setBusy(false);
    }
  }, [busy, editable, schedulePayload, selected, submitNote]);

  const saveCapacity = React.useCallback(async () => {
    if (busy) return;
    const day = Number(capacityDay);
    const total = Number(totalCapacity);
    const subscription = Number(subscriptionCapacity);
    if (
      !Number.isInteger(day) || day < 1 || day > 7 ||
      !Number.isInteger(total) || total < 0 ||
      !Number.isInteger(subscription) || subscription < 0 || subscription > total
    ) {
      setMessage('Capacity requires a weekday 1–7 and non-negative whole units; subscription capacity cannot exceed total capacity.');
      return;
    }
    setBusy(true);
    try {
      await chefSubscriptionApi.putSlotRule({
        isoDayOfWeek: day,
        mealSlotCode: capacitySlot,
        totalCapacityUnits: total,
        subscriptionCapacityUnits: subscription,
        salesEnabled: capacitySalesEnabled,
        reason: 'Updated by Chef in Craves mobile',
      });
      const refreshed = await chefSubscriptionApi.getCapacity();
      setCapacity(refreshed);
      setMessage('Subscription capacity updated.');
    } catch {
      setMessage('Capacity could not be updated. Please refresh and try again.');
    } finally {
      setBusy(false);
    }
  }, [busy, capacityDay, capacitySalesEnabled, capacitySlot, subscriptionCapacity, totalCapacity]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <ChefHeader title="Meal Plans" />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.flameRed} colors={[colors.flameRed]} />}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <View style={styles.topRow}>
          <Pressable accessibilityRole="button" accessibilityLabel="Back to Chef profile" onPress={() => navigation.goBack()} style={styles.iconButton}>
            <FilledIcon name="arrow-left" size={24} />
          </Pressable>
          <View style={styles.headingCopy}>
            <Text accessibilityRole="header" style={styles.title}>Chef Meal Plans</Text>
            <Text style={styles.subtitle}>Create, schedule, submit and capacity-plan subscriptions from the live backend.</Text>
          </View>
        </View>

        {message ? <View style={styles.messageCard}><FilledIcon name="information" color={colors.flameRed} /><Text style={styles.messageText}>{message}</Text></View> : null}
        {loading ? <View style={styles.loading}><ActivityIndicator color={colors.flameRed} /><Text style={styles.helper}>Loading meal-plan workspace…</Text></View> : null}

        <View style={styles.sectionHeader}>
          <View><Text style={styles.sectionTitle}>My plans</Text><Text style={styles.sectionCaption}>{plans.length} plan{plans.length === 1 ? '' : 's'}</Text></View>
          <Pressable accessibilityRole="button" onPress={beginCreate} style={styles.primaryCompact}><FilledIcon name="plus" size={18} color={colors.white} /><Text style={styles.primaryCompactText}>New plan</Text></Pressable>
        </View>

        {plans.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.planRail}>
            {plans.map(plan => (
              <Pressable key={plan.id} onPress={() => {setCreating(false); setSelectedId(plan.id); setMessage(null);}} style={[styles.planCard, selectedId === plan.id && styles.planCardSelected]}>
                <View style={styles.planIcon}><FilledIcon name="food-variant" color={colors.flameRed} /></View>
                <Text numberOfLines={2} style={styles.planCardTitle}>{plan.name}</Text>
                <PlanStatusPill status={plan.status} />
                <Text style={styles.planAmount}>{money(plan)}</Text>
                <Text style={styles.planPeriod}>{plan.billingPeriod === 'WEEKLY' ? 'Weekly' : 'Monthly'}</Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : !loading ? <View style={styles.emptyCard}><Text style={styles.emptyTitle}>No meal plans yet</Text><Text style={styles.helper}>Create your first draft and choose meals from your active menu.</Text></View> : null}

        {(creating || selected) ? (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.cardHeaderIcon}><FilledIcon name="clipboard-text" color={colors.flameRed} /></View>
              <View style={styles.cardHeaderCopy}><Text style={styles.cardTitle}>{creating ? 'New plan details' : 'Plan details'}</Text><Text style={styles.sectionCaption}>{creating ? 'Creates a server-owned draft.' : selected ? planStatusLabel(selected.status) : ''}</Text></View>
            </View>
            {selected?.reviewReason ? <View style={styles.reviewCard}><Text style={styles.reviewTitle}>Admin review</Text><Text style={styles.reviewText}>{selected.reviewReason}</Text></View> : null}
            <Field label="Plan name" value={form.name} onChangeText={value => setForm(current => ({...current, name: value}))} placeholder="Weekly home lunch plan" />
            <Field label="Description" value={form.description} onChangeText={value => setForm(current => ({...current, description: value}))} placeholder="What customers receive" multiline />
            <Text style={styles.fieldLabel}>Frequency</Text>
            <View style={styles.choiceRow}>
              {(['WEEKLY', 'MONTHLY'] as const).map(period => (
                <Pressable key={period} disabled={!editable} onPress={() => {setForm(current => ({...current, billingPeriod: period})); setRows([emptyMeal()]);}} style={[styles.choiceChip, form.billingPeriod === period && styles.choiceChipSelected, !editable && styles.disabled]}>
                  <Text style={[styles.choiceChipText, form.billingPeriod === period && styles.choiceChipTextSelected]}>{period === 'WEEKLY' ? 'Weekly' : 'Monthly'}</Text>
                </Pressable>
              ))}
            </View>
            <Field label="Plan price (₹)" value={form.amount} onChangeText={value => setForm(current => ({...current, amount: value}))} placeholder="0.00" keyboardType="decimal-pad" />
            {creating ? (
              <Pressable disabled={busy} onPress={createPlan} style={[styles.primaryButton, busy && styles.disabled]}>{busy ? <ActivityIndicator color={colors.white} /> : <Text style={styles.primaryButtonText}>Create Draft</Text>}</Pressable>
            ) : editable ? (
              <Pressable disabled={busy} onPress={savePlanDetails} style={[styles.secondaryWide, busy && styles.disabled]}><FilledIcon name="content-save" color={colors.flameRed} /><Text style={styles.secondaryWideText}>Save plan details</Text></Pressable>
            ) : <Text style={styles.lockedText}>This plan is locked while {planStatusLabel(selected!.status).toLowerCase()}.</Text>}
          </View>
        ) : null}

        {selected && editable ? (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.cardHeaderIcon}><FilledIcon name="calendar-clock" color={colors.flameRed} /></View>
              <View style={styles.cardHeaderCopy}><Text style={styles.cardTitle}>Meal schedule</Text><Text style={styles.sectionCaption}>Only Active + available dishes can be scheduled.</Text></View>
            </View>
            {!availableMenu.length ? <View style={styles.warningCard}><FilledIcon name="alert" color={colors.warning} /><Text style={styles.warningText}>Activate at least one available menu item before submitting this plan.</Text></View> : null}
            <Field label="Generation lead hours" value={leadHours} onChangeText={setLeadHours} placeholder="24" keyboardType="number-pad" />
            {rows.map((row, index) => (
              <View key={`meal-${index}`} style={styles.mealCard}>
                <View style={styles.mealHeader}><Text style={styles.mealTitle}>Meal {index + 1}</Text>{rows.length > 1 ? <Pressable onPress={() => setRows(current => current.filter((_, rowIndex) => rowIndex !== index))} style={styles.iconButtonSmall}><FilledIcon name="delete" size={18} color={colors.error} /></Pressable> : null}</View>
                <Text style={styles.fieldLabel}>{selected.billingPeriod === 'WEEKLY' ? 'Day' : 'Day of month'}</Text>
                {selected.billingPeriod === 'WEEKLY' ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.choiceRow}>
                    {WEEKDAYS.map((dayLabel, dayIndex) => (
                      <Pressable key={dayLabel} onPress={() => updateRow(index, {day: String(dayIndex + 1)})} style={[styles.dayChip, row.day === String(dayIndex + 1) && styles.dayChipSelected]}><Text style={[styles.dayChipText, row.day === String(dayIndex + 1) && styles.dayChipTextSelected]}>{dayLabel}</Text></Pressable>
                    ))}
                  </ScrollView>
                ) : <Field label="" value={row.day} onChangeText={value => updateRow(index, {day: value})} placeholder="1–28" keyboardType="number-pad" />}
                <Text style={styles.fieldLabel}>Meal slot</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.choiceRow}>
                  {MEAL_SLOTS.map(slot => (
                    <Pressable key={slot} onPress={() => updateRow(index, {mealSlotCode: slot, serviceTime: SLOT_DEFAULT_TIME[slot]})} style={[styles.choiceChip, row.mealSlotCode === slot && styles.choiceChipSelected]}><Text style={[styles.choiceChipText, row.mealSlotCode === slot && styles.choiceChipTextSelected]}>{slot.charAt(0) + slot.slice(1).toLowerCase()}</Text></Pressable>
                  ))}
                </ScrollView>
                <Text style={styles.fieldLabel}>Dish</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dishRail}>
                  {availableMenu.map(item => (
                    <Pressable key={item.id} onPress={() => updateRow(index, {menuItemId: item.id})} style={[styles.dishChip, row.menuItemId === item.id && styles.dishChipSelected]}>
                      <View style={styles.dishIcon}><FilledIcon name="food" size={18} color={row.menuItemId === item.id ? colors.flameRed : colors.espressoBrown} /></View>
                      <Text numberOfLines={1} style={styles.dishChipText}>{item.itemName}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
                <View style={styles.twoColumns}>
                  <View style={styles.column}><Field label="Time" value={row.serviceTime} onChangeText={value => updateRow(index, {serviceTime: value})} placeholder="12:30" /></View>
                  <View style={styles.column}><Field label="Quantity" value={row.quantity} onChangeText={value => updateRow(index, {quantity: value})} placeholder="1" keyboardType="number-pad" /></View>
                </View>
              </View>
            ))}
            <Pressable onPress={() => setRows(current => [...current, emptyMeal()])} style={styles.addMealButton}><FilledIcon name="plus-circle" color={colors.flameRed} /><Text style={styles.addMealText}>Add meal</Text></Pressable>
            <Pressable disabled={busy || !availableMenu.length} onPress={() => saveSchedule(false)} style={[styles.secondaryWide, (busy || !availableMenu.length) && styles.disabled]}><FilledIcon name="content-save" color={colors.flameRed} /><Text style={styles.secondaryWideText}>Save schedule</Text></Pressable>
            <Field label="Submission note (optional)" value={submitNote} onChangeText={setSubmitNote} placeholder="Note for admin review" multiline />
            <Pressable disabled={busy || !availableMenu.length} onPress={() => saveSchedule(true)} style={[styles.primaryButton, (busy || !availableMenu.length) && styles.disabled]}>{busy ? <ActivityIndicator color={colors.white} /> : <Text style={styles.primaryButtonText}>Save & Submit for Approval</Text>}</Pressable>
          </View>
        ) : null}

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardHeaderIcon}><FilledIcon name="gauge" color={colors.flameRed} /></View>
            <View style={styles.cardHeaderCopy}><Text style={styles.cardTitle}>Subscription capacity</Text><Text style={styles.sectionCaption}>Protect normal orders while reserving plan capacity.</Text></View>
          </View>
          {capacity?.adminSalesFrozen ? <View style={styles.errorCard}><FilledIcon name="snowflake-alert" color={colors.error} /><Text style={styles.errorText}>Subscription sales are frozen by Admin{capacity.freezeReason ? `: ${capacity.freezeReason}` : '.'}</Text></View> : null}
          {capacity ? (
            <View style={styles.capacitySummary}>
              <View style={styles.metric}><Text style={styles.metricValue}>{capacity.slotRules.length}</Text><Text style={styles.metricLabel}>slot rules</Text></View>
              <View style={styles.metric}><Text style={styles.metricValue}>{capacity.openIncidentCount}</Text><Text style={styles.metricLabel}>open incidents</Text></View>
              <View style={styles.metric}><Text style={styles.metricValue}>{capacity.slotRules.reduce((sum, rule) => sum + rule.recurringAvailableUnits, 0)}</Text><Text style={styles.metricLabel}>available units</Text></View>
            </View>
          ) : null}
          {capacity?.slotRules.slice(0, 8).map(rule => (
            <View key={rule.id} style={styles.capacityRuleRow}>
              <View style={styles.capacityRuleIcon}><FilledIcon name="calendar-range" size={18} color={colors.flameRed} /></View>
              <View style={styles.capacityRuleCopy}><Text style={styles.capacityRuleTitle}>{WEEKDAYS[rule.isoDayOfWeek - 1]} · {rule.mealSlotCode}</Text><Text style={styles.capacityRuleText}>{rule.subscriptionCapacityUnits}/{rule.totalCapacityUnits} subscription/total · {rule.recurringReservedUnits} reserved</Text></View>
              <Text style={[styles.capacityState, !rule.salesEnabled && styles.capacityStateOff]}>{rule.salesEnabled ? 'On' : 'Off'}</Text>
            </View>
          ))}
          <Text style={styles.fieldLabel}>Weekday</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.choiceRow}>
            {WEEKDAYS.map((dayLabel, index) => <Pressable key={dayLabel} onPress={() => setCapacityDay(String(index + 1))} style={[styles.dayChip, capacityDay === String(index + 1) && styles.dayChipSelected]}><Text style={[styles.dayChipText, capacityDay === String(index + 1) && styles.dayChipTextSelected]}>{dayLabel}</Text></Pressable>)}
          </ScrollView>
          <Text style={styles.fieldLabel}>Meal slot</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.choiceRow}>
            {MEAL_SLOTS.map(slot => <Pressable key={slot} onPress={() => setCapacitySlot(slot)} style={[styles.choiceChip, capacitySlot === slot && styles.choiceChipSelected]}><Text style={[styles.choiceChipText, capacitySlot === slot && styles.choiceChipTextSelected]}>{slot.charAt(0) + slot.slice(1).toLowerCase()}</Text></Pressable>)}
          </ScrollView>
          <View style={styles.twoColumns}>
            <View style={styles.column}><Field label="Total units" value={totalCapacity} onChangeText={setTotalCapacity} placeholder="20" keyboardType="number-pad" /></View>
            <View style={styles.column}><Field label="Subscription units" value={subscriptionCapacity} onChangeText={setSubscriptionCapacity} placeholder="10" keyboardType="number-pad" /></View>
          </View>
          <View style={styles.switchRow}><View style={styles.switchCopy}><Text style={styles.fieldLabel}>Subscription sales enabled</Text><Text style={styles.sectionCaption}>Turn off to stop new recurring reservations for this slot.</Text></View><Switch value={capacitySalesEnabled} onValueChange={setCapacitySalesEnabled} thumbColor={colors.white} trackColor={{false: colors.borderStrong, true: colors.flameRed}} /></View>
          <Pressable disabled={busy || capacity?.adminSalesFrozen} onPress={saveCapacity} style={[styles.secondaryWide, (busy || capacity?.adminSalesFrozen) && styles.disabled]}><FilledIcon name="gauge" color={colors.flameRed} /><Text style={styles.secondaryWideText}>Save slot capacity</Text></Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {flex: 1, backgroundColor: colors.white},
  content: {paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.xxxl, gap: spacing.md},
  topRow: {flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm},
  iconButton: {width: touchTarget.minimum, height: touchTarget.minimum, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: ICON_SURFACE},
  iconButtonSmall: {width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: ICON_SURFACE},
  headingCopy: {minWidth: 0, flex: 1},
  title: {color: colors.espressoBrown, fontSize: typography.hero, fontWeight: fontWeight.extrabold},
  subtitle: {marginTop: spacing.xxs, color: colors.textSecondary, fontSize: typography.small, lineHeight: 20},
  messageCard: {flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, padding: spacing.md, borderRadius: radius.lg, backgroundColor: ICON_SURFACE},
  messageText: {minWidth: 0, flex: 1, color: colors.espressoBrown, fontSize: typography.small, lineHeight: 20},
  loading: {minHeight: 96, alignItems: 'center', justifyContent: 'center', gap: spacing.sm},
  helper: {color: colors.textSecondary, fontSize: typography.small},
  sectionHeader: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md},
  sectionTitle: {color: colors.espressoBrown, fontSize: typography.heading, fontWeight: fontWeight.bold},
  sectionCaption: {marginTop: spacing.xxs, color: colors.textSecondary, fontSize: typography.tiny, lineHeight: 17},
  primaryCompact: {minHeight: touchTarget.minimum, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.md, borderRadius: radius.pill, backgroundColor: colors.flameRed},
  primaryCompactText: {color: colors.white, fontSize: typography.small, fontWeight: fontWeight.bold},
  planRail: {gap: spacing.sm, paddingVertical: spacing.xxs},
  planCard: {width: 190, minHeight: 176, padding: spacing.md, borderRadius: radius.lg, borderWidth: borderWidth.standard, borderColor: colors.border, backgroundColor: colors.white, ...elevation.card},
  planCardSelected: {borderColor: colors.flameRed, borderWidth: borderWidth.strong},
  planIcon: {width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: ICON_SURFACE},
  planCardTitle: {marginTop: spacing.sm, color: colors.espressoBrown, fontSize: typography.body, fontWeight: fontWeight.bold},
  planAmount: {marginTop: spacing.sm, color: colors.flameRedAccessible, fontSize: typography.heading, fontWeight: fontWeight.bold},
  planPeriod: {marginTop: spacing.xxs, color: colors.textSecondary, fontSize: typography.tiny},
  statusPill: {alignSelf: 'flex-start', marginTop: spacing.xs, paddingHorizontal: spacing.xs, paddingVertical: spacing.xxs, borderRadius: radius.pill, backgroundColor: ICON_SURFACE},
  statusPillActive: {backgroundColor: colors.successSoft},
  statusPillWarning: {backgroundColor: colors.warningSoft},
  statusPillText: {color: colors.textSecondary, fontSize: 9, fontWeight: fontWeight.semibold},
  statusPillTextActive: {color: colors.successText},
  statusPillTextWarning: {color: colors.warningText},
  emptyCard: {padding: spacing.lg, borderRadius: radius.lg, backgroundColor: ICON_SURFACE},
  emptyTitle: {color: colors.espressoBrown, fontSize: typography.body, fontWeight: fontWeight.bold},
  card: {gap: spacing.sm, padding: spacing.md, borderRadius: radius.lg, borderWidth: borderWidth.standard, borderColor: colors.border, backgroundColor: colors.white, ...elevation.card},
  cardHeader: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm},
  cardHeaderIcon: {width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: ICON_SURFACE},
  cardHeaderCopy: {minWidth: 0, flex: 1},
  cardTitle: {color: colors.espressoBrown, fontSize: typography.heading, fontWeight: fontWeight.bold},
  reviewCard: {padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.warningSoft},
  reviewTitle: {color: colors.warningText, fontSize: typography.small, fontWeight: fontWeight.bold},
  reviewText: {marginTop: spacing.xxs, color: colors.warningText, fontSize: typography.small, lineHeight: 19},
  fieldBlock: {gap: spacing.xxs},
  fieldLabel: {color: colors.espressoBrown, fontSize: typography.small, fontWeight: fontWeight.semibold},
  input: {minHeight: touchTarget.minimum, paddingHorizontal: spacing.sm, borderRadius: radius.md, borderWidth: borderWidth.standard, borderColor: colors.border, backgroundColor: colors.white, color: colors.espressoBrown, fontSize: typography.body},
  multilineInput: {minHeight: 92, paddingTop: spacing.sm},
  choiceRow: {flexDirection: 'row', gap: spacing.xs},
  choiceChip: {minHeight: 42, justifyContent: 'center', paddingHorizontal: spacing.sm, borderRadius: radius.pill, borderWidth: borderWidth.standard, borderColor: colors.border, backgroundColor: ICON_SURFACE},
  choiceChipSelected: {borderColor: colors.flameRed, backgroundColor: colors.flameRed},
  choiceChipText: {color: colors.espressoBrown, fontSize: typography.tiny, fontWeight: fontWeight.semibold},
  choiceChipTextSelected: {color: colors.white},
  disabled: {opacity: 0.45},
  primaryButton: {minHeight: touchTarget.comfortable, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: colors.flameRed},
  primaryButtonText: {color: colors.white, fontSize: typography.body, fontWeight: fontWeight.bold},
  secondaryWide: {minHeight: touchTarget.minimum, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, borderRadius: radius.md, borderWidth: borderWidth.standard, borderColor: colors.flameRed, backgroundColor: colors.white},
  secondaryWideText: {color: colors.flameRedAccessible, fontSize: typography.small, fontWeight: fontWeight.bold},
  lockedText: {padding: spacing.sm, color: colors.textSecondary, fontSize: typography.small, lineHeight: 19, borderRadius: radius.md, backgroundColor: ICON_SURFACE},
  warningCard: {flexDirection: 'row', gap: spacing.sm, padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.warningSoft},
  warningText: {minWidth: 0, flex: 1, color: colors.warningText, fontSize: typography.small, lineHeight: 19},
  mealCard: {gap: spacing.sm, padding: spacing.sm, borderRadius: radius.md, borderWidth: borderWidth.standard, borderColor: colors.border, backgroundColor: colors.surfaceBase},
  mealHeader: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  mealTitle: {color: colors.espressoBrown, fontSize: typography.body, fontWeight: fontWeight.bold},
  dayChip: {width: 48, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: ICON_SURFACE},
  dayChipSelected: {backgroundColor: colors.flameRed},
  dayChipText: {color: colors.espressoBrown, fontSize: typography.tiny, fontWeight: fontWeight.bold},
  dayChipTextSelected: {color: colors.white},
  dishRail: {gap: spacing.xs},
  dishChip: {width: 150, minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, padding: spacing.xs, borderRadius: radius.md, borderWidth: borderWidth.standard, borderColor: colors.border, backgroundColor: colors.white},
  dishChipSelected: {borderColor: colors.flameRed, borderWidth: borderWidth.strong},
  dishIcon: {width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm, backgroundColor: ICON_SURFACE},
  dishChipText: {minWidth: 0, flex: 1, color: colors.espressoBrown, fontSize: typography.tiny, fontWeight: fontWeight.semibold},
  twoColumns: {flexDirection: 'row', gap: spacing.sm},
  column: {minWidth: 0, flex: 1},
  addMealButton: {minHeight: touchTarget.minimum, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, borderRadius: radius.md, backgroundColor: ICON_SURFACE},
  addMealText: {color: colors.flameRedAccessible, fontSize: typography.small, fontWeight: fontWeight.bold},
  errorCard: {flexDirection: 'row', gap: spacing.sm, padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.errorSoft},
  errorText: {minWidth: 0, flex: 1, color: colors.error, fontSize: typography.small, lineHeight: 19},
  capacitySummary: {flexDirection: 'row', gap: spacing.xs},
  metric: {minWidth: 0, flex: 1, padding: spacing.sm, borderRadius: radius.md, backgroundColor: ICON_SURFACE},
  metricValue: {color: colors.espressoBrown, fontSize: typography.heading, fontWeight: fontWeight.bold},
  metricLabel: {marginTop: spacing.xxs, color: colors.textSecondary, fontSize: typography.tiny},
  capacityRuleRow: {minHeight: 70, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xs, borderBottomWidth: borderWidth.standard, borderBottomColor: colors.border},
  capacityRuleIcon: {width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm, backgroundColor: ICON_SURFACE},
  capacityRuleCopy: {minWidth: 0, flex: 1},
  capacityRuleTitle: {color: colors.espressoBrown, fontSize: typography.small, fontWeight: fontWeight.bold},
  capacityRuleText: {marginTop: spacing.xxs, color: colors.textSecondary, fontSize: typography.tiny},
  capacityState: {color: colors.successText, fontSize: typography.tiny, fontWeight: fontWeight.bold},
  capacityStateOff: {color: colors.textSecondary},
  switchRow: {minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: spacing.sm},
  switchCopy: {minWidth: 0, flex: 1},
});
