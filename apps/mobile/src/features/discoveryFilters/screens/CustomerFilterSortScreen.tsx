import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  useNavigation,
  useRoute,
  type NavigationProp,
  type RouteProp,
} from '@react-navigation/native';
import {useAppDispatch, useAppSelector} from '../../../app/store/hooks';
import {
  colors,
  fontWeight,
  radius,
  spacing,
  touchTarget,
  typography,
} from '../../../design/tokens';
import {Button} from '../../../shared/components/Button';
import {Icon} from '../../../shared/components/Icon';
import {ScreenShell} from '../../../shared/components/ScreenShell';
import {discoverySearchActions} from '../../discoverySearch/state/discoverySearchSlice';
import {getDiscoveryFilterCapabilities} from '../discoveryFilterApplication';
import {
  areDiscoveryFiltersEqual,
  createDefaultDiscoveryFilters,
  discoveryFilterActions,
  resolveDiscoveryFilterSession,
  type DiscoveryDietOption,
  type DiscoveryFilterSnapshot,
  type DiscoveryFilterSurface,
  type DiscoverySortOption,
} from '../state/discoveryFilterSlice';

type FilterSortRouteParams = {
  CustomerFilterSort: {origin: DiscoveryFilterSurface};
};

interface SortRowDefinition {
  key: string;
  label: string;
  description: string;
  value: DiscoverySortOption | null;
  supportedOnHome?: boolean;
  supportedOnChefs?: boolean;
}

const SORT_ROWS: readonly SortRowDefinition[] = [
  {
    key: 'recommended',
    label: 'Recommended',
    description: 'Keep the current discovery ranking.',
    value: 'RECOMMENDED',
    supportedOnHome: true,
    supportedOnChefs: true,
  },
  {
    key: 'popular',
    label: 'Most Popular',
    description: 'Requires popularity ranking from discovery.',
    value: null,
  },
  {
    key: 'rating',
    label: 'Rating',
    description: 'Requires rating data from discovery.',
    value: null,
  },
  {
    key: 'delivery',
    label: 'Delivery Time',
    description: 'Requires an authoritative delivery-time field.',
    value: null,
  },
  {
    key: 'price-low',
    label: 'Price: Low to High',
    description: 'Sort the currently loaded nearby meals by price.',
    value: 'PRICE_LOW_TO_HIGH',
    supportedOnHome: true,
  },
  {
    key: 'price-high',
    label: 'Price: High to Low',
    description: 'Sort the currently loaded nearby meals by price.',
    value: 'PRICE_HIGH_TO_LOW',
    supportedOnHome: true,
  },
];

const DIET_ROWS: readonly {value: DiscoveryDietOption; label: string}[] = [
  {value: 'VEG', label: 'Vegetarian'},
  {value: 'NON_VEG', label: 'Non-vegetarian'},
  {value: 'EGG', label: 'Egg'},
];

function cloneFilters(filters: DiscoveryFilterSnapshot): DiscoveryFilterSnapshot {
  return {
    sort: filters.sort,
    cuisineIds: [...filters.cuisineIds],
    diets: [...filters.diets],
  };
}

