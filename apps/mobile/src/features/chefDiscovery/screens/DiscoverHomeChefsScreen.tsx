import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {comingSoonTitle} from '../../customerEmptyStates/domain/customerEmptyStateModel';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {useCustomerBottomNavScroll} from '../../../app/navigation/CustomerBottomNavController';
import type {CustomerChefsStackParamList} from '../../../app/navigation/types';
import {useAppSelector} from '../../../app/store/hooks';
import {toAppApiError} from '../../../core/http/apiError';
import {
  colors,
  elevation,
  fontWeight,
  radius,
  spacing,
  touchTarget,
  typography,
  iconSize,
} from '../../../design/tokens';
import {
  OfflineNotice,
  RecoverableErrorBanner,
  TerminalState,
} from '../../../shared/components/LifecycleStates';
import {Icon} from '../../../shared/components/Icon';
import {ScreenShell} from '../../../shared/components/ScreenShell';
import {CustomerChefFace} from '../../customerShell/components/CustomerChefFace';
import {CustomerHeader} from '../../customerShell/components/CustomerHeader';
import {CustomerLocationSelector} from '../../customerShell/components/CustomerLocationSelector';
import {useCustomerHeaderState} from '../../customerShell/hooks/useCustomerHeaderState';
import {DiscoverySearchInput} from '../../discoverySearch/components/DiscoverySearchInput';
import {
  canRequestNextSearchPage,
  isDiscoverySearchActive,
} from '../../discoverySearch/discoverySearchOrchestration';
import {useDiscoverySearchSession} from '../../discoverySearch/hooks/useDiscoverySearchSession';
import {CustomerFavoriteHeartButton} from '../../favorites/components/CustomerFavoriteHeartButton';
import {
  useFavoriteKitchensQuery,
  useToggleFavoriteKitchen,
} from '../../favorites/query/homeFavoriteQueries';
import {useHomeNearbyDishesQuery} from '../../home/query/homeFeedQueries';
import type {NearbyKitchen} from '../api/nearbyChefDiscoveryApi';
import {
  filterLoadedNearbyKitchens,
  flattenNearbyKitchenPages,
  formatKitchenDistance,
  getKitchenInitials,
  kitchenCardImageUrls,
  summarizeKitchenDishes,
  type KitchenDishSummary,
} from '../chefDiscoveryPresentation';
import {useNearbyChefDiscoveryQuery} from '../query/nearbyChefDiscoveryQueries';

const DISCOVERY_RADIUS_METERS = 10_000;
const DISCOVERY_PAGE_SIZE = 20;
// Same size as Home's top-kitchen feed, so both tabs share one cached request.
const KITCHEN_DISH_PAGE_SIZE = 100;

function ChefDiscoverySkeleton() {
  return (
    <View
      accessibilityLabel="Loading home chefs near you"
      accessibilityRole="progressbar"
      style={styles.skeletonWrap}>
      <View style={styles.skeletonLineWide} />
      <View style={styles.skeletonLine} />
      <View style={styles.skeletonSearch} />
      <View style={styles.skeletonCard} />
      <View style={styles.skeletonCard} />
    </View>
  );
}

