import React from 'react';
import {Image, Pressable, ScrollView, StyleSheet, Text, View, Alert} from 'react-native';
import MaterialDesignIcons from '@react-native-vector-icons/material-design-icons';
import * as ImagePicker from 'expo-image-picker';
import {usePreventRemove} from '@react-navigation/native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {useQueryClient} from '@tanstack/react-query';
import type {ChefProductStackParamList} from '../../../app/navigation/types';
import {AppApiError} from '../../../core/http/apiError';
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
import {Icon} from '../../../shared/components/Icon';
import {SkeletonBlock} from '../../../shared/components/Skeleton';
import type {ChefMenuItem} from '../../chefMenu/api/chefMenuApi';
import {FieldError, FormField, GroupLabel, OptionChip} from '../../chefMenu/components/DishFormField';
import {
  getChefMenuDisplayState,
  getChefMenuPrimaryImageUrl,
} from '../../chefMenu/domain/chefMenuPresentation';
import {useChefMenuModel} from '../../chefMenu/state/useChefMenuModel';
import {
  ChefActionButton,
  ChefCard,
  ChefScreen,
  ChefSheet,
  ChefTopBar,
  ConfirmDialog,
  VegMark,
  useChefToast,
} from '../../chefShell/components/ui';
import {formatRupeesExact} from '../../chefShell/domain/chefFormat';
import {RadioMark} from '../../customerSubscription/components/MealPlanUi';
import {billingUnit, formatServiceTime, mealSlotLabel} from '../../mealPlans/domain/mealPlanSchedule';
import {resolveApiImageUrl} from '../../mealPlans/domain/resolveApiImageUrl';
import {
  chefSubscriptionApi,
  type ChefMealPlan,
  type ChefMealSchedule,
} from '../api/chefSubscriptionApi';
import {chefPlanMetaLine, chefPlanPriceLabel, chefPlanStatusPresentation} from '../domain/chefMealPlanPresentation';
import {
  addMealLabel,
  addSlot,
  copyDayToWeekdays,
  dayName,
  dayRangeLabel,
  daysWithMeals,
  editorScheduleKind,
  freeSlotsForDay,
  groupMealDays,
  initialSlots,
  LEAD_HOUR_OPTIONS,
  otherWeekdaysHaveMeals,
  removeSlot,
  repeatsLabel,
  setSlotDish,
  setSlotQuantity,
  setSlotTime,
  slotsToScheduleRequest,
  stepWithErrors,
  TIME_OPTIONS,
  validateMealPlanForm,
  WEEK_ORDER,
  WEEKDAYS_SHORT,
  type BillingPeriod,
  type EditorSlot,
  type MealPlanFormValues,
  type MealSlot,
} from '../domain/mealPlanEditor';
import {
  invalidateChefMealPlans,
  useChefMealPlanScheduleQuery,
  useChefMealPlansQuery,
} from '../query/chefMealPlanQueries';

type Props = NativeStackScreenProps<ChefProductStackParamList, 'ChefMealPlanEditor'>;
type Sheet = {kind: 'lead'} | {kind: 'time'; slot: MealSlot} | {kind: 'dish'; key: string} | {kind: 'add'} | null;
type Step = 1 | 2 | 3;

const STEP_NAMES: Record<Step, string> = {1: 'Details', 2: 'Meals', 3: 'Review'};
const MONTH_DAYS = Array.from({length: 28}, (_, index) => index + 1);
// Server limits for plan photos (JPEG/PNG only; WebP is rejected).
const MAX_PHOTO_BYTES = 2_097_152;
const MAX_PHOTO_SIDE = 4096;
const SLOT_ICON: Record<MealSlot, string> = {
  BREAKFAST: 'coffee-outline',
  LUNCH: 'weather-sunny',
  SNACK: 'cookie-outline',
  DINNER: 'weather-night',
};

const SUMMARY_PHOTO = touchTarget.comfortable + spacing.xs;

const leadHoursLabel = (hours: number) =>
  hours === 24 ? '24 hours before (default)' : `${hours} ${hours === 1 ? 'hour' : 'hours'} before`;

function Glyph({name, size = 22, color = colors.textSecondary}: {name: string; size?: number; color?: string}) {
  return <MaterialDesignIcons accessibilityElementsHidden name={name as never} size={size} color={color} />;
}

function Message({title, message, action}: {title: string; message: string; action: {label: string; onPress: () => void}}) {
  return (
    <ChefCard>
      <View style={styles.message}>
        <Text accessibilityRole="header" allowFontScaling={textDefaults.allowFontScaling} style={styles.messageTitle}>
          {title}
        </Text>
        <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.messageText}>
          {message}
        </Text>
        <ChefActionButton label={action.label} onPress={action.onPress} />
      </View>
    </ChefCard>
  );
}

