import {
  parseChefOperationalNotices,
  parseChefOperationalOrders,
} from './chefOperationalApi';

const ORDER_ID = '11111111-1111-4111-8111-111111111111';
const NOTICE_ID = '22222222-2222-4222-8222-222222222222';

describe('chefOperationalApi parsing', () => {
  it('keeps the bounded order lifecycle fields required by P86 tabs and server-derived timers', () => {
    expect(
      parseChefOperationalOrders({
        content: [
          {
            id: ORDER_ID,
            status: 'PREPARING',
            prepTimeMinutes: 30,
            createdAt: '2026-08-09T08:00:00Z',
            updatedAt: '2026-08-09T08:10:00Z',
            grandTotal: 800,
            deliveryAddress: {addressLine1: 'private field intentionally discarded'},
          },
        ],
      }),
    ).toEqual([
      {
        id: ORDER_ID,
        status: 'PREPARING',
        prepTimeMinutes: 30,
        createdAt: '2026-08-09T08:00:00Z',
        updatedAt: '2026-08-09T08:10:00Z',
      },
    ]);
  });

  it('allows older bounded envelopes without timer fields while still discarding private data', () => {
    expect(
      parseChefOperationalOrders([
        {
          id: ORDER_ID,
          status: 'CHEF_ACCEPTANCE_PENDING',
          deliveryAddress: {addressLine1: 'discarded'},
        },
      ]),
    ).toEqual([
      {
        id: ORDER_ID,
        status: 'CHEF_ACCEPTANCE_PENDING',
        prepTimeMinutes: null,
        createdAt: null,
        updatedAt: null,
      },
    ]);
  });

  it('fails closed on unsupported order status instead of undercounting', () => {
    expect(
      parseChefOperationalOrders([{id: ORDER_ID, status: 'UNKNOWN_STATUS'}]),
    ).toBeNull();
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
});
