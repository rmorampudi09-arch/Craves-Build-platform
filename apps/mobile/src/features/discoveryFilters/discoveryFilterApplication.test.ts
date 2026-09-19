import type {NearbyDish} from '../home/api/homeFeedApi';
import {applyHomeDiscoveryFilters} from './discoveryFilterApplication';
import {
  areDiscoveryFiltersEqual,
  createDefaultDiscoveryFilters,
  discoveryFilterActions,
  discoveryFilterReducer,
  resolveDiscoveryFilterSession,
  type DiscoveryFilterState,
} from './state/discoveryFilterSlice';

function dish(
  id: string,
  price: number,
  foodType: NearbyDish['foodType'],
): NearbyDish {
  return {
    id,
    kitchenId: '00000000-0000-4000-8000-000000000001',
    kitchenName: 'Kitchen',
    kitchenDisplayName: null,
    areaName: null,
    city: null,
    state: null,
    kitchenLatitude: 17.4,
    kitchenLongitude: 78.4,
    distanceMeters: 100,
    itemName: id,
    description: null,
    category: 'Meals',
    foodType,
    price,
    currency: 'INR',
    servesCount: null,
    preparationTimeMinutes: null,
    spiceLevel: null,
    unitPackageWeightGrams: null,
    thermoboxRequired: null,
    primaryImageUrl: null,
  };
}

describe('P38 discovery filters', () => {
  it('keeps draft/application values scoped to user and location', () => {
    let state = discoveryFilterReducer(undefined, {type: 'init'});
    state = discoveryFilterReducer(
      state,
      discoveryFilterActions.filtersApplied({
        surface: 'HOME',
        scopeKey: 'user:address-a',
        filters: {
          sort: 'PRICE_LOW_TO_HIGH',
          cuisineIds: [],
          diets: ['VEG'],
          minPrice: 100,
          maxPrice: 300,
          maxPreparationTimeMinutes: 30,
          spiceLevel: 'MEDIUM',
        },
      }),
    );

    expect(
      resolveDiscoveryFilterSession(state.sessions.HOME, 'user:address-a').applied,
    ).toEqual({
      sort: 'PRICE_LOW_TO_HIGH',
      cuisineIds: [],
      diets: ['VEG'],
      minPrice: 100,
      maxPrice: 300,
      maxPreparationTimeMinutes: 30,
      spiceLevel: 'MEDIUM',
    });
    expect(
      resolveDiscoveryFilterSession(state.sessions.HOME, 'user:address-b').applied,
    ).toEqual(createDefaultDiscoveryFilters());
  });

  it('normalizes selections for stable dirty-state comparison', () => {
    expect(
      areDiscoveryFiltersEqual(
        {
          sort: 'RECOMMENDED',
          cuisineIds: ['b', 'a', 'a'],
          diets: ['EGG', 'VEG'],
          minPrice: 100,
          maxPrice: 300,
          maxPreparationTimeMinutes: 45,
          spiceLevel: 'SPICY',
        },
        {
          sort: 'RECOMMENDED',
          cuisineIds: ['a', 'b'],
          diets: ['VEG', 'EGG'],
          minPrice: 100,
          maxPrice: 300,
          maxPreparationTimeMinutes: 45,
          spiceLevel: 'SPICY',
        },
      ),
    ).toBe(true);
  });

  it('filters loaded dishes by diet and sorts price without mutating input order', () => {
    const source = [
      dish('veg-high', 300, 'VEG'),
      dish('non-veg', 150, 'NON_VEG'),
      dish('veg-low', 100, 'VEG'),
    ];

    const result = applyHomeDiscoveryFilters(source, {
      sort: 'PRICE_LOW_TO_HIGH',
      cuisineIds: [],
      diets: ['VEG'],
      minPrice: null,
      maxPrice: null,
      maxPreparationTimeMinutes: null,
      spiceLevel: null,
    });

    expect(result.map(item => item.id)).toEqual(['veg-low', 'veg-high']);
    expect(source.map(item => item.id)).toEqual(['veg-high', 'non-veg', 'veg-low']);
  });

  it('applies Catalog v2 price, prep-time and spice filters to loaded rows', () => {
    const quick = {
      ...dish('quick', 180, 'VEG'),
      preparationTimeMinutes: 20,
      spiceLevel: 'MILD' as const,
    };
    const slow = {
      ...dish('slow', 220, 'VEG'),
      preparationTimeMinutes: 50,
      spiceLevel: 'MILD' as const,
    };
    const spicy = {
      ...dish('spicy', 200, 'VEG'),
      preparationTimeMinutes: 20,
      spiceLevel: 'SPICY' as const,
    };

    const result = applyHomeDiscoveryFilters([quick, slow, spicy], {
      sort: 'PREPARATION_TIME_ASC',
      cuisineIds: [],
      diets: ['VEG'],
      minPrice: 150,
      maxPrice: 250,
      maxPreparationTimeMinutes: 30,
      spiceLevel: 'MILD',
    });

    expect(result.map(item => item.id)).toEqual(['quick']);
  });

  it('fails closed to no price range when persisted bounds are inverted', () => {
    let state = discoveryFilterReducer(undefined, {type: 'init'});
    state = discoveryFilterReducer(
      state,
      discoveryFilterActions.filtersApplied({
        surface: 'HOME',
        scopeKey: 'user:address-a',
        filters: {
          sort: 'RECOMMENDED',
          cuisineIds: [],
          diets: [],
          minPrice: 500,
          maxPrice: 100,
          maxPreparationTimeMinutes: null,
          spiceLevel: null,
        },
      }),
    );

    expect(state.sessions.HOME.applied.minPrice).toBeNull();
    expect(state.sessions.HOME.applied.maxPrice).toBeNull();
  });

  it('clears only the targeted scoped applied filters', () => {
    const seeded: DiscoveryFilterState = {
      sessions: {
        HOME: {
          scopeKey: 'user:address-a',
          applied: {
            sort: 'PRICE_HIGH_TO_LOW',
            cuisineIds: [],
            diets: ['EGG'],
            minPrice: null,
            maxPrice: null,
            maxPreparationTimeMinutes: null,
            spiceLevel: null,
          },
        },
        CHEFS: {
          scopeKey: 'user:address-a',
          applied: createDefaultDiscoveryFilters(),
        },
      },
    };

    const next = discoveryFilterReducer(
      seeded,
      discoveryFilterActions.filtersCleared({
        surface: 'HOME',
        scopeKey: 'user:address-a',
      }),
    );

    expect(next.sessions.HOME.applied).toEqual(createDefaultDiscoveryFilters());
    expect(next.sessions.CHEFS).toBe(seeded.sessions.CHEFS);
  });
});
