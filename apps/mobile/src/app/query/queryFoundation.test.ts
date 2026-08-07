import {clearPrivateQueryCache} from './queryCache';
import {createAppQueryClient} from './queryClient';
import {
  createPrivateQueryKey,
  createPublicQueryKey,
  isPrivateQueryKey,
  matchesPrivateQueryScope,
} from './queryKeys';
import {clampPageSize, queryPolicy} from './queryPolicy';

describe('query/store provider and cache rules', () => {
  it('centralizes bounded default query behavior', () => {
    const client = createAppQueryClient();
    const defaults = client.getDefaultOptions();

    expect(defaults.queries?.retry).toBe(queryPolicy.readRetryCount);
    expect(defaults.queries?.staleTime).toBe(queryPolicy.staleTimeMs);
    expect(defaults.queries?.gcTime).toBe(queryPolicy.gcTimeMs);
    expect(defaults.queries?.refetchOnReconnect).toBe(true);
    expect(defaults.mutations?.retry).toBe(queryPolicy.mutationRetryCount);
  });

  it('creates stable contextual public query keys', () => {
    const first = createPublicQueryKey('discovery', {
      locationKey: 'hyd-17.44-78.39',
      filters: {
        cuisine: 'TELUGU',
        dietary: ['VEG', 'VEGAN'],
      },
      paging: {pageSize: 20, strategy: 'cursor'},
    });
    const second = createPublicQueryKey('discovery', {
      paging: {strategy: 'cursor', pageSize: 20},
      filters: {
        dietary: ['VEG', 'VEGAN'],
        cuisine: 'TELUGU',
      },
      locationKey: 'hyd-17.44-78.39',
    });

    expect(first).toEqual(second);
    expect(isPrivateQueryKey(first)).toBe(false);
  });

  it('requires private keys to carry user and role ownership', () => {
    const key = createPrivateQueryKey('orders', {
      userId: 'identity-123',
      role: 'CUSTOMER',
      entityId: 'order-456',
      locationKey: 'address-10',
      filters: {status: 'ACTIVE'},
      paging: {pageSize: 20},
    });

    expect(isPrivateQueryKey(key)).toBe(true);
    expect(matchesPrivateQueryScope(key, {userId: 'identity-123'})).toBe(true);
    expect(matchesPrivateQueryScope(key, {role: 'CUSTOMER'})).toBe(true);
    expect(matchesPrivateQueryScope(key, {role: 'CHEF'})).toBe(false);
  });

  it('clears only the requested private cache scope and preserves public data', async () => {
    const client = createAppQueryClient();
    const customerKey = createPrivateQueryKey('orders', {
      userId: 'identity-1',
      role: 'CUSTOMER',
    });
    const chefKey = createPrivateQueryKey('orders', {
      userId: 'identity-1',
      role: 'CHEF',
    });
    const otherUserKey = createPrivateQueryKey('orders', {
      userId: 'identity-2',
      role: 'CUSTOMER',
    });
    const publicKey = createPublicQueryKey('catalog', {
      locationKey: 'hyd-17.44-78.39',
    });

    client.setQueryData(customerKey, ['customer-order']);
    client.setQueryData(chefKey, ['chef-order']);
    client.setQueryData(otherUserKey, ['other-order']);
    client.setQueryData(publicKey, ['public-dish']);

    await clearPrivateQueryCache(client, {
      userId: 'identity-1',
      role: 'CUSTOMER',
    });

    expect(client.getQueryData(customerKey)).toBeUndefined();
    expect(client.getQueryData(chefKey)).toEqual(['chef-order']);
    expect(client.getQueryData(otherUserKey)).toEqual(['other-order']);
    expect(client.getQueryData(publicKey)).toEqual(['public-dish']);

    await clearPrivateQueryCache(client);

    expect(client.getQueryData(chefKey)).toBeUndefined();
    expect(client.getQueryData(otherUserKey)).toBeUndefined();
    expect(client.getQueryData(publicKey)).toEqual(['public-dish']);
  });

  it('bounds page size and publishes a finite cached-page limit', () => {
    expect(clampPageSize()).toBe(queryPolicy.paging.defaultPageSize);
    expect(clampPageSize(0)).toBe(1);
    expect(clampPageSize(10.9)).toBe(10);
    expect(clampPageSize(queryPolicy.paging.maxPageSize + 100)).toBe(
      queryPolicy.paging.maxPageSize,
    );
    expect(queryPolicy.paging.maxCachedPages).toBeGreaterThan(0);
    expect(queryPolicy.paging.maxCachedPages).toBeLessThanOrEqual(10);
  });
});
