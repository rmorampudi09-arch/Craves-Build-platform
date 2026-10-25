import React from 'react';
import {act, create} from 'react-test-renderer';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {customerShellApi, type CustomerNotice} from '../../customerShell/api/customerShellApi';
import {
  createCustomerNotificationQueryKey,
  useMarkAllCustomerNotificationsRead,
} from './customerNotificationQueries';

jest.mock('../../../core/config/runtimeConfig', () => ({
  getRuntimeConfig: () => ({apiBaseUrl: 'https://api.craves.in'}),
}));
jest.mock('../../../app/store/hooks', () => ({
  useAppSelector: (select: (state: unknown) => unknown) =>
    select({auth: {identity: {id: 'customer-1'}}}),
}));
jest.mock('../../customerShell/api/customerShellApi', () => ({
  ...jest.requireActual('../../customerShell/api/customerShellApi'),
  customerShellApi: {markNotificationRead: jest.fn()},
}));

const markRead = customerShellApi.markNotificationRead as jest.Mock;

function notice(id: string): CustomerNotice {
  return {
    id,
    title: id,
    body: '',
    noticeType: null,
    targetType: null,
    targetId: null,
    readAt: null,
    createdAt: '2026-10-25T08:00:00Z',
  };
}

async function setup(ids: string[]) {
  const queryClient = new QueryClient({defaultOptions: {mutations: {retry: false}}});
  const key = createCustomerNotificationQueryKey('customer-1');
  queryClient.setQueryData(key, ids.map(notice));
  const result: {current: ReturnType<typeof useMarkAllCustomerNotificationsRead> | null} = {current: null};
  function Probe() {
    result.current = useMarkAllCustomerNotificationsRead();
    return null;
  }
  await act(async () => {
    create(
      <QueryClientProvider client={queryClient}>
        <Probe />
      </QueryClientProvider>,
    );
  });
  const unread = () =>
    (queryClient.getQueryData<CustomerNotice[]>(key) ?? [])
      .filter(item => item.readAt === null)
      .map(item => item.id);
  return {mutation: () => result.current!, unread};
}

describe('useMarkAllCustomerNotificationsRead on the legacy inbox', () => {
  beforeEach(() => markRead.mockReset());

  it('marks every unread notice one by one, past the first batch', async () => {
    markRead.mockResolvedValue(undefined);
    const ids = Array.from({length: 12}, (_, index) => `n${index}`);
    const {mutation, unread} = await setup(ids);

    await act(async () => {
      await mutation().mutateAsync(ids);
    });

    expect(markRead).toHaveBeenCalledTimes(12);
    expect(unread()).toEqual([]);
  });

  it('keeps the failed ones unread and reports the failure', async () => {
    markRead.mockImplementation((id: string) =>
      id === 'n1' ? Promise.reject(new Error('offline')) : Promise.resolve(),
    );
    const {mutation, unread} = await setup(['n0', 'n1', 'n2']);

    await act(async () => {
      await expect(mutation().mutateAsync(['n0', 'n1', 'n2'])).rejects.toThrow(
        'CUSTOMER_NOTIFICATION_MARK_ALL_PARTIAL',
      );
    });

    expect(unread()).toEqual(['n1']);
  });
});
