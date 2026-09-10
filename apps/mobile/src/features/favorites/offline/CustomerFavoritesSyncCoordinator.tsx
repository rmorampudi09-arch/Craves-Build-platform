import React from 'react';
import {AppState} from 'react-native';
import {appQueryClient} from '../../../app/query';
import {useAppSelector} from '../../../app/store/hooks';
import {AppApiError} from '../../../core/http/apiError';
import {customerFavoritesApi} from '../api/customerFavoritesApi';
import {createCustomerFavoritesQueryKey} from '../query/customerFavoritesQueries';
import {
  clearFavoriteMutationQueue,
  hydrateFavoriteMutationQueue,
  replayFavoriteMutationQueue,
  type PendingFavoriteMutation,
} from './customerFavoritesOfflineQueue';

const REPLAY_INTERVAL_MS = 30_000;

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
  const activeIdentityRef = React.useRef<string | null>(identityId);
  const replayingRef = React.useRef(false);
  activeIdentityRef.current = identityId;

  const replay = React.useCallback(async () => {
    if (!identityId || replayingRef.current) return;
    const replayIdentityId = identityId;
    replayingRef.current = true;
    try {
      const result = await replayFavoriteMutationQueue(
        replayIdentityId,
        async (mutation: PendingFavoriteMutation) => {
          if (activeIdentityRef.current !== replayIdentityId) {
            // Never let a queued mutation created under account A be sent using
            // account B's newly active credentials. Treat this as retriable so
            // the replay loop stops without dropping the old identity's queue;
            // the identity-change effect below then removes that private state.
            throw new AppApiError(
              'FAVORITES_IDENTITY_CHANGED',
              'Favorite sync stopped because the signed-in account changed.',
              undefined,
              undefined,
              true,
            );
          }

          if (mutation.targetFavorite) {
            await customerFavoritesApi.save(mutation.menuItemId);
          } else {
            await customerFavoritesApi.remove(mutation.menuItemId);
          }
        },
      );
      if (
        activeIdentityRef.current === replayIdentityId &&
        (result.replayed > 0 || result.dropped > 0)
      ) {
        await appQueryClient.invalidateQueries({
          queryKey: createCustomerFavoritesQueryKey(replayIdentityId),
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
