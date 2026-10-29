// Live mode wired end to end: RiderApp with CRAVES_RIDER_API_MODE=live, MSG91 phone OTP through auth-service, Firebase mocked at the SDK,
// and every HTTP call (auth-service and the rider API) answered by a fake network through the real clients.
import React from 'react';
import {Text} from 'react-native';
import renderer, {act, type ReactTestInstance} from 'react-test-renderer';
import {getIdToken, signInWithCustomToken, signInWithPhoneNumber} from '@react-native-firebase/auth';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {AxiosError, type InternalAxiosRequestConfig} from 'axios';
import type {HomeSummary, RiderMe, Terms, Trip} from '../../features/rider/api/contract';
import {fakeHttp, type FakeReply} from '../../features/rider/api/fakeHttp';
import {tokenMemory} from '../../core/security/tokenMemory';
import {authActions} from '../../features/auth/state/authSlice';
import {appQueryClient} from '../query';
import {store} from '../store/store';
import {RiderApp} from './RiderApp';
import {OFFLINE_RECHECK_MS} from './useRiderSession';

jest.mock('react-native-config', () => ({
  __esModule: true,
  default: {CRAVES_RIDER_API_MODE: 'live', CRAVES_API_BASE_URL: 'https://api.example.invalid'},
}));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('../../features/rider/native/riderDevice', () => ({
  riderDevice: {...jest.requireActual('../../features/rider/native/riderDevice').riderDevice, installationId: async () => 'android-id-1'},
}));

jest.setTimeout(30_000);

const me: RiderMe = {
  riderId: 'r1',
  name: 'Ravi Kumar',
  phoneMasked: '+91 ••••• •2345',
  status: 'ACTIVE',
  termsVersion: 'v2',
  acceptedTermsVersion: 'v1',
  language: 'en',
  minAppVersion: '1.0.0',
  supportPhone: '+914000000000',
  features: {payoutsEnabled: true, withdrawEnabled: true},
};
const terms: Terms = {
  version: 'v2',
  effectiveFrom: '2026-10-20T00:00:00Z',
  summaryOfChanges: ['Waiting pay starts after 8 minutes.'],
  rateCardLines: [{label: 'Base pay', value: '₹40'}],
  grievanceLines: [{label: 'Rider support', value: '+91 40 0000 0000'}],
};
const home: HomeSummary = {online: false, todayEarningsPaise: 0, todayTrips: 0};
const tokens = {
  tokenType: 'Bearer',
  accessToken: 'access-1',
  expiresIn: 900,
  refreshToken: 'refresh-1',
  refreshTokenExpiresAt: '2099-01-01T00:00:00Z',
  identity: {userId: 'u1', roles: ['CUSTOMER']},
};

/** The rider backend in test mode: one allow-listed rider whose terms acceptance sticks. */
function backend(server: {me: RiderMe; home: HomeSummary}) {
  return (config: InternalAxiosRequestConfig): FakeReply => {
    const path = `${config.method} ${config.url}`;
    if (path === 'post /api/v1/auth/firebase/exchange' || path === 'post /api/v1/auth/refresh') {
      return {status: 200, data: tokens};
    }
    if (path === 'post /api/v1/auth/otp/send') {
      return {status: 200, data: {challengeId: CHALLENGE, expiresAt: 1, resendAvailableAt: 2}};
    }
    if (path === 'post /api/v1/auth/otp/verify') {
      return {status: 200, data: {firebaseCustomToken: CUSTOM_TOKEN}};
    }
    if (config.headers.get('Authorization') !== 'Bearer access-1') {
      return {status: 401, data: {}};
    }
    switch (path) {
      case 'get /api/v1/rider/me':
        return {status: 200, data: server.me};
      case 'get /api/v1/rider/terms':
        return {status: 200, data: terms};
      case 'post /api/v1/rider/terms/accept':
        server.me = {...server.me, acceptedTermsVersion: JSON.parse(config.data).version};
        return {status: 204};
      case 'get /api/v1/rider/home':
        return {status: 200, data: server.home};
      case 'get /api/v1/rider/trips/active':
        return {status: 204};
      case 'post /api/v1/rider/devices':
        return {status: 204};
      default:
        return {status: 404, data: {code: 'NOT_FOUND', message: path}};
    }
  };
}

const CHALLENGE = 'c'.repeat(43);
const CUSTOM_TOKEN = 't'.repeat(200);
const secure = new Map<string, string>();
let calls: InternalAxiosRequestConfig[] = [];
let tree: renderer.ReactTestRenderer;

beforeEach(() => {
  // One store and query cache per app process: start each test signed out with nothing cached.
  store.dispatch(authActions.bootstrapReset());
  appQueryClient.clear();
  tokenMemory.clear();
  secure.clear();
  (SecureStore.getItemAsync as jest.Mock).mockImplementation(async (key: string) => secure.get(key) ?? null);
  (SecureStore.setItemAsync as jest.Mock).mockImplementation(async (key: string, value: string) => {
    secure.set(key, value);
  });
  (SecureStore.deleteItemAsync as jest.Mock).mockImplementation(async (key: string) => {
    secure.delete(key);
  });
});

