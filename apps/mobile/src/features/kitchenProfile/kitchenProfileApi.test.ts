import {httpClient} from '../../core/http/httpClient';
import {
  CUSTOMER_KITCHEN_PROFILE_CONTRACT_GAPS,
  PUBLIC_KITCHEN_PROFILE_PATH,
  kitchenProfileApi,
  mapCustomerKitchenProfile,
} from './api/kitchenProfileApi';

jest.mock('../../core/http/httpClient', () => ({
  httpClient: {
    get: jest.fn(),
  },
}));

const getMock = httpClient.get as jest.Mock;
const kitchenId = '11111111-1111-4111-8111-111111111111';
const firstMenuItemId = '22222222-2222-4222-8222-222222222222';
const secondMenuItemId = '33333333-3333-4333-8333-333333333333';

const kitchen = {
  id: kitchenId,
  identityId: '44444444-4444-4444-8444-444444444444',
  kitchenName: 'Meena Home Kitchen',
  displayName: 'Meena’s Kitchen',
  description: 'Home-cooked meals made in small batches.',
  phoneNumber: '+910000000000',
  email: 'private@example.test',
  addressLine1: 'Private pickup address',
  addressLine2: 'Private address detail',
  landmark: 'Private landmark',
  areaName: 'Madhapur',
  city: 'Hyderabad',
  state: 'Telangana',
  postalCode: '500081',
  latitude: 17.4483,
  longitude: 78.3915,
  status: 'ACTIVE',
  createdAt: '2024-02-03T04:05:06Z',
  updatedAt: '2026-08-08T10:00:00Z',
};

const firstMenuItem = {
  id: firstMenuItemId,
  kitchenId,
  itemName: 'Home-style veg meal',
  description: 'Rice, dal, curry and curd',
  category: 'MEALS',
  foodType: 'VEG',
  price: 199,
  currency: 'INR',
  servesCount: 1,
  preparationTimeMinutes: 30,
  spiceLevel: 'MEDIUM',
  unitPackageWeightGrams: 650,
  thermoboxRequired: false,
  available: true,
  status: 'ACTIVE',
  images: [
    {
      id: '55555555-5555-4555-8555-555555555555',
      menuItemId: firstMenuItemId,
      publicUrl: 'https://media.craves.test/dishes/meal.jpg',
      sortOrder: 0,
      primary: true,
    },
  ],
};

const secondMenuItem = {
  id: secondMenuItemId,
  kitchenId,
  itemName: 'Curd rice',
  description: null,
  category: 'RICE',
  foodType: 'VEG',
  price: 129,
  currency: 'INR',
  servesCount: null,
  preparationTimeMinutes: 20,
  spiceLevel: null,
  unitPackageWeightGrams: 450,
  thermoboxRequired: false,
  available: true,
  status: 'ACTIVE',
  images: [
    {
      id: '66666666-6666-4666-8666-666666666666',
      menuItemId: secondMenuItemId,
      publicUrl: 'http://insecure.example.test/curd-rice.jpg',
      sortOrder: 0,
      primary: true,
    },
    {
      id: '77777777-7777-4777-8777-777777777777',
      menuItemId: secondMenuItemId,
      publicUrl: 'https://media.craves.test/dishes/curd-rice.jpg',
      sortOrder: 1,
      primary: false,
    },
  ],
};

