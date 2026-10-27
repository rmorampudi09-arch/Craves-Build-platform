import type {RiderFix, Trip, TripAction} from '../api/contract';

/** One trip action waiting to reach the server. Stored as JSON under STORAGE_KEY. */
export interface QueueEntry {
  id: string;
  riderId: string;
  tripId: string;
  action: TripAction;
  /** Idempotency-Key header; the same key is never queued twice. */
  key: string;
  body?: unknown;
  /** Date.now() when the rider tapped, and the phone's fix then (blueprint A4); entries saved before 1.1.0 have neither. */
  occurredAt?: number;
  fix?: RiderFix;
  createdAt: number;
  attempts: number;
  nextAttemptAt: number;
}

export type NewQueueEntry = Pick<QueueEntry, 'riderId' | 'tripId' | 'action' | 'key' | 'body' | 'occurredAt' | 'fix'>;

export type QueueOutcome =
  | {kind: 'sent'; trip: Trip}
  | {kind: 'queued'}
  | ({kind: 'rejected'} & RejectInfo);

/** Why the server refused a step; attemptsLeft comes with a wrong delivery OTP. */
export interface RejectInfo {
  code: string;
  message: string;
  attemptsLeft?: number;
}

export interface QueueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export interface QueueDeps {
  storage: QueueStorage;
  send: (entry: QueueEntry) => Promise<Trip>;
  /** True for network failures and 5xx: keep the entry and retry with backoff. */
  isRetriable: (error: unknown) => boolean;
  describe: (error: unknown) => RejectInfo;
  /** Entries it matches (the customer's delivery OTP) stay in memory and are never written to storage. */
  memoryOnly?: (entry: QueueEntry) => boolean;
  now?: () => number;
}

export const STORAGE_KEY = 'rider.queue.v1';
const BASE_DELAY_MS = 2_000;
const MAX_DELAY_MS = 60_000;

export function createOfflineQueue(deps: QueueDeps) {
  const now = deps.now ?? Date.now;
  let entries: QueueEntry[] | null = null;
  let chain: Promise<unknown> = Promise.resolve();
  let counter = 0;
  const changeListeners = new Set<() => void>();
  const rejectListeners = new Set<(entry: QueueEntry, info: RejectInfo) => void>();
  const sentListeners = new Set<(entry: QueueEntry, trip: Trip) => void>();

  // Every operation runs one after another, so a replay never races an enqueue.
  function serial<T>(task: () => Promise<T>): Promise<T> {
    const next = chain.then(task, task);
    chain = next.catch(() => undefined);
    return next;
  }

  async function load(): Promise<QueueEntry[]> {
    if (!entries) {
      try {
        const parsed = JSON.parse((await deps.storage.getItem(STORAGE_KEY)) ?? '[]');
        entries = Array.isArray(parsed) ? parsed : [];
      } catch {
        entries = [];
      }
    }
    return entries as QueueEntry[];
  }

  async function save(list: QueueEntry[]): Promise<void> {
    entries = list;
    const {memoryOnly} = deps;
    await deps.storage.setItem(STORAGE_KEY, JSON.stringify(memoryOnly ? list.filter(e => !memoryOnly(e)) : list));
    changeListeners.forEach(listener => listener());
  }

  async function flushFor(riderId: string): Promise<Map<string, QueueOutcome>> {
    const results = new Map<string, QueueOutcome>();
    const heldTrips = new Set<string>();
    for (const entry of [...(await load())]) {
      // Actions belong to the rider who made them; another rider's wait for that rider.
      if (entry.riderId !== riderId || heldTrips.has(entry.tripId)) {
        continue;
      }
      if (!(await load()).some(e => e.id === entry.id)) {
        continue;
      }
      if (entry.nextAttemptAt > now()) {
        heldTrips.add(entry.tripId);
        results.set(entry.id, {kind: 'queued'});
        continue;
      }
      try {
        const trip = await deps.send(entry);
        await save((await load()).filter(e => e.id !== entry.id));
        results.set(entry.id, {kind: 'sent', trip});
        sentListeners.forEach(listener => listener(entry, trip));
      } catch (error) {
        heldTrips.add(entry.tripId);
        if (deps.isRetriable(error)) {
          const attempts = entry.attempts + 1;
          const delay = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** (attempts - 1));
          await save(
            (await load()).map(e =>
              e.id === entry.id ? {...e, attempts, nextAttemptAt: now() + delay} : e,
            ),
          );
          results.set(entry.id, {kind: 'queued'});
        } else {
          // The server refused (4xx, e.g. the trip was cancelled): its state wins, so drop this trip's queue.
          const info = deps.describe(error);
          const list = await load();
          const dropped = list.filter(e => e.tripId === entry.tripId && e.riderId === riderId);
          await save(list.filter(e => !dropped.includes(e)));
          dropped.forEach(e => results.set(e.id, {kind: 'rejected', ...info}));
          rejectListeners.forEach(listener => listener(entry, info));
        }
      }
    }
    return results;
  }

  return {
    /** Saves the action, tries to send it straight away and reports what happened to it. */
    enqueue(input: NewQueueEntry): Promise<QueueOutcome> {
      return serial(async () => {
        const list = await load();
        let entry = list.find(e => e.key === input.key);
        if (!entry) {
          counter += 1;
          entry = {
            ...input,
            id: `${now()}-${counter}`,
            createdAt: now(),
            attempts: 0,
            nextAttemptAt: 0,
          };
          await save([...list, entry]);
        }
        const results = await flushFor(input.riderId);
        return results.get(entry.id) ?? {kind: 'queued'};
      });
    },
    flush(riderId: string): Promise<Map<string, QueueOutcome>> {
      return serial(() => flushFor(riderId));
    },
    /** This rider's entries waiting to send, oldest first, optionally for one trip (copies). */
    entries(riderId: string, tripId?: string): Promise<QueueEntry[]> {
      return serial(async () =>
        (await load())
          .filter(e => e.riderId === riderId && (tripId === undefined || e.tripId === tripId))
          .map(e => ({...e})),
      );
    },
    pending(riderId: string, tripId?: string): Promise<number> {
      return serial(async () =>
        (await load()).filter(
          e => e.riderId === riderId && (tripId === undefined || e.tripId === tripId),
        ).length,
      );
    },
    /** Every rider's entries waiting, and the oldest one's createdAt (null when none): the phone's health report. */
    stats(): Promise<{pending: number; oldestAt: number | null}> {
      return serial(async () => {
        const list = await load();
        return {pending: list.length, oldestAt: list.length ? Math.min(...list.map(e => e.createdAt)) : null};
      });
    },
    subscribe(listener: () => void): () => void {
      changeListeners.add(listener);
      return () => changeListeners.delete(listener);
    },
    onRejected(listener: (entry: QueueEntry, info: RejectInfo) => void) {
      rejectListeners.add(listener);
      return () => rejectListeners.delete(listener);
    },
    onSent(listener: (entry: QueueEntry, trip: Trip) => void) {
      sentListeners.add(listener);
      return () => sentListeners.delete(listener);
    },
  };
}

export type OfflineQueue = ReturnType<typeof createOfflineQueue>;
