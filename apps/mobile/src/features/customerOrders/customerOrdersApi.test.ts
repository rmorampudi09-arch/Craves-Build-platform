import {httpClient} from '../../core/http/httpClient';
import {
  CUSTOMER_ORDERS_PATH,
  CUSTOMER_ORDERS_SERVER_WINDOW_LIMIT,
  customerOrdersApi,
  parseCustomerOrdersResponse,
} from './api/customerOrdersApi';

jest.mock('../../core/http/httpClient', () => ({
  httpClient: {
    get: jest.fn(),
  },
}));

const getMock = httpClient.get as jest.Mock;

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
      contactPhoneNumber: 'redacted-by-mobile-parser',
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
    createdAt: '2026-08-08T12:00:00Z',
    updatedAt: '2026-08-08T12:05:00Z',
    ...overrides,
  };
}

describe('P52 customer orders API', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('calls only the exact unpaginated customer order list route', async () => {
    getMock.mockResolvedValueOnce([order()]);

    await customerOrdersApi.listRecentOrders();

    expect(getMock).toHaveBeenCalledWith(CUSTOMER_ORDERS_PATH, {
      signal: undefined,
      dedupeKey: 'customer-orders:recent',
    });
  });

  it('keeps only the customer-safe allow-listed order fields', () => {
    const result = parseCustomerOrdersResponse([order()]);

    expect(result).not.toBeNull();
    expect(result?.[0]).not.toHaveProperty('customerIdentityId');
    expect(result?.[0].deliveryAddress).not.toHaveProperty('contactPhoneNumber');
    expect(result?.[0].deliveryAddress).not.toHaveProperty('latitude');
    expect(result?.[0].grandTotal).toEqual({amount: '229', currency: 'INR'});
  });

  it('rejects unknown statuses rather than inventing lifecycle semantics', () => {
    expect(parseCustomerOrdersResponse([order({status: 'UNKNOWN'})])).toBeNull();
  });

  it('rejects a response larger than the exact backend recent-order window', () => {
    const oversized = Array.from(
      {length: CUSTOMER_ORDERS_SERVER_WINDOW_LIMIT + 1},
      (_, index) => order({
        id: `${String(index + 1).padStart(8, '0')}-1111-4111-8111-111111111111`,
      }),
    );

    expect(parseCustomerOrdersResponse(oversized)).toBeNull();
  });

  it('rejects reordered results because the backend contract is newest-first', () => {
    expect(
      parseCustomerOrdersResponse([
        order({createdAt: '2026-08-08T11:00:00Z'}),
        order({
          id: '88888888-8888-4888-8888-888888888888',
          createdAt: '2026-08-08T12:00:00Z',
        }),
      ]),
    ).toBeNull();
  });
});
