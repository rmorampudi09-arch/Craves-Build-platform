import {AppApiError} from '../../../core/http/apiError';
import {httpClient} from '../../../core/http/httpClient';
import {
  chefNotificationInboxApi,
  markAllChefNoticesRead,
  parseChefNotification,
  parseChefNotificationPage,
  parseChefNotificationUnreadCount,
} from './chefNotificationInboxApi';

jest.mock('../../../core/http/httpClient', () => ({
  httpClient: {
    get: jest.fn(),
    patch: jest.fn(),
  },
}));

const notice = {
  id: '11111111-1111-4111-8111-111111111111',
  title: 'New order',
  body: 'You have a new order.',
  noticeType: 'ORDER_STATUS',
  targetType: 'ORDER',
  targetId: '22222222-2222-4222-8222-222222222222',
  readAt: null,
  createdAt: '2026-09-19T12:00:00Z',
};

describe('chefNotificationInboxApi contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('accepts only the exact privacy-reduced notice shape', () => {
    expect(parseChefNotification(notice)).toEqual(notice);
    expect(
      parseChefNotification({
        ...notice,
        recipientIdentityId: 'private',
      }),
    ).toBeNull();
  });

  it('parses exact cursor page semantics', () => {
    expect(
      parseChefNotificationPage({
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
      parseChefNotificationPage({
        notices: [notice],
        nextCursor: null,
        hasMore: true,
      }),
    ).toBeNull();
  });

  it('parses exact unread count only', () => {
    expect(parseChefNotificationUnreadCount({unreadCount: 8})).toEqual({
      unreadCount: 8,
    });
    expect(
      parseChefNotificationUnreadCount({
        unreadCount: 8,
        identityId: 'private',
      }),
    ).toBeNull();
  });

  it('uses the exact page/count/read routes', async () => {
    (httpClient.get as jest.Mock)
      .mockResolvedValueOnce({
        notices: [notice],
        nextCursor: null,
        hasMore: false,
      })
      .mockResolvedValueOnce({unreadCount: 1});
    (httpClient.patch as jest.Mock).mockResolvedValue(undefined);

    await chefNotificationInboxApi.page({
      limit: 50,
      cursor: 'cursor-1',
      unreadOnly: false,
    });
    expect(httpClient.get).toHaveBeenNthCalledWith(
      1,
      '/api/v1/notifications/in-app/page',
      {
        params: {
          limit: 50,
          unreadOnly: false,
          role: 'CHEF',
          cursor: 'cursor-1',
        },
        signal: undefined,
        dedupeKey: 'chef-notification-page:50:false:cursor-1',
      },
    );

    await expect(chefNotificationInboxApi.unreadCount()).resolves.toEqual({
      unreadCount: 1,
    });
    expect(httpClient.get).toHaveBeenNthCalledWith(
      2,
      '/api/v1/notifications/in-app/unread-count',
      {
        params: {role: 'CHEF'},
        signal: undefined,
        dedupeKey: 'chef-notification-unread-count',
      },
    );

    await chefNotificationInboxApi.markRead(notice.id);
    expect(httpClient.patch).toHaveBeenNthCalledWith(
      1,
      `/api/v1/notifications/in-app/${notice.id}/read`,
      undefined,
      {signal: undefined},
    );

    await chefNotificationInboxApi.markAllRead();
    expect(httpClient.patch).toHaveBeenNthCalledWith(
      2,
      '/api/v1/notifications/in-app/read-all',
      undefined,
      {params: {role: 'CHEF'}, signal: undefined},
    );
  });

  it('rejects invalid ids and paging bounds before network calls', async () => {
    await expect(
      chefNotificationInboxApi.page({limit: 101}),
    ).rejects.toThrow('CHEF_NOTIFICATION_LIMIT_INVALID');

    await expect(
      chefNotificationInboxApi.page({cursor: 'x'.repeat(513)}),
    ).rejects.toThrow('CHEF_NOTIFICATION_CURSOR_INVALID');

    await expect(
      chefNotificationInboxApi.markRead('bad-id'),
    ).rejects.toThrow('CHEF_NOTIFICATION_ID_INVALID');
  });

  describe('markAllChefNoticesRead', () => {
    const ids = [notice.id, '33333333-3333-4333-8333-333333333333'];

    it('marks everything read in one call when the route is published', async () => {
      (httpClient.patch as jest.Mock).mockResolvedValue(undefined);
      await expect(markAllChefNoticesRead(ids)).resolves.toEqual(ids);
      expect(httpClient.patch).toHaveBeenCalledTimes(1);
    });

    it('marks the visible notices one by one when the route is not published yet', async () => {
      (httpClient.patch as jest.Mock)
        .mockRejectedValueOnce(new AppApiError('NOT_FOUND', 'Not found', 404))
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new AppApiError('SERVER', 'Boom', 500));
      await expect(markAllChefNoticesRead(ids)).resolves.toEqual([ids[0]]);
      expect(httpClient.patch).toHaveBeenCalledTimes(3);
      expect(httpClient.patch).toHaveBeenNthCalledWith(
        2,
        `/api/v1/notifications/in-app/${ids[0]}/read`,
        undefined,
        {signal: undefined},
      );
    });

    it('does not hide a real failure behind the one-by-one fallback', async () => {
      (httpClient.patch as jest.Mock).mockRejectedValueOnce(new AppApiError('SERVER', 'Boom', 500));
      await expect(markAllChefNoticesRead(ids)).rejects.toMatchObject({status: 500});
      expect(httpClient.patch).toHaveBeenCalledTimes(1);
    });

    it('fails when the fallback could not mark any notice', async () => {
      (httpClient.patch as jest.Mock)
        .mockRejectedValueOnce(new AppApiError('NOT_FOUND', 'Not found', 404))
        .mockRejectedValue(new AppApiError('SERVER', 'Boom', 500));
      await expect(markAllChefNoticesRead(ids)).rejects.toMatchObject({status: 500});
    });
  });
});
