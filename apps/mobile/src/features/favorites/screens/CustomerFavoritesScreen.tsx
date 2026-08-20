import React from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MaterialDesignIcons from '@react-native-vector-icons/material-design-icons';
import {useNavigation} from '@react-navigation/native';
import type {BottomTabNavigationProp} from '@react-navigation/bottom-tabs';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {useCustomerBottomNavScroll} from '../../../app/navigation/CustomerBottomNavController';
import type {
  CustomerProfileStackParamList,
  CustomerTabParamList,
} from '../../../app/navigation/types';
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
import {TerminalState} from '../../../shared/components/LifecycleStates';
import {ScreenShell} from '../../../shared/components/ScreenShell';
import {CustomerHeader} from '../../customerShell/components/CustomerHeader';
import {CustomerLocationSelector} from '../../customerShell/components/CustomerLocationSelector';
import type {FavoriteHomeCard} from '../api/favoriteHomeFeedApi';
import type {FavoriteEntityType} from '../api/homeFavoritesApi';
import type {SavedCatalogItem} from '../api/savedCatalogApi';
import {
  favoriteHomeDisplayName,
  favoriteHomeStateCopy,
  isCookingToday,
  type FavoriteHomeTone,
} from '../presentation/favoriteHomePresentation';
import {
  availabilityCopyForItem,
  canOpenSavedDish,
  savedDishDisplayName,
  savedKitchenDisplayName,
  type SavedAvailabilityTone,
} from '../presentation/savedCatalogPresentation';
import {
  useCustomerFavoritesQuery,
  useCustomerFavoritesQueueState,
  useToggleCustomerFavorite,
} from '../query/customerFavoritesQueries';
import {
  useFavoriteChefsQuery,
  useFavoriteHomeFeedQuery,
  useFavoriteKitchensQuery,
  useFavoriteWatchesQuery,
  useToggleFavoriteChef,
  useToggleFavoriteKitchen,
  useToggleFavoriteWatch,
} from '../query/homeFavoriteQueries';
import {useSavedCatalogQuery} from '../query/savedCatalogQueries';

type FavoritesNavigation = NativeStackNavigationProp<
  CustomerProfileStackParamList,
  'CustomerFavorites'
>;
type CustomerTabsNavigation = BottomTabNavigationProp<CustomerTabParamList>;
type SavedTab = 'DISHES' | 'HOME_CHEFS' | 'KITCHENS';

type Tone = SavedAvailabilityTone | FavoriteHomeTone;

function FilledIcon({
  name,
  size = 22,
  color = colors.espressoBrown,
}: {
  name: string;
  size?: number;
  color?: string;
}) {
  return <MaterialDesignIcons name={name as never} size={size} color={color} />;
}

function formatPrice(amount: number | null, currency: string | null): string | null {
  if (amount === null || !currency) return null;
  const value = Number.isInteger(amount) ? amount.toFixed(0) : amount.toFixed(2);
  return currency === 'INR' ? `₹${value}` : `${currency} ${value}`;
}

function foodTypeCopy(foodType: string | null): string | null {
  switch (foodType) {
    case 'NON_VEG':
      return 'Non-veg';
    case 'EGG':
      return 'Egg';
    case 'VEG':
      return 'Veg';
    default:
      return null;
  }
}

function toneStyles(tone: Tone) {
  if (tone === 'positive') {
    return {container: styles.availabilityPositive, text: styles.availabilityPositiveText};
  }
  if (tone === 'attention') {
    return {container: styles.availabilityAttention, text: styles.availabilityAttentionText};
  }
  return {container: styles.availabilityMuted, text: styles.availabilityMutedText};
}

function sectionRows(
  rows: readonly SavedCatalogItem[],
  states: readonly SavedCatalogItem['availabilityState'][],
): SavedCatalogItem[] {
  const stateSet = new Set(states);
  return rows.filter(row => stateSet.has(row.availabilityState));
}

