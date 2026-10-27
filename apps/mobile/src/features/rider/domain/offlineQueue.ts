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
  /** Not sent at the tap, so the rider was told it will sync and may have left: an OTP then goes with capturedOffline. */
  deferred?: boolean;
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

/** An encrypted store for the customer's delivery OTP while its step waits, by entry id (decision E1). */
export interface SecretStore {
  save(id: string, value: string): Promise<void>;
  load(id: string): Promise<string | null>;
  remove(id: string): Promise<void>;
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
  /**
   * Where the customer's delivery OTP waits, so it survives a restart. Storage never holds it, only
   * {method: 'OTP', otpRef: <entry id>, ...}; without a secret store an unsent OTP lives in memory only.
   */
  secret?: SecretStore;
  /** Lets go of what an entry holds outside the queue (the kept delivery photo) once the server answered for it. */
  release?: (entry: QueueEntry) => Promise<void>;
  /** Refusals the rider must see later (default: all); the others only reach onRejected. */
  keepRefusal?: (entry: QueueEntry, info: RejectInfo) => boolean;
  now?: () => number;
}

export const STORAGE_KEY = 'rider.queue.v1';
export const REFUSALS_KEY = 'rider.queue.refusals.v1';
/** The ids of the OTPs in the secret store and when each was kept: the store can't list its keys (decision E1). */
export const OTP_REFS_KEY = 'rider.queue.otpRefs.v1';
const MAX_REFUSALS = 5;
/** The longest the customer's OTP waits on the phone (decision E1). */
export const OTP_KEPT_MS = 24 * 60 * 60_000;
const BASE_DELAY_MS = 2_000;
const MAX_DELAY_MS = 60_000;

type OtpBody = {method: 'OTP'; otp?: string; otpRef?: string; capturedOffline?: boolean};
type OtpRef = {id: string; at: number};

/** An OTP delivery's body: in memory it has the otp, as stored only the otpRef. */
function otpBody(entry: QueueEntry): OtpBody | undefined {
  const body = entry.body as OtpBody | undefined;
  return body?.method === 'OTP' ? body : undefined;
}

/** What storage holds: never the customer's OTP, only the id it waits under. */
function forStorage(entry: QueueEntry): QueueEntry {
  const body = otpBody(entry);
  if (body?.otp === undefined) {
    return entry;
  }
  const stored: OtpBody = {...body, otpRef: entry.id};
  delete stored.otp;
  return {...entry, body: stored};
}

