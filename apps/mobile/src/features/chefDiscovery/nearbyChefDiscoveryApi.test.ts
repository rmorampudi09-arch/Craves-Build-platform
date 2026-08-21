import {httpClient} from '../../core/http/httpClient';
import {
  LEGACY_NEARBY_CHEF_DISCOVERY_PATH,
  NEARBY_CHEF_DISCOVERY_PATH,
  nearbyChefDiscoveryApi,
  normalizeNearbyKitchenPageRequest,
} from './api/nearbyChefDiscoveryApi';

jest.mock('../../core/http/httpClient', () => ({
  httpClient: {
    get: jest.fn(),
  },
}));

const getMock = httpClient.get as jest.Mock;

const response = {
  latitude: 17.4483,
  longitude: 78.3915,
  radiusMeters: 10000,
  page: {
    page: 0,
    size: 20,
    totalElements: 1,
    totalPages: 1,
    hasNext: false,
  },
  kitchens: [
    {
      id: '22222222-2222-4222-8222-222222222222',
      kitchenName: 'Kitchen One',
      displayName: 'Kitchen One',
      description: 'Fresh home-style meals',
      areaName: 'Madhapur',
      city: 'Hyderabad',
      state: 'Telangana',
      latitude: null,
      longitude: null,
      distanceMeters: 320,
      activeMenuItemCount: 6,
    },
  ],
};

const request = {
  latitude: 17.4483,
  longitude: 78.3915,
  radiusMeters: 10000,
  page: 0,
  size: 20,
};

describe('P34 nearby chef discovery API', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('accepts the live production contract where stored kitchen coordinates can be null', async () => {
    getMock.mockResolvedValueOnce(response);

    const result = await nearbyChefDiscoveryApi.listNearbyKitchens(request);

    expect(getMock).toHaveBeenCalledWith(NEARBY_CHEF_DISCOVERY_PATH, {
      params: request,
      signal: undefined,
      dedupeKey: 'nearby-chef-discovery:17.4483:78.3915:10000:0:20',
    });
    expect(result.kitchens[0].latitude).toBeNull();
    expect(result.kitchens[0].longitude).toBeNull();
  });

  it('rejects requests outside the backend discovery bounds before transport', () => {
    expect(() =>
      normalizeNearbyKitchenPageRequest({
        ...request,
        longitude: 181,
      }),
    ).toThrow('longitude must be between -180 and 180.');
  });

  it('validates the exact kitchen summary shape without inventing guide-only fields', async () => {
    getMock.mockResolvedValueOnce(response);

    const result = await nearbyChefDiscoveryApi.listNearbyKitchens(request);

    expect(result.kitchens[0]).toEqual(response.kitchens[0]);
    expect(result.kitchens[0]).not.toHaveProperty('rating');
    expect(result.kitchens[0]).not.toHaveProperty('deliveryEtaMinutes');
    expect(result.kitchens[0]).not.toHaveProperty('isFavorite');
  });

  it('uses the public catalog fallback when nearby discovery is unavailable', async () => {
    getMock
      .mockRejectedValueOnce(new Error('discovery unavailable'))
      .mockResolvedValueOnce({
        kitchens: [
          {
            id: '22222222-2222-4222-8222-222222222222',
            kitchenName: 'Kitchen One',
            displayName: 'Kitchen One',
            description: 'Fresh home-style meals',
            areaName: 'Madhapur',
            city: 'Hyderabad',
            latitude: null,
            longitude: null,
            distanceKm: 0.32,
            activeMenuItemCount: 6,
          },
        ],
      });

    const result = await nearbyChefDiscoveryApi.listNearbyKitchens(request);

    expect(getMock).toHaveBeenNthCalledWith(2, LEGACY_NEARBY_CHEF_DISCOVERY_PATH, {
      params: {
        latitude: request.latitude,
        longitude: request.longitude,
        radiusKm: 10,
      },
      signal: undefined,
      dedupeKey: 'nearby-chef-discovery-fallback:17.4483:78.3915:10000',
    });
    expect(result.kitchens[0]).toEqual(
      expect.objectContaining({
        latitude: null,
        longitude: null,
        distanceMeters: 320,
      }),
    );
  });

  it('rejects a response whose location or pagination context differs from the request', async () => {
    getMock.mockResolvedValueOnce({
      ...response,
      radiusMeters: 5000,
    });

    await expect(nearbyChefDiscoveryApi.listNearbyKitchens(request)).rejects.toThrow(
      'Nearby kitchen response context does not match the request.',
    );
  });
});
