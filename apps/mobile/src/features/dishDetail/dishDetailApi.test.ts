import {httpClient} from '../../core/http/httpClient';
import {
  CUSTOMER_DISH_DETAIL_CONTRACT_GAPS,
  PUBLIC_KITCHEN_DETAIL_PATH,
  PUBLIC_MENU_ITEM_DETAIL_PATH,
  dishDetailApi,
  mapCustomerDishDetail,
} from './api/dishDetailApi';

jest.mock('../../core/http/httpClient', () => ({
  httpClient: {
    get: jest.fn(),
  },
}));

const getMock = httpClient.get as jest.Mock;
const menuItemId = '11111111-1111-4111-8111-111111111111';
const kitchenId = '22222222-2222-4222-8222-222222222222';

const menuItem = {
  id: menuItemId,
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
      id: '33333333-3333-4333-8333-333333333333',
      menuItemId,
      publicUrl: 'https://media.craves.test/dishes/second.jpg',
      sortOrder: 2,
      primary: false,
      contentType: 'image/jpeg',
    },
    {
      id: '44444444-4444-4444-8444-444444444444',
      menuItemId,
      publicUrl: 'https://media.craves.test/dishes/primary.jpg',
      sortOrder: 0,
      primary: true,
      contentType: 'image/jpeg',
    },
    {
      id: '55555555-5555-4555-8555-555555555555',
      menuItemId,
      publicUrl: 'https://media.craves.test/dishes/third.jpg',
      sortOrder: 1,
      primary: false,
      contentType: 'image/jpeg',
    },
  ],
};

const kitchen = {
  id: kitchenId,
  identityId: '66666666-6666-4666-8666-666666666666',
  kitchenName: 'Meena Home Kitchen',
  displayName: 'Meena’s Kitchen',
  description: 'Home-cooked meals',
  phoneNumber: '+910000000000',
  email: 'private@example.test',
  addressLine1: 'Private pickup address',
  areaName: 'Madhapur',
  city: 'Hyderabad',
  state: 'Telangana',
  status: 'ACTIVE',
};

describe('P39 dish detail API contract', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('maps the exact public catalog item and kitchen routes into the customer detail model', async () => {
    getMock.mockResolvedValueOnce(menuItem).mockResolvedValueOnce(kitchen);

    const detail = await dishDetailApi.getCustomerDishDetail(menuItemId);

    expect(getMock).toHaveBeenNthCalledWith(
      1,
      `${PUBLIC_MENU_ITEM_DETAIL_PATH}/${menuItemId}`,
      {
        signal: undefined,
        dedupeKey: `customer-dish-detail-item:${menuItemId}`,
      },
    );
    expect(getMock).toHaveBeenNthCalledWith(
      2,
      `${PUBLIC_KITCHEN_DETAIL_PATH}/${kitchenId}`,
      {
        signal: undefined,
        dedupeKey: `customer-dish-detail-kitchen:${kitchenId}`,
      },
    );
    expect(detail).toMatchObject({
      id: menuItemId,
      itemName: 'Home-style veg meal',
      description: 'Rice, dal, curry and curd',
      category: 'MEALS',
      foodType: 'VEG',
      price: {amount: 199, currency: 'INR'},
      availability: {available: true, status: 'ACTIVE'},
      kitchen: {
        id: kitchenId,
        kitchenName: 'Meena Home Kitchen',
        displayName: 'Meena’s Kitchen',
      },
    });
    expect(detail.kitchen).not.toHaveProperty('identityId');
    expect(detail.kitchen).not.toHaveProperty('phoneNumber');
    expect(detail.kitchen).not.toHaveProperty('email');
    expect(detail.kitchen).not.toHaveProperty('addressLine1');
  });

  it('preserves every available backend image URL in the order returned by the backend', () => {
    const detail = mapCustomerDishDetail(menuItem, kitchen);

    expect(detail.images.map(image => image.url)).toEqual([
      'https://media.craves.test/dishes/second.jpg',
      'https://media.craves.test/dishes/primary.jpg',
      'https://media.craves.test/dishes/third.jpg',
    ]);
    expect(detail.images.map(image => image.sortOrder)).toEqual([2, 0, 1]);
  });

  it('keeps optional catalog values null and marks remaining unsupported capabilities explicitly', () => {
    const detail = mapCustomerDishDetail(
      {
        ...menuItem,
        description: null,
        servesCount: null,
        preparationTimeMinutes: null,
        spiceLevel: null,
        unitPackageWeightGrams: null,
        thermoboxRequired: null,
        images: [
          {
            ...menuItem.images[0],
            publicUrl: null,
          },
          {
            ...menuItem.images[1],
            publicUrl: 'http://insecure.example.test/image.jpg',
          },
          menuItem.images[2],
        ],
      },
      {
        ...kitchen,
        displayName: null,
        description: null,
        areaName: null,
        city: null,
        state: null,
      },
    );

    expect(detail.description).toBeNull();
    expect(detail.servesCount).toBeNull();
    expect(detail.preparationTimeMinutes).toBeNull();
    expect(detail.spiceLevel).toBeNull();
    expect(detail.unitPackageWeightGrams).toBeNull();
    expect(detail.thermoboxRequired).toBeNull();
    expect(detail.images.map(image => image.url)).toEqual([
      'https://media.craves.test/dishes/third.jpg',
    ]);
    expect(detail.cuisine).toBeNull();
    expect(detail.ingredients).toBeNull();
    expect(detail.allergens).toBeNull();
    expect(detail.reviewSummary).toEqual({
      aggregateRating: null,
      reviewCount: null,
    });
    expect(detail.favoriteState).toBeNull();
    expect(detail.contractGaps).toBe(CUSTOMER_DISH_DETAIL_CONTRACT_GAPS);
    expect(detail.contractGaps.map(gap => gap.capability)).toEqual([
      'CUISINE',
      'INGREDIENTS',
      'ALLERGENS',
      'REVIEWS',
    ]);
  });

  it('fails closed instead of falling back to stale price or availability data', () => {
    expect(() =>
      mapCustomerDishDetail({...menuItem, available: false}, kitchen),
    ).toThrow('This dish is no longer available.');
    expect(() =>
      mapCustomerDishDetail({...menuItem, status: 'INACTIVE'}, kitchen),
    ).toThrow('This dish is no longer available.');
    expect(() =>
      mapCustomerDishDetail({...menuItem, price: 0}, kitchen),
    ).toThrow();
  });

  it('rejects mismatched menu-item, image, and kitchen identities', () => {
    expect(() =>
      mapCustomerDishDetail(
        {
          ...menuItem,
          images: [
            {
              ...menuItem.images[0],
              menuItemId: '77777777-7777-4777-8777-777777777777',
            },
          ],
        },
        kitchen,
      ),
    ).toThrow('Catalog image identity does not match the menu item.');

    expect(() =>
      mapCustomerDishDetail(menuItem, {
        ...kitchen,
        id: '88888888-8888-4888-8888-888888888888',
      }),
    ).toThrow('Catalog kitchen identity does not match the menu item.');
  });
});
