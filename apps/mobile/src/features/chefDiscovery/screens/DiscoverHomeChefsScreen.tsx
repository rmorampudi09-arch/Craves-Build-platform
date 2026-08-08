import React, {useMemo, useState} from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {useCustomerBottomNavScroll} from '../../../app/navigation/CustomerBottomNavController';
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
  const header = useCustomerHeaderState();
  const bottomNavScroll = useCustomerBottomNavScroll();
  const [locationSelectorVisible, setLocationSelectorVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [boundaryNotice, setBoundaryNotice] = useState<string | null>(null);

  const discovery = useNearbyChefDiscoveryQuery({
    radiusMeters: DISCOVERY_RADIUS_METERS,
    size: DISCOVERY_PAGE_SIZE,
  });

  const kitchens = useMemo(
    () => flattenNearbyKitchenPages(discovery.data?.pages),
    [discovery.data?.pages],
  );
  const visibleKitchens = useMemo(
    () => filterLoadedNearbyKitchens(kitchens, searchQuery),
    [kitchens, searchQuery],
  );

  const queryError = discovery.error ? toAppApiError(discovery.error) : null;
  const offline = queryError?.code === 'NETWORK_ERROR';
  const initialLoading =
    discovery.isPending && kitchens.length === 0 && !discovery.locationRequired;
  const searchActive = searchQuery.trim().length > 0;

  const retryDiscovery = () => {
    discovery.refetch();
  };

  const showFiltersBoundary = () => {
    setBoundaryNotice(
      'Cuisine, rating and sort filters are not available because the nearby-kitchen API does not provide those fields yet.',
    );
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
    if (searchActive && kitchens.length > 0) {
      return (
        <TerminalState
          title="No matching kitchens"
          description="Try another name or area from the nearby kitchens already loaded."
          actionLabel="Clear search"
          onAction={() => setSearchQuery('')}
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
        <TextInput
          accessibilityLabel="Search loaded nearby kitchens"
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={setSearchQuery}
          placeholder="Search chefs, kitchens or area"
          placeholderTextColor={colors.placeholder}
          returnKeyType="search"
          style={styles.searchInput}
          value={searchQuery}
        />
        <Pressable
          accessibilityHint="Explains why advanced nearby-kitchen filters are unavailable"
          accessibilityLabel="Filters"
          accessibilityRole="button"
          onPress={showFiltersBoundary}
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
        onEndReached={() => {
          if (
            discovery.hasNextPage &&
            !discovery.isFetchingNextPage &&
            !searchActive
          ) {
            discovery.fetchNextPage();
          }
        }}
        onEndReachedThreshold={0.6}
        onScroll={bottomNavScroll.onScroll}
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
  searchInput: {
    flex: 1,
    minHeight: touchTarget.comfortable,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    color: colors.textPrimary,
    fontSize: typography.body,
    paddingHorizontal: spacing.md,
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
