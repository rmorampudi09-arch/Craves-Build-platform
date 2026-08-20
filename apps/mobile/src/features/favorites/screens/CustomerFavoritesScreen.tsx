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
import type {SavedCatalogItem} from '../api/savedCatalogApi';
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
import {useSavedCatalogQuery} from '../query/savedCatalogQueries';

type FavoritesNavigation = NativeStackNavigationProp<
  CustomerProfileStackParamList,
  'CustomerFavorites'
>;
type CustomerTabsNavigation = BottomTabNavigationProp<CustomerTabParamList>;

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

function toneStyles(tone: SavedAvailabilityTone) {
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

export function CustomerFavoritesScreen() {
  const navigation = useNavigation<FavoritesNavigation>();
  const bottomNavScroll = useCustomerBottomNavScroll();
  const favorites = useCustomerFavoritesQuery();
  const queueState = useCustomerFavoritesQueueState();
  const toggleFavorite = useToggleCustomerFavorite();
  const savedCatalog = useSavedCatalogQuery(favorites.data, favorites.isSuccess);
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
      savedCatalog.menuItemIds.length > 0
        ? savedCatalog.refetch()
        : Promise.resolve(undefined),
    ]).catch(() => undefined);
  }, [favorites, savedCatalog]);

  const favoriteRows = favorites.data ?? [];
  const resolvedRows = savedCatalog.data ?? [];
  const cookingToday = sectionRows(resolvedRows, [
    'AVAILABLE_NOW',
    'COOKING_LATER_TODAY',
  ]);
  const savedForLater = resolvedRows.filter(
    row =>
      row.availabilityState !== 'AVAILABLE_NOW' &&
      row.availabilityState !== 'COOKING_LATER_TODAY',
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

      return (
        <Pressable
          accessibilityHint={
            canOpen ? 'Opens current dish details.' : 'This saved item cannot be opened right now.'
          }
          accessibilityRole={canOpen ? 'button' : undefined}
          disabled={!canOpen}
          key={dish.menuItemId}
          onPress={
            canOpen
              ? () =>
                  navigation.navigate('CustomerDishDetail', {
                    menuItemId: dish.menuItemId,
                  })
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
            <Text numberOfLines={2} style={styles.dishName}>
              {displayName}
            </Text>
            <Text numberOfLines={1} style={styles.kitchenName}>
              {kitchenName}
            </Text>
            {meta ? <Text style={styles.metaText}>{meta}</Text> : null}
            {price ? <Text style={styles.priceText}>{price}</Text> : null}
            <View
              accessibilityLabel={`${availability.title}. ${availability.detail ?? ''}`.trim()}
              style={[styles.availabilityBadge, availabilityStyle.container]}>
              <Text style={[styles.availabilityTitle, availabilityStyle.text]}>
                {availability.title}
              </Text>
            </View>
            {availability.detail ? (
              <Text style={styles.availabilityDetail}>{availability.detail}</Text>
            ) : null}
            {queued ? <Text style={styles.queuedText}>Waiting to sync</Text> : null}
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
    [navigation, queueState.pendingMenuItemIds, toggleFavorite],
  );

  return (
    <ScreenShell edges={['top']} keyboardAvoiding={false} testID="customer-favorites">
      <View style={styles.root}>
        <CustomerHeader
          title="Favorites"
          onPressLocation={() => setLocationSelectorVisible(true)}
          onPressNotifications={() => navigation.navigate('CustomerNotifications')}
        />
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          onScroll={bottomNavScroll.onScroll}
          refreshControl={
            favorites.sessionRequired ? undefined : (
              <RefreshControl
                refreshing={favorites.isRefetching || savedCatalog.isRefetching}
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
                <Text accessibilityRole="header" style={styles.title}>
                  Saved for you
                </Text>
                <Text style={styles.subtitle}>
                  Remember the dishes you trust and see when their home kitchens are cooking.
                </Text>
              </View>
            </View>

            {queueState.hasPendingChanges ? (
              <View accessibilityLiveRegion="polite" style={styles.syncCard}>
                <FilledIcon
                  name="cloud-sync-outline"
                  size={20}
                  color={colors.flameRedAccessible}
                />
                <View style={styles.syncCopy}>
                  <Text style={styles.syncTitle}>Saving when online</Text>
                  <Text style={styles.syncText}>
                    {queueState.pendingCount === 1
                      ? '1 favorite change is waiting to sync.'
                      : `${queueState.pendingCount} favorite changes are waiting to sync.`}
                  </Text>
                </View>
              </View>
            ) : null}

            {favorites.sessionRequired ? (
              <TerminalState
                title="Sign in required"
                description="Favorites are private to your customer account."
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
                        <Text accessibilityRole="header" style={styles.todayTitle}>
                          Your favorites are cooking today
                        </Text>
                        <Text style={styles.todaySubtitle}>
                          Based only on the kitchen's current schedule and catalog availability.
                        </Text>
                      </View>
                    </View>
                    {cookingToday.map(renderDishCard)}
                  </View>
                ) : (
                  <View style={styles.calmStatusCard}>
                    <FilledIcon name="weather-sunset" size={22} color={colors.textSecondary} />
                    <View style={styles.syncCopy}>
                      <Text style={styles.calmStatusTitle}>Nothing saved is cooking today yet</Text>
                      <Text style={styles.calmStatusText}>
                        Your dishes stay saved. Pull to refresh when kitchen schedules change.
                      </Text>
                    </View>
                  </View>
                )}

                {savedForLater.length > 0 ? (
                  <View style={styles.savedSection}>
                    <View style={styles.sectionHeader}>
                      <Text accessibilityRole="header" style={styles.sectionTitle}>
                        Saved for later
                      </Text>
                      <Text style={styles.countText}>{savedForLater.length}</Text>
                    </View>
                    {savedForLater.map(renderDishCard)}
                  </View>
                ) : null}

                <Text style={styles.transparencyCopy}>
                  Availability is checked from Craves catalog and kitchen schedule data. We do not label a dish “sold out” unless inventory data proves it.
                </Text>
              </>
            )}
          </View>
        </ScrollView>
        <CustomerLocationSelector
          visible={locationSelectorVisible}
          onClose={() => setLocationSelectorVisible(false)}
        />
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
  title: {
    color: colors.espressoBrown,
    fontSize: typography.hero,
    fontWeight: fontWeight.bold,
  },
  subtitle: {
    marginTop: spacing.xxs,
    color: colors.textSecondary,
    fontSize: typography.small,
  },
  syncCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.iconSurface,
  },
  syncCopy: {minWidth: 0, flex: 1},
  syncTitle: {
    color: colors.espressoBrown,
    fontSize: typography.small,
    fontWeight: fontWeight.bold,
  },
  syncText: {
    marginTop: spacing.xxs,
    color: colors.textSecondary,
    fontSize: typography.tiny,
  },
  loadingCard: {
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  loadingText: {color: colors.textSecondary, fontSize: typography.small},
  todaySection: {
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.successSoft,
  },
  todayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
  },
  todayIcon: {
    width: touchTarget.minimum,
    height: touchTarget.minimum,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
  },
  todayHeaderCopy: {minWidth: 0, flex: 1},
  todayTitle: {
    color: colors.successText,
    fontSize: typography.heading,
    fontWeight: fontWeight.bold,
  },
  todaySubtitle: {
    marginTop: spacing.xxs,
    color: colors.textSecondary,
    fontSize: typography.tiny,
  },
  calmStatusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
  },
  calmStatusTitle: {
    color: colors.espressoBrown,
    fontSize: typography.small,
    fontWeight: fontWeight.bold,
  },
  calmStatusText: {
    marginTop: spacing.xxs,
    color: colors.textSecondary,
    fontSize: typography.tiny,
  },
  savedSection: {gap: spacing.sm},
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    color: colors.espressoBrown,
    fontSize: typography.heading,
    fontWeight: fontWeight.bold,
  },
  countText: {
    color: colors.flameRedAccessible,
    fontSize: typography.small,
    fontWeight: fontWeight.bold,
  },
  dishCard: {
    minHeight: 124,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
    backgroundColor: colors.white,
    ...elevation.card,
  },
  dishCardUnavailable: {elevation: 0, shadowOpacity: 0},
  dishImage: {
    width: 104,
    height: 104,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
  },
  dishImageFallback: {
    width: 104,
    height: 104,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.iconSurface,
  },
  dishCopy: {minWidth: 0, flex: 1},
  dishName: {
    color: colors.espressoBrown,
    fontSize: typography.body,
    fontWeight: fontWeight.bold,
  },
  kitchenName: {
    marginTop: spacing.xxs,
    color: colors.textSecondary,
    fontSize: typography.small,
  },
  metaText: {
    marginTop: spacing.xxs,
    color: colors.textSecondary,
    fontSize: typography.tiny,
  },
  priceText: {
    marginTop: spacing.xs,
    color: colors.flameRedAccessible,
    fontSize: typography.body,
    fontWeight: fontWeight.bold,
  },
  availabilityBadge: {
    alignSelf: 'flex-start',
    marginTop: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radius.pill,
  },
  availabilityPositive: {backgroundColor: colors.successSoft},
  availabilityPositiveText: {color: colors.successText},
  availabilityAttention: {backgroundColor: colors.warningSoft},
  availabilityAttentionText: {color: colors.warningText},
  availabilityMuted: {backgroundColor: colors.surfaceMuted},
  availabilityMutedText: {color: colors.textSecondary},
  availabilityTitle: {
    fontSize: typography.tiny,
    fontWeight: fontWeight.bold,
  },
  availabilityDetail: {
    marginTop: spacing.xxs,
    color: colors.textSecondary,
    fontSize: typography.tiny,
  },
  queuedText: {
    marginTop: spacing.xxs,
    color: colors.flameRedAccessible,
    fontSize: typography.tiny,
    fontWeight: fontWeight.bold,
  },
  heartButton: {
    width: touchTarget.minimum,
    height: touchTarget.minimum,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.iconSurface,
  },
  transparencyCopy: {
    padding: spacing.sm,
    color: colors.textSecondary,
    fontSize: typography.tiny,
  },
  pressed: {opacity: 0.72},
});
