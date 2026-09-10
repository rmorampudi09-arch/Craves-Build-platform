import {httpClient} from '../../core/http/httpClient';
import {
  customerOrderDetailPath,
  customerOrdersApi,
  isCustomerOrderId,
  parseCustomerOrderResponse,
} from './api/customerOrdersApi';

jest.mock('../../core/http/httpClient', () => ({
  httpClient: {
    get: jest.fn(),
  },
}));

const getMock = httpClient.get as jest.Mock;
const ORDER_ID = '11111111-1111-4111-8111-111111111111';

function order(overrides: Record<string, unknown> = {}) {
  return {
    id: ORDER_ID,
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
    chefResponseNote: 'Ready soon',
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
      latitude: 12.9,
      longitude: 77.6,
    },
    pickupAddress: {contactPhoneNumber: 'private-chef'},
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

describe('P55 customer order detail API', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('calls the exact customer-owned detail route with a private dedupe key', async () => {
    getMock.mockResolvedValueOnce(order());

    await customerOrdersApi.getOrder(ORDER_ID);

    expect(getMock).toHaveBeenCalledWith(customerOrderDetailPath(ORDER_ID), {
      signal: undefined,
      dedupeKey: `customer-order:${ORDER_ID}`,
    });
  });

  it('rejects malformed IDs before a network request', async () => {
    expect(isCustomerOrderId('not-an-order-id')).toBe(false);

    await expect(customerOrdersApi.getOrder('not-an-order-id')).rejects.toMatchObject({
      code: 'CUSTOMER_ORDER_INVALID_ID',
    });
    expect(getMock).not.toHaveBeenCalled();
  });

  it('keeps only the customer-safe allow-listed detail fields', () => {
    const parsed = parseCustomerOrderResponse(order());

    expect(parsed).not.toBeNull();
    expect(parsed).not.toHaveProperty('customerIdentityId');
    expect(parsed).not.toHaveProperty('pickupAddress');
    expect(parsed?.deliveryAddress).not.toHaveProperty('contactPhoneNumber');
    expect(parsed?.deliveryAddress).not.toHaveProperty('latitude');
    expect(parsed?.grandTotal).toEqual({amount: '229', currency: 'INR'});
  });

  it('fails closed if the response belongs to a different order ID', async () => {
    getMock.mockResolvedValueOnce(
      order({id: '88888888-8888-4888-8888-888888888888'}),
    );

    await expect(customerOrdersApi.getOrder(ORDER_ID)).rejects.toMatchObject({
      code: 'CUSTOMER_ORDER_DETAIL_INVALID_RESPONSE',
    });
  });
});
