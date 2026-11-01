import React from 'react';
import {Alert} from 'react-native';
import renderer, {act} from 'react-test-renderer';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {AppApiError} from '../../../core/http/apiError';
import type {Offer} from '../api/contract';
import {riderApi} from '../api/riderApi';
import type {ReceivedOffer} from '../domain/offerTiming';
import {riderDevice} from '../native/riderDevice';
import {riderOnlineService} from '../native/riderOnlineService';
import {RIDER_APP_VERSION} from '../riderConfig';
import {tripQueue} from '../state/tripQueue';
import {RiderRuntime} from './RiderRuntime';

const mockTokenListeners: ((token: string) => void)[] = [];
const mockStatusListeners: ((status: {state: string; connected?: boolean}) => void)[] = [];

jest.mock('../api/riderApi', () => ({riderApi: {registerDevice: jest.fn(async () => undefined)}}));
jest.mock('../state/tripQueue', () => ({
  tripQueue: {
    flush: jest.fn(async () => undefined),
    onSent: () => () => undefined,
    onRejected: () => () => undefined,
    setNativeOutbox: jest.fn(async () => undefined),
  },
}));
jest.mock('../native/riderDevice', () => ({riderDevice: {installationId: jest.fn(async () => 'android-id-1')}}));
jest.mock('../native/riderOnlineService', () => ({
  riderOnlineService: {
    fcmToken: jest.fn(async () => 'token-1'),
    onFcmToken: (cb: (token: string) => void) => {
      mockTokenListeners.push(cb);
      return () => undefined;
    },
    pendingOffer: jest.fn(async () => null),
    onOffer: () => () => undefined,
    onTripChanged: () => () => undefined,
    onStatus: (cb: (status: {state: string; connected?: boolean}) => void) => {
      mockStatusListeners.push(cb);
      return () => undefined;
    },
  },
}));

const offer: Offer = {
  offerId: 'o1',
  tripId: 't1',
  expiresAt: '2020-01-01T00:00:00Z',
  expiresInSec: 40,
  payPaise: 6800,
  pickupDistanceM: 1200,
  dropDistanceM: 3400,
  kitchenArea: 'Madhapur',
  customerLocality: 'Kondapur',
  estMinutes: 28,
  payLines: [],
};

const registerDevice = riderApi.registerDevice as jest.Mock;
const installationId = riderDevice.installationId as jest.Mock;
const pendingOffer = riderOnlineService.pendingOffer as jest.Mock;

async function mount(openOffer: (offer: ReceivedOffer) => void = jest.fn(), nativeOutbox?: boolean) {
  const client = new QueryClient();
  let tree: renderer.ReactTestRenderer | undefined;
  await act(async () => {
    tree = renderer.create(
      <QueryClientProvider client={client}>
        <RiderRuntime riderId="r1" nativeOutbox={nativeOutbox} openOffer={openOffer} />
      </QueryClientProvider>,
    );
  });
  return tree!;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockTokenListeners.length = 0;
  mockStatusListeners.length = 0;
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});

describe('RiderRuntime device registration', () => {
  it('sends the FCM token after sign-in and again whenever it changes', async () => {
    const tree = await mount();
    expect(registerDevice).toHaveBeenCalledWith({
      installationId: 'android-id-1',
      fcmToken: 'token-1',
      appVersion: RIDER_APP_VERSION,
      model: expect.any(String),
    });

    await act(async () => mockTokenListeners.forEach(cb => cb('token-2')));
    expect(registerDevice).toHaveBeenLastCalledWith(expect.objectContaining({fcmToken: 'token-2'}));
    act(() => tree.unmount());
  });

  it("says the phone isn't approved on 409 DEVICE_NOT_BOUND", async () => {
    registerDevice.mockRejectedValueOnce(new AppApiError('DEVICE_NOT_BOUND', 'Not bound', 409));
    const tree = await mount();
    expect(Alert.alert).toHaveBeenCalledWith(
      "This phone isn't approved",
      "Call rider support to approve this phone. You won't get offers on it until then.",
    );
    act(() => tree.unmount());
  });

  it('registers nothing without an Android ID, rather than a made-up one', async () => {
    installationId.mockResolvedValueOnce(null);
    const tree = await mount();
    expect(registerDevice).not.toHaveBeenCalled();
    act(() => tree.unmount());
  });

  it('stays quiet when registration fails for another reason', async () => {
    registerDevice.mockRejectedValueOnce(new AppApiError('NETWORK', 'Offline', undefined, undefined, true));
    const tree = await mount();
    expect(Alert.alert).not.toHaveBeenCalled();
    act(() => tree.unmount());
  });
});

describe('RiderRuntime pending offer', () => {
  it('opens the Offer screen for the offer whose notification opened the app, keeping its receive time', async () => {
    const receivedAtMs = Date.now() - 5_000;
    pendingOffer.mockResolvedValueOnce({offer, receivedAtMs});
    const openOffer = jest.fn();
    const tree = await mount(openOffer);
    // The countdown uses receivedAtMs + expiresInSec; expiresAt (in the past here) is ignored.
    expect(openOffer).toHaveBeenCalledWith({offer, receivedAtMs});
    act(() => tree.unmount());
  });

  it('skips a pending offer whose time ran out', async () => {
    pendingOffer.mockResolvedValueOnce({offer, receivedAtMs: Date.now() - 41_000});
    const openOffer = jest.fn();
    const tree = await mount(openOffer);
    expect(openOffer).not.toHaveBeenCalled();
    act(() => tree.unmount());
  });
});

describe('RiderRuntime native outbox (P2-02b)', () => {
  it("switches trip steps to the phone's native outbox only when the server says so", async () => {
    const setNativeOutbox = tripQueue.setNativeOutbox as jest.Mock;
    let tree = await mount();
    expect(setNativeOutbox).toHaveBeenLastCalledWith(false);
    act(() => tree.unmount());
    tree = await mount(jest.fn(), true);
    expect(setNativeOutbox).toHaveBeenLastCalledWith(true);
    act(() => tree.unmount());
  });
});

describe('RiderRuntime queue', () => {
  const status = (state: string, connected?: boolean) => act(() => mockStatusListeners.forEach(cb => cb({state, connected})));
  const flushedNow = () => (tripQueue.flush as jest.Mock).mock.calls.filter(([, options]) => options?.now).length;

  it('sends the queue, backoff or not, when an upload reaches the server, at most every 5 s (P1-08)', async () => {
    jest.useFakeTimers();
    const tree = await mount();
    expect(tripQueue.flush).toHaveBeenCalledWith('r1'); // on start, respecting backoff
    status('ERROR'); // no signal: nothing
    expect(flushedNow()).toBe(0);
    status('ONLINE');
    expect(tripQueue.flush).toHaveBeenLastCalledWith('r1', {now: true});
    status('ONLINE');
    status('ERROR', true); // connected, only offers can't ring
    expect(flushedNow()).toBe(1);
    act(() => jest.advanceTimersByTime(5_000));
    status('ERROR', true);
    expect(flushedNow()).toBe(2);
    act(() => tree.unmount());
    jest.useRealTimers();
  });
});
