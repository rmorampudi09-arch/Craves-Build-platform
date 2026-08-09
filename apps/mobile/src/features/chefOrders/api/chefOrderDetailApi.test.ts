import {httpClient} from '../../../core/http/httpClient';
import {
  chefOrderDetailApi,
  parseChefOrderDetail,
} from './chefOrderDetailApi';

const ORDER_ID = '11111111-1111-4111-8111-111111111111';
const CHECKOUT_ID = '22222222-2222-4222-8222-222222222222';
const KITCHEN_ID = '33333333-3333-4333-8333-333333333333';
const ITEM_ID = '44444444-4444-4444-8444-444444444444';
const MENU_ITEM_ID = '55555555-5555-4555-8555-555555555555';
const ADDRESS_ID = '66666666-6666-4666-8666-666666666666';

function order(overrides: Record<string, unknown> = {}) {
  return {
    id: ORDER_ID,
    checkoutId: CHECKOUT_ID,
    customerIdentityId: '77777777-7777-4777-8777-777777777777',
    kitchenId: KITCHEN_ID,
    kitchenName: 'Meena’s Kitchen',
    status: 'CHEF_ACCEPTANCE_PENDING',
    currency: 'inr',
    foodSubtotal: 320,
    platformFee: 10,
    taxAmount: 16,
    deliveryFee: 25,
    grandTotal: 371,
    chefResponseNote: null,
    prepTimeMinutes: null,
    deliveryAddress: {
      sourceAddressId: ADDRESS_ID,
      recipientName: 'Customer',
      contactPhoneNumber: '+919999999999',
      addressLine1: '12 Sample Road',
      addressLine2: null,
      landmark: 'Near Park',
      areaName: 'Indiranagar',
      city: 'Bengaluru',
      state: 'Karnataka',
      postalCode: '560038',
      latitude: 12.9716,
      longitude: 77.6412,
    },
    items: [
      {
        id: ITEM_ID,
        menuItemId: MENU_ITEM_ID,
        itemName: 'Home-style meal',
        category: 'MEALS',
        foodType: 'VEG',
        unitPrice: 160,
        quantity: 2,
        lineTotal: 320,
      },
    ],
    createdAt: '2026-08-09T08:00:00Z',
    updatedAt: '2026-08-09T08:05:00Z',
    ...overrides,
  };
}

describe('chefOrderDetailApi contract', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('parses the exact Chef OrderResponse detail fields used by mobile', () => {
    expect(parseChefOrderDetail(order())).toEqual(
      expect.objectContaining({
        id: ORDER_ID,
        checkoutId: CHECKOUT_ID,
        kitchenId: KITCHEN_ID,
        status: 'CHEF_ACCEPTANCE_PENDING',
        currency: 'INR',
        grandTotal: 371,
        deliveryAddress: expect.objectContaining({
          sourceAddressId: ADDRESS_ID,
          latitude: 12.9716,
          longitude: 77.6412,
        }),
        items: [
          expect.objectContaining({
            id: ITEM_ID,
            menuItemId: MENU_ITEM_ID,
            quantity: 2,
          }),
        ],
      }),
    );
  });

  it('accepts legacy orders whose delivery snapshot is absent', () => {
    expect(parseChefOrderDetail(order({deliveryAddress: null}))).toEqual(
      expect.objectContaining({deliveryAddress: null}),
    );
  });

  it('fails closed on unsupported status or malformed delivery coordinates', () => {
    expect(parseChefOrderDetail(order({status: 'NEW'}))).toBeNull();
    expect(
      parseChefOrderDetail(
        order({
          deliveryAddress: {
            ...order().deliveryAddress,
            latitude: 120,
          },
        }),
      ),
    ).toBeNull();
  });

  it('uses the exact Chef order-detail read route', async () => {
    const get = jest.spyOn(httpClient, 'get').mockResolvedValue(order());

    await expect(chefOrderDetailApi.getOrder(ORDER_ID)).resolves.toEqual(
      expect.objectContaining({id: ORDER_ID}),
    );

    expect(get).toHaveBeenCalledWith(`/api/v1/chef/orders/${ORDER_ID}`, {
      signal: undefined,
      dedupeKey: `chef-order-detail:${ORDER_ID}`,
    });
  });

  it('uses the exact accept request and forwards the stable idempotency key', async () => {
    const post = jest
      .spyOn(httpClient, 'post')
      .mockResolvedValue(order({status: 'CHEF_ACCEPTED', prepTimeMinutes: 35}));
    const request = {prepTimeMinutes: 35, note: 'Order confirmed'};

    await chefOrderDetailApi.acceptOrder(ORDER_ID, request, 'accept-key-1');

    expect(post).toHaveBeenCalledWith(
      `/api/v1/chef/orders/${ORDER_ID}/accept`,
      request,
      {
        signal: undefined,
        headers: {'Idempotency-Key': 'accept-key-1'},
      },
    );
  });

  it('uses the exact reject request and rejects invalid order identifiers locally', async () => {
    const post = jest
      .spyOn(httpClient, 'post')
      .mockResolvedValue(order({status: 'CHEF_REJECTED'}));
    const request = {reason: 'Unable to prepare this order'};

    await chefOrderDetailApi.rejectOrder(ORDER_ID, request, 'reject-key-1');

    expect(post).toHaveBeenCalledWith(
      `/api/v1/chef/orders/${ORDER_ID}/reject`,
      request,
      {
        signal: undefined,
        headers: {'Idempotency-Key': 'reject-key-1'},
      },
    );
    await expect(
      chefOrderDetailApi.getOrder('not-an-order-id'),
    ).rejects.toThrow('Chef order ID must be a UUID.');
  });
});
