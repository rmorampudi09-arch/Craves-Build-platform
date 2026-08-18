import React, {useMemo, useState} from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import type {CustomerHomeStackParamList} from '../../../app/navigation/types';
import {useAppSelector} from '../../../app/store/hooks';
import {
  colors,
  fontWeight,
  radius,
  spacing,
  touchTarget,
  typography,
} from '../../../design/tokens';
import {Icon} from '../../../shared/components/Icon';
import {ScreenShell} from '../../../shared/components/ScreenShell';
import type {NearbyKitchen} from '../../chefDiscovery/api/nearbyChefDiscoveryApi';
import {
  filterLoadedNearbyKitchens,
  flattenNearbyKitchenPages,
  formatKitchenDistance,
} from '../../chefDiscovery/chefDiscoveryPresentation';
import {useNearbyChefDiscoveryQuery} from '../../chefDiscovery/query/nearbyChefDiscoveryQueries';
import type {NearbyDish} from '../../home/api/homeFeedApi';
import {
  filterHomeDishes,
  flattenNearbyDishPages,
  formatDishPrice,
  formatDistance,
} from '../../home/homePresentation';
import {useHomeNearbyDishesQuery} from '../../home/query/homeFeedQueries';
import {DiscoverySearchInput} from '../components/DiscoverySearchInput';

const SEARCH_RADIUS_METERS = 10_000;
const SEARCH_PAGE_SIZE = 50;

type SearchRow =
  | {kind: 'section'; key: string; title: string}
  | {kind: 'dish'; key: string; dish: NearbyDish}
  | {kind: 'kitchen'; key: string; kitchen: NearbyKitchen};

