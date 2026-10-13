import React from 'react';
import {Image, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, View} from 'react-native';
import {
  useNavigation,
  type CompositeNavigationProp,
} from '@react-navigation/native';
import type {BottomTabNavigationProp} from '@react-navigation/bottom-tabs';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {useQueryClient} from '@tanstack/react-query';
import type {
  ChefProductStackParamList,
  ChefTabParamList,
} from '../../../app/navigation/types';
import {toAppApiError} from '../../../core/http/apiError';
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
import {Icon, type IconName} from '../../../shared/components/Icon';
import {SkeletonBlock} from '../../../shared/components/Skeleton';
import {getChefMenuPrimaryImageUrl} from '../../chefMenu/domain/chefMenuPresentation';
import {useChefMenuModel} from '../../chefMenu/state/useChefMenuModel';
import {ChefActionButton, ChefCard, ChefTopBar, ChipTap, StatusChip, chipTapOverlap} from '../../chefShell/components/ui';
import {summarizeSchedule, type ScheduleItemLike} from '../../mealPlans/domain/mealPlanSchedule';
import {resolveApiImageUrl} from '../../mealPlans/domain/resolveApiImageUrl';
import type {ChefMealPlan} from '../api/chefSubscriptionApi';
import {
  acceptingSubscribersLabel,
  acceptingSubscribersValue,
  chefPlanAccessibilityLabel,
  chefPlanMetaLine,
  chefPlanMetrics,
  chefPlanPriceLabel,
  chefPlanStatusPresentation,
  filterChefPlans,
  subscriberCountLabel,
  type ChefPlanFilter,
} from '../domain/chefMealPlanPresentation';
import {
  invalidateChefMealPlans,
  useChefMealPlanSchedulesQuery,
  useChefMealPlansQuery,
  useSetAcceptingSubscribers,
} from '../query/chefMealPlanQueries';

type ChefMealPlansNavigation = CompositeNavigationProp<
  BottomTabNavigationProp<ChefTabParamList, 'Menu'>,
  NativeStackNavigationProp<ChefProductStackParamList>
>;

const PHOTO = spacing.xxxl + spacing.xxl; // the board's 72 dp photo
const PILL_HEIGHT = 34;

function PlanNote({tone, icon, text}: {tone: 'info' | 'warn'; icon: IconName; text: string}) {
  const color = tone === 'warn' ? colors.warningText : colors.infoText;
  return (
    <View style={[styles.note, {backgroundColor: tone === 'warn' ? colors.warningSoft : colors.infoSoft}]}>
      <Icon color={color} name={icon} size={iconSize.sm} surface={false} />
      <Text allowFontScaling={textDefaults.allowFontScaling} style={[styles.noteText, {color}]}>
        {text}
      </Text>
    </View>
  );
}

function CardLink({icon, label, onPress}: {icon: IconName; label: string; onPress: () => void}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={({pressed}) => [styles.link, pressed && styles.pressed]}>
      <Icon color={colors.textPrimary} name={icon} size={iconSize.sm} surface={false} />
      <Text allowFontScaling={textDefaults.allowFontScaling} numberOfLines={1} style={styles.linkText}>
        {label}
      </Text>
    </Pressable>
  );
}

