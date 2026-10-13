import React from 'react';
import {Pressable, StyleSheet, Switch, Text, TextInput, View} from 'react-native';
import MaterialDesignIcons from '@react-native-vector-icons/material-design-icons';
import {useNavigation, useRoute, type RouteProp} from '@react-navigation/native';
import {useQueryClient} from '@tanstack/react-query';
import type {ChefProductStackParamList} from '../../../app/navigation/types';
import {isRouteNotPublished} from '../../../core/http/routeAvailability';
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
import {SkeletonBlock} from '../../../shared/components/Skeleton';
import {OptionChip} from '../../chefMenu/components/DishFormField';
import {getChefMenuDisplayState} from '../../chefMenu/domain/chefMenuPresentation';
import {useChefMenuModel} from '../../chefMenu/state/useChefMenuModel';
import {
  ChefActionButton,
  ChefCard,
  ChefScreen,
  ChefSheet,
  ChefTopBar,
  ComingSoon,
  ListGroup,
  ListRow,
  useChefToast,
} from '../../chefShell/components/ui';
import {formatDayLabel} from '../../chefShell/domain/chefFormat';
import {mealSlotLabel} from '../../mealPlans/domain/mealPlanSchedule';
import {chefSubscriptionApi, type ChefMealSchedule} from '../api/chefSubscriptionApi';
import {ChefDatePicker} from '../components/ChefDatePicker';
import {
  capacityBar,
  capacityCaption,
  clampPlates,
  dateChangeLines,
  dishLimits,
  dishLimitSummary,
  firstServedSlot,
  limitDays,
  limitHeading,
  setSubscriberPlates,
  setTotalPlates,
  slotLimits,
} from '../domain/chefDailyLimits';
import {MEAL_SLOTS, type MealSlot} from '../domain/mealPlanEditor';
import {
  invalidateChefMealPlans,
  useChefCapacityQuery,
  useChefMealPlanSchedulesState,
  useChefMealPlansQuery,
} from '../query/chefMealPlanQueries';

type PlateValues = {total: number; subscriber: number; salesEnabled: boolean};
type Sheet = 'dish' | 'date' | null;

const REASON = 'Updated by Chef in Craves mobile';
const DEFAULT_DISH_MAX = 10;
const BAR_HEIGHT = 10; // no token for a 10 dp bar
const SAVE_PROBLEM = "We couldn't save your limits. Try again.";
const DIFFERENT_DAYS = 'Your days have different limits now. Saving sets them all to these numbers.';
const REPLACES_CHANGE = 'This date already has a change. Saving replaces it.';

const isoOf = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

function PlateStepper({name, value, onChange}: {name: string; value: number; onChange: (value: number) => void}) {
  const lower = name.toLowerCase();
  return (
    <View style={styles.stepper}>
      <Pressable
        accessibilityLabel={`Fewer ${lower}`}
        accessibilityRole="button"
        disabled={value <= 0}
        onPress={() => onChange(value - 1)}
        style={styles.stepperButton}>
        <MaterialDesignIcons
          accessibilityElementsHidden
          color={value > 0 ? colors.textSecondary : colors.borderStrong}
          name="minus-circle-outline"
          size={iconSize.lg}
        />
      </Pressable>
      <TextInput
        accessibilityLabel={name}
        allowFontScaling={textDefaults.allowFontScaling}
        keyboardType="number-pad"
        maxLength={6}
        onChangeText={text => onChange(Number(text.replace(/\D/g, '')) || 0)}
        selectTextOnFocus
        style={styles.stepperValue}
        value={String(value)}
      />
      <Pressable accessibilityLabel={`More ${lower}`} accessibilityRole="button" onPress={() => onChange(value + 1)} style={styles.stepperButton}>
        <MaterialDesignIcons accessibilityElementsHidden color={colors.flameRedAccessible} name="plus-circle" size={iconSize.lg} />
      </Pressable>
    </View>
  );
}

