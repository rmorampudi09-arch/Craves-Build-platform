// tripQueue in a live rider build whose phone has the native outbox (P2-02b): what the JS queue holds moves there,
// OTPs included, and then every step of those trips goes native, in order.
import {NativeModules} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import {AppApiError} from '../../../core/http/apiError';
import type {Trip} from '../api/contract';
import {riderApi} from '../api/riderApi';
import type {QueueEntry} from '../domain/offlineQueue';

jest.mock('react-native-config', () => ({
  __esModule: true,
  default: {CRAVES_RIDER_API_MODE: 'live', CRAVES_API_BASE_URL: 'https://api.example.invalid'},
}));
jest.mock('../api/riderApi', () => ({riderApi: {tripAction: jest.fn()}}));

const trip = {tripId: 't1', step: 'AT_DROP'} as Trip;

/** A small stand-in for RiderOutbox: it keeps what it is given and sends when online. */
const outbox = {
  online: false,
  entries: [] as QueueEntry[],
  imported: [] as {entries: QueueEntry[]; refusals: unknown[]}[],
  pass(): string {
    const results = this.entries.map(entry => (this.online ? {entry, kind: 'sent', trip} : {entry, kind: 'queued'}));
    if (this.online) {
      this.entries = [];
    }
    return JSON.stringify({results, needsAuth: false});
  },
};
const native = {
  lastFix: async () => null,
  setQueueStats: () => undefined,
  outboxEnqueue: jest.fn(async (entryJson: string) => {
    const entry = {...JSON.parse(entryJson), id: `n${outbox.entries.length + 1}`, createdAt: 2_000, attempts: 0, nextAttemptAt: 0};
    outbox.entries.push(entry);
    return JSON.stringify({...JSON.parse(outbox.pass()), entryId: entry.id});
  }),
  outboxFlush: jest.fn(async () => outbox.pass()),
  outboxImport: jest.fn(async (json: string) => {
    const moved = JSON.parse(json) as {entries: QueueEntry[]; refusals: unknown[]};
    outbox.imported.push(moved);
    outbox.entries.push(...moved.entries);
    return null;
  }),
  outboxState: jest.fn(async () => JSON.stringify({entries: outbox.entries, refusals: []})),
  outboxDefer: jest.fn(async () => null),
  outboxDismissRefusal: jest.fn(async () => null),
};
NativeModules.CravesRiderOnline = native;
// Loaded after the module is in place, as in the rider app.
const {tripQueue} = require('./tripQueue') as typeof import('./tripQueue');

const tripAction = riderApi.tripAction as jest.Mock;
const offline = () => new AppApiError('NETWORK_ERROR', 'No internet', undefined, undefined, true);

describe('tripQueue with the native outbox', () => {
  it('keeps the JS queue until the server says so, then moves it with the OTP and sends through native', async () => {
    tripAction.mockRejectedValue(offline());
    await tripQueue.enqueue({riderId: 'r1', tripId: 't1', action: 'arrived-drop', key: 'k1'});
    await tripQueue.enqueue({riderId: 'r1', tripId: 't1', action: 'delivered', key: 'k2', body: {method: 'OTP', otp: '4831'}});
    expect(native.outboxEnqueue).not.toHaveBeenCalled();
    expect(await tripQueue.pending('r1')).toBe(2);

    await tripQueue.setNativeOutbox(true);
    expect(outbox.imported).toHaveLength(1);
    expect(outbox.imported[0].entries.map(e => [e.key, e.deferred])).toEqual([['k1', true], ['k2', true]]);
    expect(outbox.imported[0].entries[1].body).toEqual({method: 'OTP', otp: '4831'});
    // The JS queue let go of the code's Keystore copy; the native outbox seals its own.
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(`rider.otp.${outbox.imported[0].entries[1].id}`);
    expect(await tripQueue.pending('r1')).toBe(2);

    // A new tap of that trip goes native, behind the moved steps, and all of them go once online.
    outbox.online = true;
    tripAction.mockClear();
    const sent = jest.fn();
    const off = tripQueue.onSent(sent);
    await expect(tripQueue.enqueue({riderId: 'r1', tripId: 't1', action: 'failed', key: 'k3'})).resolves.toEqual({kind: 'sent', trip});
    expect(tripAction).not.toHaveBeenCalled();
    expect(sent.mock.calls.map(([entry]) => (entry as QueueEntry).key)).toEqual(['k1', 'k2', 'k3']);
    expect(await tripQueue.pending('r1')).toBe(0);
    off();
  });

  it('keeps a trip with steps still in the outbox there after the switch goes off; other trips use the JS queue', async () => {
    outbox.online = false;
    await tripQueue.enqueue({riderId: 'r1', tripId: 't5', action: 'picked-up', key: 'k5'});
    expect(native.outboxEnqueue).toHaveBeenLastCalledWith(expect.stringContaining('"key":"k5"'), expect.any(String));
    await tripQueue.setNativeOutbox(false);
    const calls = native.outboxEnqueue.mock.calls.length;
    await tripQueue.enqueue({riderId: 'r1', tripId: 't5', action: 'arrived-drop', key: 'k6'});
    expect(native.outboxEnqueue).toHaveBeenCalledTimes(calls + 1);
    tripAction.mockResolvedValueOnce({...trip, tripId: 't6'});
    await expect(tripQueue.enqueue({riderId: 'r1', tripId: 't6', action: 'picked-up', key: 'k7'})).resolves.toMatchObject({kind: 'sent'});
    expect(native.outboxEnqueue).toHaveBeenCalledTimes(calls + 1);
    expect(await tripQueue.pending('r1')).toBe(2);
  });
});
