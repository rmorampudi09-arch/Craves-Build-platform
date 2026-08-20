import AsyncStorage from '@react-native-async-storage/async-storage';
import {AppApiError} from '../../../core/http/apiError';
import {
  clearFavoriteMutationQueue,
  discardFavoriteMutation,
  enqueueFavoriteMutation,
  getFavoriteMutationQueueSnapshot,
  hydrateFavoriteMutationQueue,
  replayFavoriteMutationQueue,
} from './customerFavoritesOfflineQueue';

const CUSTOMER_A = '11111111-1111-4111-8111-111111111111';
const CUSTOMER_B = '22222222-2222-4222-8222-222222222222';
const ITEM_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ITEM_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function installMemoryStorage() {
  const values = new Map<string, string>();
  jest.mocked(AsyncStorage.getItem).mockImplementation(async key => values.get(key) ?? null);
  jest.mocked(AsyncStorage.setItem).mockImplementation(async (key, value) => {
    values.set(key, value);
  });
  jest.mocked(AsyncStorage.removeItem).mockImplementation(async key => {
    values.delete(key);
  });
  return values;
}

describe('customerFavoritesOfflineQueue', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    installMemoryStorage();
    await clearFavoriteMutationQueue(CUSTOMER_A);
    await clearFavoriteMutationQueue(CUSTOMER_B);
  });

  it('collapses repeated offline toggles to the latest intent per dish', async () => {
    await enqueueFavoriteMutation(CUSTOMER_A, ITEM_A, true);
    await enqueueFavoriteMutation(CUSTOMER_A, ITEM_A, false);

    const queue = getFavoriteMutationQueueSnapshot(CUSTOMER_A);
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({
      identityId: CUSTOMER_A,
      menuItemId: ITEM_A,
      targetFavorite: false,
      attempts: 0,
    });
  });

  it('discards an older queued intent after a newer online mutation succeeds', async () => {
    await enqueueFavoriteMutation(CUSTOMER_A, ITEM_A, true);
    await enqueueFavoriteMutation(CUSTOMER_A, ITEM_B, true);

    await discardFavoriteMutation(CUSTOMER_A, ITEM_A);

    expect(getFavoriteMutationQueueSnapshot(CUSTOMER_A).map(item => item.menuItemId)).toEqual([
      ITEM_B,
    ]);
  });

  it('keeps pending mutations segregated by authenticated identity', async () => {
    await enqueueFavoriteMutation(CUSTOMER_A, ITEM_A, true);
    await enqueueFavoriteMutation(CUSTOMER_B, ITEM_B, true);

    expect(getFavoriteMutationQueueSnapshot(CUSTOMER_A).map(item => item.menuItemId)).toEqual([
      ITEM_A,
    ]);
    expect(getFavoriteMutationQueueSnapshot(CUSTOMER_B).map(item => item.menuItemId)).toEqual([
      ITEM_B,
    ]);
  });

  it('keeps retriable failures queued and increments the attempt counter', async () => {
    await enqueueFavoriteMutation(CUSTOMER_A, ITEM_A, true);

    const result = await replayFavoriteMutationQueue(CUSTOMER_A, async () => {
      throw new AppApiError('NETWORK_ERROR', 'offline', undefined, undefined, true);
    });

    expect(result).toEqual({
      replayed: 0,
      dropped: 0,
      remaining: 1,
      stoppedForAuthentication: false,
    });
    expect(getFavoriteMutationQueueSnapshot(CUSTOMER_A)[0]).toMatchObject({
      attempts: 1,
      lastErrorCode: 'NETWORK_ERROR',
    });
  });

  it('drops permanent invalid mutations so they cannot poison replay forever', async () => {
    await enqueueFavoriteMutation(CUSTOMER_A, ITEM_A, true);

    const result = await replayFavoriteMutationQueue(CUSTOMER_A, async () => {
      throw new AppApiError('MENU_ITEM_NOT_FOUND', 'missing', 404);
    });

    expect(result.dropped).toBe(1);
    expect(result.remaining).toBe(0);
    expect(getFavoriteMutationQueueSnapshot(CUSTOMER_A)).toEqual([]);
  });

  it('preserves the queue when authentication must be restored', async () => {
    await enqueueFavoriteMutation(CUSTOMER_A, ITEM_A, true);
    await enqueueFavoriteMutation(CUSTOMER_A, ITEM_B, false);

    const handler = jest.fn(async () => {
      throw new AppApiError('HTTP_401', 'sign in', 401);
    });
    const result = await replayFavoriteMutationQueue(CUSTOMER_A, handler);

    expect(result.stoppedForAuthentication).toBe(true);
    expect(result.remaining).toBe(2);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(getFavoriteMutationQueueSnapshot(CUSTOMER_A)).toHaveLength(2);
  });

  it('does not resurrect a queue cleared while replay is in flight', async () => {
    await enqueueFavoriteMutation(CUSTOMER_A, ITEM_A, true);

    let releaseHandler: (() => void) | undefined;
    const waiting = new Promise<void>(resolve => {
      releaseHandler = resolve;
    });
    const replay = replayFavoriteMutationQueue(CUSTOMER_A, async () => waiting);

    await Promise.resolve();
    await clearFavoriteMutationQueue(CUSTOMER_A);
    releaseHandler?.();
    await replay;

    expect(getFavoriteMutationQueueSnapshot(CUSTOMER_A)).toEqual([]);
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith(
      `@craves/customer-favorites/pending/v1/${CUSTOMER_A}`,
    );
  });

  it('rehydrates only valid rows for the requested identity', async () => {
    const values = installMemoryStorage();
    values.set(
      `@craves/customer-favorites/pending/v1/${CUSTOMER_A}`,
      JSON.stringify([
        {
          id: 'valid',
          identityId: CUSTOMER_A,
          menuItemId: ITEM_A,
          targetFavorite: true,
          queuedAt: '2026-08-21T00:00:00.000Z',
          attempts: 0,
        },
        {
          id: 'foreign',
          identityId: CUSTOMER_B,
          menuItemId: ITEM_B,
          targetFavorite: true,
          queuedAt: '2026-08-21T00:00:01.000Z',
          attempts: 0,
        },
        {broken: true},
      ]),
    );

    const queue = await hydrateFavoriteMutationQueue(CUSTOMER_A);
    expect(queue).toHaveLength(1);
    expect(queue[0].menuItemId).toBe(ITEM_A);
  });
});