function PlanCard({
  plan,
  items,
  photoUrl,
  onOpen,
  onSchedule,
  onLimits,
}: {
  plan: ChefMealPlan;
  items: readonly ScheduleItemLike[] | undefined;
  photoUrl: string | null;
  onOpen: () => void;
  onSchedule: () => void;
  onLimits: () => void;
}) {
  const status = chefPlanStatusPresentation(plan.status);
  const accepting = acceptingSubscribersValue(plan);
  const setAccepting = useSetAcceptingSubscribers();
  // The position the chef just chose, shown until the server answers (success replaces the plan, failure reverts).
  const [chosen, setChosen] = React.useState<boolean | null>(null);
  const [toggleError, setToggleError] = React.useState<string | null>(null);

  const toggle = (next: boolean) => {
    setChosen(next);
    setToggleError(null);
    setAccepting(plan.id, next)
      .catch(error => setToggleError(toAppApiError(error).message))
      .finally(() => setChosen(null));
  };

  const shown = chosen ?? accepting;
  const count = subscriberCountLabel(plan);

  return (
    <ChefCard style={styles.card}>
      <Pressable
        accessibilityLabel={chefPlanAccessibilityLabel(plan)}
        accessibilityRole="button"
        onPress={onOpen}
        style={({pressed}) => [styles.open, pressed && styles.pressed]}>
        {photoUrl ? (
          <Image accessibilityIgnoresInvertColors resizeMode="cover" source={{uri: photoUrl}} style={styles.photo} />
        ) : (
          <View style={[styles.photo, styles.noPhoto]}>
            <Icon color={colors.borderStrong} name="meal" size={iconSize.xl} surface={false} />
          </View>
        )}
        <View style={styles.copy}>
          <View style={styles.titleLine}>
            <Text allowFontScaling={textDefaults.allowFontScaling} numberOfLines={2} style={styles.name}>
              {plan.name}
            </Text>
            <StatusChip label={status.label} tone={status.tone} />
          </View>
          <Text allowFontScaling={textDefaults.allowFontScaling} numberOfLines={1} style={styles.meta}>
            {chefPlanMetaLine(plan, items)}
          </Text>
          <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.price}>
            {chefPlanPriceLabel(plan)}
          </Text>
        </View>
      </Pressable>

      {plan.status === 'PENDING_APPROVAL' ? (
        <PlanNote icon="clock" text="Craves is checking this plan. You can't edit it until then." tone="info" />
      ) : null}
      {plan.status === 'REJECTED' ? (
        <PlanNote
          icon="alert"
          text={
            plan.reviewReason
              ? `Craves asked for changes: ${plan.reviewReason}`
              : 'Craves asked for changes. Update the plan and submit it again.'
          }
          tone="warn"
        />
      ) : null}

      {shown !== null ? (
        <View style={styles.acceptRow}>
          <View style={styles.acceptCopy}>
            {count ? (
              <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.count}>
                {count}
              </Text>
            ) : null}
            <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.acceptLabel}>
              {acceptingSubscribersLabel(shown)}
            </Text>
            {shown ? null : (
              <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.acceptHint}>
                Current subscribers keep getting meals.
              </Text>
            )}
          </View>
          <Switch
            accessibilityLabel={`${plan.name} taking new subscribers`}
            accessibilityState={{busy: chosen !== null, checked: shown}}
            disabled={chosen !== null}
            onValueChange={toggle}
            thumbColor={colors.white}
            trackColor={{false: colors.borderStrong, true: colors.success}}
            value={shown}
          />
        </View>
      ) : null}
      {/* Outside the switch row: a 409 can flip the plan out of Live, which hides the row but must keep the message. */}
      {toggleError ? (
        <Text accessibilityLiveRegion="polite" style={styles.toggleError}>
          {toggleError}
        </Text>
      ) : null}

      {plan.status === 'ACTIVE' ? (
        <View style={styles.links}>
          <CardLink icon="calendar" label="Schedule" onPress={onSchedule} />
          <CardLink icon="filter" label="Daily limits" onPress={onLimits} />
        </View>
      ) : null}
    </ChefCard>
  );
}

function CenterMessage({
  icon,
  title,
  message,
  action,
}: {
  icon: IconName;
  title: string;
  message: string;
  action: {label: string; onPress: () => void};
}) {
  return (
    <ChefCard>
      <View style={styles.center}>
        <Icon color={colors.textSecondary} name={icon} size={iconSize.xxl} surface={false} />
        <Text accessibilityRole="header" allowFontScaling={textDefaults.allowFontScaling} style={styles.centerTitle}>
          {title}
        </Text>
        <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.centerMessage}>
          {message}
        </Text>
        <ChefActionButton label={action.label} onPress={action.onPress} />
      </View>
    </ChefCard>
  );
}

