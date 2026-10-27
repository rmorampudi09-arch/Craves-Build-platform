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

/** The server's last refusal of a trip's step, kept under REFUSALS_KEY until the rider dismisses it (blueprint A3). */
export interface Refusal extends RejectInfo {
  riderId: string;
  tripId: string;
  action: TripAction;
  at: number;
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
  /** Refusals the rider must see later (default: all); the others only reach onRejected. */
  keepRefusal?: (entry: QueueEntry, info: RejectInfo) => boolean;
  now?: () => number;
}

export const STORAGE_KEY = 'rider.queue.v1';
export const REFUSALS_KEY = 'rider.queue.refusals.v1';
const MAX_REFUSALS = 5;
const BASE_DELAY_MS = 2_000;
const MAX_DELAY_MS = 60_000;

export function createOfflineQueue(deps: QueueDeps) {
  const now = deps.now ?? Date.now;
  let entries: QueueEntry[] | null = null;
  let refused: Refusal[] | null = null;
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

  async function read<T>(key: string): Promise<T[]> {
    try {
      const parsed = JSON.parse((await deps.storage.getItem(key)) ?? '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  async function load(): Promise<QueueEntry[]> {
    entries ??= await read<QueueEntry>(STORAGE_KEY);
    return entries;
  }

  async function loadRefusals(): Promise<Refusal[]> {
    refused ??= await read<Refusal>(REFUSALS_KEY);
    return refused;
  }

  async function saveRefusals(list: Refusal[]): Promise<void> {
    refused = list;
    // shortcut: a failed write keeps the refusals in memory only, until the app restarts; nothing better to do with it.
    await deps.storage.setItem(REFUSALS_KEY, JSON.stringify(list)).catch(() => undefined);
    changeListeners.forEach(listener => listener());
  }

  async function save(list: QueueEntry[]): Promise<void> {
    entries = list;
    const {memoryOnly} = deps;
    await deps.storage.setItem(STORAGE_KEY, JSON.stringify(memoryOnly ? list.filter(e => !memoryOnly(e)) : list));
    changeListeners.forEach(listener => listener());
  }

  /** skipBackoff: an upload just reached the server, so entries waiting out a backoff go too. */
  async function flushFor(riderId: string, skipBackoff = false): Promise<Map<string, QueueOutcome>> {
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
      if (!skipBackoff && entry.nextAttemptAt > now()) {
        heldTrips.add(entry.tripId);
        results.set(entry.id, {kind: 'queued'});
        continue;
      }
      try {
        const trip = await deps.send(entry);
        await save((await load()).filter(e => e.id !== entry.id));
        // A later step of the trip went through, so an earlier refusal of it no longer needs the rider.
        const refusals = await loadRefusals();
        if (refusals.some(r => r.tripId === entry.tripId)) {
          await saveRefusals(refusals.filter(r => r.tripId !== entry.tripId));
        }
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
          if (deps.keepRefusal?.(entry, info) ?? true) {
            const refusal: Refusal = {...info, riderId, tripId: entry.tripId, action: entry.action, at: now()};
            const others = (await loadRefusals()).filter(r => r.tripId !== entry.tripId);
            await saveRefusals([refusal, ...others].slice(0, MAX_REFUSALS));
          }
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
    /** Sends what waits; {now: true} (the phone just reached the server) also sends entries waiting out a backoff. */
    flush(riderId: string, options?: {now?: boolean}): Promise<Map<string, QueueOutcome>> {
      return serial(() => flushFor(riderId, options?.now));
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
    /** The server's refusals this rider hasn't dismissed, newest first, optionally for one trip (P1-08). */
    refusals(riderId: string, tripId?: string): Promise<Refusal[]> {
      return serial(async () =>
        (await loadRefusals()).filter(r => r.riderId === riderId && (tripId === undefined || r.tripId === tripId)),
      );
    },
    dismissRefusal(tripId: string): Promise<void> {
      return serial(async () => saveRefusals((await loadRefusals()).filter(r => r.tripId !== tripId)));
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
