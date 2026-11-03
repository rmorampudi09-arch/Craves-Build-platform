import {
  AxiosError,
  AxiosHeaders,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';
import {sessionManager} from '../../features/auth/api/sessionManager';
import {tokenMemory} from '../security/tokenMemory';
import {AppApiError} from './apiError';
import {apiClient} from './apiClient';

jest.mock('../../features/auth/api/sessionManager', () => ({
  sessionManager: {refresh: jest.fn()},
}));
jest.mock('../observability/networkObservability', () => ({
  beginNetworkObservation: jest.fn(),
  endNetworkObservation: jest.fn(),
}));

const refreshMock = sessionManager.refresh as jest.Mock;
const sentAuthorization: Array<string | undefined> = [];

type Reply = {status: number; data?: unknown};
let replies: Reply[] = [];

function reply(config: InternalAxiosRequestConfig, {status, data}: Reply) {
  const response: AxiosResponse = {
    data,
    status,
    statusText: '',
    headers: new AxiosHeaders(),
    config,
  };
  if (status < 400) {
    return Promise.resolve(response);
  }
  return Promise.reject(
    new AxiosError('failed', 'ERR_BAD_REQUEST', config, undefined, response),
  );
}

function refreshTo(accessToken: string) {
  refreshMock.mockImplementation(async () => {
    tokenMemory.set(accessToken, 900);
    return {accessToken};
  });
}

describe('apiClient sign-in renewal', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    sentAuthorization.length = 0;
    replies = [];
    // Zero lifetime = already past its refresh time, like a token the phone slept through.
    tokenMemory.set('expired-token', 0);
    apiClient.defaults.adapter = async config => {
      sentAuthorization.push(config.headers.get('Authorization') as string | undefined);
      return reply(config, replies.shift() ?? {status: 200});
    };
  });

  afterEach(() => {
    tokenMemory.clear();
  });

  it('renews once and retries after a 401', async () => {
    replies = [{status: 401}, {status: 200, data: {ok: true}}];
    refreshTo('fresh-token');

    await expect(apiClient.get('/api/v1/orders')).resolves.toMatchObject({data: {ok: true}});

    expect(refreshMock).toHaveBeenCalledTimes(1);
    expect(sentAuthorization).toEqual(['Bearer expired-token', 'Bearer fresh-token']);
  });

  it('renews once and retries after a body-less 403 when the sent token is stale', async () => {
    replies = [{status: 403}, {status: 200, data: {ok: true}}];
    refreshTo('fresh-token');

    await expect(apiClient.get('/api/v1/orders')).resolves.toMatchObject({data: {ok: true}});

    expect(refreshMock).toHaveBeenCalledTimes(1);
    expect(sentAuthorization).toEqual(['Bearer expired-token', 'Bearer fresh-token']);
  });

  it('surfaces a body-less 403 unchanged, with no renewal, while the token is still fresh', async () => {
    tokenMemory.set('live-token', 900);
    replies = [{status: 403}];

    await expect(apiClient.get('/api/v1/chef/orders')).rejects.toMatchObject({
      status: 403,
      code: 'HTTP_403',
    });

    expect(refreshMock).not.toHaveBeenCalled();
    expect(sentAuthorization).toEqual(['Bearer live-token']);
  });

  it('renews and retries a POST that was refused before the controller ran', async () => {
    replies = [{status: 403}, {status: 200}];
    refreshTo('fresh-token');

    await apiClient.post('/api/v1/cart/items', {dishId: 'd1'});

    expect(refreshMock).toHaveBeenCalledTimes(1);
    expect(sentAuthorization).toHaveLength(2);
  });

  it('keeps the 403 when the renewed request is refused again, without looping', async () => {
    replies = [{status: 403}, {status: 403}, {status: 403}];
    refreshTo('fresh-token');

    await expect(apiClient.get('/api/v1/chef/orders')).rejects.toMatchObject({
      status: 403,
      code: 'HTTP_403',
    });

    expect(refreshMock).toHaveBeenCalledTimes(1);
    expect(sentAuthorization).toHaveLength(2);
  });

  it('does not renew for a 403 that carries a backend code', async () => {
    replies = [{status: 403, data: {code: 'CHEF_KITCHEN_SUSPENDED'}}];

    await expect(apiClient.get('/api/v1/kitchens/me')).rejects.toMatchObject({
      status: 403,
      code: 'CHEF_KITCHEN_SUSPENDED',
    });

    expect(refreshMock).not.toHaveBeenCalled();
    expect(sentAuthorization).toHaveLength(1);
  });

  it('does not renew for a body-less 403 on a request sent without a token', async () => {
    tokenMemory.clear();
    replies = [{status: 403}];

    await expect(apiClient.get('/api/v1/catalog/kitchens')).rejects.toBeInstanceOf(AppApiError);

    expect(refreshMock).not.toHaveBeenCalled();
    expect(sentAuthorization).toEqual([undefined]);
  });

  it('retries with the token another request already renewed instead of rotating again', async () => {
    replies = [{status: 403}, {status: 200}];
    apiClient.defaults.adapter = async config => {
      sentAuthorization.push(config.headers.get('Authorization') as string | undefined);
      if (sentAuthorization.length === 1) {
        tokenMemory.set('renewed-by-resume', 900);
      }
      return reply(config, replies.shift() ?? {status: 200});
    };

    await apiClient.get('/api/v1/orders');

    expect(refreshMock).not.toHaveBeenCalled();
    expect(sentAuthorization).toEqual(['Bearer expired-token', 'Bearer renewed-by-resume']);
  });

  it('turns a request cancelled during renewal into a cancellation, not a replay', async () => {
    const controller = new AbortController();
    replies = [{status: 403}];
    refreshMock.mockImplementation(async () => {
      controller.abort();
      tokenMemory.set('fresh-token', 900);
      return {accessToken: 'fresh-token'};
    });

    await expect(
      apiClient.get('/api/v1/orders', {signal: controller.signal}),
    ).rejects.toMatchObject({code: 'REQUEST_CANCELLED', cancelled: true});

    expect(sentAuthorization).toHaveLength(1);
  });

  it('surfaces the 403 when the renewal fails', async () => {
    replies = [{status: 403}];
    refreshMock.mockRejectedValue(new Error('offline'));

    await expect(apiClient.get('/api/v1/orders')).rejects.toMatchObject({status: 403});

    expect(sentAuthorization).toHaveLength(1);
  });
});
