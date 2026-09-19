import {httpClient} from '../../../core/http/httpClient';
import {
  customerNotificationInboxApi,
  parseCustomerNotification,
  parseCustomerNotificationPage,
  parseCustomerNotificationUnreadCount,
} from './customerNotificationInboxApi';

jest.mock('../../../core/http/httpClient', () => ({
  httpClient: {
    get: jest.fn(),
    patch: jest.fn(),
  },
}));

const notice = {
  id: '11111111-1111-4111-8111-111111111111',
  title: 'Order update',
  body: 'Your order is ready.',
  noticeType: 'ORDER_STATUS',
  targetType: 'ORDER',
  targetId: '22222222-2222-4222-8222-222222222222',
  readAt: null,
  createdAt: '2026-09-19T12:00:00Z',
};

describe('customerNotificationInboxApi contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('accepts only the privacy-reduced exact notice shape', () => {
    expect(parseCustomerNotification(notice)).toEqual(notice);
    expect(
      parseCustomerNotification({
        ...notice,
        providerPayload: {token: 'private'},
      }),
    ).toBeNull();
  });

  it('parses exact cursor page semantics', () => {
    expect(
      parseCustomerNotificationPage({
        notices: [notice],
        nextCursor: 'cursor-1',
        hasMore: true,
      }),
    ).toEqual({
      notices: [notice],
      nextCursor: 'cursor-1',
      hasMore: true,
    });

    expect(
      parseCustomerNotificationPage({
        notices: [notice],
        nextCursor: null,
        hasMore: true,
      }),
    ).toBeNull();
  });

  it('parses exact unread count only', () => {
    expect(parseCustomerNotificationUnreadCount({unreadCount: 7})).toEqual({
      unreadCount: 7,
    });
    expect(
      parseCustomerNotificationUnreadCount({
        unreadCount: 7,
        recipientIdentityId: 'private',
      }),
    ).toBeNull();
    expect(parseCustomerNotificationUnreadCount({unreadCount: -1})).toBeNull();
  });

  it('reads the exact cursor inbox route', async () => {
    (httpClient.get as jest.Mock).mockResolvedValue({
      notices: [notice],
      nextCursor: null,
      hasMore: false,
    });

    await expect(
      customerNotificationInboxApi.page({
        limit: 25,
        unreadOnly: true,
        cursor: 'cursor-1',
      }),
    ).resolves.toEqual({
      notices: [notice],
      nextCursor: null,
      hasMore: false,
    });

    expect(httpClient.get).toHaveBeenCalledWith(
      '/api/v1/notifications/in-app/page',
      {
        params: {
          limit: 25,
          unreadOnly: true,
          cursor: 'cursor-1',
        },
        signal: undefined,
        dedupeKey: 'customer-notification-page:25:true:cursor-1',
      },
    );
  });

  it('reads the exact unread-count route', async () => {
    (httpClient.get as jest.Mock).mockResolvedValue({unreadCount: 4});

    await expect(
      customerNotificationInboxApi.unreadCount(),
    ).resolves.toEqual({unreadCount: 4});

    expect(httpClient.get).toHaveBeenCalledWith(
      '/api/v1/notifications/in-app/unread-count',
      {
        signal: undefined,
        dedupeKey: 'customer-notification-unread-count',
      },
    );
  });

  it('uses exact single-read and read-all mutation routes', async () => {
    (httpClient.patch as jest.Mock).mockResolvedValue(undefined);

    await customerNotificationInboxApi.markRead(notice.id);
    expect(httpClient.patch).toHaveBeenCalledWith(
      `/api/v1/notifications/in-app/${notice.id}/read`,
      undefined,
      {signal: undefined},
    );

    await customerNotificationInboxApi.markAllRead();
    expect(httpClient.patch).toHaveBeenCalledWith(
      '/api/v1/notifications/in-app/read-all',
      undefined,
      {signal: undefined},
    );
  });

  it('rejects invalid ids and limits before network calls', async () => {
    await expect(
      customerNotificationInboxApi.page({limit: 101}),
    ).rejects.toThrow('CUSTOMER_NOTIFICATION_LIMIT_INVALID');

    await expect(
      customerNotificationInboxApi.markRead('bad-id'),
    ).rejects.toThrow('CUSTOMER_NOTIFICATION_ID_INVALID');
  });
});