export function CustomerHomeSearchScreen() {
  const navigation = useNavigation<
    NativeStackNavigationProp<CustomerHomeStackParamList, 'CustomerHomeSearch'>
  >();
  const selectedLocation = useAppSelector(state => state.customerShell.selectedLocation);
  const [query, setQuery] = useState('');
  const dishesQuery = useHomeNearbyDishesQuery({
    radiusMeters: SEARCH_RADIUS_METERS,
    size: SEARCH_PAGE_SIZE,
  });
  const kitchensQuery = useNearbyChefDiscoveryQuery({
    radiusMeters: SEARCH_RADIUS_METERS,
    size: SEARCH_PAGE_SIZE,
  });

  const dishes = useMemo(
    () => flattenNearbyDishPages(dishesQuery.data?.pages),
    [dishesQuery.data?.pages],
  );
  const kitchens = useMemo(
    () => flattenNearbyKitchenPages(kitchensQuery.data?.pages),
    [kitchensQuery.data?.pages],
  );
  const normalizedQuery = query.trim();
  const matchingDishes = useMemo(
    () =>
      normalizedQuery
        ? filterHomeDishes(dishes, normalizedQuery, null).slice(0, 20)
        : [],
    [dishes, normalizedQuery],
  );
  const matchingKitchens = useMemo(() => {
    if (!normalizedQuery) return [];

    const normalized = normalizedQuery.toLocaleLowerCase();
    const baseMatches = filterLoadedNearbyKitchens(kitchens, normalizedQuery);
    const matchedIds = new Set(baseMatches.map(kitchen => kitchen.id));
    const displayNameMatches = kitchens.filter(
      kitchen =>
        !matchedIds.has(kitchen.id) &&
        kitchen.displayName?.toLocaleLowerCase().includes(normalized),
    );
    return [...baseMatches, ...displayNameMatches].slice(0, 20);
  }, [kitchens, normalizedQuery]);

  const rows = useMemo<SearchRow[]>(() => {
    const next: SearchRow[] = [];
    if (matchingDishes.length > 0) {
      next.push({kind: 'section', key: 'section:dishes', title: 'Dishes'});
      next.push(
        ...matchingDishes.map(dish => ({
          kind: 'dish' as const,
          key: `dish:${dish.id}`,
          dish,
        })),
      );
    }
    if (matchingKitchens.length > 0) {
      next.push({kind: 'section', key: 'section:kitchens', title: 'Kitchens'});
      next.push(
        ...matchingKitchens.map(kitchen => ({
          kind: 'kitchen' as const,
          key: `kitchen:${kitchen.id}`,
          kitchen,
        })),
      );
    }
    return next;
  }, [matchingDishes, matchingKitchens]);

  const loading =
    Boolean(selectedLocation) &&
    (dishesQuery.isPending || kitchensQuery.isPending) &&
    dishes.length === 0 &&
    kitchens.length === 0;
  const hasNoMatches = normalizedQuery.length > 0 && !loading && rows.length === 0;

  return (
    <ScreenShell edges={['top']} testID="customer-home-search">
      <View style={styles.root}>
        <View style={styles.searchHeader}>
          <Pressable
            accessibilityLabel="Back to Home"
            accessibilityRole="button"
            hitSlop={spacing.xs}
            onPress={() => navigation.goBack()}
            style={({pressed}) => [styles.backButton, pressed && styles.backPressed]}>
            <Icon name="arrow-left" size={21} color={colors.espressoBrown} surface={false} />
          </Pressable>
          <DiscoverySearchInput
            accessibilityLabel="Search dishes and kitchens"
            autoFocus
            onChangeText={setQuery}
            onClear={() => setQuery('')}
            placeholder="Search dishes or kitchens"
            style={styles.searchInput}
            value={query}
          />
        </View>

        {!selectedLocation ? (
          <View style={styles.messageWrap}>
            <Text style={styles.messageTitle}>Choose a delivery location first</Text>
            <Text style={styles.messageCopy}>
              Nearby dish and kitchen search needs your selected delivery location.
            </Text>
          </View>
        ) : loading ? (
          <View accessibilityRole="progressbar" style={styles.messageWrap}>
            <ActivityIndicator color={colors.flameRed} />
            <Text style={styles.messageCopy}>Loading nearby dishes and kitchens…</Text>
          </View>
        ) : normalizedQuery.length === 0 ? (
          <View style={styles.messageWrap}>
            <Text style={styles.messageTitle}>Search nearby food</Text>
            <Text style={styles.messageCopy}>
              Start typing. Matching dishes and kitchens update with every character.
            </Text>
          </View>
        ) : hasNoMatches ? (
          <View style={styles.messageWrap}>
            <Text style={styles.messageTitle}>No matches found</Text>
            <Text style={styles.messageCopy}>Try another dish or kitchen name.</Text>
          </View>
        ) : (
          <FlatList
            data={rows}
            keyExtractor={item => item.key}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.resultsContent}
            renderItem={({item}) => {
              if (item.kind === 'section') {
                return <Text style={styles.sectionTitle}>{item.title}</Text>;
              }

              if (item.kind === 'dish') {
                const kitchenName =
                  item.dish.kitchenDisplayName?.trim() || item.dish.kitchenName;
                return (
                  <Pressable
                    accessibilityLabel={`Open ${item.dish.itemName}`}
                    accessibilityRole="button"
                    onPress={() =>
                      navigation.navigate('CustomerDishDetail', {
                        menuItemId: item.dish.id,
                      })
                    }
                    style={({pressed}) => [styles.resultRow, pressed && styles.resultPressed]}>
                    <View style={styles.resultCopy}>
                      <Text numberOfLines={1} style={styles.resultTitle}>
                        {item.dish.itemName}
                      </Text>
                      <Text numberOfLines={1} style={styles.resultSubtitle}>
                        From {kitchenName} · {formatDistance(item.dish.distanceMeters)}
                      </Text>
                    </View>
                    <Text style={styles.resultPrice}>
                      {formatDishPrice(item.dish.price, item.dish.currency)}
                    </Text>
                    <Icon name="chevron-right" size={18} color={colors.textSecondary} surface={false} />
                  </Pressable>
                );
              }

              const title =
                item.kitchen.displayName?.trim() || item.kitchen.kitchenName.trim();
              return (
                <Pressable
                  accessibilityLabel={`Open ${title}`}
                  accessibilityRole="button"
                  onPress={() =>
                    navigation.navigate('CustomerKitchenProfile', {
                      kitchenId: item.kitchen.id,
                    })
                  }
                  style={({pressed}) => [styles.resultRow, pressed && styles.resultPressed]}>
                  <View style={styles.resultCopy}>
                    <Text numberOfLines={1} style={styles.resultTitle}>
                      {title}
                    </Text>
                    <Text numberOfLines={1} style={styles.resultSubtitle}>
                      Kitchen · {formatKitchenDistance(item.kitchen.distanceMeters)}
                    </Text>
                  </View>
                  <Icon name="chevron-right" size={18} color={colors.textSecondary} surface={false} />
                </Pressable>
              );
            }}
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.white,
  },
  searchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: colors.white,
  },
  backButton: {
    width: touchTarget.minimum,
    height: touchTarget.minimum,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
  },
  backPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  searchInput: {
    minWidth: 0,
    flex: 1,
  },
  messageWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
  },
  messageTitle: {
    color: colors.espressoBrown,
    fontSize: typography.heading,
    fontWeight: fontWeight.bold,
    textAlign: 'center',
  },
  messageCopy: {
    color: colors.textSecondary,
    fontSize: typography.small,
    lineHeight: 20,
    textAlign: 'center',
  },
  resultsContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xxl,
  },
  sectionTitle: {
    marginTop: spacing.md,
    marginBottom: spacing.xs,
    color: colors.espressoBrown,
    fontSize: typography.body,
    fontWeight: fontWeight.bold,
  },
  resultRow: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  resultPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  resultCopy: {
    minWidth: 0,
    flex: 1,
  },
  resultTitle: {
    color: colors.espressoBrown,
    fontSize: typography.body,
    fontWeight: fontWeight.bold,
  },
  resultSubtitle: {
    marginTop: spacing.xxs,
    color: colors.textSecondary,
    fontSize: typography.tiny,
  },
  resultPrice: {
    color: colors.espressoBrown,
    fontSize: typography.small,
    fontWeight: fontWeight.bold,
  },
});