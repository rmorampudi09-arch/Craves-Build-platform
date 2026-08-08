import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
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
} from '../../../design/tokens';
import {
  OfflineNotice,
  RecoverableErrorBanner,
  TerminalState,
} from '../../../shared/components/LifecycleStates';
import {ScreenShell} from '../../../shared/components/ScreenShell';
import {CustomerHeader} from '../../customerShell/components/CustomerHeader';
import {CustomerLocationSelector} from '../../customerShell/components/CustomerLocationSelector';
import {useCustomerHeaderState} from '../../customerShell/hooks/useCustomerHeaderState';
import {DiscoverySearchInput} from '../../discoverySearch/components/DiscoverySearchInput';
import {
  canRequestNextSearchPage,
  isDiscoverySearchActive,
} from '../../discoverySearch/discoverySearchOrchestration';
import {useDiscoverySearchSession} from '../../discoverySearch/hooks/useDiscoverySearchSession';
import type {NearbyKitchen} from '../api/nearbyChefDiscoveryApi';
import {
  filterLoadedNearbyKitchens,
  flattenNearbyKitchenPages,
  formatKitchenDistance,
  formatKitchenLocation,
  getKitchenInitials,
} from '../chefDiscoveryPresentation';
import {useNearbyChefDiscoveryQuery} from '../query/nearbyChefDiscoveryQueries';

const DISCOVERY_RADIUS_METERS = 10_000;
const DISCOVERY_PAGE_SIZE = 20;

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

interface KitchenCardProps {
  kitchen: NearbyKitchen;
  onPress: (kitchen: NearbyKitchen) => void;
}