function SwitchRow({title, hint, value, onChange}: {title: string; hint?: string; value: boolean; onChange: (value: boolean) => void}) {
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.rowTitle}>
          {title}
        </Text>
        {hint ? (
          <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.hint}>
            {hint}
          </Text>
        ) : null}
      </View>
      <Switch
        accessibilityLabel={title}
        onValueChange={onChange}
        thumbColor={colors.white}
        trackColor={{false: colors.borderStrong, true: colors.success}}
        value={value}
      />
    </View>
  );
}

function Problem({text}: {text: string | null}) {
  return text ? (
    <Text accessibilityLiveRegion="assertive" accessibilityRole="alert" allowFontScaling={textDefaults.allowFontScaling} style={styles.problem}>
      {text}
    </Text>
  ) : null;
}

/** How many plates a meal can take, how many are kept for subscribers, and the one-day changes. Opened from a plan card or from Profile. */
export function ChefDailyLimitsScreen() {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<ChefProductStackParamList, 'ChefDailyLimits'>>();
  const queryClient = useQueryClient();
  const toast = useChefToast();
  const planId = route.params?.planId;
  const plans = useChefMealPlansQuery();
  const planIds = planId ? [planId] : (plans.data ?? []).map(plan => plan.id);
  const schedulesState = useChefMealPlanSchedulesState(planIds);
  const capacity = useChefCapacityQuery();
  const menu = useChefMenuModel();

  const [slotChoice, setSlotChoice] = React.useState<MealSlot | null>(null);
  const [edits, setEdits] = React.useState<Partial<Record<MealSlot, PlateValues>>>({});
  // Meals whose numbers were changed and not saved yet, in the order they were changed. Save writes all of them.
  const [unsaved, setUnsaved] = React.useState<MealSlot[]>([]);
  const [sheet, setSheet] = React.useState<Sheet>(null);
  const [busy, setBusy] = React.useState(false);
  const [unpublished, setUnpublished] = React.useState(false);
  const [mainProblem, setMainProblem] = React.useState<string | null>(null);
  const [sheetProblem, setSheetProblem] = React.useState<string | null>(null);
  const saving = React.useRef(false);

  // One dish's daily limit.
  const [dishId, setDishId] = React.useState<string | null>(null);
  const [dishMax, setDishMax] = React.useState(DEFAULT_DISH_MAX);
  const [dishOn, setDishOn] = React.useState(true);
  // One date.
  const [date, setDate] = React.useState<string | null>(null);
  const [dateKind, setDateKind] = React.useState<'meal' | 'dish'>('meal');
  const [dateValues, setDateValues] = React.useState<PlateValues>({total: 0, subscriber: 0, salesEnabled: true});
  const [dateClosed, setDateClosed] = React.useState(false);
  const [dateDishId, setDateDishId] = React.useState<string | null>(null);
  const [dateDishMax, setDateDishMax] = React.useState(DEFAULT_DISH_MAX);
  const [dateDishClosed, setDateDishClosed] = React.useState(false);

  // A plan whose schedule is still loading, or failed, never gets this far: the screen waits or offers a retry first.
  const schedules = planIds.flatMap(id => schedulesState.byId[id] ?? []) as ChefMealSchedule[];
  const slot = slotChoice ?? firstServedSlot(schedules);
  const daysFor = (code: MealSlot) => limitDays(schedules, code);
  const days = daysFor(slot);
  const data = capacity.data;
  const rules = data?.slotRules ?? [];
  const server = slotLimits(rules, slot, days);
  const valuesFor = (code: MealSlot): PlateValues => {
    const saved = slotLimits(rules, code, daysFor(code));
    return edits[code] ?? {total: saved.total, subscriber: saved.subscriber, salesEnabled: saved.salesEnabled};
  };
  const values = valuesFor(slot);
  const frozen = data?.adminSalesFrozen === true;
  const now = new Date();
  const today = isoOf(now);

  const dishes = menu.items.filter(item => getChefMenuDisplayState(item) === 'AVAILABLE');
  const dishName = (id: string) => menu.items.find(item => item.id === id)?.itemName ?? 'Dish';
  const dishLimitsFor = (id: string | null) => (id && data ? dishLimits(data.menuItemRules, id, slot, days) : null);
  const firstDish = () => dishes.find(item => dishLimitsFor(item.id))?.id ?? dishes[0]?.id ?? null;
  const slotChange = (iso: string) => data?.dateOverrides.find(change => change.serviceDate === iso && change.mealSlotCode === slot);
  const dishChange = (iso: string, id: string | null) =>
    id ? data?.menuItemDateOverrides.find(change => change.serviceDate === iso && change.mealSlotCode === slot && change.menuItemId === id) : undefined;

  const bar = capacityBar(values, server.booked);
  const changes = data
    ? dateChangeLines(data.dateOverrides, data.menuItemDateOverrides, slot, now, dishName)
    : [];

  /** Runs one save: ignores a second tap, says "coming soon" when the server has no such route, otherwise a plain problem. */
  const run = async (job: () => Promise<unknown>, done: string, onProblem: (text: string | null) => void) => {
    if (saving.current) return false;
    saving.current = true;
    setBusy(true);
    onProblem(null);
    try {
      await job();
      invalidateChefMealPlans(queryClient).catch(() => undefined);
      toast.show(done);
      return true;
    } catch (error) {
      if (isRouteNotPublished(error)) {
        // Close any sheet so the "coming soon" card behind it is what the chef sees.
        setUnpublished(true);
        setSheet(null);
      } else {
        onProblem(SAVE_PROBLEM);
      }
      return false;
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };

  const saveLimits = () =>
    run(
      async () => {
        const meals = unsaved.includes(slot) ? unsaved : [...unsaved, slot];
        for (const code of meals) {
          const {total, subscriber, salesEnabled} = valuesFor(code);
          for (const day of daysFor(code)) {
            await chefSubscriptionApi.putSlotRule({
              isoDayOfWeek: day,
              mealSlotCode: code,
              totalCapacityUnits: total,
              subscriptionCapacityUnits: subscriber,
              salesEnabled,
              reason: REASON,
            });
          }
          // A saved meal is not sent again; a meal that fails stays here for the next try.
          setUnsaved(current => current.filter(meal => meal !== code));
        }
      },
      'Limits saved',
      setMainProblem,
    );

  const openDishSheet = () => {
    const id = firstDish();
    pickDish(id);
    setSheetProblem(null);
    setSheet('dish');
  };
  const pickDish = (id: string | null) => {
    const limits = dishLimitsFor(id);
    setDishId(id);
    setDishMax(limits?.max ?? DEFAULT_DISH_MAX);
    setDishOn(limits?.salesEnabled ?? true);
  };
  const saveDish = async () => {
    const id = dishId;
    if (!id) return;
    const saved = await run(
      async () => {
        for (const day of days) {
          await chefSubscriptionApi.putMenuItemRule({
            menuItemId: id,
            isoDayOfWeek: day,
            mealSlotCode: slot,
            maxSubscriptionUnits: dishMax,
            salesEnabled: dishOn,
            reason: REASON,
          });
        }
      },
      'Dish limit saved',
      setSheetProblem,
    );
    if (saved) setSheet(null);
  };

  const openDateSheet = () => {
    setDate(null);
    setDateKind('meal');
    setDateValues(values);
    setDateClosed(false);
    pickDateDish(firstDish(), null);
    setSheetProblem(null);
    setSheet('date');
  };
  /** A date that already has a change starts from it; any other date starts from the weekly numbers. */
  const chooseDate = (iso: string) => {
    const change = slotChange(iso);
    setDate(iso);
    setDateValues(change ? {total: change.totalCapacityUnits, subscriber: change.subscriptionCapacityUnits, salesEnabled: true} : values);
    setDateClosed(change?.closed ?? false);
    pickDateDish(dateDishId, iso);
  };
  const pickDateDish = (id: string | null, iso: string | null = date) => {
    const change = iso ? dishChange(iso, id) : undefined;
    setDateDishId(id);
    setDateDishMax(change?.maxSubscriptionUnits ?? dishLimitsFor(id)?.max ?? DEFAULT_DISH_MAX);
    setDateDishClosed(change?.closed ?? false);
  };
  const saveDate = async () => {
    if (!date || (dateKind === 'dish' && !dateDishId)) return;
    const saved = await run(
      () =>
        dateKind === 'meal'
          ? chefSubscriptionApi.putDateOverride({
              serviceDate: date,
              mealSlotCode: slot,
              totalCapacityUnits: dateValues.total,
              subscriptionCapacityUnits: dateValues.subscriber,
              closed: dateClosed,
              reason: 'Date override updated by Chef in Craves mobile',
            })
          : chefSubscriptionApi.putMenuItemDateOverride({
              menuItemId: dateDishId as string, // guarded above
              serviceDate: date,
              mealSlotCode: slot,
              maxSubscriptionUnits: dateDishMax,
              closed: dateDishClosed,
              reason: 'Dish date override updated by Chef in Craves mobile',
            }),
      'Date saved',
      setSheetProblem,
    );
    if (saved) setSheet(null);
  };

  const plansPending = !planId && plans.isLoading;
  const plansFailed = !planId && plans.isError && !plans.data;

  let body: React.ReactNode;
  if (unpublished || (capacity.error && isRouteNotPublished(capacity.error))) {
    body = (
      <ComingSoon
        message="You'll be able to set how many plates you cook each day in a coming update."
        title="Daily limits are on their way"
      />
    );
  } else if (capacity.isLoading || plansPending || schedulesState.isLoading) {
    body = (
      <>
        <SkeletonBlock borderRadius={radius.pill} height={40} width="70%" />
        <SkeletonBlock borderRadius={radius.md} height={260} width="100%" />
        <SkeletonBlock borderRadius={radius.md} height={116} width="100%" />
      </>
    );
  } else if (!data || plansFailed || schedulesState.failed) {
    body = (
      <ChefCard>
        <View style={styles.center}>
          <Text accessibilityRole="header" allowFontScaling={textDefaults.allowFontScaling} style={styles.centerTitle}>
            Couldn't load your daily limits
          </Text>
          <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.centerText}>
            Check your connection and try again.
          </Text>
          <ChefActionButton
            label="Try again"
            onPress={() => {
              capacity.refetch();
              if (plansFailed) plans.refetch();
              schedulesState.refetch();
            }}
          />
        </View>
      </ChefCard>
    );
  } else {
    const setValues = (next: PlateValues) => {
      setEdits(current => ({...current, [slot]: next}));
      setUnsaved(current => (current.includes(slot) ? current : [...current, slot]));
    };
    body = (
      <>
        {frozen ? (
          <View accessibilityRole="alert" style={styles.banner}>
            <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.bannerText}>
              {`Craves has paused new subscriptions for now.${data.freezeReason ? ` ${data.freezeReason}` : ''}`}
            </Text>
          </View>
        ) : null}
        <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.hint}>
          These limits cover your whole kitchen, across all your meal plans.
        </Text>
        <View accessibilityRole="radiogroup" style={styles.chips}>
          {MEAL_SLOTS.map(code => (
            <OptionChip key={code} label={mealSlotLabel(code)} onPress={() => setSlotChoice(code)} selected={code === slot} />
          ))}
        </View>
        <ChefCard>
          <Text accessibilityRole="header" allowFontScaling={textDefaults.allowFontScaling} style={styles.cardTitle}>
            {limitHeading(slot, days)}
          </Text>
          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.rowTitle}>
                Total plates
              </Text>
              <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.hint}>
                All orders together
              </Text>
            </View>
            <PlateStepper name="Total plates" onChange={total => setValues(setTotalPlates(values, total))} value={values.total} />
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.rowTitle}>
                Kept for subscribers
              </Text>
              <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.hint}>
                The rest are for normal orders
              </Text>
            </View>
            <PlateStepper name="Kept for subscribers" onChange={subscriber => setValues(setSubscriberPlates(values, subscriber))} value={values.subscriber} />
          </View>
          <View style={styles.divider} />
          <SwitchRow
            onChange={salesEnabled => setValues({...values, salesEnabled})}
            title="New subscribers can join"
            value={values.salesEnabled}
          />
          <View style={styles.bar}>
            <View style={[styles.barPart, styles.barBooked, {flex: bar.booked}]} />
            <View style={[styles.barPart, styles.barFree, {flex: bar.free}]} />
            <View style={[styles.barPart, styles.barNormal, {flex: bar.normal}]} />
          </View>
          <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.hint}>
            {capacityCaption(bar)}
          </Text>
          {server.mixed ? (
            <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.problem}>
              {DIFFERENT_DAYS}
            </Text>
          ) : null}
          {server.deficit > 0 ? (
            <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.problem}>
              Subscribers have booked more plates than this limit. Raise it so every subscriber is served.
            </Text>
          ) : null}
        </ChefCard>
        <ListGroup>
          <ListRow
            icon="meal"
            onPress={openDishSheet}
            subtitle={dishLimitSummary(data.menuItemRules, slot, days, dishName)}
            title="Limits per dish"
          />
          <ListRow icon="calendar" onPress={openDateSheet} subtitle="Festival, holiday or fewer plates" title="Change a single date" />
        </ListGroup>
        <ChefActionButton busy={busy && sheet === null} disabled={frozen || busy} label="Save" onPress={() => saveLimits()} />
        <Problem text={mainProblem} />
      </>
    );
  }

  const dateText = date
    ? (() => {
        const [year, month, day] = date.split('-').map(Number);
        return `Changing ${formatDayLabel(new Date(year, month - 1, day), now, {weekday: true})}`;
      })()
    : 'Pick the day you want to change.';
  const slotName = mealSlotLabel(slot).toLowerCase();

  return (
    <ChefScreen
      header={
        <ChefTopBar onBack={() => navigation.goBack()} showBell={false} subtitle="How many plates you can cook" title="Daily limits" />
      }
      // From Profile the screen sits above the tab bar's slot; from a plan card it covers it.
      withTabBar={(route.name as string) === 'ChefSubscriptionPlan'}>
      {body}

      <ChefSheet onClose={() => setSheet(null)} title="Limits per dish" visible={sheet === 'dish'}>
        <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.hint}>
          {`For ${slotName}. Subscribers can't order more of a dish than this each day.`}
        </Text>
        {dishes.length === 0 ? (
          <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.centerText}>
            Turn on a dish on your menu first.
          </Text>
        ) : (
          <>
            <View accessibilityRole="radiogroup" style={styles.chips}>
              {dishes.map(item => (
                <OptionChip key={item.id} label={item.itemName} onPress={() => pickDish(item.id)} selected={item.id === dishId} />
              ))}
            </View>
            <View style={styles.row}>
              <Text allowFontScaling={textDefaults.allowFontScaling} style={[styles.rowTitle, styles.rowText]}>
                Most plates a day
              </Text>
              <PlateStepper name="Plates of this dish" onChange={max => setDishMax(clampPlates(max))} value={dishMax} />
            </View>
            <SwitchRow onChange={setDishOn} title="Subscribers can order this dish" value={dishOn} />
            {dishLimitsFor(dishId)?.mixed ? (
              <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.problem}>
                Your days have different limits for this dish now. Saving sets them all to these numbers.
              </Text>
            ) : null}
            <ChefActionButton busy={busy} disabled={frozen || busy} label="Save dish limit" onPress={() => saveDish()} />
            <Problem text={sheetProblem} />
          </>
        )}
      </ChefSheet>

      <ChefSheet onClose={() => setSheet(null)} title="Change a single date" visible={sheet === 'date'}>
        <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.hint}>
          {`For ${slotName}.`}
        </Text>
        <ChefDatePicker min={today} onChange={chooseDate} value={date} />
        <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.rowTitle}>
          {dateText}
        </Text>
        {date && (dateKind === 'meal' ? slotChange(date) : dishChange(date, dateDishId)) ? (
          <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.problem}>
            {REPLACES_CHANGE}
          </Text>
        ) : null}
        <View accessibilityRole="radiogroup" style={styles.chips}>
          <OptionChip label="Whole meal" onPress={() => setDateKind('meal')} selected={dateKind === 'meal'} />
          <OptionChip disabled={dishes.length === 0} label="One dish" onPress={() => setDateKind('dish')} selected={dateKind === 'dish'} />
        </View>
        {dateKind === 'meal' ? (
          <>
            <View style={styles.row}>
              <Text allowFontScaling={textDefaults.allowFontScaling} style={[styles.rowTitle, styles.rowText]}>
                Total plates
              </Text>
              <PlateStepper name="Total plates that day" onChange={total => setDateValues(setTotalPlates(dateValues, total))} value={dateValues.total} />
            </View>
            <View style={styles.row}>
              <Text allowFontScaling={textDefaults.allowFontScaling} style={[styles.rowTitle, styles.rowText]}>
                Kept for subscribers
              </Text>
              <PlateStepper
                name="Kept for subscribers that day"
                onChange={subscriber => setDateValues(setSubscriberPlates(dateValues, subscriber))}
                value={dateValues.subscriber}
              />
            </View>
            <SwitchRow
              hint="Your other meals are not changed."
              onChange={setDateClosed}
              title={`Close ${slotName} on this day`}
              value={dateClosed}
            />
          </>
        ) : (
          <>
            <View accessibilityRole="radiogroup" style={styles.chips}>
              {dishes.map(item => (
                <OptionChip key={item.id} label={item.itemName} onPress={() => pickDateDish(item.id)} selected={item.id === dateDishId} />
              ))}
            </View>
            <View style={styles.row}>
              <Text allowFontScaling={textDefaults.allowFontScaling} style={[styles.rowTitle, styles.rowText]}>
                Most plates
              </Text>
              <PlateStepper name="Plates of this dish that day" onChange={max => setDateDishMax(clampPlates(max))} value={dateDishMax} />
            </View>
            <SwitchRow hint="It stays on your menu." onChange={setDateDishClosed} title="Close this dish on this day" value={dateDishClosed} />
          </>
        )}
        <ChefActionButton
          busy={busy}
          disabled={!date || (dateKind === 'dish' && !dateDishId) || frozen || busy}
          label="Save date"
          onPress={() => saveDate()}
        />
        <Problem text={sheetProblem} />
        {changes.length > 0 ? (
          <View style={styles.changes}>
            <Text accessibilityRole="header" allowFontScaling={textDefaults.allowFontScaling} style={styles.rowTitle}>
              Dates you've changed
            </Text>
            {changes.map(line => (
              <Text allowFontScaling={textDefaults.allowFontScaling} key={line} style={styles.hint}>
                {line}
              </Text>
            ))}
          </View>
        ) : null}
      </ChefSheet>
    </ChefScreen>
  );
}

