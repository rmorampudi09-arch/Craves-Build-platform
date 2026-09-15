import type {NearbyKitchen, NearbyKitchenPage} from './api/nearbyChefDiscoveryApi';
import {
  filterLoadedNearbyKitchens,
  flattenNearbyKitchenPages,
  formatKitchenDistance,
  formatKitchenLocation,
  getKitchenInitials,
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
});