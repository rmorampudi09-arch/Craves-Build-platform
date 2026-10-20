import type {DeviceEventEmitter as Emitter} from 'react-native';
import type {Offer} from '../api/contract';
import type {riderOnlineService as Service} from './riderOnlineService';

const mockConfig = {mode: 'mock'};
jest.mock('react-native-config', () => ({
  __esModule: true,
  default: {
    get CRAVES_RIDER_API_MODE() {
      return mockConfig.mode;
    },
    CRAVES_ENVIRONMENT: 'production',
    CRAVES_API_BASE_URL: 'https://api.craves.in',
  },
}));
jest.mock('../api/riderApi', () => ({riderApi: {postLocations: jest.fn()}}));

const offer: Offer = {
  offerId: 'o1',
  tripId: 't1',
  expiresAt: '2026-10-19T10:00:40Z',
  expiresInSec: 40,
  payPaise: 6800,
  pickupDistanceM: 1200,
  dropDistanceM: 3400,
  kitchenArea: 'Madhapur',
  customerLocality: 'Kondapur',
  estMinutes: 28,
  payLines: [],
};

function nativeModule() {
  return {
    start: jest.fn(async () => undefined),
    stop: jest.fn(async () => undefined),
    testRing: jest.fn(async () => undefined),
    lastFix: jest.fn(async () => ({lat: 17.4, lng: 78.3, accuracyM: 9, at: '2026-10-19T09:59:00.000Z', mock: false})),
    getFcmToken: jest.fn(async () => 'fcm-1'),
    getPendingOffer: jest.fn(async () => ({offer: JSON.stringify(offer), receivedAtMs: 1234, channel: 'fcm'})),
  };
}

/** A fresh copy of the service, with react-native and riderApi from the same (reset) module registry. */
function load(mode: 'mock' | 'live', native?: ReturnType<typeof nativeModule>) {
  mockConfig.mode = mode;
  jest.resetModules();
  const rn = require('react-native');
  rn.NativeModules.CravesRiderOnline = native;
  return {
    service: require('./riderOnlineService').riderOnlineService as typeof Service,
    emitter: rn.DeviceEventEmitter as typeof Emitter,
    postLocations: require('../api/riderApi').riderApi.postLocations as jest.Mock,
  };
}

describe('riderOnlineService in live mode with the native module', () => {
  it('passes the shift to the native service and never keeps the credential in JS', async () => {
    const native = nativeModule();
    const {service} = load('live', native);

    await service.start({shiftCredential: 'secret-credential', expiresAt: '2026-10-19T22:00:00Z'});
    expect(native.start).toHaveBeenCalledWith('secret-credential', Date.parse('2026-10-19T22:00:00Z'), 'https://api.craves.in');
    expect(JSON.stringify(service)).not.toContain('secret-credential');

    // Reopened while the server says online: the native service resumes its saved shift.
    await service.start();
    expect(native.start).toHaveBeenLastCalledWith(null, 0, 'https://api.craves.in');

    await service.stop();
    await service.testRing();
    expect(native.stop).toHaveBeenCalled();
    expect(native.testRing).toHaveBeenCalled();
  });

  it('turns native events into offers, trip changes and statuses', async () => {
    const {service, emitter} = load('live', nativeModule());
    const offers = jest.fn();
    const trips = jest.fn();
    const statuses = jest.fn();
    service.onOffer(offers);
    service.onTripChanged(trips);
    const off = service.onStatus(statuses);

    emitter.emit('riderOffer', {offer: JSON.stringify(offer), receivedAtMs: 1000, channel: 'fcm'});
    emitter.emit('riderOffer', {offer: 'not json', receivedAtMs: 2000, channel: 'locations'});
    emitter.emit('riderTripChanged', {tripId: 't1', step: 'TO_KITCHEN', version: 2});
    const fix = {lat: 17.5, lng: 78.4, accuracyM: 5, at: '2026-10-19T10:00:00.000Z', mock: true};
    emitter.emit('riderStatus', {state: 'ONLINE', lastFix: fix});
    off();
    emitter.emit('riderStatus', {state: 'OFFLINE', message: 'Ops ended your shift.'});

    expect(offers).toHaveBeenCalledTimes(1);
    expect(offers).toHaveBeenCalledWith(offer, 1000);
    expect(trips).toHaveBeenCalledWith({tripId: 't1', step: 'TO_KITCHEN', version: 2});
    expect(statuses).toHaveBeenCalledTimes(1);
    expect(service.lastFix()).toEqual(fix);
  });

  it('reads the FCM token, its changes and the offer that opened the app', async () => {
    const native = nativeModule();
    const {service, emitter} = load('live', native);
    const tokens = jest.fn();
    service.onFcmToken(tokens);
    emitter.emit('riderFcmToken', {token: 'fcm-2'});

    expect(await service.fcmToken()).toBe('fcm-1');
    expect(tokens).toHaveBeenCalledWith('fcm-2');
    expect(await service.pendingOffer()).toEqual({offer, receivedAtMs: 1234});

    native.getFcmToken.mockRejectedValueOnce(new Error('no Firebase'));
    native.getPendingOffer.mockResolvedValueOnce(null as never);
    expect(await service.fcmToken()).toBeNull();
    expect(await service.pendingOffer()).toBeNull();
  });

  it('ignores a launch intent whose offer id is not an id (another app can set the extras)', async () => {
    const native = nativeModule();
    const {service} = load('live', native);
    native.getPendingOffer.mockResolvedValueOnce({
      offer: JSON.stringify({...offer, offerId: '../../withdrawals'}),
      receivedAtMs: 1234,
      channel: 'fcm',
    });
    expect(await service.pendingOffer()).toBeNull();
  });

  it('starts with the fix the native service already has', async () => {
    const {service} = load('live', nativeModule());
    await Promise.resolve();
    expect(service.lastFix()).toMatchObject({lat: 17.4, lng: 78.3});
  });
});

describe('riderOnlineService without the native module', () => {
  it('uses the JS loop against the mock server in mock mode, even in the rider app', async () => {
    const native = nativeModule();
    const {service, postLocations} = load('mock', native);
    postLocations.mockResolvedValue({offers: [offer]});
    const offers = jest.fn();
    const statuses = jest.fn();
    service.onOffer(offers);
    service.onStatus(statuses);

    await service.start();
    await service.stop();

    expect(native.start).not.toHaveBeenCalled();
    expect(postLocations).toHaveBeenCalledTimes(1);
    expect(offers).toHaveBeenCalledWith(offer, expect.any(Number));
    expect(statuses.mock.calls.map(([status]) => status.state)).toEqual(['ONLINE', 'OFFLINE']);
    // Demo builds register a fixed token with the mock server and never have a pending offer.
    expect(await service.fcmToken()).toBe('mock-fcm-token');
    expect(await service.pendingOffer()).toBeNull();
  });

  it('refuses to go online in live mode when the native module is missing', async () => {
    const {service} = load('live');
    await expect(service.start({shiftCredential: 'c', expiresAt: '2026-10-19T22:00:00Z'})).rejects.toThrow(
      'native CravesRiderOnline module',
    );
  });
});
