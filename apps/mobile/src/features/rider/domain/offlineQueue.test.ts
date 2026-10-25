import type {Trip} from '../api/contract';
import {createOfflineQueue, QueueEntry, STORAGE_KEY} from './offlineQueue';

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

function setup(send: (entry: QueueEntry) => Promise<Trip>) {
  let clock = 1_000;
  const storage = memoryStorage();
  const queue = createOfflineQueue({
    storage,
    send,
    isRetriable: error => !(error instanceof HttpError) || !error.status || error.status >= 500,
    describe: error => ({code: 'REFUSED', message: (error as Error).message}),
    now: () => clock,
  });
  return {queue, storage, advance: (ms: number) => (clock += ms)};
}

const trip = {tripId: 't1', step: 'AT_KITCHEN'} as Trip;

describe('rider offline queue', () => {
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
    expect(send).toHaveBeenCalledTimes(2);
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
