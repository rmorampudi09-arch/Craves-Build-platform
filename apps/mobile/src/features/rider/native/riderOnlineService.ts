import {DeviceEventEmitter, NativeModules, Vibration} from 'react-native';
import {getRuntimeConfig} from '../../../core/config/runtimeConfig';
import type {Offer, RiderFix, ShiftStart, TripStep} from '../api/contract';
import {riderApi} from '../api/riderApi';
import {mockRider} from '../api/riderApi.mock';
import type {ReceivedOffer} from '../domain/offerTiming';
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

/** Keeps the rider online: uploads location, delivers offers and trip changes (Kotlin RiderOnlineService in live builds). */
export interface RiderOnlineService {
  /** Pass the shift from POST /shift/start; the native service keeps its credential, JS never stores it. */
  start(shift?: ShiftStart): Promise<void>;
  stop(): Promise<void>;
  testRing(): Promise<void>;
  lastFix(): RiderFix | undefined;
  onOffer(cb: (offer: Offer, receivedAtMs: number) => void): () => void;
  onTripChanged(cb: (change: TripChange) => void): () => void;
  onStatus(cb: (status: RiderOnlineStatus) => void): () => void;
  /** The FCM token for POST /devices; null when Firebase can't give one. */
  fcmToken(): Promise<string | null>;
  onFcmToken(cb: (token: string) => void): () => void;
  /** The offer whose notification opened the app, or one that rang while JS wasn't running. */
  pendingOffer(): Promise<ReceivedOffer | null>;
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

/** Mock mode, Jest and the customer app: a JS loop that works only while the app is open, against the mock server. */
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
    // The mock needs no shift credential; the native service keeps the real one.
    async start(_shift?: ShiftStart) {
      if (riderApiMode !== 'mock') {
        throw new Error('Going online needs the rider app (native CravesRiderOnline module).');
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
    // The mock server ignores the token; a fixed one lets demo builds show the "phone not approved" check.
    fcmToken: async () => 'mock-fcm-token',
    onFcmToken: (_cb: (token: string) => void) => () => undefined,
    pendingOffer: async (): Promise<ReceivedOffer | null> => null,
    /** Dev panel: poll now instead of waiting up to 10 seconds. */
    pollNow: poll,
    isRunning: () => timer !== null,
  };
}

/** The Kotlin module's interface (android/app/src/rider, docs/riders/NATIVE.md). */
interface NativeRiderOnline {
  /** A null credential resumes the shift the service saved. */
  start(shiftCredential: string | null, expiresAtMs: number, apiBaseUrl: string): Promise<void>;
  stop(): Promise<void>;
  testRing(): Promise<void>;
  lastFix(): Promise<RiderFix | null>;
  getFcmToken(): Promise<string>;
  getPendingOffer(): Promise<NativeOffer | null>;
}

/** A riderOffer event: the Offer JSON exactly as FCM or /locations delivered it, and which came first. */
interface NativeOffer {
  offer: string;
  receivedAtMs: number;
  channel: 'fcm' | 'locations';
}

function parseOffer(event: NativeOffer): ReceivedOffer | null {
  try {
    const offer = JSON.parse(event.offer) as Offer;
    // A tapped offer comes from launch-intent extras, which any app can set, and its id goes into the accept URL.
    return typeof offer.offerId === 'string' && /^[\w-]{1,64}$/.test(offer.offerId) && typeof offer.expiresInSec === 'number'
      ? {offer, receivedAtMs: event.receivedAtMs}
      : null;
  } catch {
    return null;
  }
}

/** Live mode: the Kotlin foreground service uploads and rings; JS only listens. The credential never touches JS storage. */
function createNativeOnlineService(native: NativeRiderOnline) {
  let fix: RiderFix | undefined;
  const on = <T>(event: string, cb: (payload: T) => void) => {
    const subscription = DeviceEventEmitter.addListener(event, cb);
    return () => subscription.remove();
  };
  on<RiderOnlineStatus>('riderStatus', status => {
    fix = status.lastFix ?? fix;
  });
  native
    .lastFix()
    .then(saved => {
      fix = fix ?? saved ?? undefined;
    })
    .catch(() => undefined);
  // Native counts an offer as delivered once JS runs, but with the activity gone (swiped away while online) nothing
  // listens: keep the newest such offer for pendingOffer(), as native does for one that came before JS started.
  let listening = 0;
  let unheard: ReceivedOffer | null = null;
  on<NativeOffer>('riderOffer', event => {
    if (listening === 0) {
      unheard = parseOffer(event) ?? unheard;
    }
  });

  return {
    start: (shift?: ShiftStart) =>
      native.start(shift?.shiftCredential ?? null, shift ? Date.parse(shift.expiresAt) : 0, getRuntimeConfig().apiBaseUrl),
    stop: () => native.stop(),
    testRing: () => native.testRing(),
    lastFix: () => fix,
    onOffer(cb: (offer: Offer, receivedAtMs: number) => void) {
      listening += 1;
      const off = on<NativeOffer>('riderOffer', event => {
        const received = parseOffer(event);
        if (received) {
          cb(received.offer, received.receivedAtMs);
        }
      });
      return () => {
        listening -= 1;
        off();
      };
    },
    onTripChanged: (cb: (change: TripChange) => void) => on('riderTripChanged', cb),
    onStatus: (cb: (status: RiderOnlineStatus) => void) => on('riderStatus', cb),
    fcmToken: () => native.getFcmToken().catch(() => null),
    onFcmToken: (cb: (token: string) => void) => on<{token: string}>('riderFcmToken', event => cb(event.token)),
    async pendingOffer() {
      const event = await native.getPendingOffer().catch(() => null);
      const tapped = event ? parseOffer(event) : null;
      const held = unheard;
      unheard = null;
      // The newer of the two; RiderRuntime drops it if it has expired.
      return tapped && held ? (held.receivedAtMs > tapped.receivedAtMs ? held : tapped) : tapped ?? held;
    },
    /** The dev panel exists only in mock builds, which use the JS loop. */
    pollNow: async () => undefined,
  };
}

// Present only in the rider flavor (android/app/src/rider); mock mode keeps the JS loop even there.
const native = riderApiMode === 'live' ? (NativeModules.CravesRiderOnline as NativeRiderOnline | undefined) : undefined;

export const riderOnlineService: RiderOnlineService & {pollNow(): Promise<void>} = native
  ? createNativeOnlineService(native)
  : createJsOnlineService();
