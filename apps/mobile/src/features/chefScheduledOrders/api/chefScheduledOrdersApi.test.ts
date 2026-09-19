import {httpClient} from '../../../core/http/httpClient';
import {
  CHEF_SCHEDULED_ORDERS_PATH,
  chefScheduledOrdersApi,
  parseChefScheduledOrderPage,
} from './chefScheduledOrdersApi';

jest.mock('../../../core/http/httpClient', () => ({
  httpClient: {
    get: jest.fn(),
    put: jest.fn(),
  },
}));

const SCHEDULE_ID = '11111111-1111-4111-8111-111111111111';
const CHECKOUT_ID = '22222222-2222-4222-8222-222222222222';
const ORDER_ID = '33333333-3333-4333-8333-333333333333';
const KITCHEN_ID = '44444444-4444-4444-8444-444444444444';

const queueItem = {
  scheduleRequestId: SCHEDULE_ID,
  checkoutId: CHECKOUT_ID,
  orderId: ORDER_ID,
  kitchenId: KITCHEN_ID,
  requestedFulfilmentAt: '2026-09-21T12:00:00Z',
  requestedTimezone: 'Asia/Kolkata',
  scheduleStatus: 'PENDING_CHEF_CONFIRMATION',
  responseStatus: 'PENDING',
  paymentGate: 'PAYMENT_AFTER_ALL_CHEFS_CONFIRM',
  responseNote: null,
  responseVersion: 1,
  respondedAt: null,
  createdAt: '2026-09-20T12:00:00Z',
};

describe('chefScheduledOrdersApi contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('parses strict ascending cursor page rows', () => {
    expect(
      parseChefScheduledOrderPage({
        items: [queueItem],
        nextCursor: 'cursor-1',
        hasMore: true,
      }),
    ).toEqual({
      items: [queueItem],
      nextCursor: 'cursor-1',
      hasMore: true,
    });

    expect(
      parseChefScheduledOrderPage({
        items: [{...queueItem, chefIdentityId: 'private'}],
        nextCursor: null,
        hasMore: false,
      }),
    ).toBeNull();
  });

  it('requires nextCursor when hasMore is true', () => {
    expect(
      parseChefScheduledOrderPage({
        items: [queueItem],
        nextCursor: null,
        hasMore: true,
      }),
    ).toBeNull();
  });

  it('uses exact pending queue params and current route', async () => {
    (httpClient.get as jest.Mock).mockResolvedValue({
      items: [queueItem],
      nextCursor: null,
      hasMore: false,
    });

    await chefScheduledOrdersApi.list({
      responseStatus: 'PENDING',
      limit: 20,
    });

    expect(httpClient.get).toHaveBeenCalledWith(CHEF_SCHEDULED_ORDERS_PATH, {
      params: {limit: 20, responseStatus: 'PENDING'},
      signal: undefined,
      dedupeKey: 'chef-scheduled-orders:all:PENDING:20:',
    });
  });

  it('sends exact accept JSON with optimistic version', async () => {
    (httpClient.put as jest.Mock).mockResolvedValue({
      orderId: ORDER_ID,
      kitchenId: KITCHEN_ID,
      status: 'ACCEPTED',
      paymentGate: 'PAYMENT_AFTER_ALL_CHEFS_CONFIRM',
      responseNote: 'Can prepare',
      version: 2,
      respondedAt: '2026-09-20T13:00:00Z',
    });

    await chefScheduledOrdersApi.respond(SCHEDULE_ID, ORDER_ID, {
      action: 'ACCEPT',
      responseNote: ' Can prepare ',
      expectedVersion: 1,
    });

    expect(httpClient.put).toHaveBeenCalledWith(
      `${CHEF_SCHEDULED_ORDERS_PATH}/${SCHEDULE_ID}/orders/${ORDER_ID}/response`,
      {
        action: 'ACCEPT',
        responseNote: 'Can prepare',
        expectedVersion: 1,
      },
      {signal: undefined},
    );
  });

  it('rejects stale/invalid request fields before transport', async () => {
    await expect(
      chefScheduledOrdersApi.respond(SCHEDULE_ID, ORDER_ID, {
        action: 'ACCEPT',
        responseNote: null,
        expectedVersion: 0,
      }),
    ).rejects.toThrow('CHEF_SCHEDULED_ORDER_VERSION_INVALID');

    await expect(
      chefScheduledOrdersApi.list({limit: 101}),
    ).rejects.toThrow('CHEF_SCHEDULED_ORDER_LIMIT_INVALID');

    await expect(
      chefScheduledOrdersApi.list({cursor: 'x'.repeat(513)}),
    ).rejects.toThrow('CHEF_SCHEDULED_ORDER_CURSOR_INVALID');

    expect(httpClient.put).not.toHaveBeenCalled();
    expect(httpClient.get).not.toHaveBeenCalled();
  });

  it('rejects a contradictory server response action', async () => {
    (httpClient.put as jest.Mock).mockResolvedValue({
      orderId: ORDER_ID,
      kitchenId: KITCHEN_ID,
      status: 'REJECTED',
      paymentGate: 'PAYMENT_AFTER_ALL_CHEFS_CONFIRM',
      responseNote: null,
      version: 2,
      respondedAt: '2026-09-20T13:00:00Z',
    });

    await expect(
      chefScheduledOrdersApi.respond(SCHEDULE_ID, ORDER_ID, {
        action: 'ACCEPT',
        responseNote: null,
        expectedVersion: 1,
      }),
    ).rejects.toThrow('CHEF_SCHEDULED_ORDER_RESPONSE_STATUS_MISMATCH');
  });
});
