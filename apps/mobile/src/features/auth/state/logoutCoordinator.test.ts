import type {AppDispatch} from '../../../app/store/store';
import {createAppQueryClient} from '../../../app/query/queryClient';
import {
  createPrivateQueryKey,
  createPublicQueryKey,
} from '../../../app/query/queryKeys';
import {authActions} from './authSlice';
import {authService} from './authService';
import {completeLogout} from './logoutCoordinator';

jest.mock('./authService', () => ({
  authService: {
    logout: jest.fn(),
  },
}));

const logoutMock = authService.logout as jest.Mock;

describe('completeLogout', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    logoutMock.mockResolvedValue(undefined);
  });

  it('clears private queries and mutation state before returning to the anonymous auth root', async () => {
    const client = createAppQueryClient();
    const privateKey = createPrivateQueryKey('orders', {
      userId: 'identity-1',
      role: 'CHEF',
    });
    const publicKey = createPublicQueryKey('catalog', {
      locationKey: 'hyd-17.44-78.39',
    });
    const mutationClearSpy = jest.spyOn(client.getMutationCache(), 'clear');
    const dispatch = jest.fn() as unknown as AppDispatch;

    client.setQueryData(privateKey, ['private-order']);
    client.setQueryData(publicKey, ['public-dish']);

    await completeLogout(dispatch, client);

    expect(logoutMock).toHaveBeenCalledTimes(1);
    expect(client.getQueryData(privateKey)).toBeUndefined();
    expect(client.getQueryData(publicKey)).toEqual(['public-dish']);
    expect(mutationClearSpy).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith(authActions.signedOut());

    client.clear();
  });

  it('still clears private app state and signs out if session cleanup unexpectedly rejects', async () => {
    const client = createAppQueryClient();
    const privateKey = createPrivateQueryKey('orders', {
      userId: 'identity-1',
      role: 'CUSTOMER',
    });
    const dispatch = jest.fn() as unknown as AppDispatch;

    client.setQueryData(privateKey, ['private-order']);
    logoutMock.mockRejectedValue(new Error('offline'));

    await expect(completeLogout(dispatch, client)).resolves.toBeUndefined();

    expect(client.getQueryData(privateKey)).toBeUndefined();
    expect(dispatch).toHaveBeenCalledWith(authActions.signedOut());

    client.clear();
  });
});
