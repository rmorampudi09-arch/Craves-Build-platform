import {QueryClient} from '@tanstack/react-query';
import {CustomerProfileContractError} from './api/customerProfileApi';
import {fullCustomerProfileFixture} from './fixtures/customerProfileFixtures';
import {
  createCustomerProfileQueryKey,
  resolveCustomerProfileHubState,
  writeCustomerProfileQuery,
} from './query/customerProfileQueries';

describe('customer profile query state', () => {
  it('exposes loading, empty, invalid-response, and request-failed states explicitly', () => {
    expect(
      resolveCustomerProfileHubState({
        data: undefined,
        isPending: true,
        isError: false,
        error: null,
      }).status,
    ).toBe('loading');

    expect(
      resolveCustomerProfileHubState({
        data: null,
        isPending: false,
        isError: false,
        error: null,
      }).status,
    ).toBe('empty');

    expect(
      resolveCustomerProfileHubState({
        data: undefined,
        isPending: false,
        isError: true,
        error: new CustomerProfileContractError(),
      }),
    ).toEqual({
      status: 'error',
      data: null,
      error: {code: 'invalid-response'},
    });

    expect(
      resolveCustomerProfileHubState({
        data: undefined,
        isPending: false,
        isError: true,
        error: new Error('network'),
      }),
    ).toEqual({
      status: 'error',
      data: null,
      error: {code: 'request-failed'},
    });
  });

  it('returns the normalized ready contract without duplicating server state', () => {
    if (fullCustomerProfileFixture.status !== 'ready') {
      throw new Error('Full customer profile fixture must be ready.');
    }

    const state = resolveCustomerProfileHubState({
      data: fullCustomerProfileFixture.data,
      isPending: false,
      isError: false,
      error: null,
    });

    expect(state.status).toBe('ready');
    if (state.status === 'ready') {
      expect(state.data.profile.profileId).toBe(
        '11111111-1111-4111-8111-111111111111',
      );
    }
  });

  it('writes a successful update into the canonical private profile query key', () => {
    if (fullCustomerProfileFixture.status !== 'ready') {
      throw new Error('Full customer profile fixture must be ready.');
    }
    const queryClient = new QueryClient();
    const identityId = fullCustomerProfileFixture.data.profile.identityId;

    writeCustomerProfileQuery(
      queryClient,
      identityId,
      fullCustomerProfileFixture.data,
    );

    expect(
      queryClient.getQueryData(createCustomerProfileQueryKey(identityId)),
    ).toBe(fullCustomerProfileFixture.data);
  });
});