function KitchenCard({kitchen, onPress}: KitchenCardProps) {
  const title = kitchen.displayName ?? kitchen.kitchenName;
  const location = formatKitchenLocation(kitchen);

  return (
    <Pressable
      accessibilityHint="Kitchen profile navigation is not available until the public kitchen profile contract is implemented."
      accessibilityLabel={`Open ${title}`}
      accessibilityRole="button"
      onPress={() => onPress(kitchen)}
      style={({pressed}) => [styles.kitchenCard, pressed && styles.kitchenCardPressed]}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{getKitchenInitials(kitchen)}</Text>
      </View>
      <View style={styles.cardBody}>
        <View style={styles.cardTitleRow}>
          <View style={styles.cardTitleCopy}>
            <Text numberOfLines={1} style={styles.kitchenTitle}>
              {title}
            </Text>
            {kitchen.displayName && kitchen.displayName !== kitchen.kitchenName ? (
              <Text numberOfLines={1} style={styles.kitchenOwner}>
                {kitchen.kitchenName}
              </Text>
            ) : null}
          </View>
          <View style={styles.availableBadge}>
            <Text style={styles.availableBadgeText}>Open menu</Text>
          </View>
        </View>

        {kitchen.description ? (
          <Text numberOfLines={2} style={styles.description}>
            {kitchen.description}
          </Text>
        ) : null}

        <Text numberOfLines={1} style={styles.metadata}>
          {[formatKitchenDistance(kitchen.distanceMeters), location]
            .filter(Boolean)
            .join(' • ')}
        </Text>

        <View style={styles.cardFooter}>
          <Text style={styles.menuCount}>
            {kitchen.activeMenuItemCount}{' '}
            {kitchen.activeMenuItemCount === 1 ? 'dish available' : 'dishes available'}
          </Text>
          <Text style={styles.viewKitchen}>View kitchen ›</Text>
        </View>
      </View>
    </Pressable>
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
  const [boundaryNotice, setBoundaryNotice] = useState<string | null>(null);
  const listRef = useRef<FlatList<NearbyKitchen>>(null);

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

  const showKitchenProfileBoundary = (kitchen: NearbyKitchen) => {
    const title = kitchen.displayName ?? kitchen.kitchenName;
    setBoundaryNotice(
      `${title} is available nearby, but the public kitchen-profile route and contract are not implemented yet.`,
    );
  };

  const emptyState = (() => {
    if (discovery.locationRequired) {
      return (
        <TerminalState
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
          title="No matching kitchens"
          description="Try another chef, kitchen name or area."
          actionLabel="Clear search"
          onAction={handleClearSearch}
        />
      );
    }
    return (
      <TerminalState
        title="No home chefs nearby yet"
        description="Pull to refresh or choose another saved location."
        actionLabel="Refresh"
        onAction={retryDiscovery}
        secondaryActionLabel="Change location"
        onSecondaryAction={() => setLocationSelectorVisible(true)}
      />
    );
  })();

  const headerContent = (
    <View>
      <CustomerHeader
        onPressLocation={() => setLocationSelectorVisible(true)}
        onPressNotifications={() => header.refreshNotifications()}
      />

      <View style={styles.heroCopy}>
        <Text style={styles.eyebrow}>HOME CHEFS NEAR YOU</Text>
        <Text style={styles.heading}>Discover home chefs</Text>
        <Text style={styles.subheading}>
          Find active kitchens serving homemade food around your selected location.
        </Text>
      </View>

      <View style={styles.searchRow}>
        <DiscoverySearchInput
          accessibilityLabel="Search nearby kitchens"
          onChangeText={handleSearchChange}
          onClear={handleClearSearch}
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
          <Text style={styles.filterButtonText}>Filters</Text>
        </Pressable>
      </View>

      <View style={styles.sectionHeadingRow}>
        <View style={styles.sectionHeadingCopy}>
          <Text style={styles.sectionTitle}>Nearby chefs</Text>
          <Text style={styles.sectionCaption}>
            Active kitchens ordered by distance from your saved location
          </Text>
        </View>
        <View style={styles.radiusPill}>
          <Text style={styles.radiusPillText}>Within 10 km</Text>
        </View>
      </View>

      {boundaryNotice ? (
        <RecoverableErrorBanner
          message={boundaryNotice}
          style={styles.inlineNotice}
        />
      ) : null}

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
    <ScreenShell edges={['top']} keyboardAvoiding={false} testID="discover-home-chefs">
      <FlatList
        ref={listRef}
        contentContainerStyle={styles.listContent}
        data={visibleKitchens}
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
          <KitchenCard kitchen={item} onPress={showKitchenProfileBoundary} />
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
    backgroundColor: colors.surfaceBase,
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
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
  },
  searchField: {
    flex: 1,
  },
  filterButton: {
    minHeight: touchTarget.comfortable,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.flameRed,
    alignItems: 'center',
    justifyContent: 'center',
    ...elevation.primaryAction,
  },
  filterButtonPressed: {
    opacity: 0.84,
    transform: [{scale: 0.98}],
  },
  filterButtonText: {
    color: colors.white,
    fontSize: typography.small,
    fontWeight: fontWeight.bold,
  },
  sectionHeadingRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xl,
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
  radiusPill: {
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceWarm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  radiusPillText: {
    color: colors.espressoBrown,
    fontSize: typography.tiny,
    fontWeight: fontWeight.semibold,
  },
  inlineNotice: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  kitchenCard: {
    flexDirection: 'row',
    gap: spacing.md,
    marginHorizontal: spacing.md,
    marginVertical: spacing.xs,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    ...elevation.card,
  },
  kitchenCardPressed: {
    opacity: 0.88,
    transform: [{scale: 0.99}],
  },
  avatar: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: colors.surfaceWarmStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: colors.flameRed,
    fontSize: typography.heading,
    fontWeight: fontWeight.extrabold,
  },
  cardBody: {
    flex: 1,
    minWidth: 0,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
  },
  cardTitleCopy: {
    flex: 1,
    minWidth: 0,
  },
  kitchenTitle: {
    color: colors.espressoBrown,
    fontSize: typography.body,
    fontWeight: fontWeight.bold,
  },
  kitchenOwner: {
    color: colors.textSecondary,
    fontSize: typography.tiny,
    marginTop: spacing.xxs,
  },
  availableBadge: {
    borderRadius: radius.pill,
    backgroundColor: colors.successSoft,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xxs,
  },
  availableBadgeText: {
    color: colors.success,
    fontSize: typography.tiny,
    fontWeight: fontWeight.bold,
  },
  description: {
    color: colors.textPrimary,
    fontSize: typography.small,
    marginTop: spacing.sm,
  },
  metadata: {
    color: colors.textSecondary,
    fontSize: typography.tiny,
    marginTop: spacing.sm,
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
    fontSize: typography.tiny,
  },
  viewKitchen: {
    color: colors.flameRed,
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
    backgroundColor: colors.surfaceMuted,
  },
  skeletonLine: {
    height: 14,
    width: '82%',
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceMuted,
  },
  skeletonSearch: {
    height: touchTarget.comfortable,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
  },
  skeletonCard: {
    height: 136,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceMuted,
  },
});