export function ChefMealPlanEditorScreen({navigation, route}: Props) {
  const planId = route.params?.planId;
  const plans = useChefMealPlansQuery();
  const schedule = useChefMealPlanScheduleQuery(planId);
  // A draft without meals has no schedule yet: the server answers 404.
  const noSchedule = schedule.error instanceof AppApiError && schedule.error.status === 404;
  const plan = planId ? plans.data?.find(item => item.id === planId) : undefined;
  // Latched: a refetch after a save must not unmount the form (a 404 schedule refetches through 'pending').
  const [loaded, setLoaded] = React.useState<{plan: ChefMealPlan; schedule: ChefMealSchedule | null} | null>(null);
  if (!loaded && plan && (schedule.data || noSchedule)) {
    setLoaded({plan, schedule: schedule.data ?? null});
  }

  if (!planId || loaded) {
    return (
      <MealPlanEditor
        initialStep={route.params?.step === 2 ? 2 : 1}
        navigation={navigation}
        plan={loaded?.plan ?? null}
        schedule={loaded?.schedule ?? null}
      />
    );
  }

  let body: React.ReactNode;
  if (plans.isLoading || schedule.isLoading) {
    body = (
      <View style={styles.skeleton}>
        <SkeletonBlock borderRadius={radius.md} height={120} width="100%" />
        <SkeletonBlock borderRadius={radius.md} height={48} width="100%" />
        <SkeletonBlock borderRadius={radius.md} height={48} width="100%" />
      </View>
    );
  } else if (plans.isError || schedule.isError) {
    body = (
      <Message
        action={{
          label: 'Try again',
          onPress: () => {
            plans.refetch();
            schedule.refetch();
          },
        }}
        message="Check your connection and try again."
        title="Couldn't load this meal plan"
      />
    );
  } else {
    body = (
      <Message
        action={{label: 'Back to meal plans', onPress: () => navigation.goBack()}}
        message="It may have been deleted."
        title="This meal plan is not available any more"
      />
    );
  }
  return (
    <ChefScreen header={<ChefTopBar onBack={() => navigation.goBack()} showBell={false} title="Meal plan" />}>
      {body}
    </ChefScreen>
  );
}