// shortcut: these are the kitchen's dish photos; switch to chef-uploaded kitchen photos once the API has them.
function KitchenPhotoStrip({imageUrls}: {imageUrls: readonly string[]}) {
  const [first, second, third] = imageUrls;
  const hiddenCount = imageUrls.length - 3;

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.photoStrip}>
      <Image source={{uri: first}} resizeMode="cover" style={styles.photoMain} />
      {second ? (
        <View style={styles.photoColumn}>
          <Image source={{uri: second}} resizeMode="cover" style={styles.photoSide} />
          {third ? (
            <View style={styles.photoSide}>
              <Image source={{uri: third}} resizeMode="cover" style={StyleSheet.absoluteFill} />
              {hiddenCount > 0 ? (
                <View style={styles.photoMore}>
                  <Text style={styles.photoMoreText}>+{hiddenCount}</Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

interface KitchenCardProps {
  kitchen: NearbyKitchen;
  summary: KitchenDishSummary | undefined;
  favorite: boolean;
  favoritePending: boolean;
  onFavorite: (kitchenId: string) => void;
  onViewKitchen: (kitchen: NearbyKitchen) => void;
}

function KitchenCard({
  kitchen,
  summary,
  favorite,
  favoritePending,
  onFavorite,
  onViewKitchen,
}: KitchenCardProps) {
  const title = kitchen.kitchenName;
  const imageUrls = kitchenCardImageUrls(kitchen.kitchenPhotoUrls, summary?.imageUrls ?? []);
  const dishCount = `${kitchen.activeMenuItemCount} ${
    kitchen.activeMenuItemCount === 1 ? 'dish' : 'dishes'
  }`;

  return (
    <View style={styles.kitchenCard}>
      <Pressable
        accessibilityHint="Opens this kitchen's public profile and available dishes"
        accessibilityLabel={`View ${title} kitchen`}
        accessibilityRole="button"
        onPress={() => onViewKitchen(kitchen)}
        style={({pressed}) => pressed && styles.kitchenCardPressed}>
        <View style={styles.cardHeader}>
          <View style={styles.avatar}>
            <View style={styles.avatarFace}>
              <CustomerChefFace
                url={kitchen.chefPhotoUrl}
                fallback={<Text style={styles.avatarText}>{getKitchenInitials(kitchen)}</Text>}
              />
            </View>
            <View style={styles.openDot} />
          </View>
          <View style={styles.cardTitleCopy}>
            <Text numberOfLines={1} style={styles.kitchenTitle}>
              {title}
            </Text>
            <Text numberOfLines={1} style={styles.metadata}>
              {[kitchen.areaName || kitchen.city, formatKitchenDistance(kitchen.distanceMeters)]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </View>
        </View>

        {imageUrls.length > 0 ? (
          <KitchenPhotoStrip imageUrls={imageUrls} />
        ) : kitchen.description ? (
          <Text numberOfLines={2} style={styles.description}>
            {kitchen.description}
          </Text>
        ) : null}

        <View style={styles.cardFooter}>
          <Text numberOfLines={1} style={styles.menuCount}>
            {[summary?.preparationTimeLabel, dishCount].filter(Boolean).join('  ·  ')}
          </Text>
          {summary ? (
            <Text style={styles.startingPrice}>From {summary.startingPriceLabel}</Text>
          ) : null}
        </View>
      </Pressable>

      {/* Sibling of the card button so TalkBack can still reach it. */}
      <CustomerFavoriteHeartButton
        favorite={favorite}
        pending={favoritePending}
        onToggle={() => onFavorite(kitchen.id)}
        itemLabel={title}
        style={styles.favoriteButton}
      />
    </View>
  );
}

export function DiscoverHomeChefsScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<CustomerChefsStackParamList, 'CustomerChefsRoot'>>();
  const identityId = useAppSelector(state => state.auth.identity?.id ?? null);
  const selectedLocation = useAppSelector(state => state.customerShell.selectedLocation);
  const header = useCustomerHeaderState();
  const bottomNavScroll = useCustomerBottomNavScroll();
  const [locationSelectorVisible, setLocationSelectorVisible] = useState(false);
  const listRef = useRef<FlatList<NearbyKitchen>>(null);
  const searchRowYRef = useRef(0);

  const discovery = useNearbyChefDiscoveryQuery({
    radiusMeters: DISCOVERY_RADIUS_METERS,
    size: DISCOVERY_PAGE_SIZE,
  });
  const searchScopeKey =
    identityId && selectedLocation
      ? `${identityId}:${selectedLocation.addressId}`
      : null;
  const search = useDiscoverySearchSession('CHEFS', searchScopeKey);
  const restorePendingRef = useRef(search.scrollOffset > 0);

  const kitchens = useMemo(
    () => flattenNearbyKitchenPages(discovery.data?.pages),
    [discovery.data?.pages],
  );
  const visibleKitchens = useMemo(
    () => filterLoadedNearbyKitchens(kitchens, search.query),
    [kitchens, search.query],
  );
  const nearbyKitchenCount = discovery.data?.pages[0]?.page.totalElements ?? null;

  const dishDiscovery = useHomeNearbyDishesQuery({
    radiusMeters: DISCOVERY_RADIUS_METERS,
    size: KITCHEN_DISH_PAGE_SIZE,
  });
  // shortcut: only the first 100 nearby dishes are summarized; kitchens past that show no photos.
  const dishSummaries = useMemo(
    () =>
      summarizeKitchenDishes(
        dishDiscovery.data?.pages.flatMap(page => page.menuItems) ?? [],
      ),
    [dishDiscovery.data?.pages],
  );

  const favoriteKitchens = useFavoriteKitchensQuery();
  const toggleFavoriteKitchen = useToggleFavoriteKitchen();
  const favoriteKitchenIds = useMemo(
    () => new Set(favoriteKitchens.items.map(item => item.kitchenId)),
    [favoriteKitchens.items],
  );
  const handleFavorite = (kitchenId: string) => {
    if (!favoriteKitchens.identityId || toggleFavoriteKitchen.isPending) return;
    toggleFavoriteKitchen.mutate({
      kitchenId,
      favorite: favoriteKitchenIds.has(kitchenId),
    });
  };

  useEffect(() => {
    restorePendingRef.current = search.scrollOffset > 0;
    if (search.scrollOffset === 0) {
      listRef.current?.scrollToOffset({offset: 0, animated: false});
    }
  }, [search.scrollOffset, searchScopeKey]);

  const queryError = discovery.error ? toAppApiError(discovery.error) : null;
  const offline = queryError?.code === 'NETWORK_ERROR';
  const initialLoading =
    discovery.isPending && kitchens.length === 0 && !discovery.locationRequired;
  const searchActive = isDiscoverySearchActive(search.query);
  const draftSearchActive = isDiscoverySearchActive(search.draft);

  const retryDiscovery = () => {
    discovery.refetch();
  };

  const loadNextPage = useCallback(() => {
    if (
      canRequestNextSearchPage({
        hasNextPage: discovery.hasNextPage,
        isFetchingNextPage: discovery.isFetchingNextPage,
        isDebouncing: search.isDebouncing,
      })
    ) {
      discovery.fetchNextPage();
    }
  }, [discovery, search.isDebouncing]);

  const resetSearchPosition = useCallback(() => {
    restorePendingRef.current = false;
    listRef.current?.scrollToOffset({offset: 0, animated: false});
  }, []);

  const handleSearchChange = useCallback(
    (value: string) => {
      if (discovery.isFetchingNextPage) {
        discovery.cancelPendingRequest();
      }
      resetSearchPosition();
      search.setDraft(value);
    },
    [discovery, resetSearchPosition, search],
  );

  const handleClearSearch = useCallback(() => {
    if (discovery.isFetchingNextPage) {
      discovery.cancelPendingRequest();
    }
    resetSearchPosition();
    search.clear();
  }, [discovery, resetSearchPosition, search]);

  const handleSearchRowLayout = useCallback((event: LayoutChangeEvent) => {
    searchRowYRef.current = event.nativeEvent.layout.y;
  }, []);

  const handleSearchFocus = useCallback(() => {
    requestAnimationFrame(() => {
      listRef.current?.scrollToOffset({
        offset: Math.max(0, searchRowYRef.current - spacing.sm),
        animated: true,
      });
    });
  }, []);

  const saveListOffset = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      search.saveScrollOffset(event.nativeEvent.contentOffset.y);
    },
    [search],
  );

  const restoreListOffset = useCallback(() => {
    if (
      restorePendingRef.current &&
      search.scrollOffset > 0 &&
      visibleKitchens.length > 0
    ) {
      restorePendingRef.current = false;
      requestAnimationFrame(() => {
        listRef.current?.scrollToOffset({
          offset: search.scrollOffset,
          animated: false,
        });
      });
    }
  }, [search.scrollOffset, visibleKitchens.length]);

  const openFilters = () => {
    navigation.navigate('CustomerFilterSort', {origin: 'CHEFS'});
  };

  const openKitchenProfile = useCallback(
    (kitchen: NearbyKitchen) => {
      navigation.navigate('CustomerKitchenProfile', {kitchenId: kitchen.id});
    },
    [navigation],
  );

  const emptyState = (() => {
    if (discovery.locationRequired) {
      return (
        <TerminalState
          illustration="location"
          title="Choose your location"
          description="Select a saved address to discover active home kitchens nearby."
          actionLabel="Choose location"
          onAction={() => setLocationSelectorVisible(true)}
        />
      );
    }
    if (initialLoading) {
      return <ChefDiscoverySkeleton />;
    }
    if (queryError && kitchens.length === 0) {
      return (
        <TerminalState
          illustration={offline ? 'offline' : 'loadError'}
          title={offline ? 'You appear to be offline' : 'Home chefs could not be loaded'}
          description={queryError.message}
          actionLabel="Try again"
          onAction={retryDiscovery}
        />
      );
    }
    if (search.isDebouncing && draftSearchActive) {
      return (
        <View accessibilityLiveRegion="polite" style={styles.searchUpdating}>
          <ActivityIndicator color={colors.flameRed} />
          <Text style={styles.searchUpdatingText}>Updating search results…</Text>
        </View>
      );
    }
    if (searchActive && kitchens.length > 0) {
      if (discovery.hasNextPage) {
        return (
          <TerminalState
            illustration="search"
            title="No match in the loaded results yet"
            description="More live nearby kitchens are available. Search the next page or clear your search."
            actionLabel="Search next page"
            onAction={loadNextPage}
            secondaryActionLabel="Clear search"
            onSecondaryAction={handleClearSearch}
          />
        );
      }
      return (
        <TerminalState
          illustration="search"
          title="No matching kitchens"
          description="Try another chef, kitchen name or area."
          actionLabel="Clear search"
          onAction={handleClearSearch}
        />
      );
    }
    return (
      <TerminalState
        illustration="comingSoonArea"
        title={comingSoonTitle(selectedLocation?.displayName)}
        description="Home chefs don't cook near this address yet. Try another address."
        actionLabel="Change delivery address"
        onAction={() => setLocationSelectorVisible(true)}
      />
    );
  })();

  const headerContent = (
    <View>
      <View style={styles.topPanel}>
        <CustomerHeader
          onPressLocation={() => setLocationSelectorVisible(true)}
          onPressNotifications={() => header.refreshNotifications()}
        />

        <View style={styles.heroCopy}>
          <Text style={styles.eyebrow}>HOME CHEFS NEAR YOU</Text>
          <Text style={styles.heading}>Discover home chefs</Text>
        </View>

        <View onLayout={handleSearchRowLayout} style={styles.searchRow}>
          <DiscoverySearchInput
            accessibilityLabel="Search nearby kitchens"
            onChangeText={handleSearchChange}
            onClear={handleClearSearch}
            onFocus={handleSearchFocus}
            placeholder="Search chefs, kitchens or area"
            style={styles.searchField}
            value={search.draft}
          />
          <Pressable
            accessibilityHint="Open filter and sort options"
            accessibilityLabel="Filters"
            accessibilityRole="button"
            onPress={openFilters}
            style={({pressed}) => [styles.filterButton, pressed && styles.filterButtonPressed]}>
            <Icon name="filter" size={iconSize.md} color={colors.flameRedAccessible} surface={false} />
          </Pressable>
        </View>
      </View>

      <View style={styles.sectionHeadingRow}>
        <View style={styles.sectionHeadingCopy}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>
            Nearby kitchens
          </Text>
        </View>
        <Text style={styles.radiusPillText}>
          {nearbyKitchenCount ? `${nearbyKitchenCount} within 10 km` : 'Within 10 km'}
        </Text>
      </View>

      {queryError && kitchens.length > 0 ? (
        offline ? (
          <OfflineNotice
            message={queryError.message}
            onRetry={retryDiscovery}
            style={styles.inlineNotice}
          />
        ) : (
          <RecoverableErrorBanner
            message={queryError.message}
            onRetry={retryDiscovery}
            style={styles.inlineNotice}
          />
        )
      ) : null}
    </View>
  );

  return (
    <ScreenShell edges={['top']} keyboardAvoiding testID="discover-home-chefs">
      <FlatList
        ref={listRef}
        contentContainerStyle={styles.listContent}
        data={visibleKitchens}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        keyExtractor={item => item.id}
        ListEmptyComponent={emptyState}
        ListFooterComponent={
          discovery.isFetchingNextPage ? (
            <ActivityIndicator
              accessibilityLabel="Loading more home chefs"
              color={colors.flameRed}
              style={styles.footerLoader}
            />
          ) : null
        }
        ListHeaderComponent={headerContent}
        onContentSizeChange={restoreListOffset}
        onEndReached={loadNextPage}
        onEndReachedThreshold={0.6}
        onMomentumScrollEnd={saveListOffset}
        onScroll={bottomNavScroll.onScroll}
        onScrollEndDrag={saveListOffset}
        refreshControl={
          <RefreshControl
            colors={[colors.flameRed]}
            onRefresh={retryDiscovery}
            refreshing={discovery.isRefetching && !discovery.isFetchingNextPage}
            tintColor={colors.flameRed}
          />
        }
        renderItem={({item}) => (
          <KitchenCard
            kitchen={item}
            summary={dishSummaries.get(item.id)}
            favorite={favoriteKitchenIds.has(item.id)}
            favoritePending={toggleFavoriteKitchen.isPending}
            onFavorite={handleFavorite}
            onViewKitchen={openKitchenProfile}
          />
        )}
        scrollEventThrottle={bottomNavScroll.scrollEventThrottle}
        showsVerticalScrollIndicator={false}
      />

      <CustomerLocationSelector
        visible={locationSelectorVisible}
        onClose={() => setLocationSelectorVisible(false)}
      />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  listContent: {
    flexGrow: 1,
    paddingBottom: spacing.xxl,
    backgroundColor: colors.white,
  },
  topPanel: {
    paddingBottom: spacing.md,
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
    backgroundColor: colors.white,
    ...elevation.card,
  },
  heroCopy: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  eyebrow: {
    color: colors.flameRed,
    fontSize: typography.tiny,
    fontWeight: fontWeight.bold,
    letterSpacing: 1.1,
  },
  heading: {
    color: colors.espressoBrown,
    fontSize: typography.hero,
    fontWeight: fontWeight.extrabold,
    marginTop: spacing.xxs,
  },
  subheading: {
    color: colors.textSecondary,
    fontSize: typography.small,
    marginTop: spacing.xs,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
  },
  searchField: {
    minWidth: 0,
    flex: 1,
  },
  filterButton: {
    width: touchTarget.minimum,
    minHeight: touchTarget.minimum,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterButtonPressed: {
    backgroundColor: colors.surfaceMuted,
    transform: [{scale: 0.98}],
  },
  sectionHeadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  sectionHeadingCopy: {
    flex: 1,
  },
  sectionTitle: {
    color: colors.espressoBrown,
    fontSize: typography.heading,
    fontWeight: fontWeight.bold,
  },
  sectionCaption: {
    color: colors.textSecondary,
    fontSize: typography.tiny,
    marginTop: spacing.xxs,
  },
  radiusPillText: {
    color: colors.textSecondary,
    fontSize: typography.small,
    fontWeight: fontWeight.medium,
  },
  inlineNotice: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  kitchenCard: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    ...elevation.card,
  },
  kitchenCardPressed: {
    opacity: 0.88,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingRight: touchTarget.minimum,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.cream,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Clips the face to the circle; the open dot sits outside it so the dot is not clipped.
  avatarFace: {
    ...StyleSheet.absoluteFill,
    borderRadius: radius.pill,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: colors.flameRed,
    fontSize: typography.heading,
    fontWeight: fontWeight.extrabold,
  },
  openDot: {
    position: 'absolute',
    right: 1,
    bottom: 1,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: colors.white,
    backgroundColor: colors.success,
  },
  cardTitleCopy: {
    flex: 1,
    minWidth: 0,
  },
  kitchenTitle: {
    color: colors.espressoBrown,
    fontSize: typography.button,
    fontWeight: fontWeight.bold,
  },
  metadata: {
    color: colors.textSecondary,
    fontSize: typography.small,
    marginTop: 2,
  },
  favoriteButton: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.sm,
    backgroundColor: colors.surfaceMuted,
  },
  description: {
    color: colors.textPrimary,
    fontSize: typography.small,
    marginTop: spacing.sm,
  },
  photoStrip: {
    height: 150,
    flexDirection: 'row',
    gap: spacing.xxs,
    marginTop: spacing.sm,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  photoMain: {
    flex: 2,
    backgroundColor: colors.surfaceMuted,
  },
  photoColumn: {
    flex: 1,
    gap: spacing.xxs,
  },
  photoSide: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: colors.surfaceMuted,
  },
  photoMore: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.42)',
  },
  photoMoreText: {
    color: colors.white,
    fontSize: typography.heading,
    fontWeight: fontWeight.bold,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  menuCount: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: typography.small,
  },
  startingPrice: {
    color: colors.flameRedAccessible,
    fontSize: typography.small,
    fontWeight: fontWeight.bold,
  },
  searchUpdating: {
    minHeight: 120,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  searchUpdatingText: {
    color: colors.textSecondary,
    fontSize: typography.small,
  },
  footerLoader: {
    paddingVertical: spacing.lg,
  },
  skeletonWrap: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
    gap: spacing.sm,
  },
  skeletonLineWide: {
    height: 22,
    width: '62%',
    borderRadius: radius.sm,
    backgroundColor: colors.border,
  },
  skeletonLine: {
    height: 14,
    width: '82%',
    borderRadius: radius.sm,
    backgroundColor: colors.border,
  },
  skeletonSearch: {
    height: touchTarget.comfortable,
    borderRadius: radius.md,
    backgroundColor: colors.border,
  },
  skeletonCard: {
    height: 240,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
  },
});
