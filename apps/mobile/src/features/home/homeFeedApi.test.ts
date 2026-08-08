import {httpClient} from '../../core/http/httpClient';
import {
  HOME_NEARBY_MENU_ITEMS_PATH,
  homeFeedApi,
  normalizeNearbyDishPageRequest,
} from './api/homeFeedApi';

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
  menuItems: [
    {
      id: '11111111-1111-4111-8111-111111111111',
      kitchenId: '22222222-2222-4222-8222-222222222222',
      kitchenName: 'Kitchen One',
      kitchenDisplayName: 'Kitchen One',
      areaName: 'Madhapur',
      city: 'Hyderabad',
      state: 'Telangana',
      kitchenLatitude: 17.449,
      kitchenLongitude: 78.392,
      distanceMeters: 320,
      itemName: 'Veg Meal',
      description: 'Fresh meal',
      category: 'Meals',
      foodType: 'VEG',
      price: 199,
      currency: 'INR',
      servesCount: 1,
      preparationTimeMinutes: 25,
      spiceLevel: 'MEDIUM',
      unitPackageWeightGrams: 500,
      thermoboxRequired: false,
      primaryImageUrl: null,
    },
  ],
};

describe('P31 home feed API', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('maps only the exact nearby discovery location and pagination parameters', async () => {
    getMock.mockResolvedValueOnce(response);

    await homeFeedApi.listNearbyDishes({
      latitude: 17.4483,
      longitude: 78.3915,
      radiusMeters: 10000,
      page: 0,
      size: 20,
    });

    expect(getMock).toHaveBeenCalledWith(HOME_NEARBY_MENU_ITEMS_PATH, {
      params: {
        latitude: 17.4483,
        longitude: 78.3915,
        radiusMeters: 10000,
        page: 0,
        size: 20,
      },
      signal: undefined,
      dedupeKey: 'home-nearby-dishes:17.4483:78.3915:10000:0:20',
    });
  });

  it('rejects requests outside backend discovery bounds before transport', () => {
    expect(() =>
      normalizeNearbyDishPageRequest({
        latitude: 91,
        longitude: 78.3915,
        radiusMeters: 10000,
        page: 0,
        size: 20,
      }),
    ).toThrow('latitude must be between -90 and 90.');
  });

  it('rejects a response whose pagination context does not match the request', async () => {
    getMock.mockResolvedValueOnce({
      ...response,
      page: {...response.page, page: 1},
    });

    await expect(
      homeFeedApi.listNearbyDishes({
        latitude: 17.4483,
        longitude: 78.3915,
        radiusMeters: 10000,
        page: 0,
        size: 20,
      }),
    ).rejects.toThrow('Discovery response context does not match the request.');
  });
});
