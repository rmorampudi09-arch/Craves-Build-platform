import type {NearbyDish, NearbyDishPage} from './api/homeFeedApi';
import {
  filterHomeDishes,
  flattenNearbyDishPages,
  formatDishPrice,
  formatDistance,
  getHomeCategories,
} from './homePresentation';

function dish(overrides: Partial<NearbyDish> = {}): NearbyDish {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    kitchenId: '22222222-2222-4222-8222-222222222222',
    kitchenName: 'Kitchen One',
    kitchenDisplayName: 'Kitchen One',
    areaName: 'Area',
    city: 'City',
    state: 'State',
    kitchenLatitude: 17.4,
    kitchenLongitude: 78.4,
    distanceMeters: 850,
    itemName: 'Paneer Bowl',
    description: 'Fresh paneer with rice',
    category: 'Bowls',
    foodType: 'VEG',
    price: 199,
    currency: 'INR',
    servesCount: 1,
    preparationTimeMinutes: 25,
    spiceLevel: 'MEDIUM',
    unitPackageWeightGrams: 450,
    thermoboxRequired: false,
    primaryImageUrl: null,
    ...overrides,
  };
}

function page(menuItems: NearbyDish[], pageNumber = 0): NearbyDishPage {
  return {
    latitude: 17.4,
    longitude: 78.4,
    radiusMeters: 10_000,
    page: {
      page: pageNumber,
      size: 20,
      totalElements: menuItems.length,
      totalPages: 1,
      hasNext: false,
    },
    menuItems,
  };
}

describe('home presentation', () => {
  it('flattens pages while protecting against duplicate menu items', () => {
    const first = dish();
    const second = dish({
      id: '33333333-3333-4333-8333-333333333333',
      itemName: 'Dosa',
      category: 'Breakfast',
    });

    expect(flattenNearbyDishPages([page([first]), page([first, second], 1)])).toEqual([
      first,
      second,
    ]);
  });

  it('derives stable categories only from authoritative nearby results', () => {
    expect(
      getHomeCategories([
        dish({category: 'Bowls'}),
        dish({category: 'Breakfast'}),
        dish({category: 'Bowls'}),
      ]),
    ).toEqual(['Bowls', 'Breakfast']);
  });

  it('filters only the already-loaded nearby result set', () => {
    const paneer = dish();
    const dosa = dish({
      id: '33333333-3333-4333-8333-333333333333',
      itemName: 'Masala Dosa',
      description: 'Crisp dosa',
      category: 'Breakfast',
      kitchenName: 'South Kitchen',
      kitchenDisplayName: 'South Kitchen',
    });

    expect(filterHomeDishes([paneer, dosa], 'south', null)).toEqual([dosa]);
    expect(filterHomeDishes([paneer, dosa], '', 'Bowls')).toEqual([paneer]);
  });

  it('formats customer-facing price and distance without changing source values', () => {
    expect(formatDishPrice(199, 'INR')).toBe('₹199');
    expect(formatDishPrice(12.5, 'USD')).toBe('USD 12.50');
    expect(formatDistance(850)).toBe('850 m away');
    expect(formatDistance(1450)).toBe('1.4 km away');
  });
});
