import {useEffect, useState} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import {AppApiError} from '../../../core/http/apiError';
import type {DeliverBody} from '../api/contract';
import {riderApi} from '../api/riderApi';
import {createOfflineQueue, type QueueEntry, type Refusal, type SecretStore} from '../domain/offlineQueue';
import {riderDevice} from '../native/riderDevice';
import {riderOnlineService} from '../native/riderOnlineService';

/** The customer's OTP while its delivery step waits: Keystore-encrypted, like the refresh token (decision E1). */
const otpStore: SecretStore = {
  save: (id, otp) => SecureStore.setItemAsync(`rider.otp.${id}`, otp),
  load: id => SecureStore.getItemAsync(`rider.otp.${id}`),
  remove: id => SecureStore.deleteItemAsync(`rider.otp.${id}`),
};

/** The one queue every trip action goes through, kept in AsyncStorage so it survives restarts. */
export const tripQueue = createOfflineQueue({
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

/** Tells the native service how many trip actions wait to sync, and since when, for the phone's health report. */
function reportQueueStats() {
  tripQueue
    .stats()
    .then(({pending, oldestAt}) => riderOnlineService.setQueueStats(pending, oldestAt ?? 0))
    .catch(() => undefined);
}
tripQueue.subscribe(reportQueueStats);
reportQueueStats();

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
