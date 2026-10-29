import {useEffect, useState} from 'react';
import {DeviceEventEmitter, NativeModules} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import {getRuntimeConfig} from '../../../core/config/runtimeConfig';
import {refreshAccessToken} from '../../../core/http/apiClient';
import {AppApiError, appApiErrorFromStatus} from '../../../core/http/apiError';
import {tokenMemory} from '../../../core/security/tokenMemory';
import type {DeliverBody, Trip} from '../api/contract';
import {riderApi} from '../api/riderApi';
import {lockedAtZero} from '../api/riderApi.live';
import {
  createOfflineQueue,
  type NewQueueEntry,
  type QueueEntry,
  type QueueOutcome,
  type Refusal,
  type RejectInfo,
  type SecretStore,
} from '../domain/offlineQueue';
import {riderDevice} from '../native/riderDevice';
import {riderOnlineService} from '../native/riderOnlineService';
import {riderApiMode} from '../riderConfig';
import {createNativeTripQueue, type NativeOutbox} from './nativeTripQueue';

/** The customer's OTP while its delivery step waits: Keystore-encrypted, like the refresh token (decision E1). */
const otpStore: SecretStore = {
  save: (id, otp) => SecureStore.setItemAsync(`rider.otp.${id}`, otp),
  load: id => SecureStore.getItemAsync(`rider.otp.${id}`),
  remove: id => SecureStore.deleteItemAsync(`rider.otp.${id}`),
};

/** The JS queue, kept in AsyncStorage so it survives restarts: mock builds, and live ones until the native outbox is on. */
const jsQueue = createOfflineQueue({
  storage: AsyncStorage,
  send: entry =>
    riderApi.tripAction(
      entry.tripId,
      entry.action,
      entry.body,
      entry.key,
      entry.occurredAt === undefined ? undefined : {occurredAt: entry.occurredAt, fix: entry.fix},
    ),
  // A 401 means the session needs renewing, not that the server refused the step: keep it.
  isRetriable: error =>
    !(error instanceof AppApiError) ||
    error.retriable ||
    !error.status ||
    error.status === 401 ||
    error.status >= 500,
  describe: error =>
    error instanceof AppApiError
      ? {code: error.code, message: error.message, attemptsLeft: error.attemptsLeft}
      : {code: 'UNKNOWN', message: 'Something went wrong. Try again.'},
  // AsyncStorage never holds the customer's OTP: it waits in the Keystore, at most 24 h, until the server answers.
  secret: otpStore,
  // The kept delivery photo goes once the server has answered for its step (P1-07).
  release: async entry => {
    const body = entry.body as DeliverBody | undefined;
    if (body?.method === 'PHOTO' && body.photoUri) {
      await riderDevice.deletePhoto(body.photoUri);
    }
  },
  // The trip screen shows a wrong or locked OTP by the code boxes, unless the rider typed it offline and was told to go:
  // that one, like every other refusal, waits on screen for the rider.
  keepRefusal: (entry, info) => entry.deferred === true || (info.code !== 'OTP_INVALID' && info.code !== 'OTP_LOCKED'),
});

/** Tells the native service how many trip actions wait in the JS queue, and since when; it adds its own outbox's. */
function reportQueueStats() {
  jsQueue
    .stats()
    .then(({pending, oldestAt}) => riderOnlineService.setQueueStats(pending, oldestAt ?? 0))
    .catch(() => undefined);
}
jsQueue.subscribe(reportQueueStats);
reportQueueStats();

// Present only in the rider flavor's live builds (android/app/src/rider, P2-02); mock builds keep the JS queue.
const outboxModule =
  riderApiMode === 'live' ? (NativeModules.CravesRiderOnline as Partial<NativeOutbox> | undefined) : undefined;

/** The Kotlin outbox: steps there survive the app being swiped away, killed or the phone restarting. */
const nativeQueue =
  typeof outboxModule?.outboxEnqueue === 'function'
    ? createNativeTripQueue({
        native: outboxModule as NativeOutbox,
        freshToken: () => (tokenMemory.isFresh() ? tokenMemory.get() : null),
        renewToken: refreshAccessToken,
        apiBaseUrl: () => getRuntimeConfig().apiBaseUrl,
        describe: (status, answer): RejectInfo => {
          const error = lockedAtZero(appApiErrorFromStatus(status, answer));
          return {code: error.code, message: error.message, attemptsLeft: error.attemptsLeft};
        },
        onPass: listener => {
          const subscription = DeviceEventEmitter.addListener('riderOutboxChanged', (event: {answer: string}) => listener(event.answer));
          return () => subscription.remove();
        },
      })
    : null;
const queues = nativeQueue ? [jsQueue, nativeQueue] : [jsQueue];
let nativeOn = false;
let switching: Promise<void> = Promise.resolve();

