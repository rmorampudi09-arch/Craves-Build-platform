import React from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
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
import {SafeAreaView} from 'react-native-safe-area-context';
import type {
  ChefProductStackParamList,
  ChefTabParamList,
} from '../../../app/navigation/types';
import {
  colors,
  elevation,
  fontWeight,
  radius,
  spacing,
  touchTarget,
  typography,
} from '../../../design/tokens';
import {Icon} from '../../../shared/components/Icon';
import {SkeletonBlock} from '../../../shared/components/Skeleton';
import type {ChefMenuItem} from '../api/chefMenuApi';
import {
  CHEF_MENU_STATUS_FILTERS,
  chefMenuStatusLabel,
  deriveChefMenuSummary,
  filterChefMenuItems,
  formatChefMenuPrice,
  getChefMenuCategories,
  getChefMenuDisplayState,
  getChefMenuPrimaryImageUrl,
  type ChefMenuStatusFilter,
} from '../domain/chefMenuPresentation';
import {useChefMenuModel} from '../state/useChefMenuModel';
import {ChefHeader} from '../../chefShell/components/ChefHeader';

type ChefMenuNavigation = CompositeNavigationProp<
  BottomTabNavigationProp<ChefTabParamList, 'Menu'>,
  NativeStackNavigationProp<ChefProductStackParamList>
>;

const STATUS_FILTER_LABELS: Record<ChefMenuStatusFilter, string> = {
  ALL: 'All items',
  AVAILABLE: 'Available',
  UNAVAILABLE: 'Unavailable',
  DRAFT: 'Draft',
  INACTIVE: 'Inactive',
};

function MenuSkeleton() {
  return (
    <View style={styles.skeletonList}>
      {[0, 1, 2].map(index => (
        <View key={index} style={styles.card}>
          <View style={styles.cardMainRow}>
            <SkeletonBlock borderRadius={radius.md} height={92} width={92} />
            <View style={styles.skeletonCopy}>
              <SkeletonBlock height={18} width="72%" />
              <SkeletonBlock height={14} width="46%" />
              <SkeletonBlock height={14} width="82%" />
              <SkeletonBlock height={18} width="34%" />
            </View>
          </View>
          <SkeletonBlock height={52} width="100%" />
        </View>
      ))}
    </View>
  );
}

function Metric({label, value}: {label: string; value: number}) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function StatusBadge({item}: {item: ChefMenuItem}) {
  const state = getChefMenuDisplayState(item);
  return (
    <View
      style={[
        styles.statusBadge,
        state === 'AVAILABLE'
          ? styles.statusAvailable
          : state === 'UNAVAILABLE'
            ? styles.statusUnavailable
            : state === 'DRAFT'
              ? styles.statusDraft
              : styles.statusInactive,
      ]}>
      <Text
        style={[
          styles.statusText,
          state === 'AVAILABLE'
            ? styles.statusAvailableText
            : state === 'UNAVAILABLE'
              ? styles.statusUnavailableText
              : state === 'DRAFT'
                ? styles.statusDraftText
                : styles.statusInactiveText,
        ]}>
        {chefMenuStatusLabel(state)}
      </Text>
    </View>
  );
}

