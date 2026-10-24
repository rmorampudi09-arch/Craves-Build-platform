import React from 'react';
import {RefreshControl, ScrollView, StyleSheet, Text, View} from 'react-native';
import {useNavigation, type CompositeNavigationProp} from '@react-navigation/native';
import type {BottomTabNavigationProp} from '@react-navigation/bottom-tabs';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import type {ChefProductStackParamList, ChefTabParamList} from '../../../app/navigation/types';
import {
  borderWidth,
  colors,
  fontWeight,
  radius,
  spacing,
  textDefaults,
  typography,
} from '../../../design/tokens';
import {InputField} from '../../../shared/components/InputField';
import {SkeletonBlock} from '../../../shared/components/Skeleton';
import {
  ChefActionButton,
  ChipTap,
  ConfirmDialog,
  EmptyState,
  ListGroup,
  chipTapOverlap,
  useChefToast,
} from '../../chefShell/components/ui';
import type {ChefMenuItem} from '../api/chefMenuApi';
import {DishRow} from '../components/DishRow';
import {
  chefMenuCategoryLabel,
  deriveChefMenuSummary,
  filterChefMenuItems,
  getChefMenuCategories,
  type ChefMenuStatusFilter,
} from '../domain/chefMenuPresentation';
import {useChefMenuModel} from '../state/useChefMenuModel';
import {useDishSwitch} from '../state/useDishSwitch';

type ChefMenuNavigation = CompositeNavigationProp<
  BottomTabNavigationProp<ChefTabParamList, 'Menu'>,
  NativeStackNavigationProp<ChefProductStackParamList>
>;

/** One row of filters: a status or a category, never both at once. */
type Filter = {kind: 'status'; status: ChefMenuStatusFilter} | {kind: 'category'; category: string};
const ALL: Filter = {kind: 'status', status: 'ALL'};

const PILL_HEIGHT = 34;

function FilterPill({label, on, onPress}: {label: string; on: boolean; onPress: () => void}) {
  return (
    <ChipTap accessibilityLabel={label} accessibilityRole="button" accessibilityState={{selected: on}} onPress={onPress}>
      <View style={[styles.pill, on && styles.pillOn]}>
        <Text allowFontScaling={textDefaults.allowFontScaling} style={[styles.pillText, on && styles.pillTextOn]}>
          {label}
        </Text>
      </View>
    </ChipTap>
  );
}

/**
 * The Dishes side of the Menu tab: search, one row of filters, and a switch on every dish.
 * The Menu tab screen owns the header, the Dishes / Meal plans toggle and the "+ Add dish" button.
 */
