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
import {dishDetailApi, type CustomerDishDetail} from '../../dishDetail/api/dishDetailApi';
import {
  useCustomerFavoritesQuery,
  useToggleCustomerFavorite,
} from '../query/customerFavoritesQueries';

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

function formatPrice(amount: number, currency: string): string {
  const value = Number.isInteger(amount) ? amount.toFixed(0) : amount.toFixed(2);
  return currency === 'INR' ? `₹${value}` : `${currency} ${value}`;
}

export function CustomerFavoritesScreen() {
  const navigation = useNavigation<FavoritesNavigation>();
  const bottomNavScroll = useCustomerBottomNavScroll();
  const favorites = useCustomerFavoritesQuery();
  const toggleFavorite = useToggleCustomerFavorite();
  const [locationSelectorVisible, setLocationSelectorVisible] = React.useState(false);
  const [details, setDetails] = React.useState<Record<string, CustomerDishDetail>>({});
  const [detailLoading, setDetailLoading] = React.useState(false);

  React.useEffect(() => {
    const rows = favorites.data ?? [];
    if (!rows.length) {
      setDetails({});
      setDetailLoading(false);
      return;
    }

    const controller = new AbortController();
    setDetailLoading(true);
    Promise.allSettled(
      rows.map(favorite =>
        dishDetailApi.getCustomerDishDetail(favorite.menuItemId, controller.signal),
      ),
    )
      .then(results => {
        if (controller.signal.aborted) return;
        const next: Record<string, CustomerDishDetail> = {};
        results.forEach(result => {
          if (result.status === 'fulfilled') {
            next[result.value.id] = result.value;
          }
        });
        setDetails(next);
      })
      .finally(() => {
        if (!controller.signal.aborted) setDetailLoading(false);
      });
    return () => controller.abort();
  }, [favorites.data]);

  const browseMeals = React.useCallback(() => {
    const tabs = navigation.getParent<CustomerTabsNavigation>();
    if (tabs) {
      tabs.navigate('Home');
      return;
    }
    navigation.goBack();
  }, [navigation]);

  const refresh = React.useCallback(() => {
    favorites.refetch().catch(() => undefined);
  }, [favorites]);

  const favoriteRows = favorites.data ?? [];
  const loadedRows = favoriteRows
    .map(favorite => details[favorite.menuItemId])
    .filter((dish): dish is CustomerDishDetail => Boolean(dish));

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
                refreshing={favorites.isRefetching}
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
                <Text accessibilityRole="header" style={styles.title}>Favorites</Text>
                <Text style={styles.subtitle}>
                  Your saved dishes stay synchronized with your Craves customer account.
                </Text>
              </View>
            </View>

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
            ) : (
              <>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Saved dishes</Text>
                  <Text style={styles.countText}>{favoriteRows.length}</Text>
                </View>
                {loadedRows.map(dish => (
                  <Pressable
                    accessibilityRole="button"
                    key={dish.id}
                    onPress={() => navigation.navigate('CustomerDishDetail', {menuItemId: dish.id})}
                    style={({pressed}) => [styles.dishCard, pressed && styles.pressed]}>
                    {dish.images[0]?.url ? (
                      <Image
                        accessibilityIgnoresInvertColors
                        source={{uri: dish.images[0].url}}
                        resizeMode="cover"
                        style={styles.dishImage}
                      />
                    ) : (
                      <View style={styles.dishImageFallback}>
                        <FilledIcon name="food" size={30} color={colors.flameRed} />
                      </View>
                    )}
                    <View style={styles.dishCopy}>
                      <Text numberOfLines={2} style={styles.dishName}>{dish.itemName}</Text>
                      <Text numberOfLines={1} style={styles.kitchenName}>
                        {dish.kitchen.displayName ?? dish.kitchen.kitchenName}
                      </Text>
                      <Text style={styles.metaText}>
                        {dish.category} · {dish.foodType === 'NON_VEG' ? 'Non-veg' : dish.foodType === 'EGG' ? 'Egg' : 'Veg'}
                      </Text>
                      <Text style={styles.priceText}>{formatPrice(dish.price.amount, dish.price.currency)}</Text>
                    </View>
                    <Pressable
                      accessibilityLabel={`Remove ${dish.itemName} from favorites`}
                      accessibilityRole="button"
                      accessibilityState={{busy: toggleFavorite.isPending}}
                      disabled={toggleFavorite.isPending}
                      hitSlop={spacing.xs}
                      onPress={event => {
                        event.stopPropagation();
                        toggleFavorite.mutate({menuItemId: dish.id, favorite: true});
                      }}
                      style={({pressed}) => [styles.heartButton, pressed && styles.pressed]}>
                      <FilledIcon name="heart" size={24} color={colors.flameRed} />
                    </Pressable>
                  </Pressable>
                ))}
                {detailLoading ? (
                  <View style={styles.detailLoadingRow}>
                    <ActivityIndicator size="small" color={colors.flameRed} />
                    <Text style={styles.loadingText}>Refreshing dish details…</Text>
                  </View>
                ) : loadedRows.length < favoriteRows.length ? (
                  <Text style={styles.staleCopy}>
                    Some saved dishes are no longer currently sellable and are hidden until the catalog can verify them again.
                  </Text>
                ) : null}
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
  title: {color: colors.espressoBrown, fontSize: typography.hero, fontWeight: fontWeight.bold},
  subtitle: {marginTop: spacing.xxs, color: colors.textSecondary, fontSize: typography.small},
  loadingCard: {minHeight: 220, alignItems: 'center', justifyContent: 'center', gap: spacing.sm},
  loadingText: {color: colors.textSecondary, fontSize: typography.small},
  sectionHeader: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  sectionTitle: {color: colors.espressoBrown, fontSize: typography.heading, fontWeight: fontWeight.bold},
  countText: {color: colors.flameRedAccessible, fontSize: typography.small, fontWeight: fontWeight.bold},
  dishCard: {
    minHeight: 124,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: borderWidth.standard,
    borderColor: colors.border,
    backgroundColor: colors.white,
    ...elevation.card,
  },
  dishImage: {width: 104, height: 104, borderRadius: radius.md, backgroundColor: colors.surfaceMuted},
  dishImageFallback: {width: 104, height: 104, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.iconSurface},
  dishCopy: {minWidth: 0, flex: 1},
  dishName: {color: colors.espressoBrown, fontSize: typography.body, fontWeight: fontWeight.bold},
  kitchenName: {marginTop: spacing.xxs, color: colors.textSecondary, fontSize: typography.small},
  metaText: {marginTop: spacing.xxs, color: colors.textSecondary, fontSize: typography.tiny},
  priceText: {marginTop: spacing.xs, color: colors.flameRedAccessible, fontSize: typography.body, fontWeight: fontWeight.bold},
  heartButton: {width: touchTarget.minimum, height: touchTarget.minimum, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, backgroundColor: colors.iconSurface},
  detailLoadingRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, padding: spacing.md},
  staleCopy: {padding: spacing.sm, color: colors.textSecondary, fontSize: typography.small, lineHeight: 20},
  pressed: {opacity: 0.72},
});