/**
 * The Meal plans side of the Menu tab. `hideHeader`: the Menu tab already draws the header, the
 * Dishes / Meal plans toggle and the "+ New plan" button above this list.
 */
export function ChefMealPlansScreen({hideHeader = false}: {hideHeader?: boolean}) {
  const navigation = useNavigation<ChefMealPlansNavigation>();
  const queryClient = useQueryClient();
  const plansQuery = useChefMealPlansQuery();
  const menu = useChefMenuModel();
  const plans = React.useMemo(() => plansQuery.data ?? [], [plansQuery.data]);
  const schedules = useChefMealPlanSchedulesQuery(plans.map(plan => plan.id));
  const [filter, setFilter] = React.useState<ChefPlanFilter>('ALL');

  const metrics = React.useMemo(() => chefPlanMetrics(plans), [plans]);
  const shown = React.useMemo(() => filterChefPlans(plans, filter), [plans, filter]);
  const dishPhotos = React.useMemo(
    () => new Map(menu.items.map(item => [item.id, getChefMenuPrimaryImageUrl(item)])),
    [menu.items],
  );

  const initialLoading = plansQuery.isLoading;
  const initialError = plansQuery.isError && plans.length === 0;
  const refreshing = (plansQuery.isRefetching || menu.isRefreshing) && !initialLoading;

  const refresh = React.useCallback(() => {
    invalidateChefMealPlans(queryClient).catch(() => undefined);
    menu.refresh().catch(() => undefined);
  }, [menu, queryClient]);

  const pill = (label: string, value: ChefPlanFilter, count: number) => {
    const on = filter === value;
    return (
      <ChipTap
        accessibilityLabel={`${label} ${count}`}
        accessibilityRole="button"
        accessibilityState={{selected: on}}
        key={value}
        onPress={() => setFilter(value)}>
        <View style={[styles.pill, on && styles.pillOn]}>
          <Text allowFontScaling={textDefaults.allowFontScaling} style={[styles.pillText, on && styles.pillTextOn]}>
            {`${label} ${count}`}
          </Text>
        </View>
      </ChipTap>
    );
  };

  let body: React.ReactNode;
  if (initialLoading) {
    body = (
      <View style={styles.list}>
        {[0, 1, 2].map(index => (
          <SkeletonBlock borderRadius={radius.md} height={112} key={index} width="100%" />
        ))}
      </View>
    );
  } else if (initialError) {
    body = (
      <CenterMessage
        action={{label: 'Try again', onPress: refresh}}
        icon="wifi-off"
        message="Check your connection and try again."
        title="Couldn't load your meal plans"
      />
    );
  } else if (plans.length === 0) {
    body = (
      <CenterMessage
        action={{label: 'Create a plan', onPress: () => navigation.navigate('ChefMealPlanEditor', {})}}
        icon="meal"
        message="Create a weekly or monthly plan from dishes on your menu."
        title="No meal plans yet"
      />
    );
  } else {
    body = (
      <>
        <ScrollView
          contentContainerStyle={styles.pills}
          horizontal
          keyboardShouldPersistTaps="handled"
          showsHorizontalScrollIndicator={false}
          style={styles.pillScroll}>
          {pill('All', 'ALL', metrics.total)}
          {pill('Live', 'LIVE', metrics.live)}
          {pill('Waiting approval', 'WAITING', metrics.pending)}
          {pill('Drafts', 'DRAFTS', metrics.draft)}
        </ScrollView>
        {shown.length === 0 ? (
          <CenterMessage
            action={{label: 'Show all plans', onPress: () => setFilter('ALL')}}
            icon="search-off"
            message="Try another filter."
            title="No plans here"
          />
        ) : (
          shown.map(plan => {
            const items = schedules[plan.id]?.items;
            const coverId = items && items.length > 0 ? summarizeSchedule(items).coverMenuItemId : null;
            return (
              <PlanCard
                items={items}
                key={plan.id}
                onLimits={() => navigation.navigate('ChefDailyLimits', {planId: plan.id})}
                onOpen={() => navigation.navigate('ChefMealPlanEditor', {planId: plan.id})}
                onSchedule={() => navigation.navigate('ChefMealPlanEditor', {planId: plan.id, step: 2})}
                photoUrl={resolveApiImageUrl(plan.imageUrl) ?? (coverId ? dishPhotos.get(coverId) ?? null : null)}
                plan={plan}
              />
            );
          })
        )}
      </>
    );
  }

  return (
    <View style={styles.screen}>
      {hideHeader ? null : <ChefTopBar showBell={false} title="Meal plans" />}
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl colors={[colors.flameRed]} onRefresh={refresh} refreshing={refreshing} />}
        showsVerticalScrollIndicator={false}>
        {body}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.white},
  content: {flexGrow: 1, gap: spacing.sm, paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.xxl},
  list: {gap: spacing.sm},
  pillScroll: {flexGrow: 0, marginHorizontal: -spacing.md, ...chipTapOverlap(PILL_HEIGHT)},
  pills: {gap: spacing.xs, paddingHorizontal: spacing.md},
  pill: {
    height: PILL_HEIGHT, // matches the Dishes pills
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  pillOn: {borderColor: colors.flameRedAccessible, backgroundColor: colors.errorSoft},
  pillText: {color: colors.textPrimary, fontSize: typography.small, fontWeight: fontWeight.semibold},
  pillTextOn: {color: colors.flameRedAccessible},
  card: {padding: 0, overflow: 'hidden'},
  open: {flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, padding: spacing.sm},
  pressed: {opacity: 0.6},
  photo: {width: PHOTO, height: PHOTO, borderRadius: radius.md},
  noPhoto: {alignItems: 'center', justifyContent: 'center', borderWidth: borderWidth.standard, borderColor: colors.border},
  copy: {flex: 1, minWidth: 0, gap: spacing.xxs},
  titleLine: {flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.xs},
  name: {flex: 1, color: colors.textPrimary, fontSize: typography.button, fontWeight: fontWeight.bold},
  meta: {color: colors.textSecondary, fontSize: typography.small},
  price: {marginTop: spacing.xxs, color: colors.textPrimary, fontSize: typography.body, fontWeight: fontWeight.bold},
  note: {flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs, margin: spacing.sm, marginTop: 0, padding: spacing.sm, borderRadius: radius.md},
  noteText: {flex: 1, fontSize: typography.small},
  acceptRow: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingBottom: spacing.sm},
  acceptCopy: {flex: 1, minWidth: 0},
  count: {color: colors.textPrimary, fontSize: typography.small, fontWeight: fontWeight.bold},
  acceptLabel: {color: colors.textSecondary, fontSize: typography.small},
  acceptHint: {color: colors.textSecondary, fontSize: typography.tiny},
  toggleError: {color: colors.flameRedAccessible, fontSize: typography.small, paddingHorizontal: spacing.md, paddingBottom: spacing.sm},
  links: {flexDirection: 'row', borderTopWidth: borderWidth.standard, borderTopColor: colors.border, paddingHorizontal: spacing.xs, paddingVertical: spacing.xxs},
  link: {flex: 1, minHeight: touchTarget.minimum, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs},
  linkText: {color: colors.textPrimary, fontSize: typography.body, fontWeight: fontWeight.bold},
  center: {alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.md},
  centerTitle: {color: colors.textPrimary, fontSize: typography.heading, fontWeight: fontWeight.bold, textAlign: 'center'},
  centerMessage: {color: colors.textSecondary, fontSize: typography.body, textAlign: 'center', marginBottom: spacing.xs},
});