function MealPlanEditor({
  initialStep,
  navigation,
  plan,
  schedule,
}: {
  /** 2 opens on the meals ("Schedule" on a plan card). */
  initialStep: Step;
  navigation: Props['navigation'];
  plan: ChefMealPlan | null;
  schedule: ChefMealSchedule | null;
}) {
  const queryClient = useQueryClient();
  const toast = useChefToast();
  const menu = useChefMenuModel();
  const editable = !plan || plan.status === 'DRAFT' || plan.status === 'REJECTED';
  // Older backends send no imageUrl key at all and have no photo endpoint.
  const photoSupported = !plan || 'imageUrl' in plan;

  const [step, setStep] = React.useState<Step>(initialStep);
  const [savedPlanId, setSavedPlanId] = React.useState(plan?.id ?? null);
  const [form, setForm] = React.useState<MealPlanFormValues>({
    name: plan?.name ?? '',
    description: plan?.description ?? '',
    amount: plan?.amount ?? '',
  });
  const [period, setPeriod] = React.useState<BillingPeriod>(plan?.billingPeriod ?? 'WEEKLY');
  // Every bill repeats one week; only a live plan set up by date still shows its dates.
  const kind = editorScheduleKind(editable, schedule ?? undefined);
  const datePlanReset = editable && schedule?.recurrenceType === 'MONTHLY';
  const [leadHours, setLeadHours] = React.useState(schedule?.generationLeadHours ?? 24);
  const [slots, setSlots] = React.useState<EditorSlot[]>(() => initialSlots(editable, schedule ?? undefined));
  const [day, setDay] = React.useState(() => slots[0]?.day ?? WEEK_ORDER[0]);
  const [photo, setPhoto] = React.useState<ImagePicker.ImagePickerAsset | null>(null);
  const [photoError, setPhotoError] = React.useState<string | null>(null);
  const [attempt, setAttempt] = React.useState<'draft' | 'submit' | null>(null);
  const [busy, setBusy] = React.useState<'draft' | 'submit' | null>(null);
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [dirty, setDirty] = React.useState(false);
  const [leaving, setLeaving] = React.useState(false);
  const [sheet, setSheet] = React.useState<Sheet>(null);
  const [note, setNote] = React.useState('');
  const [hasServerSchedule, setHasServerSchedule] = React.useState(schedule !== null);
  const [scheduleNote, setScheduleNote] = React.useState(false);
  const [pendingLeave, setPendingLeave] = React.useState<unknown>(null);
  const [removing, setRemoving] = React.useState<EditorSlot | null>(null);
  const [copying, setCopying] = React.useState(false);
  // State lags a frame behind a tap; the lock keeps a double tap to one request.
  const saving = React.useRef(false);

  // Errors appear after the first Next / save attempt and then follow the chef's edits.
  const errors = attempt ? validateMealPlanForm(form, slots, attempt) : {};
  const locked = !editable || busy !== null;
  const hasDishes = slots.some(slot => slot.menuItemId !== null);
  // Only a schedule with dishes is sent, so a draft without any keeps the server's old schedule.
  const scheduleKept = hasServerSchedule && !hasDishes;
  const mealDays = daysWithMeals(slots);
  const daySlots = slots.filter(slot => slot.day === day);
  const freeSlots = freeSlotsForDay(slots, day);
  const missingDishDays =
    attempt === 'submit'
      ? [...new Set(slots.filter(slot => slot.menuItemId === null).map(slot => slot.day))]
      : [];

  const availableDishes = React.useMemo(
    () => menu.items.filter(item => getChefMenuDisplayState(item) === 'AVAILABLE'),
    [menu.items],
  );
  const menuById = React.useMemo(
    () => new Map(menu.items.map(item => [item.id, item] as const)),
    [menu.items],
  );
  const scheduledNames = React.useMemo(
    () => new Map((schedule?.items ?? []).map(item => [item.menuItemId, item.menuItemName] as const)),
    [schedule],
  );
  const dishName = (menuItemId: string) =>
    menuById.get(menuItemId)?.itemName ?? scheduledNames.get(menuItemId) ?? 'Dish';

  usePreventRemove(editable && dirty && !leaving, ({data}) => setPendingLeave(data.action));

  React.useEffect(() => {
    if (leaving) {
      navigation.goBack();
    }
  }, [leaving, navigation]);

  const updateForm = (field: keyof MealPlanFormValues, value: string) => {
    setForm(current => ({...current, [field]: value}));
    setDirty(true);
  };
  const updateSlots = (change: (current: EditorSlot[]) => EditorSlot[]) => {
    setSlots(change);
    setDirty(true);
  };

  // The week is the same for every bill length, so changing it keeps the meals.
  const changePeriod = (next: BillingPeriod) => {
    if (next === period) return;
    setPeriod(next);
    setDirty(true);
  };

  const pickPhoto = async () => {
    if (busy || !editable) return;
    setPhotoError(null);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'Photo access needed',
          'Allow photo access for Craves in your phone settings to choose a photo for this plan.',
        );
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.6,
      });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      if (asset.mimeType && !['image/jpeg', 'image/png'].includes(asset.mimeType)) {
        setPhotoError('Choose a JPEG or PNG photo.');
        return;
      }
      if ((asset.fileSize ?? 0) > MAX_PHOTO_BYTES || asset.width > MAX_PHOTO_SIDE || asset.height > MAX_PHOTO_SIDE) {
        setPhotoError('Photo is too large. Pick a smaller photo.');
        return;
      }
      setPhoto(asset);
      setDirty(true);
    } catch {
      setPhotoError('The photo library could not be opened. Please try again.');
    }
  };

  /** False when the chef has to deal with the photo before going on; the saved plan is kept either way. */
  const uploadPhoto = async (saved: ChefMealPlan, asset: ImagePicker.ImagePickerAsset) => {
    const unavailable = () => {
      setPhoto(null);
      setPhotoError("Plan photos aren't available yet.");
      return true;
    };
    // Backends without plan photos send no imageUrl key and have no upload endpoint.
    if (!('imageUrl' in saved)) return unavailable();
    try {
      const body = new FormData();
      body.append('file', {
        uri: asset.uri,
        name: asset.fileName?.trim() || `craves-plan-${saved.id}.jpg`,
        type: asset.mimeType || 'image/jpeg',
      } as unknown as Blob);
      await chefSubscriptionApi.uploadPlanImage(saved.id, body);
      return true;
    } catch (cause) {
      const status = cause instanceof AppApiError ? cause.status : undefined;
      if (status === 404 || status === 405) return unavailable();
      const reason = status === 400 ? (cause as AppApiError).message : 'Try again.';
      if (status === 400) {
        setPhoto(null);
        setPhotoError(reason);
      } else {
        setPhotoError("Photo couldn't be uploaded. Try again.");
        setDirty(true); // the plan is saved; only the photo still waits to upload
      }
      setServerError(`Plan saved, but the photo wasn't uploaded. ${reason}`);
      return false;
    }
  };

  const save = async (mode: 'draft' | 'submit', submitNote?: string) => {
    setAttempt(mode);
    if (busy || saving.current) return;
    const problem = stepWithErrors(validateMealPlanForm(form, slots, mode));
    if (problem) {
      setStep(problem);
      return;
    }
    saving.current = true;
    setBusy(mode);
    setServerError(null);
    setPhotoError(null);
    setScheduleNote(false);
    let id = savedPlanId;
    try {
      const input = {
        name: form.name.trim(),
        description: form.description.trim(),
        billingPeriod: period,
        amount: Number(form.amount.trim()),
        currency: 'INR' as const,
      };
      const saved = id ? await chefSubscriptionApi.updatePlan(id, input) : await chefSubscriptionApi.createPlan(input);
      id = saved.id;
      setSavedPlanId(id);
      if (hasDishes) {
        await chefSubscriptionApi.putSchedule(id, slotsToScheduleRequest(slots, leadHours));
        setHasServerSchedule(true);
      }
      setDirty(false);
      // Before submit: the server takes photos only while the plan is a draft.
      if (photo && !(await uploadPhoto(saved, photo))) return;
      if (mode === 'submit') {
        await chefSubscriptionApi.submit(id, submitNote);
      }
      if (scheduleKept) {
        // A schedule cannot be emptied, so the server kept the old one; stay, and show the Meals step that says so.
        setScheduleNote(true);
        setDirty(true);
        setStep(2);
        return;
      }
      toast.show(mode === 'submit' ? 'Sent to Craves for approval' : 'Draft saved');
      setLeaving(true);
    } catch (cause) {
      setServerError(
        cause instanceof AppApiError ? cause.message : 'The meal plan could not be saved. Try again.',
      );
    } finally {
      saving.current = false;
      setBusy(null);
      if (id) {
        invalidateChefMealPlans(queryClient).catch(() => undefined);
      }
    }
  };

  const goToMeals = () => {
    setAttempt(current => current ?? 'draft');
    if (Object.keys(validateMealPlanForm(form, slots, 'draft')).length === 0) {
      setStep(2);
    }
  };
  const goToReview = () => {
    setAttempt('submit');
    const problem = stepWithErrors(validateMealPlanForm(form, slots, 'submit'));
    setStep(problem ?? 3);
  };
  const copyToWeekdays = () => {
    updateSlots(current => copyDayToWeekdays(current, day));
    setCopying(false);
  };

  const photoUri = photo?.uri ?? (photoSupported ? resolveApiImageUrl(plan?.imageUrl) : null);
  const unit = billingUnit(period);
  const status = plan ? chefPlanStatusPresentation(plan.status) : null;
  const dayLong = dayName(kind, day, 'long');

  const details = (
    <>
      {photoSupported && (editable || photoUri) ? (
        <View style={styles.photoBlock}>
          {photoUri ? (
            <>
              <Image
                accessibilityIgnoresInvertColors
                accessibilityLabel="Plan photo"
                resizeMode="cover"
                source={{uri: photoUri}}
                style={styles.photo}
              />
              {editable ? (
                <ChefActionButton disabled={busy !== null} label="Change photo" onPress={pickPhoto} tone="neutral" />
              ) : null}
            </>
          ) : (
            <Pressable
              accessibilityLabel="Add plan photo"
              accessibilityRole="button"
              disabled={busy !== null}
              onPress={pickPhoto}
              style={({pressed}) => [styles.upload, pressed && styles.pressed]}>
              <Icon color={colors.flameRedAccessible} name="camera-plus" size={iconSize.lg} surface={false} />
              <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.uploadTitle}>
                Add plan photo
              </Text>
              <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.help}>
                Customers see it on the plan card
              </Text>
            </Pressable>
          )}
          {photoError ? <FieldError message={photoError} /> : null}
        </View>
      ) : null}

      <FormField
        editable={!locked}
        error={errors.name}
        label="Plan name"
        maxLength={160}
        onChangeText={value => updateForm('name', value)}
        placeholder="e.g. Weekly home lunch"
        required
        value={form.name}
      />

      <View style={styles.group}>
        <GroupLabel label="How often" required />
        <View style={styles.chips}>
          <OptionChip disabled={locked} label="Weekly" onPress={() => changePeriod('WEEKLY')} selected={period === 'WEEKLY'} />
          <OptionChip disabled={locked} label="14 days" onPress={() => changePeriod('FORTNIGHTLY')} selected={period === 'FORTNIGHTLY'} />
          <OptionChip disabled={locked} label="Monthly" onPress={() => changePeriod('MONTHLY')} selected={period === 'MONTHLY'} />
        </View>
      </View>

      <FormField
        accessibilityLabel={`Price per ${unit}`}
        editable={!locked}
        error={errors.amount}
        keyboardType="decimal-pad"
        label="Price"
        onChangeText={value => updateForm('amount', value)}
        placeholder="1499"
        prefix="₹"
        required
        suffix={`per ${unit}`}
        value={form.amount}
      />

      <View style={styles.group}>
        <GroupLabel label="Cook how early" required />
        <Pressable
          accessibilityHint="Opens the list of times"
          accessibilityLabel={`Cook how early, ${leadHoursLabel(leadHours)}`}
          accessibilityRole="button"
          disabled={locked}
          onPress={() => setSheet({kind: 'lead'})}
          style={styles.select}>
          <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.selectText}>
            {leadHoursLabel(leadHours)}
          </Text>
          <Icon color={colors.textSecondary} name="chevron-down" size={iconSize.sm} surface={false} />
        </Pressable>
        <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.help}>
          How long before each meal you start preparing.
        </Text>
      </View>

      <FormField
        editable={!locked}
        error={errors.description}
        helper={`${form.description.length}/500`}
        label="Description"
        maxLength={500}
        multiline
        onChangeText={value => updateForm('description', value)}
        placeholder="What customers get, how it's packed"
        required
        value={form.description}
      />
    </>
  );

  const meals = (
    <>
      {datePlanReset ? (
        <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.help}>
          This plan was set up by date. Set up one week; it repeats every week.
        </Text>
      ) : null}
      {kind === 'WEEKLY' ? (
        <View accessibilityRole="tablist" style={styles.days}>
          {WEEK_ORDER.map(value => (
            <DayCell
              hasMeals={mealDays.has(value)}
              key={value}
              label={WEEKDAYS_SHORT[value - 1]}
              onPress={() => setDay(value)}
              selected={day === value}
              style={styles.weekDay}
            />
          ))}
        </View>
      ) : (
        <ScrollView
          horizontal
          accessibilityRole="tablist"
          contentContainerStyle={styles.monthDays}
          showsHorizontalScrollIndicator={false}
          style={styles.monthScroll}>
          {MONTH_DAYS.map(value => (
            <DayCell
              accessibilityLabel={`Day ${value}`}
              hasMeals={mealDays.has(value)}
              key={value}
              label={String(value)}
              onPress={() => setDay(value)}
              selected={day === value}
              style={styles.monthDay}
            />
          ))}
        </ScrollView>
      )}
      {errors.schedule ? <FieldError message={errors.schedule} /> : null}
      {scheduleNote && scheduleKept ? <FieldError message="Add at least one meal to save schedule changes." /> : null}
      {missingDishDays.length > 0 ? (
        <FieldError
          message={`Select a dish for every meal: ${missingDishDays.map(value => dayName(kind, value)).join(', ')}.`}
        />
      ) : null}

      {daySlots.map(slot => (
        <SlotCard
          dish={slot.menuItemId ? menuById.get(slot.menuItemId) : undefined}
          dishName={slot.menuItemId ? dishName(slot.menuItemId) : null}
          dishUnavailable={
            slot.menuItemId !== null &&
            menu.status === 'success' &&
            !availableDishes.some(item => item.id === slot.menuItemId)
          }
          editable={editable}
          error={errors[`slot:${slot.key}`]}
          key={slot.key}
          locked={locked}
          onDelete={() => setRemoving(slot)}
          onDish={() => setSheet({kind: 'dish', key: slot.key})}
          onQuantity={quantity => updateSlots(current => setSlotQuantity(current, slot.key, quantity))}
          onTime={() => setSheet({kind: 'time', slot: slot.slot})}
          slot={slot}
        />
      ))}

      {editable && freeSlots.length > 0 ? (
        <ChefActionButton
          accessibilityLabel={`Add meal slot for ${dayName(kind, day)}`}
          disabled={locked}
          icon="plus"
          label={addMealLabel(freeSlots)}
          onPress={() => setSheet({kind: 'add'})}
          tone="neutral"
        />
      ) : null}
      {editable && kind === 'WEEKLY' && daySlots.length > 0 ? (
        <ChefActionButton
          disabled={locked}
          icon="copy"
          label={`Copy ${dayLong} to all weekdays`}
          onPress={() => (otherWeekdaysHaveMeals(slots, day) ? setCopying(true) : copyToWeekdays())}
          tone="ghost"
        />
      ) : null}
      {editable ? (
        <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.help}>
          You can only pick dishes that are on and available on your menu.
        </Text>
      ) : null}
    </>
  );

  const reviewItems = kind === 'WEEKLY' ? slotsToScheduleRequest(slots, leadHours).items : schedule?.items ?? [];
  const review = (
    <>
      <ChefCard>
        <View style={styles.summary}>
          {photoUri ? (
            <Image accessibilityIgnoresInvertColors resizeMode="cover" source={{uri: photoUri}} style={styles.summaryPhoto} />
          ) : null}
          <View style={styles.flex}>
            <Text allowFontScaling={textDefaults.allowFontScaling} numberOfLines={2} style={styles.summaryName}>
              {form.name.trim()}
            </Text>
            <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.help}>
              {chefPlanMetaLine({billingPeriod: period}, reviewItems)}
            </Text>
            {kind === 'WEEKLY' ? (
              <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.help}>
                {repeatsLabel(period)}
              </Text>
            ) : null}
            <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.summaryPrice}>
              {chefPlanPriceLabel({amount: form.amount.trim(), currency: 'INR', billingPeriod: period})}
            </Text>
          </View>
          <EditLink label="Edit details" onPress={() => setStep(1)} />
        </View>
      </ChefCard>
      <ChefCard>
        <View style={styles.summaryHead}>
          <Text accessibilityRole="header" allowFontScaling={textDefaults.allowFontScaling} style={styles.summaryTitle}>
            Meals
          </Text>
          <EditLink label="Edit meals" onPress={() => setStep(2)} />
        </View>
        {groupMealDays(slots, kind).flatMap(group =>
          group.meals.map(meal => (
            <View key={`${group.days[0]}-${meal.slot}`} style={styles.reviewRow}>
              <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.reviewTitle}>
                {`${dayRangeLabel(kind, group.days)} · ${mealSlotLabel(meal.slot)} ${formatServiceTime(meal.time)}`}
              </Text>
              <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.help}>
                {meal.menuItemId ? dishName(meal.menuItemId) : ''}
                {meal.quantity > 1 ? ` × ${meal.quantity}` : ''}
              </Text>
            </View>
          )),
        )}
      </ChefCard>
      <FormField
        editable={busy === null}
        label="Note for Craves (optional)"
        maxLength={1000}
        multiline
        onChangeText={setNote}
        placeholder="Anything the Craves team should know"
        value={note}
      />
      <View style={styles.banner}>
        <Glyph color={colors.warningText} name="lock-clock" />
        <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.bannerText}>
          You can't edit the plan while Craves checks it. Usually takes a day.
        </Text>
      </View>
    </>
  );

  const readOnlyNote = editable || !plan
    ? null
    : plan.status === 'PENDING_APPROVAL'
      ? "Craves is checking this plan. You can't edit it until then."
      : plan.status === 'ACTIVE'
        ? 'This plan is live. To change something, send us a request.'
        : "This plan isn't live. To change something, send us a request.";

  return (
    <ChefScreen
      footer={
        editable ? (
          <View style={styles.buttons}>
            {step > 1 ? (
              <ChefActionButton disabled={busy !== null} label="Back" onPress={() => setStep((step - 1) as Step)} style={styles.flex} tone="neutral" />
            ) : null}
            {step === 1 ? <ChefActionButton label="Next: Meals" onPress={goToMeals} style={styles.flex2} /> : null}
            {step === 2 ? <ChefActionButton label="Next: Review" onPress={goToReview} style={styles.flex2} /> : null}
            {step === 3 ? (
              <ChefActionButton busy={busy === 'submit'} label="Submit for approval" onPress={() => save('submit', note)} style={styles.flex2} />
            ) : null}
          </View>
        ) : (
          <ChefActionButton
            label="Request a change"
            onPress={() => navigation.navigate('ChefSupportTicket', {topic: `Change meal plan: ${plan?.name ?? ''}`})}
          />
        )
      }
      header={
        <>
          <ChefTopBar
            backIcon={editable ? 'close' : 'arrow-left'}
            onBack={() => {
              if (!busy) navigation.goBack();
            }}
            showBell={false}
            subtitle={editable ? `Step ${step} of 3 · ${STEP_NAMES[step]}` : status?.label}
            title={editable ? (plan ? 'Edit meal plan' : 'New meal plan') : (plan?.name ?? '')}
          />
          {editable ? (
            <View accessibilityLabel={`Step ${step} of 3`} style={styles.steps}>
              {([1, 2, 3] as const).map(value => (
                <View key={value} style={[styles.stepBar, value <= step && styles.stepBarOn]} />
              ))}
            </View>
          ) : null}
        </>
      }
      key={step}>
      {readOnlyNote ? (
        <View accessibilityRole="alert" style={[styles.banner, styles.bannerInfo]}>
          <Glyph color={colors.infoText} name="lock-outline" />
          <Text allowFontScaling={textDefaults.allowFontScaling} style={[styles.bannerText, styles.bannerInfoText]}>
            {readOnlyNote}
          </Text>
        </View>
      ) : null}
      {plan?.status === 'REJECTED' ? (
        <View accessibilityRole="alert" style={styles.banner}>
          <Glyph color={colors.warningText} name="message-alert-outline" />
          <View style={styles.flex}>
            <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.bannerTitle}>
              {status?.label}
            </Text>
            <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.bannerText}>
              {plan.reviewReason ?? 'Update the plan and submit it again.'}
            </Text>
          </View>
        </View>
      ) : null}
      {serverError ? (
        <View accessibilityLiveRegion="assertive" accessibilityRole="alert" style={[styles.banner, styles.bannerError]}>
          <Icon color={colors.flameRedAccessible} name="alert" size={iconSize.md} surface={false} />
          <Text allowFontScaling={textDefaults.allowFontScaling} style={[styles.bannerText, styles.bannerErrorText]}>
            {serverError}
          </Text>
        </View>
      ) : null}

      {editable ? (
        step === 1 ? (
          details
        ) : step === 2 ? (
          meals
        ) : (
          review
        )
      ) : (
        <>
          <View accessibilityRole="radiogroup" style={styles.chips}>
            <OptionChip label="Details" onPress={() => setStep(1)} selected={step === 1} />
            <OptionChip label="Meals" onPress={() => setStep(2)} selected={step === 2} />
          </View>
          {step === 2 ? meals : details}
        </>
      )}

      <ChefSheet onClose={() => setSheet(null)} title="Cook how early" visible={sheet?.kind === 'lead'}>
        {LEAD_HOUR_OPTIONS.map(hours => (
          <SheetRow
            key={hours}
            label={leadHoursLabel(hours)}
            onPress={() => {
              setLeadHours(hours);
              setDirty(true);
              setSheet(null);
            }}
            selected={hours === leadHours}
          />
        ))}
      </ChefSheet>
      <ChefSheet
        onClose={() => setSheet(null)}
        title={sheet?.kind === 'time' ? `${mealSlotLabel(sheet.slot)} time` : 'Time'}
        visible={sheet?.kind === 'time'}>
        {sheet?.kind === 'time' ? (
          <>
            <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.help}>
              {`Applies to every ${mealSlotLabel(sheet.slot).toLowerCase()} in this plan`}
            </Text>
            {TIME_OPTIONS.map(time => (
              <SheetRow
                key={time}
                label={formatServiceTime(time)}
                onPress={() => {
                  updateSlots(current => setSlotTime(current, sheet.slot, time));
                  setSheet(null);
                }}
                selected={slots.find(slot => slot.slot === sheet.slot)?.time === time}
              />
            ))}
          </>
        ) : null}
      </ChefSheet>
      <ChefSheet onClose={() => setSheet(null)} title="Pick a dish" visible={sheet?.kind === 'dish'}>
        {sheet?.kind === 'dish' ? (
          availableDishes.length === 0 && menu.status === 'error' ? (
            <Message
              action={{
                label: 'Try again',
                onPress: () => {
                  menu.refresh().catch(() => undefined);
                },
              }}
              message="Check your connection and try again."
              title="Couldn't load your menu"
            />
          ) : availableDishes.length === 0 ? (
            <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.messageText}>
              {menu.status === 'pending' ? 'Loading your menu…' : 'None of your dishes are on and available yet.'}
            </Text>
          ) : (
            availableDishes.map(item => (
              <SheetRow
                key={item.id}
                label={item.itemName}
                leading={<DishThumb item={item} size={iconSize.xxl} />}
                onPress={() => {
                  updateSlots(current => setSlotDish(current, sheet.key, item.id));
                  setSheet(null);
                }}
                selected={slots.find(slot => slot.key === sheet.key)?.menuItemId === item.id}
              />
            ))
          )
        ) : null}
      </ChefSheet>
      <ChefSheet onClose={() => setSheet(null)} title={`Add a meal for ${dayName(kind, day)}`} visible={sheet?.kind === 'add'}>
        {freeSlots.map(code => (
          <SheetRow
            key={code}
            label={mealSlotLabel(code)}
            leading={<Glyph color={colors.textSecondary} name={SLOT_ICON[code]} />}
            onPress={() => {
              updateSlots(current => addSlot(current, day, code));
              setSheet(null);
            }}
          />
        ))}
      </ChefSheet>

      <ChefSheet onClose={() => setPendingLeave(null)} title="Save as draft?" visible={pendingLeave !== null}>
        <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.messageText}>
          Your plan isn't sent to Craves yet. A draft keeps what you've done so far.
        </Text>
        <ChefActionButton
          label="Save draft"
          onPress={() => {
            setPendingLeave(null);
            save('draft');
          }}
        />
        <ChefActionButton
          label="Discard"
          onPress={() => {
            const action = pendingLeave;
            setPendingLeave(null);
            navigation.dispatch(action as never);
          }}
          tone="neutral"
        />
        <ChefActionButton label="Keep editing" onPress={() => setPendingLeave(null)} tone="ghost" />
      </ChefSheet>
      <ConfirmDialog
        confirmLabel="Remove"
        message="The dish planned for it on this day is removed."
        onCancel={() => setRemoving(null)}
        onConfirm={() => {
          const slot = removing;
          setRemoving(null);
          if (slot) updateSlots(current => removeSlot(current, slot.key));
        }}
        title={
          removing
            ? `Remove ${mealSlotLabel(removing.slot).toLowerCase()} on ${kind === 'WEEKLY' ? dayName(kind, removing.day, 'long') : `day ${removing.day}`}?`
            : 'Remove this meal?'
        }
        tone="danger"
        visible={removing !== null}
      />
      <ConfirmDialog
        confirmLabel="Copy"
        message="This replaces any meals already planned for the other weekdays."
        onCancel={() => setCopying(false)}
        onConfirm={copyToWeekdays}
        title={`Copy ${dayLong} to all weekdays?`}
        visible={copying}
      />
    </ChefScreen>
  );
}

