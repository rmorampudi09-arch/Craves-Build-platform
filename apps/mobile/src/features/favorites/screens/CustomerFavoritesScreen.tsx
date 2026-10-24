import React from 'react';
import {askKitchenSwitch} from '../../cart/components/KitchenSwitchDialog';
import {
  ActivityIndicator,
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
import {useAppDispatch, useAppSelector} from '../../../app/store/hooks';
import type {
  CustomerProfileStackParamList,
  CustomerTabParamList,
} from '../../../app/navigation/types';
import {
  borderWidth,
  colors,
  fontWeight,
  radius,
  spacing,
  touchTarget,
  typography,
  iconSize,
} from '../../../design/tokens';
import {IconButton} from '../../../shared/components/IconButton';
import {TerminalState} from '../../../shared/components/LifecycleStates';
import {ScreenShell} from '../../../shared/components/ScreenShell';
import {UnderlineTabs} from '../../../shared/components/UnderlineTabs';
import {
  addCartItem,
  removeCartItem,
  setCartItemQuantity,
  switchCartKitchen,
  type CartMutationOutcome,
} from '../../cart/state/cartMutations';
import {refreshCartSnapshot} from '../../cart/state/cartRefresh';
import {useCustomerOrderKitchenPresentationQuery} from '../../customerOrders/query/customerOrderCatalogQueries';
import {CustomerChefFace} from '../../customerShell/components/CustomerChefFace';
import type {FavoriteHomeCard} from '../api/favoriteHomeFeedApi';
import {CustomerFavoriteDishCard} from '../components/CustomerFavoriteDishCard';
import type {SavedCatalogItem} from '../api/savedCatalogApi';
import {
  favoriteHomeDisplayName,
  favoriteHomeStateCopy,
  mergeSavedHomes,
  type SavedHomeEntry,
} from '../presentation/favoriteHomePresentation';
import {
  canAddSavedDish,
  savedDishDisplayName,
  savedKitchenDisplayName,
} from '../presentation/savedCatalogPresentation';
import {formatDishDetailPrice} from '../../dishDetail/dishDetailPurchase';
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
type SavedTab = 'DISHES' | 'HOME_CHEFS';

const SAVED_TABS = [
  {key: 'DISHES', label: 'Dishes'},
  {key: 'HOME_CHEFS', label: 'Home chefs'},
] as const;

function FilledIcon({
  name,
  size = iconSize.md,
  color = colors.espressoBrown,
}: {
  name: string;
  size?: number;
  color?: string;
}) {
  return <MaterialDesignIcons name={name as never} size={size} color={color} />;
}

function FavoriteHomeBadge({kitchenId}: {kitchenId: string | null}) {
  const kitchen = useCustomerOrderKitchenPresentationQuery(kitchenId ?? '');
  return (
    <View style={styles.homeIconBadge}>
      <CustomerChefFace
        url={kitchen.data?.chefPhotoUrl}
        fallback={
          <FilledIcon
            name="chef-hat"
            size={26}
            color={colors.flameRedAccessible}
          />
        }
      />
    </View>
  );
}

function sectionRows(
  rows: readonly SavedCatalogItem[],
  states: readonly SavedCatalogItem['availabilityState'][],
): SavedCatalogItem[] {
  const stateSet = new Set(states);
  return rows.filter(row => stateSet.has(row.availabilityState));
}

export function CustomerFavoritesScreen() {
  const navigation = useNavigation<FavoritesNavigation>();
  const dispatch = useAppDispatch();
  const cartSnapshot = useAppSelector(state => state.cart.snapshot);
  const cartMutations = useAppSelector(state => state.cart.mutations);
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
  const [cartErrors, setCartErrors] = React.useState<Record<string, string>>({});

  const browseMeals = React.useCallback(() => {
    const tabs = navigation.getParent<CustomerTabsNavigation>();
    if (tabs) {
      tabs.navigate('Home');
      return;
    }
    navigation.goBack();
  }, [navigation]);

  const exploreHomeChefs = React.useCallback(() => {
    const tabs = navigation.getParent<CustomerTabsNavigation>();
    if (tabs) {
      tabs.navigate('Chefs');
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

  const setCartError = React.useCallback(
    (menuItemId: string, message: string | null) => {
      setCartErrors(current => {
        const next = {...current};
        if (message) next[menuItemId] = message;
        else delete next[menuItemId];
        return next;
      });
    },
    [],
  );

  const handleCartOutcome = React.useCallback(
    (menuItemId: string, outcome: CartMutationOutcome) => {
      if (outcome.status === 'FAILED') {
        setCartError(menuItemId, outcome.error.message);
      } else if (outcome.status === 'APPLIED') {
        setCartError(menuItemId, null);
      }
    },
    [setCartError],
  );

  const checkCart = React.useCallback(
    async (menuItemId: string) => {
      const result = await dispatch(refreshCartSnapshot());
      if (result.status === 'FAILED') {
        setCartError(
          menuItemId,
          'Your cart could not be checked. Reconnect and try again before changing this dish.',
        );
        return;
      }
      if (result.status === 'APPLIED') {
        setCartError(menuItemId, null);
      }
    },
    [dispatch, setCartError],
  );

  const increaseFavoriteDish = React.useCallback(
    async (dish: SavedCatalogItem) => {
      if (!canAddSavedDish(dish) || !dish.kitchenId) return;
      setCartError(dish.menuItemId, null);

      let snapshot = cartSnapshot;
      if (!snapshot) {
        const refreshedCart = await dispatch(refreshCartSnapshot());
        if (refreshedCart.status !== 'APPLIED') {
          setCartError(
            dish.menuItemId,
            'Your cart could not be checked. Refresh it before adding this dish.',
          );
          return;
        }
        snapshot = refreshedCart.snapshot;
      }

      const existing = snapshot.lines.find(
        line => line.menuItemId === dish.menuItemId,
      );
      if (existing) {
        if (existing.quantity >= 100) return;
        handleCartOutcome(
          dish.menuItemId,
          await dispatch(
            setCartItemQuantity({
              lineId: existing.lineId,
              quantity: existing.quantity + 1,
            }),
          ),
        );
        return;
      }

      const otherKitchen = snapshot.lines.find(
        line => line.kitchenId !== dish.kitchenId,
      );
      if (otherKitchen) {
        const expectedSnapshot = snapshot;
        askKitchenSwitch({
          cartLines: expectedSnapshot.lines,
          newDish: {
            name: savedDishDisplayName(dish),
            kitchenName: savedKitchenDisplayName(dish),
            priceLabel:
              dish.price == null ? '' : formatDishDetailPrice(dish.price, dish.currency ?? 'INR'),
          },
          onReplace: () => {
            dispatch(
              switchCartKitchen({
                expectedSnapshot,
                menuItemId: dish.menuItemId,
                quantity: 1,
                expectedKitchenId: dish.kitchenId!,
              }),
            )
              .then(outcome => handleCartOutcome(dish.menuItemId, outcome))
              .catch(() =>
                setCartError(
                  dish.menuItemId,
                  'We couldn’t confirm the cart change. Check your cart before trying again.',
                ),
              );
          },
        });
        return;
      }

      handleCartOutcome(
        dish.menuItemId,
        await dispatch(addCartItem({menuItemId: dish.menuItemId, quantity: 1})),
      );
    },
    [cartSnapshot, dispatch, handleCartOutcome, setCartError],
  );

  const decreaseFavoriteDish = React.useCallback(
    async (dish: SavedCatalogItem) => {
      const line = cartSnapshot?.lines.find(
        item => item.menuItemId === dish.menuItemId,
      );
      if (!line) return;
      setCartError(dish.menuItemId, null);

      const outcome =
        line.quantity <= 1
          ? await dispatch(removeCartItem({lineId: line.lineId}))
          : await dispatch(
              setCartItemQuantity({
                lineId: line.lineId,
                quantity: line.quantity - 1,
              }),
            );
      handleCartOutcome(dish.menuItemId, outcome);
    },
    [cartSnapshot, dispatch, handleCartOutcome, setCartError],
  );

  const cartMutationPending = Object.values(cartMutations).some(
    entry => entry.status === 'PENDING',
  );

  const renderDishCard = React.useCallback(
    (dish: SavedCatalogItem) => {
      const queued = queueState.pendingMenuItemIds.includes(dish.menuItemId);
      const kitchenSaved = dish.kitchenId
        ? favoriteKitchenIds.has(dish.kitchenId)
        : false;
      const line = cartSnapshot?.lines.find(
        item => item.menuItemId === dish.menuItemId,
      );
      const linePending = line
        ? cartMutations[`line:${line.lineId}`]?.status === 'PENDING'
        : cartMutations[`menu:${dish.menuItemId}`]?.status === 'PENDING';
      const replacementPending =
        cartMutations['cart:switch-kitchen']?.status === 'PENDING';

      return (
        <CustomerFavoriteDishCard
          key={dish.menuItemId}
          dish={dish}
          favoritePending={toggleFavorite.isPending}
          favoriteQueued={queued}
          kitchenSaved={kitchenSaved}
          kitchenPending={toggleKitchen.isPending}
          cartPending={Boolean(linePending || replacementPending)}
          cartDisabled={cartMutationPending}
          cartError={cartErrors[dish.menuItemId] ?? null}
          quantity={line?.quantity ?? 0}
          onOpenDish={menuItemId =>
            navigation.navigate('CustomerDishDetail', {menuItemId})
          }
          onToggleKitchen={item => {
            if (!item.kitchenId) return;
            toggleKitchen.mutate({
              kitchenId: item.kitchenId,
              favorite: favoriteKitchenIds.has(item.kitchenId),
            });
          }}
          onRemoveFavorite={menuItemId =>
            toggleFavorite.mutate({menuItemId, favorite: true})
          }
          onIncrease={item => {
            increaseFavoriteDish(item).catch(() =>
              setCartError(
                item.menuItemId,
                'We couldn’t confirm the cart change. Check your cart before trying again.',
              ),
            );
          }}
          onDecrease={item => {
            decreaseFavoriteDish(item).catch(() =>
              setCartError(
                item.menuItemId,
                'We couldn’t confirm the cart change. Check your cart before trying again.',
              ),
            );
          }}
          onCheckCart={() => {
            checkCart(dish.menuItemId).catch(() => undefined);
          }}
        />
      );
    },
    [
      cartErrors,
      cartMutationPending,
      cartMutations,
      cartSnapshot,
      checkCart,
      decreaseFavoriteDish,
      favoriteKitchenIds,
      increaseFavoriteDish,
      navigation,
      queueState.pendingMenuItemIds,
      setCartError,
      toggleFavorite,
      toggleKitchen,
    ],
  );

  const renderHomeEntry = (entry: SavedHomeEntry) => {
    const {card, kitchenId, chefIdentityId} = entry;
    const state = favoriteHomeStateCopy(card);
    const displayName = favoriteHomeDisplayName(card);
    const area = [card.areaName, card.city].filter(Boolean).join(', ');
    const openKitchenId = card.exists ? card.kitchenId : null;
    const kitchenWatched = kitchenId !== null && kitchenWatchIds.has(kitchenId);
    const chefWatched = chefIdentityId !== null && chefWatchIds.has(chefIdentityId);
    const watched = kitchenWatched || chefWatched;
    const removeBusy = toggleChef.isPending || toggleKitchen.isPending;
    const watchBusy = toggleChefWatch.isPending || toggleKitchenWatch.isPending;

    const remove = () => {
      // Clear every saved relation behind this row, or it would come back from the other list.
      if (chefIdentityId) toggleChef.mutate({chefIdentityId, favorite: true});
      if (kitchenId) toggleKitchen.mutate({kitchenId, favorite: true});
    };
    const toggleWatch = () => {
      if (watched) {
        if (kitchenWatched) toggleKitchenWatch.mutate({entityId: kitchenId!, channel: 'IN_APP', enabled: false});
        if (chefWatched) toggleChefWatch.mutate({entityId: chefIdentityId!, channel: 'IN_APP', enabled: false});
      } else if (kitchenId) {
        toggleKitchenWatch.mutate({entityId: kitchenId, channel: 'IN_APP', enabled: true});
      } else if (chefIdentityId) {
        toggleChefWatch.mutate({entityId: chefIdentityId, channel: 'IN_APP', enabled: true});
      }
    };

    return (
      <View key={`${card.requestedType}:${card.requestedId}`} style={styles.homeCard}>
        {/* The photo and name open the kitchen; the bell and heart stay separate buttons for screen readers. */}
        <Pressable
          accessibilityHint={openKitchenId ? 'Opens their kitchen' : undefined}
          accessibilityLabel={`${displayName}${area ? `, ${area}` : ''}. ${state.title}`}
          accessibilityRole={openKitchenId ? 'button' : undefined}
          disabled={!openKitchenId}
          onPress={() => {
            if (openKitchenId) navigation.navigate('CustomerKitchenProfile', {kitchenId: openKitchenId});
          }}
          style={({pressed}) => [styles.homeCardMain, pressed && styles.pressed]}>
          <FavoriteHomeBadge kitchenId={openKitchenId} />
          <View style={styles.homeCardCopy}>
            <Text numberOfLines={1} style={styles.homeCardTitle}>{displayName}</Text>
            {area ? <Text numberOfLines={1} style={styles.homeCardArea}>{area}</Text> : null}
            <View style={styles.homeState}>
              {state.tone === 'positive' ? <View style={styles.cookingDot} /> : null}
              <Text style={[styles.homeStateText, state.tone === 'positive' && styles.homeStateTextOn]}>
                {state.title}
              </Text>
            </View>
          </View>
        </Pressable>
        <Pressable
          accessibilityLabel={watched ? `Stop cooking alerts from ${displayName}` : `Alert me in the app when ${displayName} is cooking`}
          accessibilityRole="button"
          accessibilityState={{selected: watched, disabled: watchBusy}}
          disabled={watchBusy}
          onPress={toggleWatch}
          style={({pressed}) => [styles.circleButton, pressed && styles.pressed]}>
          <FilledIcon name={watched ? 'bell-check' : 'bell-plus-outline'} size={iconSize.md} color={colors.flameRed} />
        </Pressable>
        <IconButton
          accessibilityLabel={`Remove ${displayName} from saved`}
          disabled={removeBusy}
          icon="heart"
          onPress={remove}
        />
      </View>
    );
  };

  const homeEntries = mergeSavedHomes(
    favoriteKitchens.items
      .map(item => homeFeedByKey.get(`KITCHEN:${item.kitchenId}`))
      .filter((item): item is FavoriteHomeCard => Boolean(item)),
    favoriteChefs.items
      .map(item => homeFeedByKey.get(`CHEF:${item.chefIdentityId}`))
      .filter((item): item is FavoriteHomeCard => Boolean(item)),
  );
  const savedHomeCount = favoriteKitchens.items.length + favoriteChefs.items.length;

  const homeChefsTab = (() => {
    if (favoriteChefs.isPending || favoriteKitchens.isPending) {
      return (
        <View accessibilityRole="progressbar" style={styles.loadingCard}>
          <ActivityIndicator color={colors.flameRed} />
          <Text style={styles.loadingText}>Loading saved home chefs…</Text>
        </View>
      );
    }
    if (favoriteChefs.isError || favoriteKitchens.isError) {
      return (
        <TerminalState
          illustration="loadError"
          title="Saved home chefs could not be loaded"
          description="Check your connection and try again."
          actionLabel="Try again"
          onAction={() => {
            Promise.all([favoriteChefs.refetch(), favoriteKitchens.refetch()]).catch(() => undefined);
          }}
        />
      );
    }
    if (savedHomeCount === 0) {
      return (
        <TerminalState
          illustration="saved"
          title="No saved home chefs yet"
          description="Tap the heart on any kitchen to keep its home chef here."
          actionLabel="Explore home chefs"
          onAction={exploreHomeChefs}
        />
      );
    }
    if (homeFeed.isPending) {
      return (
        <View accessibilityRole="progressbar" style={styles.loadingCard}>
          <ActivityIndicator color={colors.flameRed} />
          <Text style={styles.loadingText}>Checking who is cooking today…</Text>
        </View>
      );
    }
    if (homeFeed.isError) {
      return (
        <TerminalState
          title="Your saved home chefs are safe"
          description="We could not check who is cooking today. Nothing was removed."
          actionLabel="Check again"
          onAction={() => homeFeed.refetch().catch(() => undefined)}
        />
      );
    }
    const morePages = [favoriteChefs, favoriteKitchens].filter(query => query.hasNextPage);
    const loadingMore = morePages.some(query => query.isFetchingNextPage);
    return (
      <>
        {homeEntries.map(renderHomeEntry)}
        {morePages.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{busy: loadingMore}}
            disabled={loadingMore}
            onPress={() => {
              Promise.all(morePages.map(query => query.fetchNextPage())).catch(() => undefined);
            }}
            style={({pressed}) => [styles.loadMoreButton, pressed && styles.pressed]}>
            {loadingMore ? <ActivityIndicator size="small" color={colors.flameRedAccessible} /> : null}
            <Text style={styles.loadMoreText}>Load more saved home chefs</Text>
          </Pressable>
        ) : null}
        <Text style={styles.footnote}>Tap the heart on any kitchen to save its home chef here.</Text>
      </>
    );
  })();

  const dishTab = favorites.sessionRequired ? (
    <TerminalState
      title="Sign in required"
      description="Sign in to see your saved dishes and home chefs."
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
      illustration="loadError"
      title="Saved dishes could not be loaded"
      description="Check your connection and try again."
      actionLabel="Try again"
      onAction={refresh}
    />
  ) : favoriteRows.length === 0 ? (
    <TerminalState
      illustration="saved"
      title="No saved dishes yet"
      description="Tap the heart on any dish to keep it here for next time."
      actionLabel="Browse dishes"
      onAction={browseMeals}
    />
  ) : savedCatalog.isPending ? (
    <View accessibilityRole="progressbar" style={styles.loadingCard}>
      <ActivityIndicator color={colors.flameRed} />
      <Text style={styles.loadingText}>Checking what is cooking today…</Text>
    </View>
  ) : savedCatalog.isError ? (
    <TerminalState
      title="Your saves are safe"
      description="We could not check what is cooking today. Nothing was removed."
      actionLabel="Check again"
      onAction={() => savedCatalog.refetch().catch(() => undefined)}
    />
  ) : (
    <>
      {cookingToday.length > 0 ? (
        <View style={styles.todaySection}>
          <View style={styles.todayHeader}>
            <View style={styles.todayIcon}>
              <FilledIcon name="pot-steam-outline" size={iconSize.md} color={colors.successText} />
            </View>
            <View style={styles.todayHeaderCopy}>
              <Text accessibilityRole="header" style={styles.todayTitle}>Your favorites are cooking today</Text>
              <Text style={styles.todaySubtitle}>Order them while they are on today's menu.</Text>
            </View>
          </View>
          {cookingToday.map(renderDishCard)}
        </View>
      ) : (
        <View style={styles.calmStatusCard}>
          <FilledIcon name="weather-sunset" size={iconSize.md} color={colors.textSecondary} />
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
    </>
  );

  return (
    <ScreenShell edges={['top']} keyboardAvoiding={false} testID="customer-favorites">
      <View style={styles.root}>
        <View style={styles.header}>
          <IconButton accessibilityLabel="Back" icon="arrow-left" onPress={() => navigation.goBack()} />
          <Text accessibilityRole="header" style={styles.title}>
            Saved
          </Text>
        </View>
        <UnderlineTabs
          accessibilityLabel="Saved sections"
          fill
          onSelect={setActiveTab}
          selected={activeTab}
          tabs={SAVED_TABS}
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
            {queueState.hasPendingChanges ? (
              <View accessibilityLiveRegion="polite" style={styles.syncCard}>
                <FilledIcon name="cloud-sync-outline" size={iconSize.sm} color={colors.flameRedAccessible} />
                <View style={styles.syncCopy}>
                  <Text style={styles.syncTitle}>Saving when online</Text>
                  <Text style={styles.syncText}>
                    {queueState.pendingCount === 1
                      ? '1 change will save when you are back online.'
                      : `${queueState.pendingCount} changes will save when you are back online.`}
                  </Text>
                </View>
              </View>
            ) : null}

            {activeTab === 'DISHES' ? dishTab : homeChefsTab}
          </View>
        </ScrollView>
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.white},
  header: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  title: {minWidth: 0, flex: 1, color: colors.espressoBrown, fontSize: typography.hero, fontWeight: fontWeight.bold},
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
    backgroundColor: colors.white,
  },
  content: {width: '100%', maxWidth: 640, alignSelf: 'center', gap: spacing.sm},
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
  homeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    borderRadius: radius.lg,
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  homeCardMain: {minWidth: 0, flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm},
  homeIconBadge: {width: 56, height: 56, borderRadius: radius.pill, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.iconSurface},
  homeCardCopy: {minWidth: 0, flex: 1, gap: 2},
  homeCardTitle: {color: colors.espressoBrown, fontSize: typography.heading, fontWeight: fontWeight.bold},
  homeCardArea: {color: colors.textSecondary, fontSize: typography.small},
  homeState: {flexDirection: 'row', alignItems: 'center', gap: 6},
  cookingDot: {width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success},
  homeStateText: {color: colors.textSecondary, fontSize: typography.small, fontWeight: fontWeight.bold},
  homeStateTextOn: {color: colors.successText},
  circleButton: {width: touchTarget.minimum, height: touchTarget.minimum, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill},
  loadMoreButton: {minHeight: touchTarget.minimum, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, borderRadius: radius.md, borderWidth: borderWidth.standard, borderColor: colors.borderStrong, backgroundColor: colors.white},
  loadMoreText: {color: colors.flameRedAccessible, fontSize: typography.small, fontWeight: fontWeight.bold},
  footnote: {marginTop: spacing.xxs, marginHorizontal: spacing.xxs, color: colors.textSecondary, fontSize: typography.small},
  pressed: {opacity: 0.72},
});
