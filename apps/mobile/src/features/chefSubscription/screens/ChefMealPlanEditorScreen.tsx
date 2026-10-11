import React from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import MaterialDesignIcons from '@react-native-vector-icons/material-design-icons';
import * as ImagePicker from 'expo-image-picker';
import {usePreventRemove} from '@react-navigation/native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {SafeAreaView, useSafeAreaInsets} from 'react-native-safe-area-context';
import {useQueryClient} from '@tanstack/react-query';
import type {ChefProductStackParamList} from '../../../app/navigation/types';
import {AppApiError} from '../../../core/http/apiError';
import {resolveReducedMotionAnimation} from '../../../design/motion';
import {useReducedMotionPreference} from '../../../design/reducedMotion';
import {
  borderWidth,
  colors,
  elevation,
  fontWeight,
  radius,
  spacing,
  textDefaults,
  touchTarget,
  typography,
} from '../../../design/tokens';
import {
  Button,
  ListSkeleton,
  RecoverableErrorBanner,
  SegmentedControl,
  TerminalState,
} from '../../../shared/components';
import type {ChefMenuItem} from '../../chefMenu/api/chefMenuApi';
import {
  getChefMenuDisplayState,
  getChefMenuPrimaryImageUrl,
} from '../../chefMenu/domain/chefMenuPresentation';
import {useChefMenuModel} from '../../chefMenu/state/useChefMenuModel';
import {
  MealPlanHeader,
  MealPlanPhoto,
  RadioMark,
} from '../../customerSubscription/components/MealPlanUi';
import {formatServiceTime, mealSlotLabel} from '../../mealPlans/domain/mealPlanSchedule';
import {resolveApiImageUrl} from '../../mealPlans/domain/resolveApiImageUrl';
import {
  chefSubscriptionApi,
  type ChefMealPlan,
  type ChefMealSchedule,
} from '../api/chefSubscriptionApi';
import {chefPlanStatusPresentation} from '../domain/chefMealPlanPresentation';
import {
  addSlot,
  daysWithMeals,
  freeSlotsForDay,
  LEAD_HOUR_OPTIONS,
  removeSlot,
  scheduleToSlots,
  setSlotDish,
  setSlotQuantity,
  setSlotTime,
  slotsToScheduleRequest,
  TIME_OPTIONS,
  validateMealPlanForm,
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
type Sheet =
  | {kind: 'lead'}
  | {kind: 'time'; slot: MealSlot}
  | {kind: 'dish'; key: string}
  | {kind: 'add'}
  | null;

const SUBTITLE = 'Plan your meals, delight your customers';
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH_DAYS = Array.from({length: 28}, (_, index) => index + 1);
// Server limits for plan photos (JPEG/PNG only; WebP is rejected).
const MAX_PHOTO_BYTES = 2_097_152;
const MAX_PHOTO_SIDE = 4096;
const SLOT_ICON: Record<MealSlot, string> = {
  BREAKFAST: 'coffee-outline',
  LUNCH: 'silverware-fork-knife',
  SNACK: 'cookie-outline',
  DINNER: 'weather-night',
};

const leadHoursLabel = (hours: number) =>
  hours === 24 ? '24 hours (Default)' : `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
const dayName = (period: BillingPeriod, day: number) =>
  period === 'WEEKLY' ? WEEKDAYS[day - 1] : `Day ${day}`;

function Glyph({name, size = 22, color = colors.textSecondary}: {name: string; size?: number; color?: string}) {
  return <MaterialDesignIcons accessibilityElementsHidden name={name as never} size={size} color={color} />;
}

function Label({text, required = true}: {text: string; required?: boolean}) {
  return (
    <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.label}>
      {text}
      {required ? <Text style={styles.required}> *</Text> : null}
    </Text>
  );
}

function FieldError({message}: {message?: string}) {
  return message ? (
    <Text accessibilityLiveRegion="polite" allowFontScaling={textDefaults.allowFontScaling} style={styles.errorText}>
      {message}
    </Text>
  ) : null;
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
        navigation={navigation}
        plan={loaded?.plan ?? null}
        schedule={loaded?.schedule ?? null}
      />
    );
  }

  let body: React.ReactNode;
  if (plans.isLoading || schedule.isLoading) {
    body = <ListSkeleton count={3} style={styles.fallback} />;
  } else if (plans.isError || schedule.isError) {
    body = (
      <RecoverableErrorBanner
        message="This meal plan could not be loaded. Check your connection and try again."
        onRetry={() => {
          plans.refetch();
          schedule.refetch();
        }}
        style={styles.fallback}
      />
    );
  } else {
    body = (
      <TerminalState
        title="This meal plan is no longer available"
        actionLabel="Back to meal plans"
        onAction={() => navigation.goBack()}
      />
    );
  }
  return (
    <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={styles.safeArea}>
      <MealPlanHeader title="Edit Meal Plan" subtitle={SUBTITLE} onBack={() => navigation.goBack()} />
      <View style={styles.body}>{body}</View>
    </SafeAreaView>
  );
}

function MealPlanEditor({
  navigation,
  plan,
  schedule,
}: {
  navigation: Props['navigation'];
  plan: ChefMealPlan | null;
  schedule: ChefMealSchedule | null;
}) {
  const queryClient = useQueryClient();
  const menu = useChefMenuModel();
  const editable = !plan || plan.status === 'DRAFT' || plan.status === 'REJECTED';
  // Older backends send no imageUrl key at all and have no photo endpoint.
  const photoSupported = !plan || 'imageUrl' in plan;

  const [savedPlanId, setSavedPlanId] = React.useState(plan?.id ?? null);
  const [form, setForm] = React.useState<MealPlanFormValues>({
    name: plan?.name ?? '',
    description: plan?.description ?? '',
    amount: plan?.amount ?? '',
  });
  const [period, setPeriod] = React.useState<BillingPeriod>(plan?.billingPeriod ?? 'WEEKLY');
  const [leadHours, setLeadHours] = React.useState(schedule?.generationLeadHours ?? 24);
  const [slots, setSlots] = React.useState<EditorSlot[]>(() =>
    schedule && schedule.recurrenceType === period ? scheduleToSlots(schedule) : [],
  );
  const [day, setDay] = React.useState(() => slots[0]?.day ?? 1);
  const [photo, setPhoto] = React.useState<ImagePicker.ImagePickerAsset | null>(null);
  const [photoError, setPhotoError] = React.useState<string | null>(null);
  const [attempt, setAttempt] = React.useState<'draft' | 'submit' | null>(null);
  const [busy, setBusy] = React.useState<'draft' | 'submit' | null>(null);
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [dirty, setDirty] = React.useState(false);
  const [leaving, setLeaving] = React.useState(false);
  const [sheet, setSheet] = React.useState<Sheet>(null);
  const [submitOpen, setSubmitOpen] = React.useState(false);
  const [note, setNote] = React.useState('');
  const [hasServerSchedule, setHasServerSchedule] = React.useState(schedule !== null);
  const [scheduleNote, setScheduleNote] = React.useState(false);

  // Errors appear after the first save attempt and then follow the chef's edits.
  const errors = attempt ? validateMealPlanForm(form, slots, attempt) : {};
  const hasErrors = Object.keys(errors).length > 0;
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

  usePreventRemove(dirty && !leaving, ({data}) => {
    Alert.alert('Discard unsaved changes?', 'Your meal plan changes have not been saved.', [
      {text: 'Keep editing', style: 'cancel'},
      {text: 'Discard', style: 'destructive', onPress: () => navigation.dispatch(data.action)},
    ]);
  });

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

  const changePeriod = (next: BillingPeriod) => {
    if (next === period) return;
    const apply = () => {
      setPeriod(next);
      setSlots([]);
      setDay(1);
      setDirty(true);
    };
    if (slots.length === 0) {
      apply();
      return;
    }
    Alert.alert('Change frequency?', 'Changing frequency clears the meal schedule.', [
      {text: 'Cancel', style: 'cancel'},
      {text: 'Change', style: 'destructive', onPress: apply},
    ]);
  };

  const pickPhoto = async () => {
    if (busy || !editable) return;
    setPhotoError(null);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'Photo permission required',
          'Allow photo access so you can choose a photo for this meal plan.',
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
    if (busy || Object.keys(validateMealPlanForm(form, slots, mode)).length > 0) return;
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
        await chefSubscriptionApi.putSchedule(id, slotsToScheduleRequest(slots, period, leadHours));
        setHasServerSchedule(true);
      }
      setDirty(false);
      // Before submit: the server takes photos only while the plan is a draft.
      if (photo && !(await uploadPhoto(saved, photo))) return;
      if (mode === 'submit') {
        await chefSubscriptionApi.submit(id, submitNote);
      }
      if (scheduleKept) {
        // A schedule cannot be emptied, so the server kept the old one; stay and say so.
        setScheduleNote(true);
        setDirty(true);
        return;
      }
      setLeaving(true);
    } catch (cause) {
      setServerError(
        cause instanceof AppApiError ? cause.message : 'The meal plan could not be saved. Try again.',
      );
    } finally {
      setBusy(null);
      if (id) {
        invalidateChefMealPlans(queryClient).catch(() => undefined);
      }
    }
  };

  const openSubmit = () => {
    setAttempt('submit');
    if (Object.keys(validateMealPlanForm(form, slots, 'submit')).length === 0) {
      setSubmitOpen(true);
    }
  };

  const statusLabel = plan ? chefPlanStatusPresentation(plan.status).label : '';
  const existingPhoto = photoSupported ? resolveApiImageUrl(plan?.imageUrl) : null;
  const photoUri = photo?.uri ?? existingPhoto;
  const unit = period === 'MONTHLY' ? 'month' : 'week';

  return (
    <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={styles.safeArea}>
      <MealPlanHeader
        title={plan ? 'Edit Meal Plan' : 'Create Meal Plan'}
        subtitle={SUBTITLE}
        onBack={() => {
          if (!busy) navigation.goBack();
        }}
      />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.body}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          {plan && !editable ? (
            <View accessibilityRole="alert" style={[styles.banner, styles.bannerInfo]}>
              <Glyph name="lock-outline" color={colors.infoText} />
              <Text allowFontScaling={textDefaults.allowFontScaling} style={[styles.bannerText, styles.bannerInfoText]}>
                This plan is {statusLabel.toLowerCase()}. You can't edit it right now.
              </Text>
            </View>
          ) : null}
          {plan?.status === 'REJECTED' ? (
            <View accessibilityRole="alert" style={[styles.banner, styles.bannerWarning]}>
              <Glyph name="message-alert-outline" color={colors.warningText} />
              <View style={styles.flex}>
                <Text allowFontScaling={textDefaults.allowFontScaling} style={[styles.bannerTitle, styles.bannerWarningText]}>
                  {statusLabel}
                </Text>
                <Text allowFontScaling={textDefaults.allowFontScaling} style={[styles.bannerText, styles.bannerWarningText]}>
                  {plan.reviewReason ?? 'Update the plan and submit it again.'}
                </Text>
              </View>
            </View>
          ) : null}

          <View style={styles.card}>
            <Text accessibilityRole="header" allowFontScaling={textDefaults.allowFontScaling} style={styles.cardTitle}>
              Plan details
            </Text>

            {photoSupported && (editable || photoUri) ? (
              <View style={styles.field}>
                <Label text="Plan photo" required={false} />
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
                      <Button label="Change photo" variant="outline" disabled={busy !== null} onPress={pickPhoto} />
                    ) : null}
                  </>
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Add plan photo"
                    disabled={busy !== null}
                    onPress={pickPhoto}
                    style={({pressed}) => [styles.upload, pressed && styles.pressed]}>
                    <Glyph name="camera-plus-outline" size={28} color={colors.flameRedAccessible} />
                    <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.uploadTitle}>
                      Add plan photo
                    </Text>
                    <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.help}>
                      Customers see this on the plan card
                    </Text>
                  </Pressable>
                )}
                <FieldError message={photoError ?? undefined} />
              </View>
            ) : null}

            <View style={styles.field}>
              <Label text="Plan name" />
              <TextInput
                accessibilityLabel="Plan name"
                allowFontScaling={textDefaults.allowFontScaling}
                editable={!locked}
                maxLength={160}
                onChangeText={value => updateForm('name', value)}
                placeholder="e.g. Weekly Home Lunch Plan"
                placeholderTextColor={colors.placeholder}
                style={[styles.input, errors.name && styles.inputError, !editable && styles.inputDisabled]}
                value={form.name}
              />
              <FieldError message={errors.name} />
            </View>

            <View style={styles.field}>
              <Label text="Frequency" />
              <SegmentedControl
                accessibilityLabel="Frequency"
                accessibilityOptionRole="radio"
                disabled={locked}
                onChange={changePeriod}
                options={[
                  {value: 'WEEKLY', label: 'Weekly'},
                  {value: 'MONTHLY', label: 'Monthly'},
                ]}
                value={period}
              />
            </View>

            <View style={styles.field}>
              <Label text="Price (INR)" />
              <View style={[styles.input, styles.inputRow, errors.amount && styles.inputError, !editable && styles.inputDisabled]}>
                <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.rupee}>₹</Text>
                <TextInput
                  accessibilityLabel={`Price per ${unit}`}
                  allowFontScaling={textDefaults.allowFontScaling}
                  editable={!locked}
                  keyboardType="decimal-pad"
                  onChangeText={value => updateForm('amount', value)}
                  placeholder="e.g. 1499"
                  placeholderTextColor={colors.placeholder}
                  style={styles.inlineInput}
                  value={form.amount}
                />
                <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.help}>per {unit}</Text>
              </View>
              <FieldError message={errors.amount} />
            </View>

            <View style={styles.field}>
              <Label text="Description" />
              <View>
                <TextInput
                  accessibilityLabel="Description"
                  allowFontScaling={textDefaults.allowFontScaling}
                  editable={!locked}
                  maxLength={500}
                  multiline
                  onChangeText={value => updateForm('description', value)}
                  placeholder="Tell customers about this plan, what they can expect, etc."
                  placeholderTextColor={colors.placeholder}
                  style={[styles.input, styles.multiline, errors.description && styles.inputError, !editable && styles.inputDisabled]}
                  textAlignVertical="top"
                  value={form.description}
                />
                <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.counter}>
                  {form.description.length}/500
                </Text>
              </View>
              <FieldError message={errors.description} />
            </View>

            <View style={styles.field}>
              <View style={styles.labelRow}>
                <Label text="Preparation lead time" />
                <Glyph name="information-outline" size={18} />
              </View>
              <Pressable
                accessibilityHint="Opens the list of lead times"
                accessibilityLabel={`Preparation lead time, ${leadHoursLabel(leadHours)}`}
                accessibilityRole="button"
                disabled={locked}
                onPress={() => setSheet({kind: 'lead'})}
                style={[styles.input, styles.inputRow, !editable && styles.inputDisabled]}>
                <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.inputValue}>
                  {leadHoursLabel(leadHours)}
                </Text>
                <Glyph name="chevron-down" />
              </Pressable>
              <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.help}>
                Meals are prepared this many hours in advance. Min 1 hour, max 168 hours.
              </Text>
            </View>
          </View>

          <View style={styles.card}>
            <View style={styles.scheduleHeader}>
              <View style={styles.tile}>
                <Glyph name="calendar-blank-outline" size={24} color={colors.flameRedAccessible} />
              </View>
              <View style={styles.flex}>
                <Text accessibilityRole="header" allowFontScaling={textDefaults.allowFontScaling} style={styles.cardTitle}>
                  Meal schedule
                </Text>
                <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.help}>
                  Select dishes from your active menu and plan them by day.
                </Text>
              </View>
            </View>

            {period === 'WEEKLY' ? (
              <View accessibilityRole="tablist" style={styles.days}>
                {WEEKDAYS.map((label, index) => (
                  <DayCell
                    key={label}
                    label={label}
                    hasMeals={mealDays.has(index + 1)}
                    selected={day === index + 1}
                    onPress={() => setDay(index + 1)}
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
                style={styles.days}>
                {MONTH_DAYS.map(value => (
                  <DayCell
                    key={value}
                    label={String(value)}
                    accessibilityLabel={`Day ${value}`}
                    hasMeals={mealDays.has(value)}
                    selected={day === value}
                    onPress={() => setDay(value)}
                    style={styles.monthDay}
                  />
                ))}
              </ScrollView>
            )}
            <FieldError message={errors.schedule} />
            <FieldError
              message={scheduleNote && scheduleKept ? 'Add at least one meal to save schedule changes.' : undefined}
            />
            {missingDishDays.length > 0 ? (
              <FieldError
                message={`Select a dish for every meal: ${missingDishDays.map(value => dayName(period, value)).join(', ')}.`}
              />
            ) : null}

            {daySlots.map(slot => (
              <SlotCard
                key={slot.key}
                slot={slot}
                dish={slot.menuItemId ? menuById.get(slot.menuItemId) : undefined}
                dishName={slot.menuItemId ? menuById.get(slot.menuItemId)?.itemName ?? scheduledNames.get(slot.menuItemId) ?? 'Dish' : null}
                dishUnavailable={
                  slot.menuItemId !== null &&
                  menu.status === 'success' &&
                  !availableDishes.some(item => item.id === slot.menuItemId)
                }
                editable={editable}
                locked={locked}
                error={errors[`slot:${slot.key}`]}
                onDelete={() => updateSlots(current => removeSlot(current, slot.key))}
                onDish={() => setSheet({kind: 'dish', key: slot.key})}
                onQuantity={quantity => updateSlots(current => setSlotQuantity(current, slot.key, quantity))}
                onTime={() => setSheet({kind: 'time', slot: slot.slot})}
              />
            ))}

            {editable && freeSlots.length > 0 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Add meal slot for ${dayName(period, day)}`}
                disabled={locked}
                onPress={() => setSheet({kind: 'add'})}
                style={({pressed}) => [styles.addSlot, pressed && styles.pressed]}>
                <Glyph name="plus" size={20} color={colors.flameRedAccessible} />
                <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.addSlotText}>
                  Add meal slot
                </Text>
              </Pressable>
            ) : null}

            <View style={styles.note}>
              <Glyph name="information-outline" size={20} color={colors.flameRedAccessible} />
              <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.noteText}>
                You can only select dishes that are Active and Available on your menu.
              </Text>
            </View>
          </View>
        </ScrollView>

        {editable ? (
          <View style={styles.bar}>
            <View style={styles.barRow}>
              <Button
                disabled={busy !== null}
                label="Save draft"
                loading={busy === 'draft'}
                onPress={() => save('draft')}
                style={styles.draftButton}
                variant="outline"
              />
              <Button
                disabled={busy !== null}
                label="Submit for approval"
                loading={busy === 'submit'}
                onPress={openSubmit}
                style={styles.submitButton}
              />
            </View>
            {serverError || hasErrors ? (
              <Text accessibilityRole="alert" allowFontScaling={textDefaults.allowFontScaling} style={styles.barError}>
                {serverError ?? 'Check the highlighted fields above.'}
              </Text>
            ) : null}
            <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.barFootnote}>
              You can add a note for the admin in the next step.
            </Text>
          </View>
        ) : null}
      </KeyboardAvoidingView>

      {sheet?.kind === 'lead' ? (
        <BottomSheet title="Preparation lead time" onClose={() => setSheet(null)}>
          {LEAD_HOUR_OPTIONS.map(hours => (
            <SheetRow
              key={hours}
              label={leadHoursLabel(hours)}
              selected={hours === leadHours}
              onPress={() => {
                setLeadHours(hours);
                setDirty(true);
                setSheet(null);
              }}
            />
          ))}
        </BottomSheet>
      ) : null}
      {sheet?.kind === 'time' ? (
        <BottomSheet
          title={`${mealSlotLabel(sheet.slot)} time`}
          footnote={`Applies to every ${mealSlotLabel(sheet.slot).toLowerCase()} in this plan`}
          onClose={() => setSheet(null)}>
          {TIME_OPTIONS.map(time => (
            <SheetRow
              key={time}
              label={formatServiceTime(time)}
              selected={slots.find(slot => slot.slot === sheet.slot)?.time === time}
              onPress={() => {
                updateSlots(current => setSlotTime(current, sheet.slot, time));
                setSheet(null);
              }}
            />
          ))}
        </BottomSheet>
      ) : null}
      {sheet?.kind === 'dish' ? (
        <BottomSheet title="Select a dish" onClose={() => setSheet(null)}>
          {availableDishes.length === 0 && menu.status === 'error' ? (
            <RecoverableErrorBanner
              message="Your menu could not be loaded. Check your connection and try again."
              onRetry={() => {
                menu.refresh().catch(() => undefined);
              }}
              style={styles.sheetError}
            />
          ) : availableDishes.length === 0 ? (
            <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.sheetEmpty}>
              {menu.status === 'pending'
                ? 'Loading your menu…'
                : 'No dishes are Active and Available on your menu yet.'}
            </Text>
          ) : (
            availableDishes.map(item => (
              <SheetRow
                key={item.id}
                label={item.itemName}
                leading={<MealPlanPhoto uri={getChefMenuPrimaryImageUrl(item)} size={40} radius={radius.sm} />}
                selected={slots.find(slot => slot.key === sheet.key)?.menuItemId === item.id}
                onPress={() => {
                  updateSlots(current => setSlotDish(current, sheet.key, item.id));
                  setSheet(null);
                }}
              />
            ))
          )}
        </BottomSheet>
      ) : null}
      {sheet?.kind === 'add' ? (
        <BottomSheet title={`Add a meal for ${dayName(period, day)}`} onClose={() => setSheet(null)}>
          {freeSlots.map(code => (
            <SheetRow
              key={code}
              label={mealSlotLabel(code)}
              leading={<Glyph name={SLOT_ICON[code]} color={colors.textSecondary} />}
              onPress={() => {
                updateSlots(current => addSlot(current, day, code));
                setSheet(null);
              }}
            />
          ))}
        </BottomSheet>
      ) : null}
      {submitOpen ? (
        <BottomSheet title="Submit for approval" onClose={() => setSubmitOpen(false)}>
          <View style={styles.submitBody}>
            <Label text="Note for admin" required={false} />
            <TextInput
              accessibilityLabel="Note for admin"
              allowFontScaling={textDefaults.allowFontScaling}
              maxLength={1000}
              multiline
              onChangeText={setNote}
              placeholder="Optional"
              placeholderTextColor={colors.placeholder}
              style={[styles.input, styles.multiline]}
              textAlignVertical="top"
              value={note}
            />
            <Button
              label="Submit"
              onPress={() => {
                setSubmitOpen(false);
                save('submit', note);
              }}
            />
          </View>
        </BottomSheet>
      ) : null}
    </SafeAreaView>
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
  style: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      accessibilityLabel={`${accessibilityLabel ?? label}${hasMeals ? ', has meals' : ''}`}
      accessibilityRole="tab"
      accessibilityState={{selected}}
      onPress={onPress}
      style={[styles.dayCell, style, selected && styles.dayCellSelected]}>
      <Text allowFontScaling={textDefaults.allowFontScaling} style={[styles.dayText, selected && styles.dayTextSelected]}>
        {label}
      </Text>
      <View style={[styles.dayDot, hasMeals && (selected ? styles.dayDotSelected : styles.dayDotFilled)]} />
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
    <View style={styles.slot}>
      <View style={styles.slotHeader}>
        <Glyph
          name={SLOT_ICON[slot.slot]}
          color={slot.slot === 'DINNER' ? colors.flameRedAccessible : colors.warning}
        />
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
          <Glyph name="clock-outline" size={18} color={colors.textPrimary} />
          <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.timeText}>
            {formatServiceTime(slot.time)}
          </Text>
          {editable ? <Glyph name="chevron-down" size={18} color={colors.textPrimary} /> : null}
        </Pressable>
        {editable ? (
          <Pressable
            accessibilityLabel={`Remove ${label.toLowerCase()}`}
            accessibilityRole="button"
            disabled={locked}
            onPress={onDelete}
            style={({pressed}) => [styles.deleteButton, pressed && styles.pressed]}>
            <Glyph name="delete-outline" size={20} color={colors.flameRedAccessible} />
          </Pressable>
        ) : null}
      </View>
      <Pressable
        accessibilityHint="Opens your available dishes"
        accessibilityLabel={`${label} dish, ${dishName ?? 'not selected'}`}
        accessibilityRole="button"
        disabled={locked}
        onPress={onDish}
        style={[styles.input, styles.inputRow, error && styles.inputError]}>
        {dishName ? (
          <MealPlanPhoto uri={dish ? getChefMenuPrimaryImageUrl(dish) : null} size={32} radius={radius.sm} />
        ) : null}
        <Text
          allowFontScaling={textDefaults.allowFontScaling}
          numberOfLines={1}
          style={[styles.inputValue, !dishName && styles.placeholder]}>
          {dishName ?? 'Select a dish'}
        </Text>
        {editable ? <Glyph name="chevron-down" /> : null}
      </Pressable>
      <FieldError message={error ?? (dishUnavailable ? 'This dish is not available on your menu right now.' : undefined)} />
      <View style={styles.quantityRow}>
        <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.help}>
          Quantity per customer
        </Text>
        <View style={styles.stepper}>
          <Pressable
            accessibilityLabel={`Fewer ${label.toLowerCase()} portions`}
            accessibilityRole="button"
            disabled={locked || slot.quantity <= 1}
            onPress={() => onQuantity(slot.quantity - 1)}
            style={({pressed}) => [styles.stepperButton, pressed && styles.pressed]}>
            <Glyph name="minus" size={20} color={editable && slot.quantity > 1 ? colors.textPrimary : colors.borderStrong} />
          </Pressable>
          <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.stepperValue}>
            {slot.quantity}
          </Text>
          <Pressable
            accessibilityLabel={`More ${label.toLowerCase()} portions`}
            accessibilityRole="button"
            disabled={locked || slot.quantity >= 100}
            onPress={() => onQuantity(slot.quantity + 1)}
            style={({pressed}) => [styles.stepperButton, pressed && styles.pressed]}>
            <Glyph name="plus" size={20} color={editable && slot.quantity < 100 ? colors.textPrimary : colors.borderStrong} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function BottomSheet({
  title,
  footnote,
  onClose,
  children,
}: React.PropsWithChildren<{title: string; footnote?: string; onClose: () => void}>) {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotionPreference();
  return (
    <Modal
      animationType={resolveReducedMotionAnimation('slide' as const, reduceMotion)}
      onRequestClose={onClose}
      transparent
      visible>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
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
          <Text accessibilityRole="header" allowFontScaling={textDefaults.allowFontScaling} style={styles.sheetTitle}>
            {title}
          </Text>
          {footnote ? (
            <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.help}>
              {footnote}
            </Text>
          ) : null}
          <ScrollView keyboardShouldPersistTaps="handled" style={styles.sheetList}>
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** With `selected` the row is a radio; without, a plain button. */
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
  safeArea: {flex: 1, backgroundColor: colors.white},
  body: {flex: 1, backgroundColor: colors.surfaceMuted},
  flex: {flex: 1, minWidth: 0},
  fallback: {margin: spacing.md},
  content: {padding: spacing.md, paddingBottom: spacing.xl, gap: spacing.md},
  pressed: {opacity: 0.7},
  card: {
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
    backgroundColor: colors.white,
    ...elevation.card,
  },
  cardTitle: {color: colors.textPrimary, fontSize: typography.button, fontWeight: fontWeight.bold},
  banner: {flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, padding: spacing.sm, borderRadius: radius.md},
  bannerInfo: {backgroundColor: colors.infoSoft},
  bannerInfoText: {color: colors.infoText},
  bannerWarning: {backgroundColor: colors.warningSoft},
  bannerWarningText: {color: colors.warningText},
  bannerTitle: {fontSize: typography.body, fontWeight: fontWeight.bold},
  bannerText: {flex: 1, fontSize: typography.small},
  field: {gap: spacing.xs},
  labelRow: {flexDirection: 'row', alignItems: 'center', gap: spacing.xxs},
  label: {color: colors.textPrimary, fontSize: typography.body, fontWeight: fontWeight.semibold},
  required: {color: colors.flameRedAccessible},
  help: {color: colors.textSecondary, fontSize: typography.small},
  errorText: {color: colors.flameRedAccessible, fontSize: typography.small},
  input: {
    minHeight: touchTarget.comfortable,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderWidth: borderWidth.standard,
    borderColor: colors.borderStrong,
    backgroundColor: colors.white,
    color: colors.textPrimary,
    fontSize: typography.body,
  },
  inputRow: {flexDirection: 'row', alignItems: 'center', gap: spacing.xs},
  inputError: {borderColor: colors.flameRed},
  inputDisabled: {backgroundColor: colors.surfaceMuted},
  inputValue: {flex: 1, minWidth: 0, color: colors.textPrimary, fontSize: typography.body},
  inlineInput: {flex: 1, minWidth: 0, minHeight: touchTarget.minimum, padding: 0, color: colors.textPrimary, fontSize: typography.body},
  placeholder: {color: colors.placeholder},
  rupee: {color: colors.textPrimary, fontSize: typography.button},
  multiline: {minHeight: 104, paddingTop: spacing.sm, paddingBottom: spacing.xl},
  counter: {position: 'absolute', right: spacing.sm, bottom: spacing.xs, color: colors.textSecondary, fontSize: typography.tiny},
  upload: {
    minHeight: 112,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xxs,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: borderWidth.focus,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceMuted,
  },
  uploadTitle: {color: colors.flameRedAccessible, fontSize: typography.body, fontWeight: fontWeight.bold},
  photo: {width: '100%', aspectRatio: 4 / 3, borderRadius: radius.md, backgroundColor: colors.surfaceMuted},
  scheduleHeader: {flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm},
  tile: {
    width: touchTarget.minimum,
    height: touchTarget.minimum,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.errorSoft,
  },
  days: {
    flexDirection: 'row',
    gap: spacing.xxs,
    padding: spacing.xxs,
    borderRadius: radius.lg,
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
    flexGrow: 0,
  },
  monthDays: {gap: spacing.xxs},
  dayCell: {
    minHeight: touchTarget.minimum,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    borderRadius: radius.md,
  },
  weekDay: {flex: 1},
  monthDay: {width: touchTarget.minimum},
  dayCellSelected: {backgroundColor: colors.flameRedAccessible},
  dayText: {color: colors.textPrimary, fontSize: typography.small, fontWeight: fontWeight.semibold},
  dayTextSelected: {color: colors.white},
  dayDot: {width: 5, height: 5, borderRadius: radius.pill},
  dayDotFilled: {backgroundColor: colors.flameRedAccessible},
  dayDotSelected: {backgroundColor: colors.white},
  slot: {
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
  },
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
  deleteButton: {
    width: touchTarget.minimum,
    height: touchTarget.minimum,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.errorSoft,
  },
  quantityRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm},
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: borderWidth.standard,
    borderColor: colors.borderStrong,
  },
  stepperButton: {width: touchTarget.minimum, height: touchTarget.minimum, alignItems: 'center', justifyContent: 'center'},
  stepperValue: {minWidth: 32, color: colors.textPrimary, fontSize: typography.body, fontWeight: fontWeight.bold, textAlign: 'center'},
  addSlot: {
    minHeight: touchTarget.minimum,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderRadius: radius.md,
    borderWidth: borderWidth.standard,
    borderStyle: 'dashed',
    borderColor: colors.flameRed,
    backgroundColor: colors.white,
  },
  addSlotText: {color: colors.flameRedAccessible, fontSize: typography.button, fontWeight: fontWeight.semibold},
  note: {flexDirection: 'row', gap: spacing.sm, padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.errorSoft},
  noteText: {flex: 1, color: colors.flameRedAccessible, fontSize: typography.small},
  bar: {
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    borderTopWidth: borderWidth.standard,
    borderTopColor: colors.border,
    backgroundColor: colors.white,
  },
  barRow: {flexDirection: 'row', gap: spacing.sm},
  draftButton: {flex: 1, paddingHorizontal: spacing.sm},
  submitButton: {flex: 1.4, paddingHorizontal: spacing.sm},
  barError: {color: colors.flameRedAccessible, fontSize: typography.small, textAlign: 'center'},
  barFootnote: {color: colors.textSecondary, fontSize: typography.small, textAlign: 'center'},
  backdrop: {flex: 1, justifyContent: 'flex-end', backgroundColor: colors.overlay},
  sheet: {
    maxHeight: '80%',
    gap: spacing.xs,
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
    borderRadius: radius.pill,
    backgroundColor: colors.borderStrong,
  },
  sheetTitle: {color: colors.textPrimary, fontSize: typography.heading, fontWeight: fontWeight.bold},
  sheetList: {flexGrow: 0},
  sheetRow: {minHeight: touchTarget.minimum, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xxs},
  sheetRowText: {flex: 1, color: colors.textPrimary, fontSize: typography.body},
  sheetEmpty: {paddingVertical: spacing.md, color: colors.textSecondary, fontSize: typography.body},
  sheetError: {marginVertical: spacing.sm},
  submitBody: {gap: spacing.sm, paddingTop: spacing.xs},
});
