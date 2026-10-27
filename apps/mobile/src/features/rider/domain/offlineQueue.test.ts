import type {Trip} from '../api/contract';
import {createOfflineQueue, OTP_KEPT_MS, OTP_REFS_KEY, QueueDeps, QueueEntry, REFUSALS_KEY, STORAGE_KEY} from './offlineQueue';

class HttpError extends Error {
  constructor(readonly status?: number) {
    super(status ? `HTTP ${status}` : 'offline');
  }
}

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: async (key: string) => data.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      data.set(key, value);
    },
  };
}

function memorySecret() {
  const data = new Map<string, string>();
  return {
    data,
    save: async (id: string, value: string) => {
      data.set(id, value);
    },
    load: async (id: string) => data.get(id) ?? null,
    remove: async (id: string) => {
      data.delete(id);
    },
  };
}

function setup(send: (entry: QueueEntry) => Promise<Trip>, extra?: Partial<QueueDeps>, storage = memoryStorage()) {
  let clock = 1_000;
  const queue = createOfflineQueue({
    storage,
    send,
    isRetriable: error => !(error instanceof HttpError) || !error.status || error.status >= 500,
    describe: error => ({code: 'REFUSED', message: (error as Error).message}),
    now: () => clock,
    ...extra,
  });
  return {queue, storage, advance: (ms: number) => (clock += ms)};
}

const trip = {tripId: 't1', step: 'AT_KITCHEN'} as Trip;

