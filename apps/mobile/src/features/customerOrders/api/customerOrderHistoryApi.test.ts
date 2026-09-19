import {httpClient} from '../../../core/http/httpClient';
import {
  customerOrderHistoryApi,
  parseCustomerOrderHistoryPage,
} from './customerOrderHistoryApi';

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
    status: 'PREPARING',
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
      contactPhoneNumber: 'private',
      addressLine1: 'Saved address',
      addressLine2: null,
      landmark: null,
      areaName: 'Area',
      city: 'City',
      state: 'State',
      postalCode: '000000',
      latitude: 0,
      longitude: 0,
    },
    pickupAddress: {
      phoneNumber: 'private',
      email: 'private@example.com',
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
    updatedAt: '2026-09-19T12:05:00Z',
    ...overrides,
  };
}

describe('customerOrderHistoryApi contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('parses exact page envelope and reuses privacy-reduced order mapping', () => {
    const parsed = parseCustomerOrderHistoryPage({
      orders: [order()],
      nextCursor: 'cursor-1',
      hasMore: true,
    });

    expect(parsed?.nextCursor).toBe('cursor-1');
    expect(parsed?.hasMore).toBe(true);
    expect(parsed?.orders).toHaveLength(1);
    expect(parsed?.orders[0]).not.toHaveProperty('customerIdentityId');
    expect(parsed?.orders[0]).not.toHaveProperty('pickupAddress');
    expect(parsed?.orders[0].deliveryAddress).not.toHaveProperty(
      'contactPhoneNumber',
    );
  });

  it('requires a cursor whenever more history exists', () => {
    expect(
      parseCustomerOrderHistoryPage({
        orders: [order()],
        nextCursor: null,
        hasMore: true,
      }),
    ).toBeNull();
  });

  it('rejects duplicate or incorrectly ordered rows', () => {
    expect(
      parseCustomerOrderHistoryPage({
        orders: [order(), order()],
        nextCursor: null,
        hasMore: false,
      }),
    ).toBeNull();

    expect(
      parseCustomerOrderHistoryPage({
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

  it('calls the exact current main page route', async () => {
    (httpClient.get as jest.Mock).mockResolvedValue({
      orders: [order()],
      nextCursor: null,
      hasMore: false,
    });

    await expect(
      customerOrderHistoryApi.page({
        limit: 20,
        cursor: 'cursor-1',
        status: 'PREPARING',
      }),
    ).resolves.toMatchObject({
      hasMore: false,
      nextCursor: null,
    });

    expect(httpClient.get).toHaveBeenCalledWith('/api/v1/orders/page', {
      params: {
        limit: 20,
        cursor: 'cursor-1',
        status: 'PREPARING',
      },
      signal: undefined,
      dedupeKey: 'customer-order-history:20:PREPARING:cursor-1',
    });
  });

  it('rejects invalid bounds before the network', async () => {
    await expect(
      customerOrderHistoryApi.page({limit: 101}),
    ).rejects.toThrow('CUSTOMER_ORDER_HISTORY_LIMIT_INVALID');

    await expect(
      customerOrderHistoryApi.page({cursor: 'x'.repeat(513)}),
    ).rejects.toThrow('CUSTOMER_ORDER_HISTORY_CURSOR_INVALID');
  });
});
