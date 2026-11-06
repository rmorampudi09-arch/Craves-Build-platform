import {QueryClient} from '@tanstack/react-query';
import {clearPrivateQueryCache} from '../../../app/query/queryCache';
import {isPrivateQueryKey} from '../../../app/query/queryKeys';
import {accountDeletionQueryKey} from './accountDeletionQueryKey';

describe('accountDeletionQueryKey', () => {
  let client: QueryClient;
  beforeEach(() => {
    client = new QueryClient();
    client.setQueryData(accountDeletionQueryKey('identity-1'), {requestId: 'request-1'});
  });
  afterEach(() => client.clear());

  it('is a private key, so logout (which clears every private key) removes it', async () => {
    expect(isPrivateQueryKey(accountDeletionQueryKey('identity-1'))).toBe(true);
    await clearPrivateQueryCache(client);
    expect(client.getQueryData(accountDeletionQueryKey('identity-1'))).toBeUndefined();
  });

  it('is cleared with the signed-in person, and only theirs', async () => {
    client.setQueryData(accountDeletionQueryKey('identity-2'), {requestId: 'request-2'});
    await clearPrivateQueryCache(client, {userId: 'identity-1'});
    expect(client.getQueryData(accountDeletionQueryKey('identity-1'))).toBeUndefined();
    expect(client.getQueryData(accountDeletionQueryKey('identity-2'))).toEqual({requestId: 'request-2'});
  });

  it('survives switching between customer and chef mode: one request covers both', async () => {
    await clearPrivateQueryCache(client, {role: 'CHEF'});
    await clearPrivateQueryCache(client, {role: 'CUSTOMER'});
    expect(client.getQueryData(accountDeletionQueryKey('identity-1'))).toEqual({requestId: 'request-1'});
  });
});
