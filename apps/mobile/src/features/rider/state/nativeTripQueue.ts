import type {Trip, TripAction} from '../api/contract';
import type {NewQueueEntry, QueueEntry, QueueOutcome, Refusal, RejectInfo} from '../domain/offlineQueue';

/**
 * The Kotlin trip-step outbox (RiderOutbox through RiderOnlineModule, P2-02): JSON text both ways. It keeps a step
 * through the app being swiped away, killed or the phone restarting, and sends it with the shift credential when JS
 * isn't running. See docs/riders/NATIVE.md.
 */
export interface NativeOutbox {
  /** Saves a step and sends it at once, in one go; resolves {entryId, results, needsAuth}. */
  outboxEnqueue(entryJson: string, optionsJson: string): Promise<string>;
  /** One pass over the waiting steps; resolves {results, needsAuth}. */
  outboxFlush(optionsJson: string): Promise<string>;
  /** {entries, refusals}: the JS queue moved in, OTPs in the bodies (sealed in the Keystore there). */
  outboxImport(json: string): Promise<null>;
  /** {entries, refusals} as stored, never a code. */
  outboxState(): Promise<string>;
  /** The step is still waiting once the tap is over: it now counts as captured offline. */
  outboxDefer(entryId: string): Promise<null>;
  outboxDismissRefusal(tripId: string): Promise<null>;
}

/** A refusal as native keeps it: the server's own status, code and message; status 0 when moved from JS, already worded. */
interface StoredRefusal {
  riderId: string;
  tripId: string;
  action: TripAction;
  at: number;
  status: number;
  code?: string;
  message?: string;
  attemptsLeft?: number;
}

interface PassResult {
  entry: QueueEntry;
  kind: 'sent' | 'queued' | 'rejected';
  trip?: Trip;
  status?: number;
  code?: string;
  message?: string;
  attemptsLeft?: number;
  /** The step the server refused; the trip's later steps went with it. */
  answered?: boolean;
}

interface PassAnswer {
  results: PassResult[];
  /** The sign-in couldn't send (a 401, or neither a token nor a shift): try once more with a renewed token. */
  needsAuth: boolean;
}

interface PassOptions {
  riderId: string;
  /** No step waits out a backoff (the phone just reached the server). */
  now?: boolean;
  /** This trip's steps don't wait out a backoff (the rider just tapped). */
  tripId?: string;
}

export interface NativeQueueDeps {
  native: NativeOutbox;
  /** The app's access token if still fresh, else null: native then sends with the shift credential, if one is saved. */
  freshToken: () => string | null;
  /** After a 401 (or with neither a token nor a shift): a renewed token, or null. */
  renewToken: () => Promise<string | null>;
  apiBaseUrl: () => string;
  /** Words a server answer as the JS queue does (describe), so both queues show the same refusal. */
  describe: (status: number, answer: {code?: string; message?: string; attemptsLeft?: number}) => RejectInfo;
  /** riderOutboxChanged: a pass native ran by itself (after an upload, on a new network, from the job). */
  onPass: (listener: (answerJson: string) => void) => () => void;
}