export function createOfflineQueue(deps: QueueDeps) {
  const now = deps.now ?? Date.now;
  let entries: QueueEntry[] = [];
  let refused: Refusal[] = [];
  let loaded: Promise<void> | null = null;
  let refusalsLoaded: Promise<void> | null = null;
  let chain: Promise<unknown> = Promise.resolve();
  let counter = 0;
  const changeListeners = new Set<() => void>();
  const rejectListeners = new Set<(entry: QueueEntry, info: RejectInfo) => void>();
  const sentListeners = new Set<(entry: QueueEntry, trip: Trip) => void>();

  // Every change runs one after another, so a replay never races an enqueue. Reads come from memory and never wait
  // behind a send, so a screen opened during an upload shows what is queued at once.
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

  /** The queue, read from storage once; after that, memory. */
  async function load(): Promise<QueueEntry[]> {
    loaded ??= (async () => {
      // Anything stored at start outlived its tap (the app restarted), so the screen shows it and an OTP says so.
      entries = (await read<QueueEntry>(STORAGE_KEY)).map(e => ({...e, deferred: true}));
      await sweepOtps();
    })();
    await loaded;
    return entries;
  }

  async function saveOtpRefs(refs: OtpRef[]): Promise<void> {
    await deps.storage.setItem(OTP_REFS_KEY, JSON.stringify(refs)).catch(() => undefined);
  }

  /** The OTP goes to the secret store, its id to the list first, so a crash between the two never hides one. */
  async function keepOtp(id: string, otp: string): Promise<void> {
    if (deps.secret) {
      await saveOtpRefs([...(await read<OtpRef>(OTP_REFS_KEY)), {id, at: now()}]);
      await deps.secret.save(id, otp).catch(() => undefined);
    }
  }

  async function forgetOtp(entry: QueueEntry): Promise<void> {
    if (otpBody(entry) && deps.secret) {
      await deps.secret.remove(entry.id).catch(() => undefined);
      const refs = await read<OtpRef>(OTP_REFS_KEY);
      if (refs.some(r => r.id === entry.id)) {
        await saveOtpRefs(refs.filter(r => r.id !== entry.id));
      }
    }
  }

  /**
   * At start, an OTP leaves the secret store when its step is gone (the app died before it could tidy up) or it was kept
   * over 24 h (E1); a step still waiting then goes without it and the server's refusal shows.
   */
  async function sweepOtps(): Promise<void> {
    if (!deps.secret) {
      return;
    }
    const refs = await read<OtpRef>(OTP_REFS_KEY);
    const waiting = new Set(entries.map(e => e.id));
    const gone = refs.filter(r => !waiting.has(r.id) || now() - r.at > OTP_KEPT_MS);
    if (gone.length > 0) {
      await Promise.all(gone.map(r => deps.secret?.remove(r.id).catch(() => undefined)));
      await saveOtpRefs(refs.filter(r => !gone.includes(r)));
    }
  }

  /** Once the server has answered for an entry (sent or refused), its OTP and photo go. */
  async function letGo(entry: QueueEntry): Promise<void> {
    await forgetOtp(entry);
    await deps.release?.(entry).catch(() => undefined);
  }

  /** The entry as the server gets it: the OTP back from its store, and capturedOffline once it outlived the tap. */
  async function ready(entry: QueueEntry): Promise<QueueEntry> {
    const body = otpBody(entry);
    if (!body) {
      return entry;
    }
    const sent: OtpBody = {...body};
    delete sent.otpRef;
    if (sent.otp === undefined && body.otpRef) {
      // shortcut: a code the store lost (or let go after 24 h) is sent without it; the server's 400 shows as a refusal.
      sent.otp = (await deps.secret?.load(body.otpRef).catch(() => null)) ?? undefined;
    }
    if (entry.deferred) {
      sent.capturedOffline = true;
    }
    return {...entry, body: sent};
  }

  async function loadRefusals(): Promise<Refusal[]> {
    refusalsLoaded ??= read<Refusal>(REFUSALS_KEY).then(list => {
      refused = list;
    });
    await refusalsLoaded;
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
    await deps.storage.setItem(STORAGE_KEY, JSON.stringify(list.map(forStorage)));
    changeListeners.forEach(listener => listener());
  }

  /**
   * skipBackoff: entries waiting out a backoff go too, every trip's (true: an upload just reached the server) or one trip's
   * (its id: the rider just tapped a step of it).
   */
  async function flushFor(riderId: string, skipBackoff: boolean | string = false): Promise<Map<string, QueueOutcome>> {
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
      if (skipBackoff !== true && skipBackoff !== entry.tripId && entry.nextAttemptAt > now()) {
        heldTrips.add(entry.tripId);
        results.set(entry.id, {kind: 'queued'});
        continue;
      }
      try {
        const trip = await deps.send(await ready(entry));
        // The screen takes the server's trip before the entry leaves the queue, so it never shows the old step between.
        sentListeners.forEach(listener => listener(entry, trip));
        await save((await load()).filter(e => e.id !== entry.id));
        await letGo(entry);
        // A later step of the trip went through, so an earlier refusal of it no longer needs the rider.
        const refusals = await loadRefusals();
        if (refusals.some(r => r.tripId === entry.tripId)) {
          await saveRefusals(refusals.filter(r => r.tripId !== entry.tripId));
        }
        results.set(entry.id, {kind: 'sent', trip});
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
          for (const e of dropped) {
            await letGo(e);
          }
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
          const otp = otpBody(entry)?.otp;
          if (otp !== undefined) {
            // Kept before the entry is stored, so no stored entry points at a code that isn't there.
            await keepOtp(entry.id, otp);
          }
          await save([...list, entry]);
        }
        // The rider just tapped: try this trip now, even a step waiting out a backoff, so a code typed as the signal
        // returns is checked at the door rather than queued behind an older step.
        const results = await flushFor(input.riderId, input.tripId);
        const outcome = results.get(entry.id) ?? {kind: 'queued'};
        if (outcome.kind === 'queued' && !entry.deferred) {
          const id = entry.id;
          await save((await load()).map(e => (e.id === id ? {...e, deferred: true} : e)));
        }
        return outcome;
      });
    },
    /** Sends what waits; {now: true} (the phone just reached the server) also sends entries waiting out a backoff. */
    flush(riderId: string, options?: {now?: boolean}): Promise<Map<string, QueueOutcome>> {
      return serial(() => flushFor(riderId, options?.now));
    },
    /** This rider's entries waiting to send, oldest first, optionally for one trip (copies). */
    async entries(riderId: string, tripId?: string): Promise<QueueEntry[]> {
      return (await load())
        .filter(e => e.riderId === riderId && (tripId === undefined || e.tripId === tripId))
        .map(e => ({...e}));
    },
    async pending(riderId: string, tripId?: string): Promise<number> {
      return (await load()).filter(e => e.riderId === riderId && (tripId === undefined || e.tripId === tripId)).length;
    },
    /** The server's refusals this rider hasn't dismissed, newest first, optionally for one trip (P1-08). */
    async refusals(riderId: string, tripId?: string): Promise<Refusal[]> {
      return (await loadRefusals()).filter(r => r.riderId === riderId && (tripId === undefined || r.tripId === tripId));
    },
    /** Not queued behind a send: the notice goes at once. Each change reads and writes in one step, so none is lost. */
    async dismissRefusal(tripId: string): Promise<void> {
      await saveRefusals((await loadRefusals()).filter(r => r.tripId !== tripId));
    },
    /** Every rider's entries waiting, and the oldest one's createdAt (null when none): the phone's health report. */
    async stats(): Promise<{pending: number; oldestAt: number | null}> {
      const list = await load();
      return {pending: list.length, oldestAt: list.length ? Math.min(...list.map(e => e.createdAt)) : null};
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
