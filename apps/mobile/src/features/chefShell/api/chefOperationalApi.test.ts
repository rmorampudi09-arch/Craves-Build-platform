import {httpClient} from '../../../core/http/httpClient';
import {
  chefOperationalApi,
  parseChefOperationalNotices,
  parseChefOperationalOrders,
} from './chefOperationalApi';

jest.mock('../../../core/http/httpClient', () => ({
  httpClient: {get: jest.fn(), patch: jest.fn()},
}));

const ORDER_ID = '11111111-1111-4111-8111-111111111111';
const ITEM_ID = '33333333-3333-4333-8333-333333333333';
const NOTICE_ID = '22222222-2222-4222-8222-222222222222';

describe('chefOperationalApi parsing', () => {
  it('keeps bounded lifecycle and safe P87 card fields while discarding direct customer contact data', () => {
    expect(
      parseChefOperationalOrders({
        content: [
          {
            id: ORDER_ID,
            status: 'PREPARING',
            kitchenName: 'Meena’s Kitchen',
            prepTimeMinutes: 30,
            createdAt: '2026-08-09T08:00:00Z',
            updatedAt: '2026-08-09T08:10:00Z',
            grandTotal: 800,
            items: [{id: ITEM_ID, itemName: 'Home-style meal', quantity: 2, unitPrice: 400}],
            deliveryAddress: {
              recipientName: 'Private Customer',
              contactPhoneNumber: '+919999999999',
              addressLine1: 'Private street address',
              areaName: 'Indiranagar',
              city: 'Bengaluru',
            },
          },
        ],
      }),
    ).toEqual([
      {
        id: ORDER_ID,
        status: 'PREPARING',
        kitchenName: 'Meena’s Kitchen',
        items: [{id: ITEM_ID, itemName: 'Home-style meal', quantity: 2}],
        deliverySummary: {areaName: 'Indiranagar', city: 'Bengaluru'},
        prepTimeMinutes: 30,
        createdAt: '2026-08-09T08:00:00Z',
        updatedAt: '2026-08-09T08:10:00Z',
      },
    ]);
  });

  it('allows older bounded envelopes without P87 summary or timer fields', () => {
    expect(
      parseChefOperationalOrders([
        {
          id: ORDER_ID,
          status: 'CHEF_ACCEPTANCE_PENDING',
        },
      ]),
    ).toEqual([
      {
        id: ORDER_ID,
        status: 'CHEF_ACCEPTANCE_PENDING',
        kitchenName: null,
        items: [],
        deliverySummary: null,
        prepTimeMinutes: null,
        createdAt: null,
        updatedAt: null,
      },
    ]);
  });

  it('fails closed on unsupported authoritative status while degrading malformed display-only summaries', () => {
    expect(
      parseChefOperationalOrders([{id: ORDER_ID, status: 'UNKNOWN_STATUS'}]),
    ).toBeNull();
    expect(
      parseChefOperationalOrders([
        {
          id: ORDER_ID,
          status: 'PREPARING',
          items: [{id: 'bad', itemName: 'Meal', quantity: 1}],
          deliveryAddress: {areaName: 'Indiranagar'},
        },
      ]),
    ).toEqual([
      {
        id: ORDER_ID,
        status: 'PREPARING',
        kitchenName: null,
        items: [],
        deliverySummary: null,
        prepTimeMinutes: null,
        createdAt: null,
        updatedAt: null,
      },
    ]);
  });

  it('fails closed on malformed server timer fields', () => {
    expect(
      parseChefOperationalOrders([
        {id: ORDER_ID, status: 'PREPARING', prepTimeMinutes: -1},
      ]),
    ).toBeNull();
  });

  it('parses the bounded in-app notification shape used for the Chef badge', () => {
    expect(
      parseChefOperationalNotices([
        {
          id: NOTICE_ID,
          title: 'New order',
          body: 'A new order needs attention.',
          noticeType: 'ORDER_CREATED',
          targetType: 'ORDER',
          targetId: ORDER_ID,
          readAt: null,
          createdAt: '2026-08-09T08:00:00Z',
        },
      ]),
    ).toEqual([
      {
        id: NOTICE_ID,
        title: 'New order',
        body: 'A new order needs attention.',
        noticeType: 'ORDER_CREATED',
        targetType: 'ORDER',
        targetId: ORDER_ID,
        readAt: null,
        createdAt: '2026-08-09T08:00:00Z',
      },
    ]);
  });

  it('fails closed on malformed notification records so the unread badge is not falsely low', () => {
    expect(
      parseChefOperationalNotices([
        {
          id: 'not-a-uuid',
          title: 'New order',
          body: 'A new order needs attention.',
          readAt: null,
          createdAt: '2026-08-09T08:00:00Z',
        },
      ]),
    ).toBeNull();
  });

  it('keeps the optional fields the server adds for the chef app and shows nothing for ones it does not send', () => {
    const [order] = parseChefOperationalOrders([
      {
        id: ORDER_ID,
        status: 'CHEF_ACCEPTANCE_PENDING',
        foodSubtotal: 220,
        chefAcceptanceExpiresAt: '2026-08-09T08:05:00Z',
        customerNote: '  Less spicy please  ',
        deliveryPartner: {name: 'Suresh', phone: '+919999999999', photoUrl: null, pickupEtaAt: '2026-08-09T08:20:00Z'},
        items: [{id: ITEM_ID, itemName: 'Chicken curry', quantity: 2, foodType: 'NON_VEG', menuItemId: NOTICE_ID}],
      },
    ]) ?? [];
    expect(order).toMatchObject({
      foodSubtotal: 220,
      chefAcceptanceExpiresAt: '2026-08-09T08:05:00Z',
      customerNote: 'Less spicy please',
      deliveryPartner: {name: 'Suresh', pickupEtaAt: '2026-08-09T08:20:00Z'},
      items: [{itemName: 'Chicken curry', foodType: 'NON_VEG', menuItemId: NOTICE_ID}],
    });

    const [plain] = parseChefOperationalOrders([{id: ORDER_ID, status: 'PREPARING'}]) ?? [];
    expect(plain).not.toHaveProperty('chefAcceptanceExpiresAt');
    expect(plain).not.toHaveProperty('customerNote');
    expect(plain).not.toHaveProperty('deliveryPartner');
    expect(plain).not.toHaveProperty('foodSubtotal');
  });

  it('drops a malformed new field instead of rejecting the whole order list', () => {
    const [order] = parseChefOperationalOrders([
      {
        id: ORDER_ID,
        status: 'CHEF_ACCEPTANCE_PENDING',
        foodSubtotal: 'lots',
        chefAcceptanceExpiresAt: 'soon',
        customerNote: 42,
        deliveryPartner: 'Suresh',
      },
    ]) ?? [];
    expect(order).toMatchObject({id: ORDER_ID, status: 'CHEF_ACCEPTANCE_PENDING'});
    expect(order).not.toHaveProperty('chefAcceptanceExpiresAt');
    expect(order).not.toHaveProperty('customerNote');
    expect(order).not.toHaveProperty('deliveryPartner');
    expect(order).not.toHaveProperty('foodSubtotal');
  });

  it('asks the server for chef notifications only', async () => {
    (httpClient.get as jest.Mock).mockResolvedValueOnce([]);
    await chefOperationalApi.listNotifications();
    expect(httpClient.get).toHaveBeenCalledWith(
      '/api/v1/notifications/in-app',
      expect.objectContaining({params: {limit: 100, role: 'CHEF'}}),
    );
  });
});