/** A trip's steps stay in one queue, in order: the one holding its steps, else the native one once it is on. */
async function queueFor(riderId: string, tripId: string) {
  if (!nativeQueue || (await jsQueue.pending(riderId, tripId)) > 0) {
    return jsQueue;
  }
  return nativeOn || (await nativeQueue.pending(riderId, tripId)) > 0 ? nativeQueue : jsQueue;
}

async function allEntries(riderId: string, tripId?: string): Promise<QueueEntry[]> {
  const lists = await Promise.all(queues.map(queue => queue.entries(riderId, tripId)));
  return lists.flat().sort((a, b) => a.createdAt - b.createdAt);
}

/**
 * The one queue every trip action goes through. Live builds whose server sets features.nativeTripOutbox (P2-02b) use the
 * native outbox, which sends after the app is swiped away, killed or the phone restarts; the rest use the JS queue.
 */
export const tripQueue = {
  /** Saves the action, tries to send it straight away and reports what happened to it. */
  async enqueue(input: NewQueueEntry): Promise<QueueOutcome> {
    await switching;
    return (await queueFor(input.riderId, input.tripId)).enqueue(input);
  },
  /** Sends what waits in both queues; {now: true} (the phone just reached the server) skips the backoff. */
  async flush(riderId: string, options?: {now?: boolean}): Promise<Map<string, QueueOutcome>> {
    const results = await Promise.all(queues.map(queue => queue.flush(riderId, options)));
    return new Map(results.flatMap(result => [...result]));
  },
  entries: allEntries,
  async pending(riderId: string, tripId?: string): Promise<number> {
    return (await allEntries(riderId, tripId)).length;
  },
  /** The server's refusals this rider hasn't dismissed, newest first. */
  async refusals(riderId: string, tripId?: string): Promise<Refusal[]> {
    const lists = await Promise.all(queues.map(queue => queue.refusals(riderId, tripId)));
    return lists.flat().sort((a, b) => b.at - a.at);
  },
  async dismissRefusal(tripId: string): Promise<void> {
    await Promise.all(queues.map(queue => queue.dismissRefusal(tripId)));
  },
  subscribe(listener: () => void): () => void {
    const offs = queues.map(queue => queue.subscribe(listener));
    return () => offs.forEach(off => off());
  },
  onRejected(listener: (entry: QueueEntry, info: RejectInfo) => void): () => void {
    const offs = queues.map(queue => queue.onRejected(listener));
    return () => offs.forEach(off => off());
  },
  onSent(listener: (entry: QueueEntry, trip: Trip) => void): () => void {
    const offs = queues.map(queue => queue.onSent(listener));
    return () => offs.forEach(off => off());
  },
  /**
   * features.nativeTripOutbox (P2-02b). On: what the JS queue holds (OTPs and refusals too) moves to the native outbox
   * first, then new steps go there. A failed move keeps the JS queue, which goes on sending; the next start tries again.
   * Off: new steps go to the JS queue, and native steps still waiting are sent with the app's token.
   */
  setNativeOutbox(enabled: boolean): Promise<void> {
    const native = nativeQueue;
    if (!native) {
      return Promise.resolve();
    }
    switching = switching
      .then(async () => {
        if (enabled) {
          await jsQueue.moveAll((entries, refusals) => native.importAll(entries, refusals));
        }
        nativeOn = enabled;
      })
      .catch(() => undefined);
    return switching;
  },
};

/** A list read from the queue, read again whenever the queue changes. */
function useQueueList<T>(
  read: (riderId: string, tripId?: string) => Promise<T[]>,
  riderId: string | undefined,
  tripId?: string,
): T[] {
  const [list, setList] = useState<T[]>([]);
  useEffect(() => {
    if (!riderId) {
      return;
    }
    let active = true;
    const refresh = () =>
      read(riderId, tripId).then(next => {
        if (active) {
          setList(next);
        }
      });
    refresh();
    const unsubscribe = tripQueue.subscribe(refresh);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [read, riderId, tripId]);
  return list;
}

/** This rider's actions still waiting to sync, oldest first: the trip screen shows the step they lead to (P1-06). */
export function usePendingEntries(riderId: string | undefined, tripId?: string): QueueEntry[] {
  return useQueueList(tripQueue.entries, riderId, tripId);
}

/** The server's refusals of this rider's steps, newest first, until the rider dismisses them (P1-08). */
export function useRefusals(riderId: string | undefined, tripId?: string): Refusal[] {
  return useQueueList(tripQueue.refusals, riderId, tripId);
}

/** Count of this rider's actions still waiting to sync; drives "Saved · will sync" and the sign-out block. */
export function usePendingActions(riderId: string | undefined, tripId?: string): number {
  return usePendingEntries(riderId, tripId).length;
}