function SavedTabs({active, onChange}: {active: SavedTab; onChange: (tab: SavedTab) => void}) {
  const tabs: Array<{key: SavedTab; label: string; icon: string}> = [
    {key: 'DISHES', label: 'Dishes', icon: 'food-outline'},
    {key: 'HOME_CHEFS', label: 'Home Chefs', icon: 'chef-hat'},
    {key: 'KITCHENS', label: 'Kitchens', icon: 'home-heart'},
  ];
  return (
    <View accessibilityRole="tablist" style={styles.tabs}>
      {tabs.map(tab => {
        const selected = active === tab.key;
        return (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{selected}}
            key={tab.key}
            onPress={() => onChange(tab.key)}
            style={({pressed}) => [
              styles.tabButton,
              selected && styles.tabButtonSelected,
              pressed && styles.pressed,
            ]}>
            <FilledIcon
              name={tab.icon}
              size={18}
              color={selected ? colors.flameRedAccessible : colors.textSecondary}
            />
            <Text style={[styles.tabLabel, selected && styles.tabLabelSelected]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function CustomerFavoritesScreen() {
  const navigation = useNavigation<FavoritesNavigation>();
  const bottomNavScroll = useCustomerBottomNavScroll();
  const favorites = useCustomerFavoritesQuery();
  const queueState = useCustomerFavoritesQueueState();
  const toggleFavorite = useToggleCustomerFavorite();
  const savedCatalog = useSavedCatalogQuery(favorites.data, favorites.isSuccess);
  const favoriteChefs = useFavoriteChefsQuery();
  const favoriteKitchens = useFavoriteKitchensQuery();
  const chefWatches = useFavoriteWatchesQuery('CHEF');
  const kitchenWatches = useFavoriteWatchesQuery('KITCHEN');
  const toggleChef = useToggleFavoriteChef();
  const toggleKitchen = useToggleFavoriteKitchen();
  const toggleChefWatch = useToggleFavoriteWatch('CHEF');
  const toggleKitchenWatch = useToggleFavoriteWatch('KITCHEN');
  const homeFeed = useFavoriteHomeFeedQuery(
    favoriteChefs.items.map(item => item.chefIdentityId),
    favoriteKitchens.items.map(item => item.kitchenId),
  );
  const [activeTab, setActiveTab] = React.useState<SavedTab>('DISHES');
  const [locationSelectorVisible, setLocationSelectorVisible] = React.useState(false);

  const browseMeals = React.useCallback(() => {
    const tabs = navigation.getParent<CustomerTabsNavigation>();
    if (tabs) {
      tabs.navigate('Home');
      return;
    }
    navigation.goBack();
  }, [navigation]);

  const refresh = React.useCallback(() => {
    Promise.all([
      favorites.refetch(),
      savedCatalog.menuItemIds.length > 0 ? savedCatalog.refetch() : Promise.resolve(undefined),
      favoriteChefs.refetch(),
      favoriteKitchens.refetch(),
      chefWatches.refetch(),
      kitchenWatches.refetch(),
      homeFeed.refetch(),
    ]).catch(() => undefined);
  }, [
    chefWatches,
    favoriteChefs,
    favoriteKitchens,
    favorites,
    homeFeed,
    kitchenWatches,
    savedCatalog,
  ]);

  const favoriteRows = favorites.data ?? [];
  const resolvedRows = savedCatalog.data ?? [];
  const cookingToday = sectionRows(resolvedRows, ['AVAILABLE_NOW', 'COOKING_LATER_TODAY']);
  const savedForLater = resolvedRows.filter(
    row => row.availabilityState !== 'AVAILABLE_NOW' && row.availabilityState !== 'COOKING_LATER_TODAY',
  );

  const favoriteChefIds = React.useMemo(
    () => new Set(favoriteChefs.items.map(item => item.chefIdentityId)),
    [favoriteChefs.items],
  );
  const favoriteKitchenIds = React.useMemo(
    () => new Set(favoriteKitchens.items.map(item => item.kitchenId)),
    [favoriteKitchens.items],
  );
  const homeFeedByKey = React.useMemo(() => {
    const map = new Map<string, FavoriteHomeCard>();
    (homeFeed.data ?? []).forEach(item => map.set(`${item.requestedType}:${item.requestedId}`, item));
    return map;
  }, [homeFeed.data]);

  const chefWatchIds = React.useMemo(
    () =>
      new Set(
        (chefWatches.data ?? [])
          .filter(item => item.channel === 'IN_APP' && item.enabled)
          .map(item => item.entityId),
      ),
    [chefWatches.data],
  );
  const kitchenWatchIds = React.useMemo(
    () =>
      new Set(
        (kitchenWatches.data ?? [])
          .filter(item => item.channel === 'IN_APP' && item.enabled)
          .map(item => item.entityId),
      ),
    [kitchenWatches.data],
  );

  const renderDishCard = React.useCallback(
    (dish: SavedCatalogItem) => {
      const queued = queueState.pendingMenuItemIds.includes(dish.menuItemId);
      const displayName = savedDishDisplayName(dish);
      const kitchenName = savedKitchenDisplayName(dish);
      const availability = availabilityCopyForItem(dish);
      const availabilityStyle = toneStyles(availability.tone);
      const price = formatPrice(dish.price, dish.currency);
      const foodType = foodTypeCopy(dish.foodType);
      const meta = [dish.category, foodType].filter(Boolean).join(' · ');
      const canOpen = canOpenSavedDish(dish);
      const kitchenSaved = dish.kitchenId ? favoriteKitchenIds.has(dish.kitchenId) : false;

      return (
        <Pressable
          accessibilityHint={canOpen ? 'Opens current dish details.' : 'This saved item cannot be opened right now.'}
          accessibilityRole={canOpen ? 'button' : undefined}
          disabled={!canOpen}
          key={dish.menuItemId}
          onPress={
            canOpen
              ? () => navigation.navigate('CustomerDishDetail', {menuItemId: dish.menuItemId})
              : undefined
          }
          style={({pressed}) => [
            styles.dishCard,
            !canOpen && styles.dishCardUnavailable,
            pressed && styles.pressed,
          ]}>
          {dish.primaryImageUrl ? (
            <Image
              accessibilityIgnoresInvertColors
              source={{uri: dish.primaryImageUrl}}
              resizeMode="cover"
              style={styles.dishImage}
            />
          ) : (
            <View style={styles.dishImageFallback}>
              <FilledIcon name={dish.found ? 'food' : 'bookmark-outline'} size={30} color={colors.flameRed} />
            </View>
          )}
          <View style={styles.dishCopy}>
            <Text numberOfLines={2} style={styles.dishName}>{displayName}</Text>
            <Text numberOfLines={1} style={styles.kitchenName}>{kitchenName}</Text>
            {meta ? <Text style={styles.metaText}>{meta}</Text> : null}
            {price ? <Text style={styles.priceText}>{price}</Text> : null}
            <View
              accessibilityLabel={`${availability.title}. ${availability.detail ?? ''}`.trim()}
              style={[styles.availabilityBadge, availabilityStyle.container]}>
              <Text style={[styles.availabilityTitle, availabilityStyle.text]}>{availability.title}</Text>
            </View>
            {availability.detail ? <Text style={styles.availabilityDetail}>{availability.detail}</Text> : null}
            {queued ? <Text style={styles.queuedText}>Waiting to sync</Text> : null}
            {dish.kitchenId ? (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{selected: kitchenSaved, busy: toggleKitchen.isPending}}
                disabled={toggleKitchen.isPending}
                onPress={event => {
                  event.stopPropagation();
                  toggleKitchen.mutate({kitchenId: dish.kitchenId!, favorite: kitchenSaved});
                }}
                style={({pressed}) => [styles.inlineAction, pressed && styles.pressed]}>
                <FilledIcon
                  name={kitchenSaved ? 'home-heart' : 'home-heart-outline'}
                  size={18}
                  color={colors.flameRedAccessible}
                />
                <Text style={styles.inlineActionText}>{kitchenSaved ? 'Kitchen saved' : 'Save kitchen'}</Text>
              </Pressable>
            ) : null}
          </View>
          <Pressable
            accessibilityLabel={`Remove ${displayName} from favorites`}
            accessibilityRole="button"
            accessibilityState={{busy: toggleFavorite.isPending || queued}}
            disabled={toggleFavorite.isPending}
            hitSlop={spacing.xs}
            onPress={event => {
              event.stopPropagation();
              toggleFavorite.mutate({menuItemId: dish.menuItemId, favorite: true});
            }}
            style={({pressed}) => [styles.heartButton, pressed && styles.pressed]}>
            <FilledIcon name="heart" size={24} color={colors.flameRed} />
          </Pressable>
        </Pressable>
      );
    },
    [favoriteKitchenIds, navigation, queueState.pendingMenuItemIds, toggleFavorite, toggleKitchen],
  );

  const renderHomeCard = React.useCallback(
    (card: FavoriteHomeCard, relationType: 'CHEF' | 'KITCHEN') => {
      const state = favoriteHomeStateCopy(card);
      const stateStyle = toneStyles(state.tone);
      const displayName = favoriteHomeDisplayName(card);
      const relationId = card.requestedId;
      const watched = relationType === 'CHEF'
        ? chefWatchIds.has(relationId)
        : kitchenWatchIds.has(relationId);
      const watchMutation = relationType === 'CHEF' ? toggleChefWatch : toggleKitchenWatch;
      const removeMutation = relationType === 'CHEF' ? toggleChef : toggleKitchen;
      const relationBusy = removeMutation.isPending;
      const canOpenKitchen = card.exists && Boolean(card.kitchenId);
      const area = [card.areaName, card.city].filter(Boolean).join(', ');

      return (
        <View key={`${relationType}:${relationId}`} style={styles.homeCard}>
          <View style={styles.homeCardHeader}>
            <View style={styles.homeIconBadge}>
              <FilledIcon
                name={relationType === 'CHEF' ? 'chef-hat' : 'home-heart'}
                size={24}
                color={colors.flameRedAccessible}
              />
            </View>
            <View style={styles.homeCardTitleCopy}>
              <Text numberOfLines={2} style={styles.homeCardTitle}>{displayName}</Text>
              {area ? <Text numberOfLines={1} style={styles.homeCardArea}>{area}</Text> : null}
            </View>
            <Pressable
              accessibilityLabel={`Remove ${displayName} from saved ${relationType === 'CHEF' ? 'home chefs' : 'kitchens'}`}
              accessibilityRole="button"
              accessibilityState={{busy: relationBusy}}
              disabled={relationBusy}
              onPress={() => {
                if (relationType === 'CHEF') {
                  toggleChef.mutate({chefIdentityId: relationId, favorite: true});
                } else {
                  toggleKitchen.mutate({kitchenId: relationId, favorite: true});
                }
              }}
              style={({pressed}) => [styles.heartButton, pressed && styles.pressed]}>
              <FilledIcon name="heart" size={22} color={colors.flameRed} />
            </Pressable>
          </View>

          <View style={[styles.availabilityBadge, stateStyle.container]}>
            <Text style={[styles.availabilityTitle, stateStyle.text]}>{state.title}</Text>
          </View>
          {state.detail ? <Text style={styles.availabilityDetail}>{state.detail}</Text> : null}

          {card.exists && card.menuPreview.length > 0 ? (
            <View style={styles.menuPreviewList}>
              {card.menuPreview.map(item => (
                <Pressable
                  accessibilityRole="button"
                  key={item.menuItemId}
                  onPress={() => navigation.navigate('CustomerDishDetail', {menuItemId: item.menuItemId})}
                  style={({pressed}) => [styles.menuPreviewRow, pressed && styles.pressed]}>
                  <View style={styles.previewIcon}>
                    <FilledIcon name="food-outline" size={17} color={colors.espressoBrown} />
                  </View>
                  <Text numberOfLines={1} style={styles.menuPreviewName}>{item.itemName}</Text>
                  <Text style={styles.menuPreviewPrice}>{formatPrice(item.price, item.currency)}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          <View style={styles.cardActions}>
            {canOpenKitchen ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => navigation.navigate('CustomerKitchenDishes', {kitchenId: card.kitchenId!})}
                style={({pressed}) => [styles.primarySmallAction, pressed && styles.pressed]}>
                <Text style={styles.primarySmallActionText}>View today's menu</Text>
              </Pressable>
            ) : null}
            <Pressable
              accessibilityLabel={watched ? 'Turn off in-app cooking alerts' : 'Notify me in the Craves app when this favorite is cooking'}
              accessibilityRole="button"
              accessibilityState={{selected: watched, busy: watchMutation.isPending}}
              disabled={watchMutation.isPending}
              onPress={() => watchMutation.mutate({entityId: relationId, channel: 'IN_APP', enabled: !watched})}
              style={({pressed}) => [styles.secondarySmallAction, pressed && styles.pressed]}>
              <FilledIcon name={watched ? 'bell-check-outline' : 'bell-plus-outline'} size={17} color={colors.flameRedAccessible} />
              <Text style={styles.secondarySmallActionText}>{watched ? 'In-app alerts on' : 'Notify in app'}</Text>
            </Pressable>
          </View>

          {card.exists && relationType === 'CHEF' && card.kitchenId && !favoriteKitchenIds.has(card.kitchenId) ? (
            <Pressable
              accessibilityRole="button"
              disabled={toggleKitchen.isPending}
              onPress={() => toggleKitchen.mutate({kitchenId: card.kitchenId!, favorite: false})}
              style={({pressed}) => [styles.relationshipCrossAction, pressed && styles.pressed]}>
              <Text style={styles.relationshipCrossActionText}>Also save this kitchen</Text>
            </Pressable>
          ) : null}
          {card.exists && relationType === 'KITCHEN' && card.chefIdentityId && !favoriteChefIds.has(card.chefIdentityId) ? (
            <Pressable
              accessibilityRole="button"
              disabled={toggleChef.isPending}
              onPress={() => toggleChef.mutate({chefIdentityId: card.chefIdentityId!, favorite: false})}
              style={({pressed}) => [styles.relationshipCrossAction, pressed && styles.pressed]}>
              <Text style={styles.relationshipCrossActionText}>Follow this home chef</Text>
            </Pressable>
          ) : null}
        </View>
      );
    },
    [
      chefWatchIds,
      favoriteChefIds,
      favoriteKitchenIds,
      kitchenWatchIds,
      navigation,
      toggleChef,
      toggleChefWatch,
      toggleKitchen,
      toggleKitchenWatch,
    ],
  );

  const renderHomeRelationshipTab = (relationType: 'CHEF' | 'KITCHEN') => {
    const relationQuery = relationType === 'CHEF' ? favoriteChefs : favoriteKitchens;
    const relations = relationType === 'CHEF'
      ? favoriteChefs.items.map(item => ({id: item.chefIdentityId}))
      : favoriteKitchens.items.map(item => ({id: item.kitchenId}));
    const cards = relations
      .map(item => homeFeedByKey.get(`${relationType}:${item.id}`))
      .filter((item): item is FavoriteHomeCard => Boolean(item));
    const cooking = cards.filter(isCookingToday);
    const label = relationType === 'CHEF' ? 'home chefs' : 'kitchens';

    if (relationQuery.isPending) {
      return (
        <View accessibilityRole="progressbar" style={styles.loadingCard}>
          <ActivityIndicator color={colors.flameRed} />
          <Text style={styles.loadingText}>Loading saved {label}…</Text>
        </View>
      );
    }
    if (relationQuery.isError) {
      return (
        <TerminalState
          title={`Saved ${label} could not be loaded`}
          description="Your relationships are kept on your Craves account. Check your connection and try again."
          actionLabel="Try again"
          onAction={() => relationQuery.refetch().catch(() => undefined)}
        />
      );
    }
    if (relations.length === 0) {
      return (
        <TerminalState
          title={relationType === 'CHEF' ? 'No favorite home chefs yet' : 'No favorite kitchens yet'}
          description={
            relationType === 'CHEF'
              ? 'Save a kitchen from a favorite dish, then follow the home chef from its card.'
              : 'Tap Save kitchen on a dish you trust to remember the household behind it.'
          }
          actionLabel="Browse meals"
          onAction={browseMeals}
        />
      );
    }
    if (homeFeed.isPending) {
      return (
        <View accessibilityRole="progressbar" style={styles.loadingCard}>
          <ActivityIndicator color={colors.flameRed} />
          <Text style={styles.loadingText}>Checking what your favorites are cooking…</Text>
        </View>
      );
    }
    if (homeFeed.isError) {
      return (
        <TerminalState
          title="Your relationships are safe"
          description="We could not refresh current kitchen schedules. Your saved home chefs and kitchens were not removed."
          actionLabel="Check again"
          onAction={() => homeFeed.refetch().catch(() => undefined)}
        />
      );
    }

    return (
      <>
        {cooking.length > 0 ? (
          <View style={styles.todaySection}>
            <View style={styles.todayHeader}>
              <View style={styles.todayIcon}>
                <FilledIcon name="pot-steam-outline" size={22} color={colors.successText} />
              </View>
              <View style={styles.todayHeaderCopy}>
                <Text accessibilityRole="header" style={styles.todayTitle}>Your favorites are cooking today</Text>
                <Text style={styles.todaySubtitle}>
                  Based on current kitchen schedule and active catalog data—not popularity or marketing guesses.
                </Text>
              </View>
            </View>
            {cooking.map(card => renderHomeCard(card, relationType))}
          </View>
        ) : (
          <View style={styles.calmStatusCard}>
            <FilledIcon name="weather-sunset" size={22} color={colors.textSecondary} />
            <View style={styles.syncCopy}>
              <Text style={styles.calmStatusTitle}>None of these favorites are cooking today yet</Text>
              <Text style={styles.calmStatusText}>They stay saved. Current schedule truth will refresh here.</Text>
            </View>
          </View>
        )}

        <View style={styles.savedSection}>
          <View style={styles.sectionHeader}>
            <Text accessibilityRole="header" style={styles.sectionTitle}>
              {relationType === 'CHEF' ? 'Your home chefs' : 'Your kitchens'}
            </Text>
            <Text style={styles.countText}>{relations.length}</Text>
          </View>
          {cards.filter(card => !isCookingToday(card)).map(card => renderHomeCard(card, relationType))}
        </View>

        {relationQuery.hasNextPage ? (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{busy: relationQuery.isFetchingNextPage}}
            disabled={relationQuery.isFetchingNextPage}
            onPress={() => relationQuery.fetchNextPage().catch(() => undefined)}
            style={({pressed}) => [styles.loadMoreButton, pressed && styles.pressed]}>
            {relationQuery.isFetchingNextPage ? <ActivityIndicator size="small" color={colors.flameRedAccessible} /> : null}
            <Text style={styles.loadMoreText}>Load more saved {label}</Text>
          </Pressable>
        ) : null}

        <Text style={styles.transparencyCopy}>
          “Cooking today” describes the kitchen schedule and active catalog only. Delivery serviceability is revalidated in the ordering flow. In-app Notify preferences are explicit and do not turn on push permission automatically.
        </Text>
      </>
    );
  };

  const dishTab = favorites.sessionRequired ? (
    <TerminalState
      title="Sign in required"
      description="Saved is private to your customer account."
      actionLabel="Go back"
      onAction={() => navigation.goBack()}
    />
  ) : favorites.isPending ? (
    <View accessibilityRole="progressbar" style={styles.loadingCard}>
      <ActivityIndicator color={colors.flameRed} />
      <Text style={styles.loadingText}>Loading saved dishes…</Text>
    </View>
  ) : favorites.isError ? (
    <TerminalState
      title="Favorites could not be loaded"
      description="Check your connection and try again."
      actionLabel="Try again"
      onAction={refresh}
    />
  ) : favoriteRows.length === 0 ? (
    <TerminalState
      title="No favorite dishes yet"
      description="Tap the heart on any dish to save it here."
      actionLabel="Browse meals"
      onAction={browseMeals}
    />
  ) : savedCatalog.isPending ? (
    <View accessibilityRole="progressbar" style={styles.loadingCard}>
      <ActivityIndicator color={colors.flameRed} />
      <Text style={styles.loadingText}>Checking what your favorites are cooking…</Text>
    </View>
  ) : savedCatalog.isError ? (
    <TerminalState
      title="Your saves are safe"
      description="We could not refresh current dish and kitchen availability. Your saved items have not been removed."
      actionLabel="Check again"
      onAction={() => savedCatalog.refetch().catch(() => undefined)}
    />
  ) : (
    <>
      {cookingToday.length > 0 ? (
        <View style={styles.todaySection}>
          <View style={styles.todayHeader}>
            <View style={styles.todayIcon}>
              <FilledIcon name="pot-steam-outline" size={22} color={colors.successText} />
            </View>
            <View style={styles.todayHeaderCopy}>
              <Text accessibilityRole="header" style={styles.todayTitle}>Your favorites are cooking today</Text>
              <Text style={styles.todaySubtitle}>Based only on the kitchen's current schedule and catalog availability.</Text>
            </View>
          </View>
          {cookingToday.map(renderDishCard)}
        </View>
      ) : (
        <View style={styles.calmStatusCard}>
          <FilledIcon name="weather-sunset" size={22} color={colors.textSecondary} />
          <View style={styles.syncCopy}>
            <Text style={styles.calmStatusTitle}>Nothing saved is cooking today yet</Text>
            <Text style={styles.calmStatusText}>Your dishes stay saved. Pull to refresh when kitchen schedules change.</Text>
          </View>
        </View>
      )}
      {savedForLater.length > 0 ? (
        <View style={styles.savedSection}>
          <View style={styles.sectionHeader}>
            <Text accessibilityRole="header" style={styles.sectionTitle}>Saved for later</Text>
            <Text style={styles.countText}>{savedForLater.length}</Text>
          </View>
          {savedForLater.map(renderDishCard)}
        </View>
      ) : null}
      <Text style={styles.transparencyCopy}>
        Availability is checked from Craves catalog and kitchen schedule data. We do not label a dish “sold out” unless inventory data proves it.
      </Text>
    </>
  );

  return (
    <ScreenShell edges={['top']} keyboardAvoiding={false} testID="customer-favorites">
      <View style={styles.root}>
        <CustomerHeader
          title="Saved"
          onPressLocation={() => setLocationSelectorVisible(true)}
          onPressNotifications={() => navigation.navigate('CustomerNotifications')}
        />
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          onScroll={bottomNavScroll.onScroll}
          refreshControl={
            favorites.sessionRequired ? undefined : (
              <RefreshControl
                refreshing={
                  favorites.isRefetching ||
                  savedCatalog.isRefetching ||
                  favoriteChefs.isRefetching ||
                  favoriteKitchens.isRefetching ||
                  homeFeed.isRefetching
                }
                onRefresh={refresh}
                colors={[colors.flameRed]}
                tintColor={colors.flameRed}
              />
            )
          }
          scrollEventThrottle={bottomNavScroll.scrollEventThrottle}
          showsVerticalScrollIndicator={false}>
          <View style={styles.content}>
            <View style={styles.introCard}>
              <View style={styles.iconBadge}>
                <FilledIcon name="heart" size={28} color={colors.flameRed} />
              </View>
              <View style={styles.introCopy}>
                <Text accessibilityRole="header" style={styles.title}>Saved & familiar</Text>
                <Text style={styles.subtitle}>
                  Remember dishes, home chefs and kitchens you trust—and see what they are actually cooking today.
                </Text>
              </View>
            </View>

            <SavedTabs active={activeTab} onChange={setActiveTab} />

            {queueState.hasPendingChanges ? (
              <View accessibilityLiveRegion="polite" style={styles.syncCard}>
                <FilledIcon name="cloud-sync-outline" size={20} color={colors.flameRedAccessible} />
                <View style={styles.syncCopy}>
                  <Text style={styles.syncTitle}>Saving when online</Text>
                  <Text style={styles.syncText}>
                    {queueState.pendingCount === 1
                      ? '1 dish favorite change is waiting to sync.'
                      : `${queueState.pendingCount} dish favorite changes are waiting to sync.`}
                  </Text>
                </View>
              </View>
            ) : null}

            {activeTab === 'DISHES'
              ? dishTab
              : activeTab === 'HOME_CHEFS'
                ? renderHomeRelationshipTab('CHEF')
                : renderHomeRelationshipTab('KITCHEN')}
          </View>
        </ScrollView>
        <CustomerLocationSelector visible={locationSelectorVisible} onClose={() => setLocationSelectorVisible(false)} />
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.white},
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxl,
    backgroundColor: colors.white,
  },
  content: {width: '100%', maxWidth: 640, alignSelf: 'center', gap: spacing.md},
  introCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  iconBadge: {
    width: 54,
    height: 54,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.iconSurface,
  },
  introCopy: {minWidth: 0, flex: 1},
  title: {color: colors.espressoBrown, fontSize: typography.hero, fontWeight: fontWeight.bold},
  subtitle: {marginTop: spacing.xxs, color: colors.textSecondary, fontSize: typography.small},
  tabs: {
    flexDirection: 'row',
    gap: spacing.xs,
    padding: spacing.xxs,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceMuted,
  },
  tabButton: {
    minHeight: touchTarget.minimum,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xxs,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.md,
  },
  tabButtonSelected: {backgroundColor: colors.white, ...elevation.card},
  tabLabel: {color: colors.textSecondary, fontSize: typography.tiny, fontWeight: fontWeight.semibold},
  tabLabelSelected: {color: colors.flameRedAccessible, fontWeight: fontWeight.bold},
  syncCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.iconSurface,
  },
  syncCopy: {minWidth: 0, flex: 1},
  syncTitle: {color: colors.espressoBrown, fontSize: typography.small, fontWeight: fontWeight.bold},
  syncText: {marginTop: spacing.xxs, color: colors.textSecondary, fontSize: typography.tiny},
  loadingCard: {minHeight: 220, alignItems: 'center', justifyContent: 'center', gap: spacing.sm},
  loadingText: {color: colors.textSecondary, fontSize: typography.small},
  todaySection: {gap: spacing.sm, padding: spacing.sm, borderRadius: radius.lg, backgroundColor: colors.successSoft},
  todayHeader: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.xs, paddingVertical: spacing.xs},
  todayIcon: {width: touchTarget.minimum, height: touchTarget.minimum, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white},
  todayHeaderCopy: {minWidth: 0, flex: 1},
  todayTitle: {color: colors.successText, fontSize: typography.heading, fontWeight: fontWeight.bold},
  todaySubtitle: {marginTop: spacing.xxs, color: colors.textSecondary, fontSize: typography.tiny},
  calmStatusCard: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, borderWidth: borderWidth.standard, borderColor: colors.border, backgroundColor: colors.surfaceMuted},
  calmStatusTitle: {color: colors.espressoBrown, fontSize: typography.small, fontWeight: fontWeight.bold},
  calmStatusText: {marginTop: spacing.xxs, color: colors.textSecondary, fontSize: typography.tiny},
  savedSection: {gap: spacing.sm},
  sectionHeader: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  sectionTitle: {color: colors.espressoBrown, fontSize: typography.heading, fontWeight: fontWeight.bold},
  countText: {color: colors.flameRedAccessible, fontSize: typography.small, fontWeight: fontWeight.bold},
  dishCard: {minHeight: 124, flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, padding: spacing.sm, borderRadius: radius.lg, borderWidth: borderWidth.standard, borderColor: colors.border, backgroundColor: colors.white, ...elevation.card},
  dishCardUnavailable: {elevation: 0, shadowOpacity: 0},
  dishImage: {width: 104, height: 104, borderRadius: radius.md, backgroundColor: colors.surfaceMuted},
  dishImageFallback: {width: 104, height: 104, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.iconSurface},
  dishCopy: {minWidth: 0, flex: 1},
  dishName: {color: colors.espressoBrown, fontSize: typography.body, fontWeight: fontWeight.bold},
  kitchenName: {marginTop: spacing.xxs, color: colors.textSecondary, fontSize: typography.small},
  metaText: {marginTop: spacing.xxs, color: colors.textSecondary, fontSize: typography.tiny},
  priceText: {marginTop: spacing.xs, color: colors.flameRedAccessible, fontSize: typography.body, fontWeight: fontWeight.bold},
  availabilityBadge: {alignSelf: 'flex-start', marginTop: spacing.xs, paddingHorizontal: spacing.sm, paddingVertical: spacing.xxs, borderRadius: radius.pill},
  availabilityPositive: {backgroundColor: colors.successSoft},
  availabilityPositiveText: {color: colors.successText},
  availabilityAttention: {backgroundColor: colors.warningSoft},
  availabilityAttentionText: {color: colors.warningText},
  availabilityMuted: {backgroundColor: colors.surfaceMuted},
  availabilityMutedText: {color: colors.textSecondary},
  availabilityTitle: {fontSize: typography.tiny, fontWeight: fontWeight.bold},
  availabilityDetail: {marginTop: spacing.xxs, color: colors.textSecondary, fontSize: typography.tiny},
  queuedText: {marginTop: spacing.xxs, color: colors.flameRedAccessible, fontSize: typography.tiny, fontWeight: fontWeight.bold},
  heartButton: {width: touchTarget.minimum, height: touchTarget.minimum, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, backgroundColor: colors.iconSurface},
  inlineAction: {alignSelf: 'flex-start', minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: spacing.xxs, marginTop: spacing.xs, paddingHorizontal: spacing.sm, borderRadius: radius.pill, backgroundColor: colors.iconSurface},
  inlineActionText: {color: colors.flameRedAccessible, fontSize: typography.tiny, fontWeight: fontWeight.bold},
  homeCard: {gap: spacing.xs, padding: spacing.md, borderRadius: radius.lg, borderWidth: borderWidth.standard, borderColor: colors.border, backgroundColor: colors.white, ...elevation.card},
  homeCardHeader: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm},
  homeIconBadge: {width: touchTarget.minimum, height: touchTarget.minimum, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.iconSurface},
  homeCardTitleCopy: {minWidth: 0, flex: 1},
  homeCardTitle: {color: colors.espressoBrown, fontSize: typography.body, fontWeight: fontWeight.bold},
  homeCardArea: {marginTop: spacing.xxs, color: colors.textSecondary, fontSize: typography.tiny},
  menuPreviewList: {gap: spacing.xxs, marginTop: spacing.xs},
  menuPreviewRow: {minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.xs, borderRadius: radius.sm, backgroundColor: colors.surfaceMuted},
  previewIcon: {width: 28, height: 28, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white},
  menuPreviewName: {minWidth: 0, flex: 1, color: colors.espressoBrown, fontSize: typography.small},
  menuPreviewPrice: {color: colors.flameRedAccessible, fontSize: typography.small, fontWeight: fontWeight.bold},
  cardActions: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs},
  primarySmallAction: {minHeight: touchTarget.minimum, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md, borderRadius: radius.pill, backgroundColor: colors.flameRedAccessible},
  primarySmallActionText: {color: colors.white, fontSize: typography.small, fontWeight: fontWeight.bold},
  secondarySmallAction: {minHeight: touchTarget.minimum, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xxs, paddingHorizontal: spacing.md, borderRadius: radius.pill, borderWidth: borderWidth.standard, borderColor: colors.borderStrong, backgroundColor: colors.white},
  secondarySmallActionText: {color: colors.flameRedAccessible, fontSize: typography.small, fontWeight: fontWeight.bold},
  relationshipCrossAction: {alignSelf: 'flex-start', minHeight: 40, justifyContent: 'center', paddingHorizontal: spacing.sm, borderRadius: radius.pill, backgroundColor: colors.iconSurface},
  relationshipCrossActionText: {color: colors.espressoBrown, fontSize: typography.tiny, fontWeight: fontWeight.semibold},
  loadMoreButton: {minHeight: touchTarget.minimum, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, borderRadius: radius.md, borderWidth: borderWidth.standard, borderColor: colors.borderStrong, backgroundColor: colors.white},
  loadMoreText: {color: colors.flameRedAccessible, fontSize: typography.small, fontWeight: fontWeight.bold},
  transparencyCopy: {padding: spacing.sm, color: colors.textSecondary, fontSize: typography.tiny},
  pressed: {opacity: 0.72},
});