function EditLink({label, onPress}: {label: string; onPress: () => void}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      hitSlop={{top: spacing.xxs, bottom: spacing.xxs}}
      onPress={onPress}
      style={styles.editLink}>
      <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.editLinkText}>
        Edit
      </Text>
    </Pressable>
  );
}

function DishThumb({item, size}: {item: ChefMenuItem; size: number}) {
  const uri = getChefMenuPrimaryImageUrl(item);
  const box = {width: size, height: size, borderRadius: radius.sm};
  return uri ? (
    <Image accessibilityIgnoresInvertColors resizeMode="cover" source={{uri}} style={box} />
  ) : (
    <View style={[box, styles.noThumb]}>
      <Icon color={colors.borderStrong} name="meal" size={iconSize.md} surface={false} />
    </View>
  );
}

function DayCell({
  label,
  accessibilityLabel,
  hasMeals,
  selected,
  onPress,
  style,
}: {
  label: string;
  accessibilityLabel?: string;
  hasMeals: boolean;
  selected: boolean;
  onPress: () => void;
  style: object;
}) {
  return (
    <Pressable
      accessibilityLabel={`${accessibilityLabel ?? label}${hasMeals ? ', has meals' : ''}`}
      accessibilityRole="tab"
      accessibilityState={{selected}}
      onPress={onPress}
      style={[styles.dayCell, style, selected && styles.dayCellOn, !selected && !hasMeals && styles.dayCellEmpty]}>
      <Text allowFontScaling={textDefaults.allowFontScaling} style={[styles.dayText, selected && styles.dayTextOn]}>
        {label}
      </Text>
    </Pressable>
  );
}