describe('rider offline queue', () => {
  it('reports how many actions wait and since when, for the phone health report', async () => {
    const {queue, advance} = setup(async () => {
      throw new HttpError();
    });
    expect(await queue.stats()).toEqual({pending: 0, oldestAt: null});
    await queue.enqueue({riderId: 'r1', tripId: 't1', action: 'arrived-pickup', key: 'k1'});
    advance(5_000);
    await queue.enqueue({riderId: 'r2', tripId: 't2', action: 'picked-up', key: 'k2'});
    expect(await queue.stats()).toEqual({pending: 2, oldestAt: 1_000});
  });

  it('keeps when and where the rider tapped on the entry', async () => {
    const send = jest.fn(async () => {
      throw new HttpError();
    });
    const {queue, storage} = setup(send);
    const fix = {lat: 17.44, lng: 78.39, accuracyM: 8, at: '2026-10-27T09:00:00Z', ageMs: 1_500};
    await queue.enqueue({riderId: 'r1', tripId: 't1', action: 'arrived-drop', key: 'k1', occurredAt: 900, fix});
    expect(JSON.parse(storage.data.get(STORAGE_KEY) ?? '[]')[0]).toMatchObject({occurredAt: 900, fix});
  });

  it('sends at once when online', async () => {
    const send = jest.fn(async () => trip);
    const {queue} = setup(send);
    const outcome = await queue.enqueue({riderId: 'r1', tripId: 't1', action: 'arrived-pickup', key: 'k1'});
    expect(outcome).toEqual({kind: 'sent', trip});
    expect(await queue.pending('r1')).toBe(0);
  });

  it('keeps actions while offline and replays them in order', async () => {
    let online = false;
    const sent: string[] = [];
    const send = jest.fn(async (entry: QueueEntry) => {
      if (!online) {
        throw new HttpError();
      }
      sent.push(entry.action);
      return trip;
    });
    const {queue, storage, advance} = setup(send);
    expect(
      (await queue.enqueue({riderId: 'r1', tripId: 't1', action: 'arrived-pickup', key: 'k1'})).kind,
    ).toBe('queued');
    await queue.enqueue({riderId: 'r1', tripId: 't1', action: 'picked-up', key: 'k2'});
    expect(await queue.pending('r1')).toBe(2);
    expect(JSON.parse(storage.data.get(STORAGE_KEY)!)).toHaveLength(2);

    online = true;
    advance(120_000);
    await queue.flush('r1');
    expect(sent).toEqual(['arrived-pickup', 'picked-up']);
    expect(await queue.pending('r1')).toBe(0);
  });

  it('sends an entry still waiting out its backoff when flushed now, as the phone just reached the server', async () => {
    let online = false;
    const send = jest.fn(async () => {
      if (!online) {
        throw new HttpError();
      }
      return trip;
    });
    const {queue} = setup(send);
    await queue.enqueue({riderId: 'r1', tripId: 't1', action: 'picked-up', key: 'k1'});
    online = true;
    await queue.flush('r1');
    expect(send).toHaveBeenCalledTimes(1); // the 2 s backoff hasn't run out
    await queue.flush('r1', {now: true});
    expect(send).toHaveBeenCalledTimes(2);
    expect(await queue.pending('r1')).toBe(0);
  });

  it("keeps the trip's last refusal across restarts until the rider dismisses it", async () => {
    const refuse = async () => {
      throw new HttpError(409);
    };
    const {queue, storage} = setup(refuse);
    await queue.enqueue({riderId: 'r1', tripId: 't1', action: 'arrived-pickup', key: 'k1'});
    await queue.enqueue({riderId: 'r1', tripId: 't1', action: 'picked-up', key: 'k2'});
    const kept = [{riderId: 'r1', tripId: 't1', action: 'picked-up', code: 'REFUSED', message: 'HTTP 409', at: 1_000}];
    expect(JSON.parse(storage.data.get(REFUSALS_KEY)!)).toEqual(kept);

    const restarted = setup(refuse, undefined, storage).queue;
    expect(await restarted.refusals('r1')).toEqual(kept);
    expect(await restarted.refusals('r1', 'other')).toEqual([]);
    expect(await restarted.refusals('r2')).toEqual([]);
    await restarted.dismissRefusal('t1');
    expect(await restarted.refusals('r1')).toEqual([]);
    expect(JSON.parse(storage.data.get(REFUSALS_KEY)!)).toEqual([]);
  });

  it('forgets a refusal once a later step of that trip goes through, and keeps none the app says to skip', async () => {
    let refuse = true;
    const send = jest.fn(async () => {
      if (refuse) {
        throw new HttpError(422);
      }
      return trip;
    });
    const {queue} = setup(send, {keepRefusal: entry => entry.action !== 'delivered'});
    await queue.enqueue({riderId: 'r1', tripId: 't1', action: 'delivered', key: 'k1'});
    expect(await queue.refusals('r1')).toEqual([]);
    await queue.enqueue({riderId: 'r1', tripId: 't1', action: 'failed', key: 'k2'});
    expect(await queue.refusals('r1')).toHaveLength(1);
    refuse = false;
    await queue.enqueue({riderId: 'r1', tripId: 't1', action: 'failed', key: 'k3'});
    expect(await queue.refusals('r1')).toEqual([]);
  });

  describe("the customer's delivery OTP (P1-05)", () => {
    const otpStep = (key: string) => ({
      riderId: 'r1',
      tripId: 't1',
      action: 'delivered' as const,
      key,
      body: {method: 'OTP', otp: '4831', fix: {lat: 17.46, lng: 78.36, accuracyM: 9, at: '2026-10-27T09:00:00Z'}},
    });

    it('survives a restart in the secret store, never in storage, goes as captured offline and is let go once sent', async () => {
      let online = false;
      const send = jest.fn(async (_entry: QueueEntry) => {
        if (!online) {
          throw new HttpError();
        }
        return trip;
      });
      const secret = memorySecret();
      const {queue, storage} = setup(send, {secret});
      expect((await queue.enqueue(otpStep('k1'))).kind).toBe('queued');
      const stored = storage.data.get(STORAGE_KEY)!;
      expect(stored).not.toContain('4831');
      const [entry] = JSON.parse(stored);
      expect(entry.body).toEqual({method: 'OTP', otpRef: entry.id, fix: otpStep('k1').body.fix});
      expect(entry.deferred).toBe(true);
      expect(secret.data.get(entry.id)).toBe('4831');

      online = true;
      const restarted = setup(send, {secret}, storage);
      restarted.advance(120_000);
      await restarted.queue.flush('r1');
      expect(send).toHaveBeenLastCalledWith(
        expect.objectContaining({body: {method: 'OTP', otp: '4831', fix: otpStep('k1').body.fix, capturedOffline: true}}),
      );
      expect(secret.data.size).toBe(0);
      expect(await restarted.queue.pending('r1')).toBe(0);
    });

    it('goes without capturedOffline when sent at the tap, and is let go when the server refuses it', async () => {
      let answer: 'ok' | 'offline' | 'wrong' = 'ok';
      const send = jest.fn(async (_entry: QueueEntry) => {
        if (answer === 'ok') {
          return trip;
        }
        throw new HttpError(answer === 'offline' ? undefined : 422);
      });
      const secret = memorySecret();
      const {queue, advance} = setup(send, {secret});
      await queue.enqueue(otpStep('k1'));
      expect(send.mock.calls[0][0].body).toEqual(otpStep('k1').body);
      expect(secret.data.size).toBe(0);

      answer = 'offline';
      await queue.enqueue(otpStep('k2'));
      expect(secret.data.size).toBe(1);
      answer = 'wrong';
      advance(120_000);
      const results = await queue.flush('r1');
      expect([...results.values()][0]).toMatchObject({kind: 'rejected'});
      expect(secret.data.size).toBe(0);
    });

    it('is let go after 24 hours: the step then goes without it and the server refuses it', async () => {
      let online = false;
      const send = jest.fn(async (entry: QueueEntry) => {
        if (!online) {
          throw new HttpError();
        }
        if (!(entry.body as {otp?: string}).otp) {
          throw new HttpError(400); // "Enter the 4-digit OTP the customer reads out."
        }
        return trip;
      });
      const secret = memorySecret();
      const {queue, storage} = setup(send, {secret});
      await queue.enqueue(otpStep('k1'));
      online = true;
      const restarted = setup(send, {secret}, storage);
      restarted.advance(OTP_KEPT_MS + 1);
      expect(await restarted.queue.pending('r1')).toBe(1);
      expect(secret.data.size).toBe(0);
      expect(JSON.parse(storage.data.get(OTP_REFS_KEY)!)).toEqual([]);
      await restarted.queue.flush('r1');
      expect(send.mock.calls.at(-1)?.[0].body).toEqual({method: 'OTP', fix: otpStep('k1').body.fix, capturedOffline: true});
      expect(await restarted.queue.refusals('r1')).toEqual([expect.objectContaining({tripId: 't1', message: 'HTTP 400'})]);
    });

    it('leaves no code behind when the app died before tidying up: it goes at the next start', async () => {
      const secret = memorySecret();
      const storage = memoryStorage();
      secret.data.set('9-1', '4831');
      storage.data.set(OTP_REFS_KEY, JSON.stringify([{id: '9-1', at: 1_000}]));
      const {queue} = setup(async () => trip, {secret}, storage);
      expect(await queue.pending('r1')).toBe(0);
      expect(secret.data.size).toBe(0);
      expect(JSON.parse(storage.data.get(OTP_REFS_KEY)!)).toEqual([]);
    });
  });

  it('counts what it loads at start as deferred: it outlived its tap', async () => {
    const storage = memoryStorage();
    const stored = {id: '1-1', riderId: 'r1', tripId: 't1', action: 'picked-up', key: 'k1', createdAt: 1, attempts: 0, nextAttemptAt: 0};
    storage.data.set(STORAGE_KEY, JSON.stringify([stored]));
    const {queue} = setup(async () => trip, undefined, storage);
    expect(await queue.entries('r1')).toEqual([{...stored, deferred: true}]);
  });

  it('announces a sent step before it leaves the queue, so the screen never shows the old step between', async () => {
    const {queue, storage} = setup(async () => trip);
    const queuedWhenAnnounced: string[] = [];
    queue.onSent(() => queuedWhenAnnounced.push(storage.data.get(STORAGE_KEY) ?? ''));
    await queue.enqueue({riderId: 'r1', tripId: 't1', action: 'picked-up', key: 'k1'});
    expect(queuedWhenAnnounced[0]).toContain('"k1"');
    expect(JSON.parse(storage.data.get(STORAGE_KEY)!)).toEqual([]);
  });

  it("tries the tapped trip's waiting steps at once, and other trips' after their backoff", async () => {
    let online = false;
    const sent: string[] = [];
    const send = jest.fn(async (entry: QueueEntry) => {
      sent.push(entry.key);
      if (!online) {
        throw new HttpError();
      }
      return trip;
    });
    const {queue} = setup(send);
    await queue.enqueue({riderId: 'r1', tripId: 't1', action: 'picked-up', key: 'k1'});
    online = true;
    await queue.enqueue({riderId: 'r1', tripId: 't2', action: 'arrived-pickup', key: 'k2'});
    expect(sent).toEqual(['k1', 'k2']);
    await queue.enqueue({riderId: 'r1', tripId: 't1', action: 'arrived-drop', key: 'k3'});
    expect(sent).toEqual(['k1', 'k2', 'k1', 'k3']);
  });

  it('answers reads from memory, so a screen opened during an upload sees the queue at once', async () => {
    let finish: (sent: Trip) => void = () => undefined;
    const send = jest.fn(() => new Promise<Trip>(resolve => (finish = resolve)));
    const {queue} = setup(send);
    const sending = queue.enqueue({riderId: 'r1', tripId: 't1', action: 'picked-up', key: 'k1'});
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    expect(send).toHaveBeenCalledTimes(1); // still in flight
    expect((await queue.entries('r1')).map(e => e.key)).toEqual(['k1']);
    expect(await queue.pending('r1', 't1')).toBe(1);
    finish(trip);
    await sending;
    expect(await queue.pending('r1')).toBe(0);
  });

  it('never queues the same idempotency key twice', async () => {
    const {queue} = setup(async () => {
      throw new HttpError();
    });
    await queue.enqueue({riderId: 'r1', tripId: 't1', action: 'picked-up', key: 'same'});
    await queue.enqueue({riderId: 'r1', tripId: 't1', action: 'picked-up', key: 'same'});
    expect(await queue.pending('r1')).toBe(1);
  });

  it('stops a trip queue on a 4xx and reports the server message', async () => {
    let online = false;
    const send = jest.fn(async () => {
      if (!online) {
        throw new HttpError();
      }
      throw new HttpError(409);
    });
    const {queue, advance} = setup(send);
    const rejected = jest.fn();
    queue.onRejected(rejected);
    await queue.enqueue({riderId: 'r1', tripId: 't1', action: 'arrived-pickup', key: 'k1'});
    await queue.enqueue({riderId: 'r1', tripId: 't1', action: 'picked-up', key: 'k2'});
    online = true;
    advance(120_000);
    const results = await queue.flush('r1');
    // Both the refused step and the one queued behind it report the refusal.
    expect([...results.values()]).toEqual([
      {kind: 'rejected', code: 'REFUSED', message: 'HTTP 409'},
      {kind: 'rejected', code: 'REFUSED', message: 'HTTP 409'},
    ]);
    expect(rejected).toHaveBeenCalledTimes(1);
    expect(await queue.pending('r1')).toBe(0);
    // Offline the second tap tries the first step again at once; online the refusal ends both.
    expect(send).toHaveBeenCalledTimes(3);
  });

  it("replays only the signed-in rider's actions", async () => {
    let online = false;
    const send = jest.fn(async () => {
      if (!online) {
        throw new HttpError();
      }
      return trip;
    });
    const {queue, advance} = setup(send);
    await queue.enqueue({riderId: 'r1', tripId: 't1', action: 'picked-up', key: 'k1'});
    online = true;
    advance(120_000);
    await queue.flush('r2');
    expect(await queue.pending('r1')).toBe(1);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('releases what an entry holds (the kept photo) once the server answered: sent, or refused with the steps behind it', async () => {
    let answer: 'ok' | 'offline' | 'refuse' = 'ok';
    const send = jest.fn(async () => {
      if (answer === 'ok') {
        return trip;
      }
      throw new HttpError(answer === 'offline' ? undefined : 409);
    });
    const release = jest.fn(async (_entry: QueueEntry) => undefined);
    const {queue, advance} = setup(send, {release});
    await queue.enqueue({riderId: 'r1', tripId: 't1', action: 'delivered', key: 'k1', body: {method: 'PHOTO', photoUri: 'a'}});
    expect(release.mock.calls.map(([e]) => e.key)).toEqual(['k1']);

    answer = 'offline';
    await queue.enqueue({riderId: 'r1', tripId: 't2', action: 'arrived-drop', key: 'k2'});
    await queue.enqueue({riderId: 'r1', tripId: 't2', action: 'delivered', key: 'k3', body: {method: 'PHOTO', photoUri: 'b'}});
    expect(release).toHaveBeenCalledTimes(1); // still waiting: the photo stays
    answer = 'refuse';
    advance(120_000);
    await queue.flush('r1');
    expect(release.mock.calls.map(([e]) => e.key)).toEqual(['k1', 'k2', 'k3']);
  });

  it('reports pending actions so sign-out can be blocked', async () => {
    const {queue} = setup(async () => {
      throw new HttpError(503);
    });
    await queue.enqueue({riderId: 'r1', tripId: 't9', action: 'arrived-drop', key: 'k1'});
    expect(await queue.pending('r1')).toBe(1);
    expect(await queue.pending('r1', 't9')).toBe(1);
    expect(await queue.pending('r1', 'other')).toBe(0);
  });
});
