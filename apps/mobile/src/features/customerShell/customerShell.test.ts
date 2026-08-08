import {httpClient} from '../../core/http/httpClient';
import {customerShellApi, unreadNoticeCount, type CustomerNotice} from './api/customerShellApi';
import {customerShellActions, customerShellReducer} from './state/customerShellSlice';

jest.mock('../../core/http/httpClient', () => ({
  httpClient: {
    get: jest.fn(),
  },
}));

const getMock = httpClient.get as jest.Mock;

describe('P27 customer shell', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('propagates one selected location through shared state', () => {
    const location = {
      kind: 'SAVED_ADDRESS' as const,
      addressId: '11111111-1111-4111-8111-111111111111',
      label: 'HOME',
      displayName: 'Madhapur, Hyderabad',
    };

    const next = customerShellReducer(
      undefined,
      customerShellActions.locationSelected(location),
    );

    expect(next.selectedLocation).toEqual(location);
    expect(
      customerShellReducer(next, customerShellActions.resetCustomerShell()).selectedLocation,
    ).toBeNull();
  });

  it('derives the notification badge only from readAt', () => {
    const notices: CustomerNotice[] = [
      {
        id: '11111111-1111-4111-8111-111111111111',
        title: 'Unread',
        body: 'Unread body',
        noticeType: null,
        targetType: null,
        targetId: null,
        readAt: null,
        createdAt: '2026-08-08T00:00:00Z',
      },
      {
        id: '22222222-2222-4222-8222-222222222222',
        title: 'Read',
        body: 'Read body',
        noticeType: null,
        targetType: null,
        targetId: null,
        readAt: '2026-08-08T00:01:00Z',
        createdAt: '2026-08-08T00:00:00Z',
      },
    ];

    expect(unreadNoticeCount(notices)).toBe(1);
  });

  it('keeps the notification contract capped at one hundred items', async () => {
    getMock.mockResolvedValueOnce([]);

    await customerShellApi.listNotifications(500);

    expect(getMock).toHaveBeenCalledWith('/api/v1/notifications/in-app', {
      params: {limit: 100},
      dedupeKey: 'customer-shell:notifications:100',
    });
  });
});
