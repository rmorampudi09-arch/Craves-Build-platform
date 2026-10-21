import {Vibration} from 'react-native';
import type {Offer, RiderFix, TripStep} from '../api/contract';
import {riderApi} from '../api/riderApi';
import {mockRider} from '../api/riderApi.mock';
import {riderApiMode} from '../riderConfig';

export interface RiderOnlineStatus {
  state: 'OFFLINE' | 'ONLINE' | 'ERROR';
  lastFix?: RiderFix;
  message?: string;
}

export interface TripChange {
  tripId: string;
  step: TripStep;
  version: number;
}

/** Keeps the rider online: uploads location, delivers offers and trip changes. Native Kotlin in task A2. */
export interface RiderOnlineService {
  start(): Promise<void>;
  stop(): Promise<void>;
  testRing(): Promise<void>;
  lastFix(): RiderFix | undefined;
  onOffer(cb: (offer: Offer, receivedAtMs: number) => void): () => void;
  onTripChanged(cb: (change: TripChange) => void): () => void;
  onStatus(cb: (status: RiderOnlineStatus) => void): () => void;
}

const UPLOAD_EVERY_MS = 10_000;
const RING = [0, 500, 250, 500, 250, 500];

function listeners<T extends unknown[]>() {
  const set = new Set<(...args: T) => void>();
  return {
    add(cb: (...args: T) => void) {
      set.add(cb);
      return () => {
        set.delete(cb);
      };
    },
    emit: (...args: T) => set.forEach(cb => cb(...args)),
  };
}

/**
 * shortcut: a JS loop that works only while the app is open and only against the mock server;
 * task A2 replaces it with the Kotlin foreground service.
 */
function createJsOnlineService() {
  const offers = listeners<[Offer, number]>();
  const trips = listeners<[TripChange]>();
  const statuses = listeners<[RiderOnlineStatus]>();
  let timer: ReturnType<typeof setInterval> | null = null;
  let fix: RiderFix | undefined;
  let lastTrip = '';

  function halt() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  async function poll() {
    const at = mockRider.position();
    fix = {
      lat: at.lat + (Math.random() - 0.5) * 0.0006,
      lng: at.lng + (Math.random() - 0.5) * 0.0006,
      accuracyM: 12,
      at: new Date().toISOString(),
      mock: false,
    };
    try {
      const response = await riderApi.postLocations([fix]);
      if (response.stop) {
        halt();
        statuses.emit({state: 'OFFLINE', lastFix: fix, message: response.stopReason});
        return;
      }
      statuses.emit({state: 'ONLINE', lastFix: fix});
      response.offers.forEach(offer => {
        Vibration.vibrate(RING);
        offers.emit(offer, Date.now());
      });
      const trip = response.activeTrip;
      const signature = trip ? `${trip.tripId}:${trip.version}` : '';
      if (trip && signature !== lastTrip) {
        lastTrip = signature;
        trips.emit(trip);
      }
    } catch {
      statuses.emit({state: 'ERROR', lastFix: fix, message: 'No internet. Retrying.'});
    }
  }

  return {
    async start() {
      if (riderApiMode !== 'mock') {
        throw new Error('Going online needs the native rider service (task A2).');
      }
      halt();
      timer = setInterval(poll, UPLOAD_EVERY_MS);
      await poll();
    },
    async stop() {
      halt();
      statuses.emit({state: 'OFFLINE', lastFix: fix});
    },
    async testRing() {
      Vibration.vibrate(RING);
    },
    lastFix: () => fix,
    onOffer: offers.add,
    onTripChanged: trips.add,
    onStatus: statuses.add,
    /** Dev panel: poll now instead of waiting up to 10 seconds. */
    pollNow: poll,
    isRunning: () => timer !== null,
  };
}

export const riderOnlineService = createJsOnlineService();
