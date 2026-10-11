import type {NearbyKitchen, NearbyKitchenPage} from './api/nearbyChefDiscoveryApi';
import type {NearbyDish} from '../home/api/homeFeedApi';
import {
  filterLoadedNearbyKitchens,
  flattenNearbyKitchenPages,
  formatKitchenDistance,
  formatKitchenLocation,
  getKitchenInitials,
  summarizeKitchenDishes,
} from './chefDiscoveryPresentation';

const kitchen: NearbyKitchen = {
  id: '11111111-1111-4111-8111-111111111111',
  kitchenName: 'Lakshmi Home Kitchen',
  displayName: 'Lakshmi Kitchen',
  description: 'Fresh Andhra meals',
  areaName: 'Madhapur',
  city: 'Hyderabad',
  state: 'Telangana',
  latitude: 17.4483,
  longitude: 78.3915,
  distanceMeters: 1450,
  activeMenuItemCount: 8,
};

function page(pageNumber: number, kitchens: NearbyKitchen[]): NearbyKitchenPage {
  return {
    latitude: 17.4483,
    longitude: 78.3915,
    radiusMeters: 10000,
    page: {
      page: pageNumber,
      size: 20,
      totalElements: kitchens.length,
      totalPages: 1,
      hasNext: false,
    },
    kitchens,
  };
}

describe('P35 chef discovery presentation', () => {
  it('flattens paged kitchens without duplicating the same kitchen id', () => {
    expect(flattenNearbyKitchenPages([page(0, [kitchen]), page(1, [kitchen])])).toEqual([
      kitchen,
    ]);
  });

  it('filters only kitchen-facing fields and does not use display name', () => {
    expect(filterLoadedNearbyKitchens([kitchen], 'andhra')).toEqual([kitchen]);
    expect(filterLoadedNearbyKitchens([kitchen], 'madhapur')).toEqual([kitchen]);
    expect(filterLoadedNearbyKitchens([kitchen], 'lakshmi kitchen')).toEqual([]);
    expect(filterLoadedNearbyKitchens([kitchen], 'biryani')).toEqual([]);
  });

  it('formats authoritative kitchen-facing fields', () => {
    expect(formatKitchenDistance(850)).toBe('850 m away');
    expect(formatKitchenDistance(1450)).toBe('1.4 km away');
    expect(formatKitchenLocation(kitchen)).toBe('Madhapur, Hyderabad, Telangana');
    expect(getKitchenInitials(kitchen)).toBe('LH');
  });

  it('summarizes photos, prep time and cheapest price per kitchen', () => {
    const otherKitchenId = '22222222-2222-4222-8222-222222222222';
    const dish = (overrides: Partial<NearbyDish>): NearbyDish => ({
      id: '33333333-3333-4333-8333-333333333333',
      kitchenId: kitchen.id,
      kitchenName: kitchen.kitchenName,
      kitchenDisplayName: null,
      areaName: null,
      city: null,
      state: null,
      kitchenLatitude: null,
      kitchenLongitude: null,
      distanceMeters: 0,
      itemName: 'Pesarattu',
      description: null,
      category: 'Breakfast',
      foodType: 'VEG',
      price: 120,
      currency: 'INR',
      servesCount: null,
      preparationTimeMinutes: null,
      spiceLevel: null,
      unitPackageWeightGrams: null,
      thermoboxRequired: null,
      primaryImageUrl: null,
      ...overrides,
    });

    const summaries = summarizeKitchenDishes([
      dish({price: 150, preparationTimeMinutes: 40, primaryImageUrl: 'https://img/a.jpg'}),
      dish({price: 90, preparationTimeMinutes: 25, primaryImageUrl: ' https://img/a.jpg '}),
      dish({price: 110, primaryImageUrl: 'https://img/b.jpg'}),
      dish({kitchenId: otherKitchenId, price: 80, preparationTimeMinutes: 30}),
    ]);

    expect(summaries.get(kitchen.id)).toEqual({
      imageUrls: ['https://img/a.jpg', 'https://img/b.jpg'],
      preparationTimeLabel: '25–40 min',
      startingPriceLabel: '₹90',
    });
    expect(summaries.get(otherKitchenId)).toEqual({
      imageUrls: [],
      preparationTimeLabel: '30 min',
      startingPriceLabel: '₹80',
    });
  });
});