export function CustomerFilterSortScreen() {
  const dispatch = useAppDispatch();
  const navigation = useNavigation<NavigationProp<FilterSortRouteParams>>();
  const route = useRoute<RouteProp<FilterSortRouteParams, 'CustomerFilterSort'>>();
  const origin = route.params.origin;
  const identityId = useAppSelector(state => state.auth.identity?.id ?? null);
  const selectedLocation = useAppSelector(state => state.customerShell.selectedLocation);
  const storedSession = useAppSelector(state => state.discoveryFilters.sessions[origin]);
  const scopeKey =
    identityId && selectedLocation
      ? `${identityId}:${selectedLocation.addressId}`
      : null;
  const applied = useMemo(
    () => resolveDiscoveryFilterSession(storedSession, scopeKey).applied,
    [scopeKey, storedSession],
  );
  const capabilities = useMemo(
    () => getDiscoveryFilterCapabilities(origin),
    [origin],
  );
  const [draft, setDraft] = useState<DiscoveryFilterSnapshot>(() =>
    cloneFilters(applied),
  );
  const allowRemoveRef = useRef(false);
  const isDirty = !areDiscoveryFiltersEqual(draft, applied);

  useEffect(() => {
    setDraft(cloneFilters(applied));
  }, [applied]);

  useEffect(
    () =>
      navigation.addListener('beforeRemove', event => {
        if (allowRemoveRef.current || !isDirty) {
          return;
        }

        event.preventDefault();
        Alert.alert(
          'Discard filter changes?',
          'Your applied filters will stay unchanged.',
          [
            {text: 'Keep editing', style: 'cancel'},
            {
              text: 'Discard',
              style: 'destructive',
              onPress: () => {
                allowRemoveRef.current = true;
                navigation.dispatch(event.data.action);
              },
            },
          ],
        );
      }),
    [isDirty, navigation],
  );

  const selectSort = (value: DiscoverySortOption) => {
    setDraft(current => ({...current, sort: value}));
  };

  const toggleDiet = (value: DiscoveryDietOption) => {
    setDraft(current => {
      const selected = current.diets.includes(value);
      return {
        ...current,
        diets: selected
          ? current.diets.filter(diet => diet !== value)
          : [...current.diets, value],
      };
    });
  };

  const resetDraft = () => {
    setDraft(createDefaultDiscoveryFilters());
  };

  const applyFilters = () => {
    const criteriaChanged = !areDiscoveryFiltersEqual(draft, applied);
    dispatch(
      discoveryFilterActions.filtersApplied({
        surface: origin,
        scopeKey,
        filters: draft,
      }),
    );

    if (criteriaChanged) {
      dispatch(
        discoverySearchActions.scrollOffsetSaved({
          surface: origin,
          scopeKey,
          scrollOffset: 0,
        }),
      );
    }

    allowRemoveRef.current = true;
    navigation.goBack();
  };

  const originLabel = origin === 'HOME' ? 'nearby meals' : 'home chefs';

  return (
    <ScreenShell
      edges={['top', 'bottom']}
      keyboardAvoiding={false}
      testID="customer-filter-sort">
      <View style={styles.root}>
        <View style={styles.header}>
          <Pressable
            accessibilityLabel="Back"
            accessibilityRole="button"
            hitSlop={spacing.xs}
            onPress={() => navigation.goBack()}
            style={({pressed}) => [
              styles.headerAction,
              pressed && styles.headerActionPressed,
            ]}>
            <Icon name="arrow-left" size={22} color={colors.espressoBrown} />
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={styles.title}>Filter &amp; Sort</Text>
            <Text style={styles.subtitle}>Refine {originLabel}</Text>
          </View>
          <Pressable
            accessibilityLabel="Reset filter draft"
            accessibilityRole="button"
            onPress={resetDraft}
            style={({pressed}) => [
              styles.resetAction,
              pressed && styles.headerActionPressed,
            ]}>
            <Text style={styles.resetText}>Reset</Text>
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Sort by</Text>
            <Text style={styles.sectionHint}>Choose one ordering option.</Text>
            <View style={styles.card}>
              {SORT_ROWS.map((row, index) => {
                const supported =
                  row.value !== null &&
                  (origin === 'HOME'
                    ? row.supportedOnHome === true
                    : row.supportedOnChefs === true);
                const selected = supported && draft.sort === row.value;
                return (
                  <Pressable
                    key={row.key}
                    accessibilityLabel={row.label}
                    accessibilityRole="radio"
                    accessibilityState={{checked: selected, disabled: !supported}}
                    disabled={!supported}
                    onPress={() => row.value && selectSort(row.value)}
                    style={({pressed}) => [
                      styles.optionRow,
                      index > 0 && styles.optionDivider,
                      !supported && styles.optionDisabled,
                      pressed && supported && styles.optionPressed,
                    ]}>
                    <View style={styles.optionCopy}>
                      <Text style={styles.optionLabel}>{row.label}</Text>
                      <Text style={styles.optionDescription}>{row.description}</Text>
                    </View>
                    <View style={[styles.radio, selected && styles.radioSelected]}>
                      {selected ? <View style={styles.radioDot} /> : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Cuisine</Text>
            <Text style={styles.sectionHint}>Choose one or more cuisines.</Text>
            <View style={styles.unavailableCard}>
              <Text style={styles.unavailableTitle}>Cuisine filters unavailable</Text>
              <Text style={styles.unavailableText}>
                The current discovery contract does not expose typed cuisine IDs or filter metadata, so Craves will not send guessed cuisine values.
              </Text>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Diet</Text>
            <Text style={styles.sectionHint}>Select any dietary constraints that apply.</Text>
            {capabilities.supportsDiet ? (
              <View style={styles.card}>
                {DIET_ROWS.map((row, index) => {
                  const selected = draft.diets.includes(row.value);
                  return (
                    <Pressable
                      key={row.value}
                      accessibilityLabel={row.label}
                      accessibilityRole="checkbox"
                      accessibilityState={{checked: selected}}
                      onPress={() => toggleDiet(row.value)}
                      style={({pressed}) => [
                        styles.optionRow,
                        index > 0 && styles.optionDivider,
                        pressed && styles.optionPressed,
                      ]}>
                      <Text style={styles.optionLabel}>{row.label}</Text>
                      <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
                        {selected ? <Icon name="check" size={16} color={colors.white} /> : null}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              <View style={styles.unavailableCard}>
                <Text style={styles.unavailableTitle}>Diet filters unavailable here</Text>
                <Text style={styles.unavailableText}>
                  Nearby-kitchen results do not currently include a typed dietary filter field.
                </Text>
              </View>
            )}
          </View>

          <View style={styles.contractNote}>
            <Text style={styles.contractNoteTitle}>Current contract boundary</Text>
            <Text style={styles.contractNoteText}>
              Price sorting and diet filtering are applied only to loaded Home meal results. Popularity, rating, delivery-time, cuisine facets and result-count preview remain disabled until exact server contracts exist.
            </Text>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <Button
            accessibilityHint="Commits this draft once and returns to the originating discovery list"
            label="Apply Filters"
            onPress={applyFilters}
            testID="apply-discovery-filters"
          />
        </View>
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surfaceBase,
  },
  header: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.white,
  },
  headerAction: {
    width: touchTarget.minimum,
    height: touchTarget.minimum,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerActionPressed: {
    backgroundColor: colors.surfaceWarm,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: spacing.sm,
  },
  title: {
    color: colors.espressoBrown,
    fontSize: typography.heading,
    fontWeight: fontWeight.extrabold,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: typography.tiny,
    marginTop: spacing.xxs,
  },
  resetAction: {
    minWidth: touchTarget.minimum,
    minHeight: touchTarget.minimum,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resetText: {
    color: colors.flameRed,
    fontSize: typography.small,
    fontWeight: fontWeight.bold,
  },
  scrollContent: {
    padding: spacing.md,
    paddingBottom: spacing.xl,
    gap: spacing.xl,
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    color: colors.espressoBrown,
    fontSize: typography.heading,
    fontWeight: fontWeight.bold,
  },
  sectionHint: {
    color: colors.textSecondary,
    fontSize: typography.small,
  },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    overflow: 'hidden',
  },
  optionRow: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  optionDivider: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  optionDisabled: {
    opacity: 0.48,
  },
  optionPressed: {
    backgroundColor: colors.surfaceWarm,
  },
  optionCopy: {
    flex: 1,
    minWidth: 0,
  },
  optionLabel: {
    color: colors.espressoBrown,
    fontSize: typography.body,
    fontWeight: fontWeight.semibold,
  },
  optionDescription: {
    color: colors.textSecondary,
    fontSize: typography.tiny,
    marginTop: spacing.xxs,
  },
  radio: {
    width: 22,
    height: 22,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: colors.flameRed,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.flameRed,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: {
    borderColor: colors.flameRed,
    backgroundColor: colors.flameRed,
  },
  unavailableCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceWarm,
    padding: spacing.md,
  },
  unavailableTitle: {
    color: colors.espressoBrown,
    fontSize: typography.body,
    fontWeight: fontWeight.bold,
  },
  unavailableText: {
    color: colors.textSecondary,
    fontSize: typography.small,
    lineHeight: 20,
    marginTop: spacing.xs,
  },
  contractNote: {
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceMuted,
    padding: spacing.md,
  },
  contractNoteTitle: {
    color: colors.espressoBrown,
    fontSize: typography.small,
    fontWeight: fontWeight.bold,
  },
  contractNoteText: {
    color: colors.textSecondary,
    fontSize: typography.tiny,
    lineHeight: 18,
    marginTop: spacing.xs,
  },
  footer: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.white,
  },
});
