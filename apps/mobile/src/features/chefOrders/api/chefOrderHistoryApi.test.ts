import {httpClient} from '../../../core/http/httpClient';
import {
  chefOrderHistoryApi,
  parseChefOrderHistoryPage,
} from './chefOrderHistoryApi';

jest.mock('../../../core/http/httpClient', () => ({
  httpClient: {
    get: jest.fn(),
  },
}));

function order(overrides: Record<string, unknown> = {}) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    checkoutId: '22222222-2222-4222-8222-222222222222',
    customerIdentityId: '33333333-3333-4333-8333-333333333333',
    kitchenId: '44444444-4444-4444-8444-444444444444',
    kitchenName: 'Home Kitchen',
    status: 'DELIVERED',
    currency: 'INR',
    foodSubtotal: 180,
    platformFee: 10,
    taxAmount: 9,
    deliveryFee: 30,
    grandTotal: 229,
    chefResponseNote: null,
    prepTimeMinutes: 25,
    deliveryAddress: {
      sourceAddressId: '55555555-5555-4555-8555-555555555555',
      recipientName: 'Customer',
      contactPhoneNumber: '+910000000000',
      addressLine1: 'Saved address',
      addressLine2: null,
      landmark: null,
      areaName: 'Area',
      city: 'City',
      state: 'State',
      postalCode: '000000',
      latitude: 8.5,
      longitude: 76.9,
    },
    pickupAddress: {
      kitchenId: '44444444-4444-4444-8444-444444444444',
      kitchenName: 'Home Kitchen',
      phoneNumber: '+919999999999',
      email: 'private@example.com',
      addressLine1: 'Private kitchen address',
    },
    items: [
      {
        id: '66666666-6666-4666-8666-666666666666',
        menuItemId: '77777777-7777-4777-8777-777777777777',
        itemName: 'Meal',
        category: 'Main',
        foodType: 'VEG',
        unitPrice: 180,
        quantity: 1,
        lineTotal: 180,
      },
    ],
    createdAt: '2026-09-19T12:00:00Z',
    updatedAt: '2026-09-19T13:00:00Z',
    ...overrides,
  };
}

describe('chefOrderHistoryApi contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('projects the page into the bounded operational Chef history shape', () => {
    const parsed = parseChefOrderHistoryPage({
      orders: [order()],
      nextCursor: 'cursor-1',
      hasMore: true,
    });

    expect(parsed).toEqual({
      orders: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          status: 'DELIVERED',
          kitchenName: 'Home Kitchen',
          items: [
            {
              id: '66666666-6666-4666-8666-666666666666',
              itemName: 'Meal',
              quantity: 1,
            },
          ],
          deliverySummary: {
            areaName: 'Area',
            city: 'City',
          },
          prepTimeMinutes: 25,
          createdAt: '2026-09-19T12:00:00Z',
          updatedAt: '2026-09-19T13:00:00Z',
        },
      ],
      nextCursor: 'cursor-1',
      hasMore: true,
    });
    expect(parsed?.orders[0]).not.toHaveProperty('customerIdentityId');
    expect(parsed?.orders[0]).not.toHaveProperty('pickupAddress');
  });

  it('requires cursor presence when more history exists', () => {
    expect(
      parseChefOrderHistoryPage({
        orders: [order()],
        nextCursor: null,
        hasMore: true,
      }),
    ).toBeNull();
  });

  it('rejects duplicate and incorrectly ordered history rows', () => {
    expect(
      parseChefOrderHistoryPage({
        orders: [order(), order()],
        nextCursor: null,
        hasMore: false,
      }),
    ).toBeNull();

    expect(
      parseChefOrderHistoryPage({
        orders: [
          order({createdAt: '2026-09-19T11:00:00Z'}),
          order({
            id: '00000000-0000-4000-8000-000000000001',
            createdAt: '2026-09-19T12:00:00Z',
          }),
        ],
        nextCursor: null,
        hasMore: false,
      }),
    ).toBeNull();
  });

  it('calls the exact current main Chef page route', async () => {
    (httpClient.get as jest.Mock).mockResolvedValue({
      orders: [order()],
      nextCursor: null,
      hasMore: false,
    });

    await expect(
      chefOrderHistoryApi.page({
        limit: 20,
        cursor: 'cursor-1',
        status: 'DELIVERED',
      }),
    ).resolves.toMatchObject({
      hasMore: false,
      nextCursor: null,
    });

    expect(httpClient.get).toHaveBeenCalledWith(
      '/api/v1/chef/orders/page',
      {
        params: {
          limit: 20,
          cursor: 'cursor-1',
          status: 'DELIVERED',
        },
        signal: undefined,
        dedupeKey: 'chef-order-history:20:DELIVERED:cursor-1',
      },
    );
  });

  it('rejects invalid bounds before network calls', async () => {
    await expect(
      chefOrderHistoryApi.page({limit: 101}),
    ).rejects.toThrow('CHEF_ORDER_HISTORY_LIMIT_INVALID');

    await expect(
      chefOrderHistoryApi.page({cursor: 'x'.repeat(513)}),
    ).rejects.toThrow('CHEF_ORDER_HISTORY_CURSOR_INVALID');
  });
});