afterEach(() => {
  act(() => tree.unmount());
});

async function settle() {
  for (let i = 0; i < 10; i += 1) {
    await act(async () => {
      await new Promise<void>(resolve => setTimeout(resolve, 0));
    });
  }
}

/** The Pressable with this testID, whose onPress runs the component's own guards. */
const press = (id: string) => tree.root.findAll(node => node.props.testID === id && typeof node.props.onPress === 'function')[0];
const input = (id: string) => tree.root.findAll(node => node.props.testID === id && typeof node.props.onChangeText === 'function')[0];
const has = (id: string) => tree.root.findAll(node => node.props.testID === id).length > 0;
const texts = () =>
  tree.root
    .findAllByType(Text)
    .map((node: ReactTestInstance) => [node.props.children].flat().join(''))
    .join(' | ');
const urls = () => calls.map(c => `${c.method} ${c.url}`);

async function start(server: {me: RiderMe; home: HomeSummary}, handler = backend(server)) {
  calls = fakeHttp(handler);
  await act(async () => {
    tree = renderer.create(<RiderApp />);
  });
  await settle();
}

describe('rider app in live mode', () => {
  it('signs in by phone, accepts the new terms and lands on Home, with the live wiring', async () => {
    (signInWithCustomToken as jest.Mock).mockResolvedValue({user: {uid: 'firebase-u1'}});
    (getIdToken as jest.Mock).mockResolvedValue('firebase-id-token');
    await start({me, home});

    expect(has('rider-sign-in-phone')).toBe(true);
    await act(async () => input('rider-phone-input').props.onChangeText('9848012345'));
    await act(async () => press('rider-send-code').props.onPress());
    await settle();
    // The SMS goes out by MSG91 from auth-service, never by Firebase phone auth.
    expect(signInWithPhoneNumber).not.toHaveBeenCalled();
    expect(JSON.parse(calls[0].data)).toEqual({phoneNumber: '9848012345', countryCode: '91'});

    await act(async () => input('rider-code-input').props.onChangeText('482913'));
    await act(async () => press('rider-verify').props.onPress());
    await settle();
    expect(JSON.parse(calls[1].data)).toEqual({challengeId: CHALLENGE, otp: '482913'});
    expect(signInWithCustomToken).toHaveBeenCalledWith(expect.anything(), CUSTOM_TOKEN);
    expect(JSON.parse(calls[2].data)).toEqual({firebaseIdToken: 'firebase-id-token'});

    // GET /me says the terms changed: the rider sees them before anything else.
    expect(has('rider-terms-accept')).toBe(true);
    await act(async () => press('rider-terms-accept').props.onPress());
    await settle();

    expect(has('rider-home')).toBe(true);
    expect(has('rider-go-online')).toBe(true);
    expect(texts()).not.toContain('Demo data');
    expect(urls()).toEqual(
      expect.arrayContaining([
        'post /api/v1/auth/otp/send',
        'post /api/v1/auth/otp/verify',
        'post /api/v1/auth/firebase/exchange',
        'get /api/v1/rider/me',
        'get /api/v1/rider/terms',
        'post /api/v1/rider/terms/accept',
        'get /api/v1/rider/home',
        'get /api/v1/rider/trips/active',
        'post /api/v1/rider/devices',
      ]),
    );
    const accept = calls.find(c => c.url === '/api/v1/rider/terms/accept');
    expect(JSON.parse(accept?.data)).toEqual({version: 'v2'});
    const device = calls.find(c => c.url === '/api/v1/rider/devices');
    expect(JSON.parse(device?.data)).toMatchObject({installationId: 'android-id-1', appVersion: '1.1.0'});
    expect(calls.every(c => c.baseURL === 'https://api.example.invalid')).toBe(true);
  });

  describe('an app older than minAppVersion, with a saved session', () => {
    const old = {...me, acceptedTermsVersion: 'v2', minAppVersion: '9.0.0'};
    beforeEach(() => {
      secure.set('craves_refresh_session_v1', JSON.stringify({refreshToken: 'refresh-0', expiresAt: '2099-01-01T00:00:00Z'}));
    });

    it('is asked to update between shifts', async () => {
      await start({me: old, home});
      expect(urls()[0]).toBe('post /api/v1/auth/refresh');
      expect(texts()).toContain('Update the app to continue');
      expect(has('rider-home')).toBe(false);
    });

    it('offers to try again, not only to sign out, when the session cannot be checked at start', async () => {
      const server = {me: {...me, acceptedTermsVersion: 'v2'}, home};
      const online = backend(server);
      let signal = false;
      await start(server, config => {
        if (!signal) {
          throw new AxiosError('Network Error', AxiosError.ERR_NETWORK, config);
        }
        return online(config);
      });
      expect(texts()).toContain("Couldn't check your sign-in | Check mobile data or Wi-Fi, then try again. You stay signed in.");
      expect(secure.has('craves_refresh_session_v1')).toBe(true);
      signal = true;
      const tryAgain = tree.root.findAll(node => node.props.testID === 'rider-retry' && typeof node.props.onPress === 'function')[0];
      await act(async () => tryAgain.props.onPress());
      await settle();
      expect(has('rider-home')).toBe(true);
    });

    it('keeps working while online', async () => {
      await start({me: old, home: {...home, online: true, shiftStartedAt: '2026-10-20T10:00:00Z'}});
      expect(has('rider-home')).toBe(true);
      expect(texts()).not.toContain('Update the app to continue');
    });
  });

  describe('a restart without signal mid-trip (WORKPLAN P2-12)', () => {
    const local = new Map<string, string>();
    const atKitchen: Trip = {
      tripId: 't1',
      version: 3,
      step: 'AT_KITCHEN',
      orderCode: 'CR-4107',
      itemsCount: 2,
      payPaise: 6700,
      kitchen: {kitchenName: "Lakshmi's Kitchen", area: 'Madhapur', address: 'Plot 41', lat: 17.4483, lng: 78.3915, chefPhone: '+912222222222'},
      customer: {firstName: 'Anil', area: 'Kondapur', address: 'Flat 302', lat: 17.4615, lng: 78.3657, phone: '+913333333333'},
      arrivedKitchenAt: '2026-10-20T10:30:00Z',
      waitFreeSeconds: 480,
      unreachableWaitSeconds: 480,
      sealed: true,
    };

    beforeEach(() => {
      local.clear();
      (AsyncStorage.getItem as jest.Mock).mockImplementation(async (key: string) => local.get(key) ?? null);
      (AsyncStorage.setItem as jest.Mock).mockImplementation(async (key: string, value: string) => {
        local.set(key, value);
      });
      (AsyncStorage.removeItem as jest.Mock).mockImplementation(async (key: string) => {
        local.delete(key);
      });
      secure.set('craves_refresh_session_v1', JSON.stringify({refreshToken: 'refresh-0', expiresAt: '2099-01-01T00:00:00Z'}));
    });

    afterEach(() => {
      (AsyncStorage.getItem as jest.Mock).mockImplementation(async () => null);
      (AsyncStorage.setItem as jest.Mock).mockImplementation(async () => undefined);
      (AsyncStorage.removeItem as jest.Mock).mockImplementation(async () => undefined);
    });

    it('opens the trip on the step its queued steps lead to, and sends them when the signal returns', async () => {
      const server = {me: {...me, acceptedTermsVersion: 'v2'}, home: {...home, online: true}, trip: atKitchen};
      const online = backend(server);
      let signal = true;
      const network = (config: InternalAxiosRequestConfig): FakeReply => {
        if (!signal) {
          throw new AxiosError('Network Error', AxiosError.ERR_NETWORK, config);
        }
        const path = `${config.method} ${config.url}`;
        if (config.headers.get('Authorization') === 'Bearer access-1' && path === 'get /api/v1/rider/trips/active') {
          return {status: 200, data: server.trip};
        }
        if (config.headers.get('Authorization') === 'Bearer access-1' && path === 'post /api/v1/rider/trips/t1/picked-up') {
          server.trip = {...server.trip, step: 'PICKED_UP', version: server.trip.version + 1};
          return {status: 200, data: server.trip};
        }
        return online(config);
      };
      await start(server, network);
      await act(async () => press('rider-resume-trip').props.onPress());
      await settle();
      expect(has('rider-pickup-check')).toBe(true);

      // No signal at the kitchen: "Picked up" waits in the queue and shows at once.
      signal = false;
      await act(async () => press('rider-picked-up').props.onPress());
      await settle();
      expect(has('rider-to-customer')).toBe(true);

      // The phone restarts, still without signal: the app opens from what it saved, not on an error.
      act(() => tree.unmount());
      store.dispatch(authActions.bootstrapReset());
      appQueryClient.clear();
      tokenMemory.clear();
      const intervals = jest.spyOn(globalThis, 'setInterval');
      try {
        await start(server, network);
        expect(texts()).not.toContain('Something went wrong');
        expect(has('rider-home')).toBe(true);
        await act(async () => press('rider-resume-trip').props.onPress());
        await settle();
        expect(has('rider-to-customer')).toBe(true);
        expect(server.trip.step).toBe('AT_KITCHEN');

        // Signal back: the next check signs in again with the saved session and sends the queued step.
        signal = true;
        const recheck = intervals.mock.calls.find(([, ms]) => ms === OFFLINE_RECHECK_MS)?.[0] as (() => void) | undefined;
        expect(recheck).toBeDefined();
        await act(async () => recheck?.());
        await settle();
        expect(server.trip.step).toBe('PICKED_UP');
        expect(urls()).toContain('post /api/v1/auth/refresh');
        expect(has('rider-to-customer')).toBe(true);
      } finally {
        intervals.mockRestore();
      }
    });

    it('still shows the error with Try again when nothing was saved', async () => {
      await start({me, home}, config => {
        throw new AxiosError('Network Error', AxiosError.ERR_NETWORK, config);
      });
      expect(texts()).toContain("Couldn't check your sign-in");
      expect(has('rider-retry')).toBe(true);
      expect(has('rider-home')).toBe(false);
    });
  });
});
