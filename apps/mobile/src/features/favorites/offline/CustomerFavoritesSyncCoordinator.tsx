import React from 'react';
import {AppState} from 'react-native';
import {appQueryClient} from '../../../app/query';
import {useAppSelector} from '../../../app/store/hooks';
import {customerFavoritesApi} from '../api/customerFavoritesApi';
import {createCustomerFavoritesQueryKey} from '../query/customerFavoritesQueries';
import {
  clearFavoriteMutationQueue,
  hydrateFavoriteMutationQueue,
  replayFavoriteMutationQueue,
  type PendingFavoriteMutation,
} from './customerFavoritesOfflineQueue';

const REPLAY_INTERVAL_MS = 30_000;

async function applyPendingMutation(mutation: PendingFavoriteMutation): Promise<void> {
  if (mutation.targetFavorite) {
    await customerFavoritesApi.save(mutation.menuItemId);
  } else {
    await customerFavoritesApi.remove(mutation.menuItemId);
  }
}

/**
 * Keeps queued Favorite mutations bound to the currently authenticated identity.
 *
 * The queue is replayed on identity hydration, app resume, and a conservative
 * periodic retry. No native connectivity dependency is required: retriable
 * transport failures remain queued until the next attempt. PUT/DELETE are
 * server-idempotent, so replay does not create duplicate business state.
 */
export function CustomerFavoritesSyncCoordinator() {
  const identityId = useAppSelector(state => state.auth.identity?.id ?? null);
  const previousIdentityRef = React.useRef<string | null>(null);
  const replayingRef = React.useRef(false);

  const replay = React.useCallback(async () => {
    if (!identityId || replayingRef.current) return;
    replayingRef.current = true;
    try {
      const result = await replayFavoriteMutationQueue(identityId, applyPendingMutation);
      if (result.replayed > 0 || result.dropped > 0) {
        await appQueryClient.invalidateQueries({
          queryKey: createCustomerFavoritesQueryKey(identityId),
          exact: true,
        });
      }
    } finally {
      replayingRef.current = false;
    }
  }, [identityId]);

  React.useEffect(() => {
    const previousIdentityId = previousIdentityRef.current;
    previousIdentityRef.current = identityId;

    if (previousIdentityId && previousIdentityId !== identityId) {
      // Pending writes are private state. AsyncStorage is not treated as an
      // encrypted cross-account mailbox, so logout/account switch removes the
      // old identity's queued mutations and cached Saved query.
      clearFavoriteMutationQueue(previousIdentityId).catch(() => undefined);
      appQueryClient.removeQueries({
        queryKey: createCustomerFavoritesQueryKey(previousIdentityId),
        exact: true,
      });
    }

    if (!identityId) return;
    hydrateFavoriteMutationQueue(identityId)
      .then(() => replay())
      .catch(() => undefined);
  }, [identityId, replay]);

  React.useEffect(() => {
    if (!identityId) return;

    const interval = setInterval(() => {
      replay().catch(() => undefined);
    }, REPLAY_INTERVAL_MS);

    const subscription = AppState.addEventListener('change', nextState => {
      if (nextState === 'active') {
        replay().catch(() => undefined);
      }
    });

    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [identityId, replay]);

  return null;
}
