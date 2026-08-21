import AsyncStorage from '@react-native-async-storage/async-storage';
import {toAppApiError} from '../../../core/http/apiError';

const STORAGE_PREFIX = '@craves/customer-favorites/pending/v1/';
const MAX_PENDING_MUTATIONS = 200;

export interface PendingFavoriteMutation {
  id: string;
  identityId: string;
  menuItemId: string;
  targetFavorite: boolean;
  queuedAt: string;
  attempts: number;
  lastErrorCode?: string;
}

export interface FavoriteReplayResult {
  replayed: number;
  dropped: number;
  remaining: number;
  stoppedForAuthentication: boolean;
}

type QueueListener = () => void;
type ReplayHandler = (mutation: PendingFavoriteMutation) => Promise<void>;

const listeners = new Set<QueueListener>();
const snapshots = new Map<string, readonly PendingFavoriteMutation[]>();
const generations = new Map<string, number>();
const EMPTY_QUEUE: readonly PendingFavoriteMutation[] = [];

function storageKey(identityId: string): string {
  return `${STORAGE_PREFIX}${identityId}`;
}

function generation(identityId: string): number {
  return generations.get(identityId) ?? 0;
}

function bumpGeneration(identityId: string): void {
  generations.set(identityId, generation(identityId) + 1);
}

function notify(): void {
  listeners.forEach(listener => listener());
}

function isPendingFavoriteMutation(value: unknown): value is PendingFavoriteMutation {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.identityId === 'string' &&
    typeof candidate.menuItemId === 'string' &&
    typeof candidate.targetFavorite === 'boolean' &&
    typeof candidate.queuedAt === 'string' &&
    typeof candidate.attempts === 'number' &&
    Number.isInteger(candidate.attempts) &&
    candidate.attempts >= 0 &&
    (candidate.lastErrorCode === undefined || typeof candidate.lastErrorCode === 'string')
  );
}

function normalizeQueue(identityId: string, value: unknown): PendingFavoriteMutation[] {
  if (!Array.isArray(value)) return [];

  const byMenuItem = new Map<string, PendingFavoriteMutation>();
  value.forEach(candidate => {
    if (!isPendingFavoriteMutation(candidate) || candidate.identityId !== identityId) return;
    byMenuItem.set(candidate.menuItemId, candidate);
  });

  return [...byMenuItem.values()]
    .sort((left, right) => left.queuedAt.localeCompare(right.queuedAt))
    .slice(-MAX_PENDING_MUTATIONS);
}

async function persist(identityId: string, queue: readonly PendingFavoriteMutation[]): Promise<void> {
  if (queue.length === 0) {
    await AsyncStorage.removeItem(storageKey(identityId));
  } else {
    await AsyncStorage.setItem(storageKey(identityId), JSON.stringify(queue));
  }
  snapshots.set(identityId, [...queue]);
  notify();
}

async function currentQueue(identityId: string): Promise<readonly PendingFavoriteMutation[]> {
  const existing = snapshots.get(identityId);
  return existing ?? hydrateFavoriteMutationQueue(identityId);
}

export async function hydrateFavoriteMutationQueue(
  identityId: string,
): Promise<readonly PendingFavoriteMutation[]> {
  const startedAtGeneration = generation(identityId);
  const raw = await AsyncStorage.getItem(storageKey(identityId));
  let parsed: unknown = [];
  if (raw) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = [];
    }
  }

  // A logout/account-switch clear can complete while AsyncStorage.getItem is in
  // flight. Never resurrect the older persisted payload after that clear.
  if (generation(identityId) !== startedAtGeneration) {
    return snapshots.get(identityId) ?? EMPTY_QUEUE;
  }

  const queue = normalizeQueue(identityId, parsed);
  await persist(identityId, queue);
  return queue;
}

export async function enqueueFavoriteMutation(
  identityId: string,
  menuItemId: string,
  targetFavorite: boolean,
): Promise<PendingFavoriteMutation> {
  const current = [...(await currentQueue(identityId))];
  const now = new Date().toISOString();
  const next: PendingFavoriteMutation = {
    id: `${identityId}:${menuItemId}:${now}`,
    identityId,
    menuItemId,
    targetFavorite,
    queuedAt: now,
    attempts: 0,
  };

  const collapsed = current.filter(item => item.menuItemId !== menuItemId);
  collapsed.push(next);
  await persist(identityId, collapsed.slice(-MAX_PENDING_MUTATIONS));
  return next;
}

export async function discardFavoriteMutation(
  identityId: string,
  menuItemId: string,
): Promise<void> {
  const current = [...(await currentQueue(identityId))];
  const next = current.filter(item => item.menuItemId !== menuItemId);
  if (next.length !== current.length) {
    await persist(identityId, next);
  }
}

export async function clearFavoriteMutationQueue(identityId: string): Promise<void> {
  // Invalidates in-flight hydrate/replay work before storage is changed. The
  // generation check prevents an older asynchronous replay from restoring data
  // after logout or account switch.
  bumpGeneration(identityId);
  await persist(identityId, []);
}

export function subscribeFavoriteMutationQueue(listener: QueueListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getFavoriteMutationQueueSnapshot(
  identityId: string | null,
): readonly PendingFavoriteMutation[] {
  if (!identityId) return EMPTY_QUEUE;
  return snapshots.get(identityId) ?? EMPTY_QUEUE;
}

export function isFavoriteMutationQueued(identityId: string | null, menuItemId: string): boolean {
  if (!identityId) return false;
  return Boolean(snapshots.get(identityId)?.some(item => item.menuItemId === menuItemId));
}

export async function replayFavoriteMutationQueue(
  identityId: string,
  handler: ReplayHandler,
): Promise<FavoriteReplayResult> {
  const startedAtGeneration = generation(identityId);
  const queue = [...(await currentQueue(identityId))];
  if (queue.length === 0) {
    return {replayed: 0, dropped: 0, remaining: 0, stoppedForAuthentication: false};
  }

  const remaining: PendingFavoriteMutation[] = [];
  let replayed = 0;
  let dropped = 0;
  let stoppedForAuthentication = false;

  for (let index = 0; index < queue.length; index += 1) {
    if (generation(identityId) !== startedAtGeneration) {
      return {
        replayed,
        dropped,
        remaining: getFavoriteMutationQueueSnapshot(identityId).length,
        stoppedForAuthentication: false,
      };
    }

    const mutation = queue[index];
    try {
      await handler(mutation);
      replayed += 1;
    } catch (error) {
      const apiError = toAppApiError(error);

      if (apiError.status === 401) {
        stoppedForAuthentication = true;
        remaining.push(mutation, ...queue.slice(index + 1));
        break;
      }

      if (apiError.retriable || apiError.status === undefined) {
        remaining.push(
          {
            ...mutation,
            attempts: mutation.attempts + 1,
            lastErrorCode: apiError.code,
          },
          ...queue.slice(index + 1),
        );
        break;
      }

      // A permanent validation/authorization/catalog error must not poison the
      // offline queue forever. The coordinator reconciles server truth after a
      // drop so the optimistic UI is corrected explicitly.
      dropped += 1;
    }
  }

  if (generation(identityId) !== startedAtGeneration) {
    return {
      replayed,
      dropped,
      remaining: getFavoriteMutationQueueSnapshot(identityId).length,
      stoppedForAuthentication: false,
    };
  }

  await persist(identityId, remaining);
  return {
    replayed,
    dropped,
    remaining: remaining.length,
    stoppedForAuthentication,
  };
}
