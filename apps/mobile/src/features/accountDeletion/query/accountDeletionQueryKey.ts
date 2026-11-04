import {privateQueryPrefix} from '../../../app/query/queryKeys';

/**
 * The delete request belongs to the identity, not to customer or chef mode, so the key carries no role:
 * logout clears it with every private key, but switching mode (which clears by role) leaves it.
 */
export function accountDeletionQueryKey(identityId: string) {
  return [...privateQueryPrefix, 'account-deletion', {userId: identityId}] as const;
}
