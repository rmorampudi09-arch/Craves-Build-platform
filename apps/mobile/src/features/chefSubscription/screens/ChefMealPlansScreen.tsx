import React from 'react';
import {
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type ListRenderItemInfo,
} from 'react-native';
import {
  useNavigation,
  type CompositeNavigationProp,
} from '@react-navigation/native';
import type {BottomTabNavigationProp} from '@react-navigation/bottom-tabs';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {useQueryClient} from '@tanstack/react-query';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {
  ChefProductStackParamList,
  ChefTabParamList,
} from '../../../app/navigation/types';
import {toAppApiError} from '../../../core/http/apiError';
import {
  colors,
  elevation,
  fontWeight,
  iconSize,
  radius,
  spacing,
  touchTarget,
  typography,
} from '../../../design/tokens';
import {Badge} from '../../../shared/components/Badge';
import {Button} from '../../../shared/components/Button';
import {Icon} from '../../../shared/components/Icon';
import {SkeletonBlock} from '../../../shared/components/Skeleton';
import {ChefHeader} from '../../chefShell/components/ChefHeader';
import {getChefMenuPrimaryImageUrl} from '../../chefMenu/domain/chefMenuPresentation';
import {useChefMenuModel} from '../../chefMenu/state/useChefMenuModel';
import {
  summarizeSchedule,
  type ScheduleItemLike,
} from '../../mealPlans/domain/mealPlanSchedule';
import {resolveApiImageUrl} from '../../mealPlans/domain/resolveApiImageUrl';
import type {ChefMealPlan} from '../api/chefSubscriptionApi';
import {
  acceptingSubscribersHint,
  acceptingSubscribersValue,
  chefPlanAccessibilityLabel,
  chefPlanMetaLine,
  chefPlanMetrics,
  chefPlanPriceLabel,
  chefPlanStatusPresentation,
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

function Metric({label, value}: {label: string; value: number}) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function PlansSkeleton() {
  return (
    <View style={styles.skeletonList}>
      {[0, 1, 2].map(index => (
        <View key={index} style={[styles.card, styles.skeletonCard]}>
          <SkeletonBlock borderRadius={radius.md} height={92} width={92} />
          <View style={styles.skeletonCopy}>
            <SkeletonBlock height={18} width="72%" />
            <SkeletonBlock height={14} width="46%" />
            <SkeletonBlock height={18} width="34%" />
          </View>
        </View>
      ))}
    </View>
  );
}

function PlanCard({
  plan,
  items,
  photoUrl,
  onOpen,
}: {
  plan: ChefMealPlan;
  items: readonly ScheduleItemLike[] | undefined;
  photoUrl: string | null;
  onOpen: () => void;
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

  return (
    <View style={styles.card}>
      <Pressable
        accessibilityHint={
          plan.status === 'REJECTED' && plan.reviewReason
            ? `Admin: ${plan.reviewReason}`
            : undefined
        }
        accessibilityLabel={chefPlanAccessibilityLabel(plan)}
        accessibilityRole="button"
        onPress={onOpen}
        style={({pressed}) => [styles.cardOpenArea, pressed && styles.pressed]}>
        <View style={styles.cardMainRow}>
          {photoUrl ? (
            <Image
              accessibilityIgnoresInvertColors
              accessibilityLabel={`${plan.name} photo`}
              resizeMode="cover"
              source={{uri: photoUrl}}
              style={styles.planImage}
            />
          ) : (
            <View style={styles.imageFallback}>
              <Icon color={colors.flameRedAccessible} name="chef" size={30} />
            </View>
          )}
          <View style={styles.cardCopy}>
            <View style={styles.cardTitleRow}>
              <Text numberOfLines={2} style={styles.planName}>
                {plan.name}
              </Text>
              <Badge label={status.label} tone={status.tone} />
            </View>
            <Text numberOfLines={1} style={styles.planMeta}>
              {chefPlanMetaLine(plan, items)}
            </Text>
            {plan.description ? (
              <Text numberOfLines={2} style={styles.planDescription}>
                {plan.description}
              </Text>
            ) : null}
            {plan.status === 'REJECTED' && plan.reviewReason ? (
              <Text style={styles.reviewReason}>Admin: {plan.reviewReason}</Text>
            ) : null}
            <View style={styles.priceRow}>
              <Text style={styles.price}>{chefPlanPriceLabel(plan)}</Text>
              <Icon color={colors.textSecondary} name="chevron-right" size={17} />
            </View>
          </View>
        </View>
      </Pressable>

      {shown !== null || toggleError ? (
        <View style={styles.availabilityBlock}>
          {shown !== null ? (
            <View style={styles.availabilityRow}>
              <View style={styles.availabilityCopy}>
                <Text style={styles.availabilityTitle}>Accepting new subscribers</Text>
                <Text style={styles.availabilityHint}>{acceptingSubscribersHint(shown)}</Text>
              </View>
              <Switch
                accessibilityLabel={`${plan.name} accepting new subscribers`}
                accessibilityState={{busy: chosen !== null, checked: shown}}
                disabled={chosen !== null}
                onValueChange={toggle}
                thumbColor={colors.white}
                trackColor={{false: colors.borderStrong, true: colors.flameRed}}
                value={shown}
              />
            </View>
          ) : null}
          {/* Outside the switch row: a 409 can flip the plan out of ACTIVE, which hides the row but must keep the message. */}
          {toggleError ? (
            <Text accessibilityLiveRegion="polite" style={styles.toggleError}>
              {toggleError}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/**
 * `hideHeader`: the Menu tab already draws the header, the Dishes / Meal plans toggle and the "New plan" button
 * above this list, so the list leaves out its own header. `headerAccessory` stays for a caller that has no tab screen.
 */
export function ChefMealPlansScreen({
  headerAccessory,
  hideHeader = false,
}: {
  headerAccessory?: React.ReactNode;
  hideHeader?: boolean;
}) {
  const navigation = useNavigation<ChefMealPlansNavigation>();
  const queryClient = useQueryClient();
  const plansQuery = useChefMealPlansQuery();
  const menu = useChefMenuModel();
  const plans = React.useMemo(() => plansQuery.data ?? [], [plansQuery.data]);
  const schedules = useChefMealPlanSchedulesQuery(plans.map(plan => plan.id));
  const [searchQuery, setSearchQuery] = React.useState('');

  const metrics = React.useMemo(() => chefPlanMetrics(plans), [plans]);
  const filteredPlans = React.useMemo(() => {
    const needle = searchQuery.trim().toLowerCase();
    return needle
      ? plans.filter(plan => plan.name.toLowerCase().includes(needle))
      : plans;
  }, [plans, searchQuery]);
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

  const renderItem = ({item}: ListRenderItemInfo<ChefMealPlan>) => {
    const items = schedules[item.id]?.items;
    const coverId = items && items.length > 0 ? summarizeSchedule(items).coverMenuItemId : null;
    return (
      <PlanCard
        items={items}
        onOpen={() => navigation.navigate('ChefMealPlanEditor', {planId: item.id})}
        photoUrl={
          resolveApiImageUrl(item.imageUrl) ?? (coverId ? dishPhotos.get(coverId) ?? null : null)
        }
        plan={item}
      />
    );
  };

  const listHeader = (
    <View style={styles.headerContent}>
      <View style={styles.titleBlock}>
        <Text accessibilityRole="header" style={styles.title}>
          Your menu
        </Text>
        <Text style={styles.subtitle}>
          Keep item availability accurate so customers only see food you can prepare.
        </Text>
      </View>

      {headerAccessory}

      <View style={styles.metricGrid}>
        <Metric label="Total" value={metrics.total} />
        <Metric label="Live" value={metrics.live} />
        <Metric label="Pending approval" value={metrics.pending} />
        <Metric label="Draft" value={metrics.draft} />
      </View>

      <View style={styles.searchBox}>
        <Icon color={colors.textSecondary} name="search" size={iconSize.lg} surface={false} />
        <TextInput
          accessibilityLabel="Search meal plans"
          onChangeText={setSearchQuery}
          placeholder="Search your meal plans"
          placeholderTextColor={colors.placeholder}
          returnKeyType="search"
          style={styles.searchInput}
          value={searchQuery}
        />
      </View>

      <View style={styles.resultsHeader}>
        <Text style={styles.resultsTitle}>Meal plans</Text>
        <Text style={styles.resultsCount}>
          {filteredPlans.length} of {plans.length}
        </Text>
      </View>
    </View>
  );

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      {hideHeader ? null : <ChefHeader title="Menu" />}
      <FlatList
        contentContainerStyle={styles.listContent}
        data={initialLoading || initialError ? [] : filteredPlans}
        keyExtractor={plan => plan.id}
        ListEmptyComponent={
          initialLoading ? (
            <PlansSkeleton />
          ) : initialError ? (
            <View style={styles.stateCard}>
              <Icon color={colors.error} name="wifi-off" size={30} />
              <Text style={styles.stateTitle}>Meal plans unavailable</Text>
              <Text style={styles.stateMessage}>
                Your meal plans could not be loaded. Check your connection and try again.
              </Text>
              <Button
                accessibilityLabel="Retry meal plans"
                label="Try again"
                loading={plansQuery.isFetching}
                onPress={refresh}
                style={styles.stateButton}
              />
            </View>
          ) : plans.length === 0 ? (
            <View style={styles.stateCard}>
              <Icon color={colors.flameRedAccessible} name="chef" size={32} />
              <Text style={styles.stateTitle}>No meal plans yet</Text>
              <Text style={styles.stateMessage}>
                Create a weekly or monthly plan from dishes on your menu.
              </Text>
            </View>
          ) : (
            <View style={styles.stateCard}>
              <Icon color={colors.textSecondary} name="search" size={30} />
              <Text style={styles.stateTitle}>No matching plans</Text>
              <Text style={styles.stateMessage}>Try a different name.</Text>
            </View>
          )
        }
        ListHeaderComponent={listHeader}
        refreshControl={
          <RefreshControl
            colors={[colors.flameRed]}
            onRefresh={refresh}
            refreshing={refreshing}
            tintColor={colors.flameRed}
          />
        }
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {flex: 1, backgroundColor: colors.surfaceMuted},
  listContent: {paddingHorizontal: spacing.md, paddingBottom: spacing.xxxl},
  headerContent: {paddingTop: spacing.lg},
  titleBlock: {marginBottom: spacing.md},
  title: {
    color: colors.espressoBrown,
    fontSize: typography.hero,
    fontWeight: fontWeight.bold,
  },
  subtitle: {color: colors.textSecondary, fontSize: typography.body, marginTop: spacing.xxs},
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  metricCard: {
    ...elevation.card,
    backgroundColor: colors.white,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexGrow: 1,
    minWidth: '44%',
    padding: spacing.sm,
  },
  metricValue: {
    color: colors.espressoBrown,
    fontSize: typography.heading,
    fontWeight: fontWeight.bold,
  },
  metricLabel: {color: colors.textSecondary, fontSize: typography.small, marginTop: spacing.xxs},
  searchBox: {
    alignItems: 'center',
    backgroundColor: colors.white,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    marginBottom: spacing.md,
    minHeight: touchTarget.comfortable,
    paddingHorizontal: spacing.sm,
  },
  searchInput: {
    color: colors.textPrimary,
    flex: 1,
    fontSize: typography.body,
    paddingHorizontal: spacing.xs,
  },
  resultsHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  resultsTitle: {
    color: colors.espressoBrown,
    fontSize: typography.heading,
    fontWeight: fontWeight.bold,
  },
  resultsCount: {color: colors.textSecondary, fontSize: typography.small},
  card: {
    ...elevation.card,
    backgroundColor: colors.white,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  cardOpenArea: {padding: spacing.md},
  cardMainRow: {flexDirection: 'row', gap: spacing.sm},
  planImage: {borderRadius: radius.md, height: 92, width: 92},
  imageFallback: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    height: 92,
    justifyContent: 'center',
    width: 92,
  },
  cardCopy: {flex: 1, minWidth: 0},
  cardTitleRow: {alignItems: 'flex-start', flexDirection: 'row', gap: spacing.xs},
  planName: {
    color: colors.textPrimary,
    flex: 1,
    fontSize: typography.body,
    fontWeight: fontWeight.bold,
  },
  planMeta: {color: colors.textSecondary, fontSize: typography.small, marginTop: spacing.xxs},
  planDescription: {color: colors.textSecondary, fontSize: typography.small, marginTop: spacing.xs},
  reviewReason: {color: colors.error, fontSize: typography.small, marginTop: spacing.xs},
  priceRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  price: {
    color: colors.flameRedAccessible,
    fontSize: typography.body,
    fontWeight: fontWeight.bold,
  },
  availabilityBlock: {borderTopColor: colors.border, borderTopWidth: 1},
  availabilityRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 72,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  availabilityCopy: {flex: 1},
  availabilityTitle: {
    color: colors.textPrimary,
    fontSize: typography.small,
    fontWeight: fontWeight.semibold,
  },
  availabilityHint: {color: colors.textSecondary, fontSize: typography.tiny, marginTop: spacing.xxs},
  toggleError: {
    color: colors.error,
    fontSize: typography.small,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  skeletonList: {gap: spacing.md},
  skeletonCard: {flexDirection: 'row', gap: spacing.sm, padding: spacing.md},
  skeletonCopy: {flex: 1, gap: spacing.xs},
  stateCard: {
    alignItems: 'center',
    backgroundColor: colors.white,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    marginBottom: spacing.md,
    padding: spacing.xl,
  },
  stateTitle: {
    color: colors.textPrimary,
    fontSize: typography.heading,
    fontWeight: fontWeight.bold,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  stateMessage: {
    color: colors.textSecondary,
    fontSize: typography.small,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  stateButton: {marginTop: spacing.md},
  pressed: {opacity: 0.65},
});
