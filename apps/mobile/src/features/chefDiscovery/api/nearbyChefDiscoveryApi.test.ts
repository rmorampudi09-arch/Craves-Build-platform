import {mapLegacyNearbyKitchenPage} from './nearbyChefDiscoveryApi';

describe('mapLegacyNearbyKitchenPage', () => {
  const request = {
    latitude: 17.385,
    longitude: 78.4867,
    radiusMeters: 10_000,
    page: 0,
    size: 1,
  };

  it('maps the legacy public catalog contract into the current nearby contract', () => {
    const page = mapLegacyNearbyKitchenPage(
      {
        kitchens: [
          {
            id: '11111111-1111-4111-8111-111111111111',
            kitchenName: 'Home Kitchen',
            displayName: null,
            description: 'Fresh food',
            areaName: 'Madhapur',
            city: 'Hyderabad',
            latitude: 17.39,
            longitude: 78.49,
            distanceKm: 1.234,
            activeMenuItemCount: 4,
          },
          {
            id: '22222222-2222-4222-8222-222222222222',
            kitchenName: 'Second Kitchen',
            displayName: 'Second',
            description: null,
            areaName: null,
            city: 'Hyderabad',
            latitude: 17.4,
            longitude: 78.5,
            distanceKm: 2,
            activeMenuItemCount: 2,
          },
        ],
      },
      request,
    );

    expect(page.latitude).toBe(request.latitude);
    expect(page.longitude).toBe(request.longitude);
    expect(page.radiusMeters).toBe(request.radiusMeters);
    expect(page.page.totalElements).toBe(2);
    expect(page.page.totalPages).toBe(2);
    expect(page.page.hasNext).toBe(true);
    expect(page.kitchens).toEqual([
      expect.objectContaining({
        kitchenName: 'Home Kitchen',
        state: null,
        distanceMeters: 1234,
        activeMenuItemCount: 4,
      }),
    ]);
  });
});