function SlotCard({
  slot,
  dish,
  dishName,
  dishUnavailable,
  editable,
  locked,
  error,
  onDelete,
  onDish,
  onQuantity,
  onTime,
}: {
  slot: EditorSlot;
  dish: ChefMenuItem | undefined;
  dishName: string | null;
  dishUnavailable: boolean;
  editable: boolean;
  /** Not editable, or a save is in flight. */
  locked: boolean;
  error?: string;
  onDelete: () => void;
  onDish: () => void;
  onQuantity: (quantity: number) => void;
  onTime: () => void;
}) {
  const label = mealSlotLabel(slot.slot);
  return (
    <ChefCard>
      <View style={styles.slotHeader}>
        <Glyph color={slot.slot === 'DINNER' ? colors.flameRedAccessible : colors.warning} name={SLOT_ICON[slot.slot]} />
        <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.slotTitle}>
          {label}
        </Text>
        <Pressable
          accessibilityHint="Opens the list of times"
          accessibilityLabel={`${label} time, ${formatServiceTime(slot.time)}`}
          accessibilityRole="button"
          disabled={locked}
          onPress={onTime}
          style={({pressed}) => [styles.timeChip, pressed && styles.pressed]}>
          <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.timeText}>
            {formatServiceTime(slot.time)}
          </Text>
          {editable ? <Icon color={colors.textPrimary} name="chevron-down" size={iconSize.xs} surface={false} /> : null}
        </Pressable>
        {editable ? (
          <Pressable
            accessibilityLabel={`Remove ${label.toLowerCase()}`}
            accessibilityRole="button"
            disabled={locked}
            onPress={onDelete}
            style={({pressed}) => [styles.iconButton, pressed && styles.pressed]}>
            <Glyph color={colors.textSecondary} name="delete-outline" size={iconSize.lg} />
          </Pressable>
        ) : null}
      </View>
      <View style={styles.dishRow}>
        <Pressable
          accessibilityHint="Opens your available dishes"
          accessibilityLabel={`${label} dish, ${dishName ?? 'not selected'}`}
          accessibilityRole="button"
          disabled={locked}
          onPress={onDish}
          style={({pressed}) => [dishName ? styles.dishOpen : styles.addDish, error && styles.addDishError, pressed && styles.pressed]}>
          {dishName ? (
            <>
              {dish ? <DishThumb item={dish} size={touchTarget.minimum} /> : null}
              <View style={styles.flex}>
                <View style={styles.dishName}>
                  {dish ? <VegMark type={dish.foodType} /> : null}
                  <Text allowFontScaling={textDefaults.allowFontScaling} numberOfLines={2} style={styles.dishNameText}>
                    {dishName}
                  </Text>
                </View>
                {dish ? (
                  <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.help}>
                    {formatRupeesExact(dish.price)} on menu
                  </Text>
                ) : null}
              </View>
            </>
          ) : (
            <>
              <Icon color={colors.flameRedAccessible} name="plus" size={iconSize.sm} surface={false} />
              <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.addDishText}>
                Add a dish
              </Text>
            </>
          )}
        </Pressable>
        {dishName ? (
          editable ? (
            <View style={styles.stepper}>
              <Pressable
                accessibilityLabel={`Fewer ${label.toLowerCase()} portions`}
                accessibilityRole="button"
                disabled={locked || slot.quantity <= 1}
                onPress={() => onQuantity(slot.quantity - 1)}
                style={styles.stepperButton}>
                <Glyph color={slot.quantity > 1 ? colors.textSecondary : colors.borderStrong} name="minus-circle-outline" size={iconSize.lg} />
              </Pressable>
              <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.stepperValue}>
                {slot.quantity}
              </Text>
              <Pressable
                accessibilityLabel={`More ${label.toLowerCase()} portions`}
                accessibilityRole="button"
                disabled={locked || slot.quantity >= 100}
                onPress={() => onQuantity(slot.quantity + 1)}
                style={styles.stepperButton}>
                <Glyph color={slot.quantity < 100 ? colors.flameRedAccessible : colors.borderStrong} name="plus-circle" size={iconSize.lg} />
              </Pressable>
            </View>
          ) : (
            <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.stepperValue}>
              {`× ${slot.quantity}`}
            </Text>
          )
        ) : null}
      </View>
      {error ? <FieldError message={error} /> : null}
      {!error && dishUnavailable ? <FieldError message="This dish is not available on your menu right now." /> : null}
    </ChefCard>
  );
}