/** The OfflineQueue interface (tripQueue) over the native outbox; reads come from the last state native gave. */
export function createNativeTripQueue(deps: NativeQueueDeps) {
  let entries: QueueEntry[] = [];
  let refused: Refusal[] = [];
  let loaded: Promise<void> | null = null;
  const changeListeners = new Set<() => void>();
  const rejectListeners = new Set<(entry: QueueEntry, info: RejectInfo) => void>();
  const sentListeners = new Set<(entry: QueueEntry, trip: Trip) => void>();

  const reject = (answer: {status?: number; code?: string; message?: string; attemptsLeft?: number}): RejectInfo =>
    answer.status
      ? deps.describe(answer.status, answer)
      : {code: answer.code || 'UNKNOWN', message: answer.message || 'Something went wrong. Try again.', attemptsLeft: answer.attemptsLeft};

  async function read(): Promise<void> {
    const state = JSON.parse(await deps.native.outboxState()) as {entries: QueueEntry[]; refusals: StoredRefusal[]};
    entries = state.entries;
    refused = state.refusals.map(r => ({...reject(r), riderId: r.riderId, tripId: r.tripId, action: r.action, at: r.at}));
  }

  async function load(): Promise<void> {
    loaded ??= read().catch(() => undefined);
    await loaded;
  }

  async function changed(): Promise<void> {
    await read().catch(() => undefined);
    changeListeners.forEach(listener => listener());
  }

  /** A sent step's trip reaches the screen before the step leaves the list, so the step on screen never goes back. */
  async function apply(answer: PassAnswer): Promise<void> {
    for (const result of answer.results) {
      const trip = result.trip;
      if (result.kind === 'sent' && trip) {
        sentListeners.forEach(listener => listener(result.entry, trip));
      } else if (result.kind === 'rejected' && result.answered) {
        const info = reject(result);
        rejectListeners.forEach(listener => listener(result.entry, info));
      }
    }
    await changed();
  }

  function outcomes(answer: PassAnswer): Map<string, QueueOutcome> {
    const map = new Map<string, QueueOutcome>();
    for (const result of answer.results) {
      map.set(
        result.entry.id,
        result.kind === 'sent' && result.trip
          ? {kind: 'sent', trip: result.trip}
          : result.kind === 'rejected'
            ? {kind: 'rejected', ...reject(result)}
            : {kind: 'queued'},
      );
    }
    return map;
  }

  const json = (options: PassOptions, accessToken: string | null) =>
    JSON.stringify({...options, accessToken, apiBaseUrl: deps.apiBaseUrl()});

  /** After a 401, or with neither a token nor a shift: one more pass with a renewed token. */
  async function renewed(first: PassAnswer, options: PassOptions): Promise<PassAnswer> {
    if (!first.needsAuth) {
      return first;
    }
    const token = await deps.renewToken();
    if (!token) {
      return first;
    }
    const second = JSON.parse(await deps.native.outboxFlush(json(options, token))) as PassAnswer;
    return {results: [...first.results, ...second.results], needsAuth: second.needsAuth};
  }

  deps.onPass(answerJson => {
    apply(JSON.parse(answerJson) as PassAnswer).catch(() => undefined);
  });

  return {
    /** Saves the step on the phone's disk, tries it at once and reports what happened to it, as the JS queue does. */
    async enqueue(input: NewQueueEntry): Promise<QueueOutcome> {
      const options = {riderId: input.riderId, tripId: input.tripId};
      const first = JSON.parse(await deps.native.outboxEnqueue(JSON.stringify(input), json(options, deps.freshToken()))) as PassAnswer & {
        entryId: string;
      };
      // The step is on disk: a failed second try leaves it waiting, never lost.
      const answer = await renewed(first, options).catch(() => first);
      const outcome = outcomes(answer).get(first.entryId) ?? {kind: 'queued'};
      if (outcome.kind === 'queued') {
        await deps.native.outboxDefer(first.entryId).catch(() => null);
      }
      await apply(answer);
      return outcome;
    },
    /** Sends what waits; {now: true} (the phone just reached the server) also sends steps waiting out a backoff. */
    async flush(riderId: string, options?: {now?: boolean}): Promise<Map<string, QueueOutcome>> {
      await load();
      if (!entries.some(e => e.riderId === riderId)) {
        return new Map();
      }
      const passOptions = {riderId, now: options?.now === true};
      try {
        const first = JSON.parse(await deps.native.outboxFlush(json(passOptions, deps.freshToken()))) as PassAnswer;
        const answer = await renewed(first, passOptions).catch(() => first);
        await apply(answer);
        return outcomes(answer);
      } catch {
        return new Map();
      }
    },
    async entries(riderId: string, tripId?: string): Promise<QueueEntry[]> {
      await load();
      return entries.filter(e => e.riderId === riderId && (tripId === undefined || e.tripId === tripId)).map(e => ({...e}));
    },
    async pending(riderId: string, tripId?: string): Promise<number> {
      await load();
      return entries.filter(e => e.riderId === riderId && (tripId === undefined || e.tripId === tripId)).length;
    },
    async refusals(riderId: string, tripId?: string): Promise<Refusal[]> {
      await load();
      return refused.filter(r => r.riderId === riderId && (tripId === undefined || r.tripId === tripId));
    },
    async dismissRefusal(tripId: string): Promise<void> {
      await deps.native.outboxDismissRefusal(tripId);
      await changed();
    },
    /** The JS queue's steps and refusals moved in (P2-02b); rejects if native could not save them. */
    async importAll(moved: QueueEntry[], movedRefusals: Refusal[]): Promise<void> {
      await deps.native.outboxImport(JSON.stringify({entries: moved, refusals: movedRefusals}));
      await changed();
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

export type NativeTripQueue = ReturnType<typeof createNativeTripQueue>;