function MenuItemCard({
  busy,
  item,
  onOpen,
  onToggleAvailability,
}: {
  busy: boolean;
  item: ChefMenuItem;
  onOpen: () => void;
  onToggleAvailability: (available: boolean) => void;
}) {
  const imageUrl = getChefMenuPrimaryImageUrl(item);
  const customerLive = item.status === 'ACTIVE' && item.available;

  return (
    <View style={styles.card}>
      <Pressable
        accessibilityLabel={`Open ${item.itemName} menu item details`}
        accessibilityRole="button"
        onPress={onOpen}
        style={({pressed}) => [styles.cardOpenArea, pressed && styles.pressed]}>
        <View style={styles.cardMainRow}>
          {imageUrl ? (
            <Image
              accessibilityIgnoresInvertColors
              accessibilityLabel={`${item.itemName} image`}
              resizeMode="cover"
              source={{uri: imageUrl}}
              style={styles.itemImage}
            />
          ) : (
            <View style={styles.imageFallback}>
              <Icon color={colors.flameRed} name="chef" size={30} />
            </View>
          )}
          <View style={styles.cardCopy}>
            <View style={styles.cardTitleRow}>
              <Text numberOfLines={2} style={styles.itemName}>
                {item.itemName}
              </Text>
              <StatusBadge item={item} />
            </View>
            <Text numberOfLines={1} style={styles.itemMeta}>
              {item.category} · {item.foodType.replace('_', ' ')}
            </Text>
            {item.description ? (
              <Text numberOfLines={2} style={styles.itemDescription}>
                {item.description}
              </Text>
            ) : null}
            <View style={styles.priceRow}>
              <Text style={styles.price}>{formatChefMenuPrice(item)}</Text>
              <Icon color={colors.textSecondary} name="chevron-right" size={17} />
            </View>
          </View>
        </View>
      </Pressable>

      <View style={styles.availabilityRow}>
        <View style={styles.availabilityCopy}>
          <Text style={styles.availabilityTitle}>Available for sale</Text>
          <Text style={styles.availabilityHint}>
            {customerLive
              ? 'Active and currently visible to eligible customers.'
              : item.status === 'ACTIVE'
                ? 'Active, but currently unavailable to customers.'
                : 'Availability is saved, but this status is not customer-live.'}
          </Text>
        </View>
        {busy ? <ActivityIndicator color={colors.flameRed} size="small" /> : null}
        <Switch
          accessibilityLabel={`${item.itemName} availability`}
          accessibilityState={{busy, checked: item.available}}
          disabled={busy}
          onValueChange={onToggleAvailability}
          thumbColor={colors.white}
          trackColor={{false: colors.borderStrong, true: colors.flameRed}}
          value={item.available}
        />
      </View>
    </View>
  );
}