describe('P42 customer kitchen profile API contract', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('uses only the exact public Catalog kitchen and kitchen-menu routes', async () => {
    getMock
      .mockResolvedValueOnce(kitchen)
      .mockResolvedValueOnce([firstMenuItem, secondMenuItem]);

    const profile = await kitchenProfileApi.getCustomerKitchenProfile(kitchenId);

    expect(getMock).toHaveBeenNthCalledWith(
      1,
      `${PUBLIC_KITCHEN_PROFILE_PATH}/${kitchenId}`,
      {
        signal: undefined,
        dedupeKey: `customer-kitchen-profile:${kitchenId}`,
      },
    );
    expect(getMock).toHaveBeenNthCalledWith(
      2,
      `${PUBLIC_KITCHEN_PROFILE_PATH}/${kitchenId}/menu-items`,
      {
        signal: undefined,
        dedupeKey: `customer-kitchen-profile-menu:${kitchenId}`,
      },
    );
    expect(profile).toMatchObject({
      id: kitchenId,
      kitchenName: 'Meena Home Kitchen',
      displayName: 'Meena’s Kitchen',
      biography: 'Home-cooked meals made in small batches.',
      location: {
        areaName: 'Madhapur',
        city: 'Hyderabad',
        state: 'Telangana',
      },
      joinedAt: '2024-02-03T04:05:06Z',
    });
    expect(profile).not.toHaveProperty('identityId');
    expect(profile).not.toHaveProperty('phoneNumber');
    expect(profile).not.toHaveProperty('email');
    expect(profile).not.toHaveProperty('addressLine1');
    expect(profile).not.toHaveProperty('postalCode');
    expect(profile).not.toHaveProperty('latitude');
    expect(profile).not.toHaveProperty('longitude');
  });

  it('maps sellable menu summaries in backend order and keeps only usable HTTPS media', () => {
    const profile = mapCustomerKitchenProfile(kitchen, [
      secondMenuItem,
      firstMenuItem,
    ]);

    expect(profile.menuItems.map(item => item.id)).toEqual([
      secondMenuItemId,
      firstMenuItemId,
    ]);
    expect(profile.menuItems[0]).toMatchObject({
      itemName: 'Curd rice',
      price: {amount: 129, currency: 'INR'},
      foodType: 'VEG',
      preparationTimeMinutes: 20,
    });
    expect(profile.menuItems[0].images.map(image => image.url)).toEqual([
      'https://media.craves.test/dishes/curd-rice.jpg',
    ]);
    expect(profile.menuItems[1].images.map(image => image.url)).toEqual([
      'https://media.craves.test/dishes/meal.jpg',
    ]);
  });

  it('keeps unsupported reference capabilities explicit instead of fabricating profile metrics', () => {
    const profile = mapCustomerKitchenProfile(
      {
        ...kitchen,
        displayName: null,
        description: null,
        areaName: null,
        createdAt: null,
      },
      [],
    );

    expect(profile.displayName).toBeNull();
    expect(profile.biography).toBeNull();
    expect(profile.location.areaName).toBeNull();
    expect(profile.joinedAt).toBeNull();
    expect(profile.verificationStatus).toBeNull();
    expect(profile.reviewSummary).toEqual({
      aggregateRating: null,
      reviewCount: null,
    });
    expect(profile.orderCount).toBeNull();
    expect(profile.serviceability).toBeNull();
    expect(profile.favoriteState).toBeNull();
    expect(profile.featuredMenuItems).toBeNull();
    expect(profile.heroMedia).toBeNull();
    expect(profile.contractGaps).toBe(CUSTOMER_KITCHEN_PROFILE_CONTRACT_GAPS);
    expect(profile.contractGaps.map(gap => gap.capability)).toEqual([
      'VERIFICATION',
      'RATING_REVIEWS',
      'ORDER_COUNT',
      'SERVICEABILITY',
      'FAVORITES',
      'FEATURED_DISHES',
      'KITCHEN_MEDIA',
    ]);
  });

  it('fails closed for inactive or mismatched kitchen data and non-sellable menu rows', () => {
    expect(() =>
      mapCustomerKitchenProfile({...kitchen, status: 'INACTIVE'}, []),
    ).toThrow('This kitchen is no longer available.');

    expect(() =>
      mapCustomerKitchenProfile(kitchen, [
        {
          ...firstMenuItem,
          kitchenId: '88888888-8888-4888-8888-888888888888',
        },
      ]),
    ).toThrow('Catalog menu-item kitchen identity does not match the request.');

    expect(() =>
      mapCustomerKitchenProfile(kitchen, [
        {
          ...firstMenuItem,
          available: false,
        },
      ]),
    ).toThrow('Public kitchen menu contained a non-sellable dish.');

    expect(() =>
      mapCustomerKitchenProfile(kitchen, [
        {
          ...firstMenuItem,
          status: 'INACTIVE',
        },
      ]),
    ).toThrow('Public kitchen menu contained a non-sellable dish.');
  });

  it('rejects invalid route identities before transport and validates response identity', async () => {
    await expect(
      kitchenProfileApi.getCustomerKitchenProfile('kitchen-card-1'),
    ).rejects.toThrow('kitchenId must be a valid UUID.');
    expect(getMock).not.toHaveBeenCalled();

    getMock.mockResolvedValueOnce({
      ...kitchen,
      id: '99999999-9999-4999-8999-999999999999',
    });

    await expect(
      kitchenProfileApi.getCustomerKitchenProfile(kitchenId),
    ).rejects.toThrow('Catalog kitchen identity does not match the request.');
    expect(getMock).toHaveBeenCalledTimes(1);
  });
});