/** One choice in a sheet: a radio when `selected` is given, a plain button without it. */
function SheetRow({
  label,
  leading,
  selected,
  onPress,
}: {
  label: string;
  leading?: React.ReactNode;
  selected?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole={selected === undefined ? 'button' : 'radio'}
      accessibilityState={selected === undefined ? undefined : {checked: selected}}
      onPress={onPress}
      style={({pressed}) => [styles.sheetRow, pressed && styles.pressed]}>
      {leading}
      <Text allowFontScaling={textDefaults.allowFontScaling} numberOfLines={2} style={styles.sheetRowText}>
        {label}
      </Text>
      {selected === undefined ? null : <RadioMark checked={selected} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: {flex: 1, minWidth: 0},
  flex2: {flex: 2},
  pressed: {opacity: 0.6},
  skeleton: {gap: spacing.sm},
  message: {alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.md},
  messageTitle: {color: colors.textPrimary, fontSize: typography.heading, fontWeight: fontWeight.bold, textAlign: 'center'},
  messageText: {color: colors.textSecondary, fontSize: typography.body},
  steps: {flexDirection: 'row', gap: spacing.xxs, paddingHorizontal: spacing.md, paddingBottom: spacing.sm, backgroundColor: colors.white},
  stepBar: {flex: 1, height: spacing.xxs, borderRadius: radius.pill, backgroundColor: colors.border},
  stepBarOn: {backgroundColor: colors.flameRed},
  buttons: {flexDirection: 'row', gap: spacing.sm},
  banner: {flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.warningSoft},
  bannerInfo: {backgroundColor: colors.infoSoft},
  bannerError: {backgroundColor: colors.errorSoft},
  bannerTitle: {color: colors.warningText, fontSize: typography.body, fontWeight: fontWeight.bold},
  bannerText: {flex: 1, color: colors.warningText, fontSize: typography.small},
  bannerInfoText: {color: colors.infoText},
  bannerErrorText: {color: colors.flameRedAccessible},
  help: {color: colors.textSecondary, fontSize: typography.small},
  group: {gap: spacing.xs},
  chips: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs},
  select: {
    minHeight: touchTarget.minimum,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderWidth: borderWidth.focus,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  selectText: {flex: 1, color: colors.textPrimary, fontSize: typography.body},
  photoBlock: {gap: spacing.xs},
  photo: {width: '100%', aspectRatio: 4 / 3, borderRadius: radius.md},
  upload: {
    height: 120, // the board's photo drop-zone; no token for it
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xxs,
    borderRadius: radius.md,
    borderWidth: borderWidth.focus,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
    backgroundColor: colors.white,
  },
  uploadTitle: {color: colors.textPrimary, fontSize: typography.body, fontWeight: fontWeight.bold},
  days: {flexDirection: 'row', justifyContent: 'space-between', gap: spacing.xxs},
  monthScroll: {flexGrow: 0},
  monthDays: {gap: spacing.xs},
  dayCell: {
    minHeight: touchTarget.minimum,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  weekDay: {flex: 1},
  monthDay: {width: touchTarget.minimum},
  dayCellOn: {borderColor: colors.flameRedAccessible, backgroundColor: colors.errorSoft},
  dayCellEmpty: {opacity: 0.55},
  dayText: {color: colors.textPrimary, fontSize: typography.small, fontWeight: fontWeight.semibold},
  dayTextOn: {color: colors.flameRedAccessible},
  slotHeader: {flexDirection: 'row', alignItems: 'center', gap: spacing.xs},
  slotTitle: {flex: 1, color: colors.textPrimary, fontSize: typography.body, fontWeight: fontWeight.bold},
  timeChip: {
    minHeight: touchTarget.minimum,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: borderWidth.standard,
    borderColor: colors.borderStrong,
  },
  timeText: {color: colors.textPrimary, fontSize: typography.small, fontWeight: fontWeight.semibold},
  iconButton: {width: touchTarget.minimum, height: touchTarget.minimum, alignItems: 'center', justifyContent: 'center'},
  dishRow: {flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs},
  dishOpen: {flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: touchTarget.minimum},
  dishName: {flexDirection: 'row', alignItems: 'center', gap: spacing.xs},
  dishNameText: {flexShrink: 1, color: colors.textPrimary, fontSize: typography.body, fontWeight: fontWeight.semibold},
  addDish: {
    flex: 1,
    minHeight: touchTarget.minimum,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  addDishError: {borderRadius: radius.md, borderWidth: borderWidth.focus, borderColor: colors.flameRedAccessible},
  addDishText: {color: colors.flameRedAccessible, fontSize: typography.body, fontWeight: fontWeight.bold},
  noThumb: {alignItems: 'center', justifyContent: 'center', borderWidth: borderWidth.standard, borderColor: colors.border},
  stepper: {flexDirection: 'row', alignItems: 'center'},
  stepperButton: {width: touchTarget.minimum, height: touchTarget.minimum, alignItems: 'center', justifyContent: 'center'},
  stepperValue: {minWidth: spacing.xl, color: colors.textPrimary, fontSize: typography.body, fontWeight: fontWeight.bold, textAlign: 'center'},
  summary: {flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm},
  summaryPhoto: {width: SUMMARY_PHOTO, height: SUMMARY_PHOTO, borderRadius: radius.md},
  summaryName: {color: colors.textPrimary, fontSize: typography.button, fontWeight: fontWeight.bold},
  summaryPrice: {marginTop: spacing.xxs, color: colors.textPrimary, fontSize: typography.body, fontWeight: fontWeight.bold},
  summaryHead: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  summaryTitle: {color: colors.textPrimary, fontSize: typography.button, fontWeight: fontWeight.bold},
  editLink: {minHeight: touchTarget.minimum, justifyContent: 'center', paddingHorizontal: spacing.xs},
  editLinkText: {color: colors.flameRedAccessible, fontSize: typography.body, fontWeight: fontWeight.bold},
  reviewRow: {paddingVertical: spacing.xs, gap: spacing.xxs},
  reviewTitle: {color: colors.textPrimary, fontSize: typography.body, fontWeight: fontWeight.semibold},
  sheetRow: {minHeight: touchTarget.minimum, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xxs},
  sheetRowText: {flex: 1, color: colors.textPrimary, fontSize: typography.body},
});
