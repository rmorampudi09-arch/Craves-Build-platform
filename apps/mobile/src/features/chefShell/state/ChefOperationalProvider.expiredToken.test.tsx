import React from 'react';
import {act, create} from 'react-test-renderer';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {AxiosError, AxiosHeaders, type InternalAxiosRequestConfig} from 'axios';
import {apiClient} from '../../../core/http/apiClient';
import {tokenMemory} from '../../../core/security/tokenMemory';
import {sessionManager} from '../../auth/api/sessionManager';
import {chefOperationalApi} from '../api/chefOperationalApi';
import {ChefOperationalProvider, useChefOperationalState} from './ChefOperationalProvider';

jest.mock('../../../app/store/hooks', () => ({
  useAppSelector: (select: (state: unknown) => unknown) => select({auth: {identity: {id: 'chef-1'}}}),
}));
jest.mock('../../../core/observability/networkObservability', () => ({
  beginNetworkObservation: jest.fn(),
  endNetworkObservation: jest.fn(),
  sanitizeNetworkRoute: (url?: string) => url ?? 'unknown',
}));
jest.mock('../../auth/api/sessionManager', () => ({sessionManager: {refresh: jest.fn()}}));
jest.mock('../api/chefOperationalApi', () => ({
  ...jest.requireActual('../api/chefOperationalApi'),
  chefOperationalApi: {listOrders: jest.fn(), listNotifications: jest.fn(), markNotificationRead: jest.fn()},
}));

const CHEF_NOTICE = '11111111-1111-4111-8111-111111111111';
const PAGE = {
  notices: [
    {
      id: CHEF_NOTICE,
      title: 'New order',
      body: 'Body',
      noticeType: 'CHEF_ORDER_AWAITING_ACCEPTANCE',
      targetType: 'ORDER',
      targetId: '33333333-3333-4333-8333-333333333333',
      readAt: null,
      createdAt: '2026-10-14T08:00:00Z',
    },
  ],
  nextCursor: null,
  hasMore: false,
};

let inboxStatuses: number[] = [];
let inboxCalls = 0;

async function mountProvider() {
  const result: {current: ReturnType<typeof useChefOperationalState>} = {current: undefined as never};
  function Probe() {
    result.current = useChefOperationalState();
    return null;
  }
  const queryClient = new QueryClient({defaultOptions: {queries: {retry: false, gcTime: Infinity}}});
  await act(async () => {
    create(
      <QueryClientProvider client={queryClient}>
        <ChefOperationalProvider>
          <Probe />
        </ChefOperationalProvider>
      </QueryClientProvider>,
    );
  });
  for (let i = 0; i < 6; i += 1) {
    await act(async () => {
      await new Promise<void>(resolve => setTimeout(resolve, 10));
    });
  }
  return result;
}

describe('ChefOperationalProvider with an expired sign-in', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    inboxCalls = 0;
    tokenMemory.set('expired-token', 900);
    (chefOperationalApi.listOrders as jest.Mock).mockResolvedValue([]);
    (chefOperationalApi.listNotifications as jest.Mock).mockResolvedValue([]);
    (sessionManager.refresh as jest.Mock).mockImplementation(async () => {
      tokenMemory.set('fresh-token', 900);
      return {accessToken: 'fresh-token'};
    });
    apiClient.defaults.adapter = async config => {
      const status = inboxStatuses[inboxCalls] ?? 200;
      inboxCalls += 1;
      const response = {
        data: status === 200 ? PAGE : undefined,
        status,
        statusText: '',
        headers: new AxiosHeaders(),
        config: config as InternalAxiosRequestConfig,
      };
      if (status === 200) {
        return response;
      }
      throw new AxiosError('failed', 'ERR_BAD_REQUEST', config, undefined, response);
    };
  });

  afterEach(() => {
    tokenMemory.clear();
  });

  it('keeps the new inbox when an empty 403 recovers after the sign-in is renewed', async () => {
    inboxStatuses = [403, 200];

    const state = await mountProvider();

    expect(sessionManager.refresh).toHaveBeenCalledTimes(1);
    expect(inboxCalls).toBe(2);
    expect(state.current.notificationV2Available).toBe(true);
    expect(state.current.notices.map(n => n.id)).toEqual([CHEF_NOTICE]);
    expect(chefOperationalApi.listNotifications).not.toHaveBeenCalled();
  });

  it('still switches to the older inbox when the empty 403 survives the renewal', async () => {
    inboxStatuses = [403, 403];

    const state = await mountProvider();

    expect(sessionManager.refresh).toHaveBeenCalledTimes(1);
    expect(inboxCalls).toBe(2);
    expect(state.current.notificationV2Available).toBe(false);
    expect(chefOperationalApi.listNotifications).toHaveBeenCalledTimes(1);
  });
});