const styles = StyleSheet.create({
  chips: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs},
  cardTitle: {color: colors.textPrimary, fontSize: typography.button, fontWeight: fontWeight.bold, marginBottom: spacing.xs},
  row: {minHeight: touchTarget.minimum, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm},
  rowText: {flex: 1, minWidth: 0},
  rowTitle: {color: colors.textPrimary, fontSize: typography.body, fontWeight: fontWeight.semibold},
  hint: {color: colors.textSecondary, fontSize: typography.small},
  divider: {height: borderWidth.standard, marginVertical: spacing.xs, backgroundColor: colors.border},
  stepper: {flexDirection: 'row', alignItems: 'center'},
  stepperButton: {width: touchTarget.minimum, height: touchTarget.minimum, alignItems: 'center', justifyContent: 'center'},
  stepperValue: {minWidth: touchTarget.minimum, paddingVertical: 0, color: colors.textPrimary, fontSize: typography.button, fontWeight: fontWeight.bold, textAlign: 'center'},
  bar: {flexDirection: 'row', height: BAR_HEIGHT, gap: borderWidth.strong, marginTop: spacing.sm, marginBottom: spacing.xs, borderRadius: radius.pill, overflow: 'hidden'},
  barPart: {height: BAR_HEIGHT},
  barBooked: {backgroundColor: colors.flameRed},
  barFree: {backgroundColor: colors.flameRed, opacity: 0.3},
  barNormal: {backgroundColor: colors.border},
  banner: {padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.warningSoft},
  bannerText: {color: colors.warningText, fontSize: typography.small},
  problem: {color: colors.flameRedAccessible, fontSize: typography.small, fontWeight: fontWeight.semibold},
  center: {alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.md},
  centerTitle: {color: colors.textPrimary, fontSize: typography.heading, fontWeight: fontWeight.bold, textAlign: 'center'},
  centerText: {color: colors.textSecondary, fontSize: typography.body, textAlign: 'center'},
  changes: {gap: spacing.xxs, paddingTop: spacing.xs},
});
