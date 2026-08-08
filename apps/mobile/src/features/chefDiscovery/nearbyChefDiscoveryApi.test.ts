import {httpClient} from '../../core/http/httpClient';
import {
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
      latitude: 17.449,
      longitude: 78.392,
      distanceMeters: 320,
      activeMenuItemCount: 6,
    },
  ],
};

describe('P34 nearby chef discovery API', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('calls only the exact nearby kitchen discovery path and supported parameters', async () => {
    getMock.mockResolvedValueOnce(response);

    await nearbyChefDiscoveryApi.listNearbyKitchens({
      latitude: 17.4483,
      longitude: 78.3915,
      radiusMeters: 10000,
      page: 0,
      size: 20,
    });

    expect(getMock).toHaveBeenCalledWith(NEARBY_CHEF_DISCOVERY_PATH, {
      params: {
        latitude: 17.4483,
        longitude: 78.3915,
        radiusMeters: 10000,
        page: 0,
        size: 20,
      },
      signal: undefined,
      dedupeKey: 'nearby-chef-discovery:17.4483:78.3915:10000:0:20',
    });
  });

  it('rejects requests outside the backend discovery bounds before transport', () => {
    expect(() =>
      normalizeNearbyKitchenPageRequest({
        latitude: 17.4483,
        longitude: 181,
        radiusMeters: 10000,
        page: 0,
        size: 20,
      }),
    ).toThrow('longitude must be between -180 and 180.');
  });

  it('validates the exact kitchen summary shape without inventing guide-only fields', async () => {
    getMock.mockResolvedValueOnce(response);

    const result = await nearbyChefDiscoveryApi.listNearbyKitchens({
      latitude: 17.4483,
      longitude: 78.3915,
      radiusMeters: 10000,
      page: 0,
      size: 20,
    });

    expect(result.kitchens[0]).toEqual(response.kitchens[0]);
    expect(result.kitchens[0]).not.toHaveProperty('rating');
    expect(result.kitchens[0]).not.toHaveProperty('deliveryEtaMinutes');
    expect(result.kitchens[0]).not.toHaveProperty('isFavorite');
  });

  it('rejects a response whose location or pagination context differs from the request', async () => {
    getMock.mockResolvedValueOnce({
      ...response,
      radiusMeters: 5000,
    });

    await expect(
      nearbyChefDiscoveryApi.listNearbyKitchens({
        latitude: 17.4483,
        longitude: 78.3915,
        radiusMeters: 10000,
        page: 0,
        size: 20,
      }),
    ).rejects.toThrow('Nearby kitchen response context does not match the request.');
  });
});