export function ChefMenuScreen() {
  const navigation = useNavigation<ChefMenuNavigation>();
  const toast = useChefToast();
  const menu = useChefMenuModel();
  const {items, status, availabilityStateByItem, publishDraft, refresh, updateAvailability} = menu;
  const setOn = useDishSwitch(updateAvailability);
  const [query, setQuery] = React.useState('');
  const [filter, setFilter] = React.useState<Filter>(ALL);
  const [publishing, setPublishing] = React.useState<ChefMenuItem | null>(null);
  const [pulling, setPulling] = React.useState(false);
  const publishLock = React.useRef(false);

  const summary = React.useMemo(() => deriveChefMenuSummary(items), [items]);
  const categories = React.useMemo(() => getChefMenuCategories(items), [items]);
  const shown = React.useMemo(
    () =>
      filterChefMenuItems(
        items,
        query,
        filter.kind === 'category' ? filter.category : null,
        filter.kind === 'status' ? filter.status : 'ALL',
      ),
    [filter, items, query],
  );
  // Only a pull shows the spinner; the quiet refresh after a switch must not flash it.
  const pull = () => {
    setPulling(true);
    refresh()
      .catch(() => undefined)
      .finally(() => setPulling(false));
  };
  const clearFilters = () => {
    setQuery('');
    setFilter(ALL);
  };

  const confirmPublish = async () => {
    const item = publishing;
    if (!item || publishLock.current) {
      return;
    }
    publishLock.current = true;
    try {
      const saved = await publishDraft(item);
      setPublishing(null);
      toast.show(saved ? `${item.itemName} is live` : `We couldn't publish ${item.itemName}. Try again.`);
    } finally {
      publishLock.current = false;
    }
  };

  const statusPill = (label: string, next: ChefMenuStatusFilter, count: number) => (
    <FilterPill
      label={`${label} ${count}`}
      on={filter.kind === 'status' && filter.status === next}
      onPress={() => setFilter({kind: 'status', status: next})}
    />
  );

  let body: React.ReactNode;
  if (status === 'pending' && items.length === 0) {
    body = (
      <View style={styles.skeleton}>
        {[0, 1, 2, 3].map(index => (
          <SkeletonBlock borderRadius={radius.md} height={80} key={index} width="100%" />
        ))}
      </View>
    );
  } else if (status === 'error' && items.length === 0) {
    body = (
      <EmptyState illustration="loadError" message="Check your connection and try again." title="Couldn't load your dishes">
        <ChefActionButton label="Try again" onPress={() => refresh().catch(() => undefined)} />
      </EmptyState>
    );
  } else if (items.length === 0) {
    body = (
      <EmptyState
        illustration="menu"
        message="Add your first dish with a photo and price so customers near you can order."
        title="No dishes yet">
        <ChefActionButton label="Add a dish" onPress={() => navigation.navigate('ChefAddMenuItem')} />
      </EmptyState>
    );
  } else {
    body = (
      <>
        <InputField
          accessibilityLabel="Search dishes"
          icon="search"
          onChangeText={setQuery}
          placeholder="Search dishes"
          returnKeyType="search"
          value={query}
        />
        <ScrollView
          contentContainerStyle={styles.pills}
          horizontal
          keyboardShouldPersistTaps="handled"
          showsHorizontalScrollIndicator={false}
          style={styles.pillScroll}>
          <FilterPill label={`All ${summary.total}`} on={filter === ALL} onPress={() => setFilter(ALL)} />
          {statusPill('On', 'AVAILABLE', summary.available)}
          {statusPill('Off', 'OFF', summary.unavailable + summary.inactive)}
          {statusPill('Drafts', 'DRAFT', summary.draft)}
          {categories.map(category => (
            <FilterPill
              key={category}
              label={chefMenuCategoryLabel(category)}
              on={filter.kind === 'category' && filter.category === category}
              onPress={() => setFilter({kind: 'category', category})}
            />
          ))}
        </ScrollView>
        <Text allowFontScaling={textDefaults.allowFontScaling} style={styles.count}>
          {`${summary.available} of ${summary.total} dishes customers can order`}
        </Text>
        {shown.length === 0 ? (
          <EmptyState illustration="search" message="Try another word or filter." title="No dishes match" width={160}>
            <ChefActionButton label="Clear filters" onPress={clearFilters} />
          </EmptyState>
        ) : (
          <ListGroup>
            {shown.map(item => (
              <DishRow
                busy={Boolean(availabilityStateByItem[item.id])}
                item={item}
                key={item.id}
                onOpen={() => navigation.navigate('ChefEditMenuItem', {menuItemId: item.id})}
                onPublish={() => setPublishing(item)}
                onSwitch={on => setOn(item, on)}
              />
            ))}
          </ListGroup>
        )}
      </>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl colors={[colors.flameRed]} onRefresh={pull} refreshing={pulling} />
        }
        showsVerticalScrollIndicator={false}>
        {body}
      </ScrollView>
      <ConfirmDialog
        busy={publishing !== null && Boolean(availabilityStateByItem[publishing.id])}
        confirmLabel="Publish dish"
        message="It goes on your kitchen page and customers can order it."
        onCancel={() => setPublishing(null)}
        onConfirm={() => confirmPublish()}
        title={`Publish ${publishing?.itemName ?? 'this dish'}?`}
        visible={publishing !== null}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.white},
  content: {flexGrow: 1, gap: spacing.sm, paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.xxl},
  skeleton: {gap: spacing.sm},
  pillScroll: {flexGrow: 0, marginHorizontal: -spacing.md, ...chipTapOverlap(PILL_HEIGHT)},
  pills: {gap: spacing.xs, paddingHorizontal: spacing.md},
  pill: {
    height: PILL_HEIGHT,
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
  count: {color: colors.textSecondary, fontSize: typography.small, marginHorizontal: 2},
});