export function ChefMenuScreen() {
  const navigation = useNavigation<ChefMenuNavigation>();
  const menu = useChefMenuModel();
  const {availabilityStateByItem, refresh, updateAvailability} = menu;
  const [searchQuery, setSearchQuery] = React.useState('');
  const [debouncedQuery, setDebouncedQuery] = React.useState('');
  const [selectedCategory, setSelectedCategory] = React.useState<string | null>(null);
  const [statusFilter, setStatusFilter] = React.useState<ChefMenuStatusFilter>('ALL');
  const [filterVisible, setFilterVisible] = React.useState(false);

  React.useEffect(() => {
    const timerId = setTimeout(() => setDebouncedQuery(searchQuery), 250);
    return () => clearTimeout(timerId);
  }, [searchQuery]);

  const summary = React.useMemo(
    () => deriveChefMenuSummary(menu.items),
    [menu.items],
  );
  const categories = React.useMemo(
    () => getChefMenuCategories(menu.items),
    [menu.items],
  );
  const filteredItems = React.useMemo(
    () =>
      filterChefMenuItems(
        menu.items,
        debouncedQuery,
        selectedCategory,
        statusFilter,
      ),
    [debouncedQuery, menu.items, selectedCategory, statusFilter],
  );

  const clearFilters = React.useCallback(() => {
    setSearchQuery('');
    setDebouncedQuery('');
    setSelectedCategory(null);
    setStatusFilter('ALL');
  }, []);

  const refreshMenu = React.useCallback(() => {
    refresh().catch(() => undefined);
  }, [refresh]);

  const openItem = React.useCallback(
    (menuItemId: string) => {
      navigation.navigate('ChefMenuItemDetail', {menuItemId});
    },
    [navigation],
  );

  const renderItem = React.useCallback(
    ({item}: ListRenderItemInfo<ChefMenuItem>) => (
      <MenuItemCard
        busy={Boolean(availabilityStateByItem[item.id])}
        item={item}
        onOpen={() => openItem(item.id)}
        onToggleAvailability={available => {
          updateAvailability(item.id, available).catch(() => undefined);
        }}
      />
    ),
    [availabilityStateByItem, openItem, updateAvailability],
  );

  const hasFilters =
    searchQuery.trim().length > 0 || selectedCategory !== null || statusFilter !== 'ALL';
  const initialLoading = menu.status === 'pending' && menu.items.length === 0;
  const initialError = menu.status === 'error' && menu.items.length === 0;

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

      {menu.feedback ? (
        <View
          accessibilityLiveRegion="polite"
          style={[
            styles.feedbackBanner,
            menu.feedback.kind === 'success'
              ? styles.feedbackSuccess
              : styles.feedbackError,
          ]}>
          <View style={styles.feedbackCopy}>
            <Text style={styles.feedbackTitle}>
              {menu.feedback.kind === 'success' ? 'Menu updated' : 'Update failed'}
            </Text>
            <Text style={styles.feedbackMessage}>{menu.feedback.message}</Text>
          </View>
          <Pressable
            accessibilityLabel="Dismiss menu update message"
            accessibilityRole="button"
            onPress={menu.clearFeedback}
            style={({pressed}) => [styles.dismissButton, pressed && styles.pressed]}>
            <Text style={styles.dismissText}>Dismiss</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.metricGrid}>
        <Metric label="Total" value={summary.total} />
        <Metric label="Available" value={summary.available} />
        <Metric label="Unavailable" value={summary.unavailable} />
        <Metric label="Draft / inactive" value={summary.draft + summary.inactive} />
      </View>

      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Icon color={colors.textSecondary} name="search" size={19} />
          <TextInput
            accessibilityLabel="Search menu items"
            onChangeText={setSearchQuery}
            placeholder="Search your menu"
            placeholderTextColor={colors.placeholder}
            returnKeyType="search"
            style={styles.searchInput}
            value={searchQuery}
          />
        </View>
        <Pressable
          accessibilityLabel={`Filter menu, ${STATUS_FILTER_LABELS[statusFilter]}`}
          accessibilityRole="button"
          onPress={() => setFilterVisible(true)}
          style={({pressed}) => [styles.filterButton, pressed && styles.pressed]}>
          <Text style={styles.filterButtonText}>Filter</Text>
        </Pressable>
      </View>

      {categories.length > 0 ? (
        <ScrollView
          contentContainerStyle={styles.categoryRow}
          horizontal
          showsHorizontalScrollIndicator={false}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{selected: selectedCategory === null}}
            onPress={() => setSelectedCategory(null)}
            style={[
              styles.categoryChip,
              selectedCategory === null && styles.categoryChipSelected,
            ]}>
            <Text
              style={[
                styles.categoryChipText,
                selectedCategory === null && styles.categoryChipTextSelected,
              ]}>
              All
            </Text>
          </Pressable>
          {categories.map(category => {
            const selected = selectedCategory === category;
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{selected}}
                key={category}
                onPress={() => setSelectedCategory(category)}
                style={[styles.categoryChip, selected && styles.categoryChipSelected]}>
                <Text
                  style={[
                    styles.categoryChipText,
                    selected && styles.categoryChipTextSelected,
                  ]}>
                  {category}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      <View style={styles.resultsHeader}>
        <Text style={styles.resultsTitle}>Menu items</Text>
        <Text style={styles.resultsCount}>
          {filteredItems.length} of {menu.items.length}
        </Text>
      </View>
    </View>
  );

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      <ChefHeader title="Menu" />
      <FlatList
        contentContainerStyle={styles.listContent}
        data={initialLoading || initialError ? [] : filteredItems}
        initialNumToRender={8}
        keyExtractor={item => item.id}
        ListEmptyComponent={
          initialLoading ? (
            <MenuSkeleton />
          ) : initialError ? (
            <View style={styles.stateCard}>
              <Icon color={colors.error} name="wifi-off" size={30} />
              <Text style={styles.stateTitle}>Menu unavailable</Text>
              <Text style={styles.stateMessage}>
                Your menu could not be loaded. Try again without losing existing screen filters.
              </Text>
              <Pressable
                accessibilityLabel="Retry Chef menu"
                accessibilityRole="button"
                disabled={menu.isRefreshing}
                onPress={refreshMenu}
                style={({pressed}) => [
                  styles.primaryButton,
                  (pressed || menu.isRefreshing) && styles.pressed,
                ]}>
                <Text style={styles.primaryButtonText}>
                  {menu.isRefreshing ? 'Refreshing…' : 'Try again'}
                </Text>
              </Pressable>
            </View>
          ) : menu.items.length === 0 ? (
            <View style={styles.stateCard}>
              <Icon color={colors.flameRed} name="chef" size={32} />
              <Text style={styles.stateTitle}>No menu items yet</Text>
              <Text style={styles.stateMessage}>
                New items will appear here after they are created for this kitchen.
              </Text>
            </View>
          ) : (
            <View style={styles.stateCard}>
              <Icon color={colors.textSecondary} name="search" size={30} />
              <Text style={styles.stateTitle}>No matching items</Text>
              <Text style={styles.stateMessage}>
                Change the search, category, or status filter to see more of your menu.
              </Text>
              {hasFilters ? (
                <Pressable
                  accessibilityLabel="Clear menu filters"
                  accessibilityRole="button"
                  onPress={clearFilters}
                  style={({pressed}) => [styles.secondaryButton, pressed && styles.pressed]}>
                  <Text style={styles.secondaryButtonText}>Clear filters</Text>
                </Pressable>
              ) : null}
            </View>
          )
        }
        ListFooterComponent={
          menu.items.length > 0 && !initialError ? (
            <View style={styles.educationBanner}>
              <Icon color={colors.flameRed} name="shield" size={22} />
              <View style={styles.educationCopy}>
                <Text style={styles.educationTitle}>Customer visibility</Text>
                <Text style={styles.educationMessage}>
                  An item is customer-live only when its backend status is Active and availability is on. Draft and inactive items remain off the customer catalog.
                </Text>
              </View>
            </View>
          ) : null
        }
        ListHeaderComponent={listHeader}
        maxToRenderPerBatch={8}
        refreshControl={
          <RefreshControl
            colors={[colors.flameRed]}
            onRefresh={refreshMenu}
            refreshing={menu.isRefreshing && !initialLoading}
            tintColor={colors.flameRed}
          />
        }
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
        windowSize={7}
      />

      <Modal
        animationType="fade"
        onRequestClose={() => setFilterVisible(false)}
        transparent
        visible={filterVisible}>
        <Pressable
          accessibilityLabel="Close menu filters"
          accessibilityRole="button"
          onPress={() => setFilterVisible(false)}
          style={styles.modalBackdrop}>
          <View style={styles.filterPanel}>
            <Text accessibilityRole="header" style={styles.filterTitle}>
              Filter by status
            </Text>
            <Text style={styles.filterSubtitle}>
              Status filters apply to your currently loaded menu.
            </Text>
            {CHEF_MENU_STATUS_FILTERS.map(filter => {
              const selected = filter === statusFilter;
              return (
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{checked: selected}}
                  key={filter}
                  onPress={() => {
                    setStatusFilter(filter);
                    setFilterVisible(false);
                  }}
                  style={({pressed}) => [styles.filterRow, pressed && styles.pressed]}>
                  <Text style={styles.filterRowText}>{STATUS_FILTER_LABELS[filter]}</Text>
                  <View style={[styles.radioOuter, selected && styles.radioOuterSelected]}>
                    {selected ? <View style={styles.radioInner} /> : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {flex: 1, backgroundColor: colors.surfaceMuted},
  listContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xxxl,
  },
  headerContent: {paddingTop: spacing.lg},
  titleBlock: {marginBottom: spacing.md},
  title: {
    color: colors.espressoBrown,
    fontSize: typography.hero,
    fontWeight: fontWeight.bold,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: typography.body,
    marginTop: spacing.xxs,
  },
  feedbackBanner: {
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
    padding: spacing.sm,
  },
  feedbackSuccess: {backgroundColor: colors.successSoft, borderColor: colors.success},
  feedbackError: {backgroundColor: colors.errorSoft, borderColor: colors.error},
  feedbackCopy: {flex: 1},
  feedbackTitle: {
    color: colors.textPrimary,
    fontSize: typography.small,
    fontWeight: fontWeight.bold,
  },
  feedbackMessage: {
    color: colors.textSecondary,
    fontSize: typography.tiny,
    marginTop: spacing.xxs,
  },
  dismissButton: {minHeight: touchTarget.minimum, justifyContent: 'center'},
  dismissText: {color: colors.flameRed, fontSize: typography.small, fontWeight: fontWeight.semibold},
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
  searchRow: {flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm},
  searchBox: {
    alignItems: 'center',
    backgroundColor: colors.white,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    minHeight: touchTarget.comfortable,
    paddingHorizontal: spacing.sm,
  },
  searchInput: {color: colors.textPrimary, flex: 1, fontSize: typography.body, paddingHorizontal: spacing.xs},
  filterButton: {
    alignItems: 'center',
    backgroundColor: colors.white,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: touchTarget.comfortable,
    paddingHorizontal: spacing.md,
  },
  filterButtonText: {color: colors.espressoBrown, fontSize: typography.body, fontWeight: fontWeight.semibold},
  categoryRow: {gap: spacing.xs, paddingBottom: spacing.md},
  categoryChip: {
    backgroundColor: colors.white,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: touchTarget.minimum,
    paddingHorizontal: spacing.md,
  },
  categoryChipSelected: {backgroundColor: colors.flameRed, borderColor: colors.flameRed},
  categoryChipText: {color: colors.textPrimary, fontSize: typography.small, fontWeight: fontWeight.semibold},
  categoryChipTextSelected: {color: colors.white},
  resultsHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  resultsTitle: {color: colors.espressoBrown, fontSize: typography.heading, fontWeight: fontWeight.bold},
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
  itemImage: {borderRadius: radius.md, height: 92, width: 92},
  imageFallback: {
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: radius.md,
    height: 92,
    justifyContent: 'center',
    width: 92,
  },
  cardCopy: {flex: 1, minWidth: 0},
  cardTitleRow: {alignItems: 'flex-start', flexDirection: 'row', gap: spacing.xs},
  itemName: {color: colors.textPrimary, flex: 1, fontSize: typography.body, fontWeight: fontWeight.bold},
  itemMeta: {color: colors.textSecondary, fontSize: typography.small, marginTop: spacing.xxs, textTransform: 'capitalize'},
  itemDescription: {color: colors.textSecondary, fontSize: typography.small, marginTop: spacing.xs},
  priceRow: {alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm},
  price: {color: colors.flameRed, fontSize: typography.body, fontWeight: fontWeight.bold},
  statusBadge: {borderRadius: radius.pill, paddingHorizontal: spacing.xs, paddingVertical: spacing.xxs},
  statusText: {fontSize: typography.tiny, fontWeight: fontWeight.bold},
  statusAvailable: {backgroundColor: colors.successSoft},
  statusAvailableText: {color: colors.success},
  statusUnavailable: {backgroundColor: colors.warningSoft},
  statusUnavailableText: {color: colors.warning},
  statusDraft: {backgroundColor: colors.infoSoft},
  statusDraftText: {color: colors.info},
  statusInactive: {backgroundColor: colors.muted},
  statusInactiveText: {color: colors.textSecondary},
  availabilityRow: {
    alignItems: 'center',
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 72,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  availabilityCopy: {flex: 1},
  availabilityTitle: {color: colors.textPrimary, fontSize: typography.small, fontWeight: fontWeight.semibold},
  availabilityHint: {color: colors.textSecondary, fontSize: typography.tiny, marginTop: spacing.xxs},
  skeletonList: {gap: spacing.md},
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
  stateTitle: {color: colors.textPrimary, fontSize: typography.heading, fontWeight: fontWeight.bold, marginTop: spacing.sm, textAlign: 'center'},
  stateMessage: {color: colors.textSecondary, fontSize: typography.small, marginTop: spacing.xs, textAlign: 'center'},
  primaryButton: {alignItems: 'center', backgroundColor: colors.flameRed, borderRadius: radius.pill, justifyContent: 'center', marginTop: spacing.md, minHeight: touchTarget.minimum, paddingHorizontal: spacing.lg},
  primaryButtonText: {color: colors.white, fontSize: typography.body, fontWeight: fontWeight.semibold},
  secondaryButton: {alignItems: 'center', borderColor: colors.flameRed, borderRadius: radius.pill, borderWidth: 1, justifyContent: 'center', marginTop: spacing.md, minHeight: touchTarget.minimum, paddingHorizontal: spacing.lg},
  secondaryButtonText: {color: colors.flameRed, fontSize: typography.body, fontWeight: fontWeight.semibold},
  educationBanner: {backgroundColor: colors.white, borderRadius: radius.md, flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs, padding: spacing.md},
  educationCopy: {flex: 1},
  educationTitle: {color: colors.espressoBrown, fontSize: typography.small, fontWeight: fontWeight.bold},
  educationMessage: {color: colors.textSecondary, fontSize: typography.small, marginTop: spacing.xxs},
  pressed: {opacity: 0.65},
  modalBackdrop: {backgroundColor: 'rgba(38,26,21,0.32)', flex: 1, justifyContent: 'flex-end'},
  filterPanel: {backgroundColor: colors.white, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg},
  filterTitle: {color: colors.espressoBrown, fontSize: typography.heading, fontWeight: fontWeight.bold},
  filterSubtitle: {color: colors.textSecondary, fontSize: typography.small, marginBottom: spacing.sm, marginTop: spacing.xs},
  filterRow: {alignItems: 'center', borderTopColor: colors.border, borderTopWidth: 1, flexDirection: 'row', justifyContent: 'space-between', minHeight: touchTarget.comfortable},
  filterRowText: {color: colors.textPrimary, fontSize: typography.body},
  radioOuter: {alignItems: 'center', borderColor: colors.borderStrong, borderRadius: radius.pill, borderWidth: 2, height: 22, justifyContent: 'center', width: 22},
  radioOuterSelected: {borderColor: colors.flameRed},
  radioInner: {backgroundColor: colors.flameRed, borderRadius: radius.pill, height: 10, width: 10},
});
