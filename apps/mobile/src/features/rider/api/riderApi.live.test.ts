// The live rider API against a fake network: paths, methods, headers, multipart parts, timeouts and error mapping.
import { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import * as SecureStore from 'expo-secure-store';
import { AppApiError } from '../../../core/http/apiError';
import { tokenMemory } from '../../../core/security/tokenMemory';
import { fakeHttp, type FakeReply } from './fakeHttp';
import { liveRiderApi, stepTap } from './riderApi.live';

/** Records parts like React Native's FormData does; Node's FormData turns the {uri, name, type} file parts into text. */
class PartsForm {
  parts: [string, unknown][] = [];
  append(name: string, value: unknown) {
    this.parts.push([name, value]);
  }
  // axios took the FormData class when it loaded; this is how it recognises any other form.
  toString() {
    return '[object FormData]';
  }
}

const scope = globalThis as unknown as { FormData: unknown };
const realFormData = scope.FormData;
let calls: InternalAxiosRequestConfig[] = [];
let reply: (config: InternalAxiosRequestConfig) => FakeReply = () => ({
  status: 204,
});

beforeEach(() => {
  scope.FormData = PartsForm;
  reply = () => ({ status: 204 });
  calls = fakeHttp(config => reply(config));
});

afterAll(() => {
  scope.FormData = realFormData;
});

const header = (config: InternalAxiosRequestConfig, name: string) =>
  config.headers.get(name);
const parts = (config: InternalAxiosRequestConfig) =>
  (config.data as PartsForm).parts;

describe('live rider API: phone binding', () => {
  it('sends the installation id with the FCM token to POST /devices', async () => {
    const device = {
      installationId: 'android-id-1',
      fcmToken: 'fcm-1',
      appVersion: '1.0.0',
      model: 'Redmi Note 13',
    };
    await liveRiderApi.registerDevice(device);
    expect(calls[0].method).toBe('post');
    expect(calls[0].url).toBe('/api/v1/rider/devices');
    expect(JSON.parse(calls[0].data)).toEqual(device);
  });

  it('starts the shift with the selfie and the X-Craves-Installation-Id header, and returns the credential', async () => {
    reply = () => ({
      status: 200,
      data: { shiftCredential: 'opaque', expiresAt: '2026-10-20T22:00:00Z' },
    });
    await expect(
      liveRiderApi.startShift('file:///selfie.jpg', 'android-id-1'),
    ).resolves.toEqual({
      shiftCredential: 'opaque',
      expiresAt: '2026-10-20T22:00:00Z',
    });
    expect(calls[0].url).toBe('/api/v1/rider/shift/start');
    expect(header(calls[0], 'X-Craves-Installation-Id')).toBe('android-id-1');
    expect(header(calls[0], 'Content-Type')).toBe('multipart/form-data');
    expect(parts(calls[0])).toEqual([
      [
        'selfie',
        { uri: 'file:///selfie.jpg', name: 'selfie.jpg', type: 'image/jpeg' },
      ],
    ]);
    expect(calls[0].timeout).toBe(90_000);
  });

  it('leaves the header off when the phone has no Android ID, and passes on 409 DEVICE_NOT_BOUND', async () => {
    reply = () => ({
      status: 409,
      data: {
        code: 'DEVICE_NOT_BOUND',
        message: "This phone isn't approved yet.",
      },
    });
    await expect(
      liveRiderApi.startShift('file:///selfie.jpg', null),
    ).rejects.toMatchObject({
      code: 'DEVICE_NOT_BOUND',
      status: 409,
      message: "This phone isn't approved yet.",
    });
    expect(header(calls[0], 'X-Craves-Installation-Id')).toBeUndefined();
  });
});

const trip = { tripId: 't1', version: 2, step: 'AT_DROP' };
const fix = {
  lat: 17.46,
  lng: 78.36,
  accuracyM: 8,
  at: '2026-10-20T10:00:00Z',
};

describe('live rider API: every path in rider-v1.yaml', () => {
  // [call, method, url, JSON body or undefined]
  it.each([
    ['getMe', () => liveRiderApi.getMe(), 'get', '/api/v1/rider/me', undefined],
    [
      'getProfile',
      () => liveRiderApi.getProfile(),
      'get',
      '/api/v1/rider/profile',
      undefined,
    ],
    [
      'getTerms',
      () => liveRiderApi.getTerms(),
      'get',
      '/api/v1/rider/terms',
      undefined,
    ],
    [
      'acceptTerms',
      () => liveRiderApi.acceptTerms('v2'),
      'post',
      '/api/v1/rider/terms/accept',
      { version: 'v2' },
    ],
    [
      'acceptPrivacyNotice',
      () => liveRiderApi.acceptPrivacyNotice('2027-05-v1', 'te'),
      'post',
      '/api/v1/rider/privacy-notice/accept',
      { version: '2027-05-v1', language: 'te' },
    ],
    [
      'getHome',
      () => liveRiderApi.getHome(),
      'get',
      '/api/v1/rider/home',
      undefined,
    ],
    [
      'getMyData',
      () => liveRiderApi.getMyData(),
      'get',
      '/api/v1/rider/my-data',
      undefined,
    ],
    [
      'endShift',
      () => liveRiderApi.endShift(),
      'post',
      '/api/v1/rider/shift/end',
      undefined,
    ],
    [
      'pauseShift',
      () => liveRiderApi.pauseShift(10),
      'post',
      '/api/v1/rider/shift/pause',
      { minutes: 10 },
    ],
    [
      'resumeShift',
      () => liveRiderApi.resumeShift(),
      'post',
      '/api/v1/rider/shift/resume',
      undefined,
    ],
    [
      'setPreferences',
      () => liveRiderApi.setPreferences({ maxPickupM: 1000, maxDropM: null }),
      'put',
      '/api/v1/rider/preferences',
      { maxPickupM: 1000, maxDropM: null },
    ],
    [
      'saveHomeSpot',
      () => liveRiderApi.saveHomeSpot(17.46, 78.39),
      'put',
      '/api/v1/rider/home-spot',
      { lat: 17.46, lng: 78.39 },
    ],
    [
      'forgetHomeSpot',
      () => liveRiderApi.forgetHomeSpot(),
      'delete',
      '/api/v1/rider/home-spot',
      undefined,
    ],
    [
      'headHome',
      () => liveRiderApi.headHome(),
      'post',
      '/api/v1/rider/shift/heading-home',
      undefined,
    ],
    [
      'stopHeadingHome',
      () => liveRiderApi.stopHeadingHome(),
      'delete',
      '/api/v1/rider/shift/heading-home',
      undefined,
    ],
    [
      'postLocations',
      () => liveRiderApi.postLocations([fix]),
      'post',
      '/api/v1/rider/locations',
      { fixes: [fix] },
    ],
    [
      'getTripEarning',
      () => liveRiderApi.getTripEarning('t1'),
      'get',
      '/api/v1/rider/earnings/trips/t1',
      undefined,
    ],
    [
      'getPayouts',
      () => liveRiderApi.getPayouts(),
      'get',
      '/api/v1/rider/payouts',
      undefined,
    ],
    [
      'reportIssue',
      () =>
        liveRiderApi.reportIssue({
          tripId: 't1',
          category: 'MISSING_PAY',
          note: 'Waiting pay missing',
        }),
      'post',
      '/api/v1/rider/support/issues',
      { tripId: 't1', category: 'MISSING_PAY', note: 'Waiting pay missing' },
    ],
    [
      'sendSos',
      () => liveRiderApi.sendSos({ tripId: 't1', fix }),
      'post',
      '/api/v1/rider/sos',
      { tripId: 't1', fix },
    ],
  ] as const)('%s', async (_name, call, method, url, body) => {
    reply = () => ({ status: 200, data: {} });
    await call();
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe(method);
    expect(calls[0].url).toBe(url);
    expect(calls[0].timeout).toBe(12_000);
    expect(
      calls[0].data === undefined ? undefined : JSON.parse(calls[0].data),
    ).toEqual(body);
  });

  it('accepts and declines offers with the Idempotency-Key', async () => {
    reply = config =>
      config.url?.endsWith('/accept')
        ? { status: 200, data: trip }
        : { status: 204 };
    await expect(
      liveRiderApi.acceptOffer('o1', 'rider-accept-o1-r1'),
    ).resolves.toEqual(trip);
    await liveRiderApi.declineOffer('o1', 'rider-decline-o1-r1');
    expect(
      calls.map(c => [c.method, c.url, header(c, 'Idempotency-Key')]),
    ).toEqual([
      ['post', '/api/v1/rider/offers/o1/accept', 'rider-accept-o1-r1'],
      ['post', '/api/v1/rider/offers/o1/decline', 'rider-decline-o1-r1'],
    ]);
  });

  it('reads the active trip, and null on 204', async () => {
    reply = () => ({ status: 200, data: trip });
    await expect(liveRiderApi.getActiveTrip()).resolves.toEqual(trip);
    reply = () => ({ status: 204 });
    await expect(liveRiderApi.getActiveTrip()).resolves.toBeNull();
    expect(calls[1].url).toBe('/api/v1/rider/trips/active');
  });

  it('sends trip steps as JSON with the Idempotency-Key', async () => {
    reply = () => ({ status: 200, data: trip });
    await liveRiderApi.tripAction(
      't1',
      'arrived-drop',
      undefined,
      'rider-arrived-drop-t1-r1',
    );
    await liveRiderApi.tripAction(
      't1',
      'failed',
      { reason: 'ADDRESS_WRONG' },
      'rider-failed-t1-r1',
    );
    await liveRiderApi.tripAction(
      't1',
      'delivered',
      { method: 'OTP', otp: '4821', fix },
      'rider-delivered-t1-r1-2',
    );
    expect(
      calls.map(c => [
        c.url,
        header(c, 'Idempotency-Key'),
        c.data && JSON.parse(c.data),
      ]),
    ).toEqual([
      [
        '/api/v1/rider/trips/t1/arrived-drop',
        'rider-arrived-drop-t1-r1',
        undefined,
      ],
      [
        '/api/v1/rider/trips/t1/failed',
        'rider-failed-t1-r1',
        { reason: 'ADDRESS_WRONG' },
      ],
      [
        '/api/v1/rider/trips/t1/delivered',
        'rider-delivered-t1-r1-2',
        { method: 'OTP', otp: '4821', fix },
      ],
    ]);
  });

  it('sends when and where each queued step was tapped: ageMs and the fix aged to now (blueprint A4)', async () => {
    reply = () => ({ status: 200, data: trip });
    const tap = {
      occurredAt: Date.now() - 60_000,
      fix: { ...fix, ageMs: 2_000 },
    };
    await liveRiderApi.tripAction('t1', 'arrived-drop', undefined, 'k1', tap);
    await liveRiderApi.tripAction(
      't1',
      'failed',
      { reason: 'CUSTOMER_UNREACHABLE' },
      'k2',
      tap,
    );
    await liveRiderApi.tripAction(
      't1',
      'delivered',
      { method: 'OTP', otp: '4821' },
      'k3',
      tap,
    );
    for (const call of calls) {
      const body = JSON.parse(call.data);
      expect(body.ageMs).toBeGreaterThanOrEqual(60_000);
      expect(body.ageMs).toBeLessThan(65_000);
      expect(body.fix).toEqual({ ...fix, ageMs: 2_000 + body.ageMs });
    }
    expect(JSON.parse(calls[1].data).reason).toBe('CUSTOMER_UNREACHABLE');
    expect(JSON.parse(calls[2].data)).toMatchObject({
      method: 'OTP',
      otp: '4821',
    });
  });

  it('ages a fix without ageMs from its own stamp, and drops one whose stamp is unreadable', () => {
    const occurredAt = Date.parse(fix.at) + 5_000;
    expect(stepTap({ occurredAt, fix }, occurredAt + 1_000)).toEqual({
      ageMs: 1_000,
      fix: { ...fix, ageMs: 6_000 },
    });
    expect(
      stepTap({ occurredAt, fix: { ...fix, at: 'later' } }, occurredAt),
    ).toEqual({ ageMs: 0 });
    expect(stepTap(undefined)).toEqual({});
  });

  describe('photo delivery', () => {
    const realFetch = globalThis.fetch;
    afterEach(() => {
      globalThis.fetch = realFetch;
    });

    it('is multipart with the photo, method, calls and fix, the Idempotency-Key and the upload timeout', async () => {
      globalThis.fetch = jest.fn(async () => ({} as Response));
      reply = () => ({ status: 200, data: { ...trip, step: 'DELIVERED' } });
      const body = {
        method: 'PHOTO',
        photoUri: 'file:///door.jpg',
        callsMade: 2,
        fix,
      } as const;
      await liveRiderApi.tripAction(
        't1',
        'delivered',
        body,
        'rider-delivered-t1-r1-photo',
      );
      expect(calls[0].url).toBe('/api/v1/rider/trips/t1/delivered');
      expect(header(calls[0], 'Idempotency-Key')).toBe(
        'rider-delivered-t1-r1-photo',
      );
      expect(header(calls[0], 'Content-Type')).toBe('multipart/form-data');
      expect(calls[0].timeout).toBe(90_000);
      expect(parts(calls[0])).toEqual([
        [
          'photo',
          { uri: 'file:///door.jpg', name: 'delivery.jpg', type: 'image/jpeg' },
        ],
        ['method', 'PHOTO'],
        ['callsMade', '2'],
        ['fix', JSON.stringify(fix)],
      ]);
    });

    it('carries the tap as ageMs and the fix parts', async () => {
      globalThis.fetch = jest.fn(async () => ({} as Response));
      reply = () => ({ status: 200, data: { ...trip, step: 'DELIVERED' } });
      const body = {
        method: 'PHOTO',
        photoUri: 'file:///door.jpg',
        callsMade: 2,
      } as const;
      await liveRiderApi.tripAction('t1', 'delivered', body, 'k', {
        occurredAt: Date.now() - 30_000,
        fix: { ...fix, ageMs: 1_000 },
      });
      const sent = Object.fromEntries(parts(calls[0]));
      expect(Number(sent.ageMs)).toBeGreaterThanOrEqual(30_000);
      expect(JSON.parse(sent.fix as string)).toEqual({
        ...fix,
        ageMs: 1_000 + Number(sent.ageMs),
      });
    });

    it('never sends a delivery without its photo: a missing file is a refusal that asks for another (P1-07)', async () => {
      globalThis.fetch = jest.fn(async () => {
        throw new TypeError('Network request failed');
      });
      reply = () => ({ status: 200, data: trip });
      const sent = liveRiderApi.tripAction(
        't1',
        'delivered',
        { method: 'PHOTO', photoUri: 'file:///gone.jpg', callsMade: 2 },
        'k',
      );
      await expect(sent).rejects.toMatchObject({
        code: 'PHOTO_MISSING',
        status: 422,
        retriable: false,
      });
      await expect(
        liveRiderApi.tripAction(
          't1',
          'delivered',
          { method: 'PHOTO', callsMade: 2 },
          'k2',
        ),
      ).rejects.toMatchObject({ code: 'PHOTO_MISSING' });
      expect(calls).toHaveLength(0);
    });
  });

  it('uploads a document photo as multipart with the upload timeout', async () => {
    await liveRiderApi.uploadDocument('PUC', 'file:///puc.jpg');
    expect(calls[0].url).toBe('/api/v1/rider/documents');
    expect(calls[0].timeout).toBe(90_000);
    expect(parts(calls[0])).toEqual([
      ['type', 'PUC'],
      [
        'photo',
        { uri: 'file:///puc.jpg', name: 'document.jpg', type: 'image/jpeg' },
      ],
    ]);
    // A PNG chosen from the gallery goes as PNG, or the server's signature check refuses it.
    await liveRiderApi.uploadDocument('PAN', 'file:///cache/ImagePicker/pan.PNG');
    expect(parts(calls[1])).toEqual([
      ['type', 'PAN'],
      ['photo', { uri: 'file:///cache/ImagePicker/pan.PNG', name: 'document.png', type: 'image/png' }],
    ]);
  });

  it('pages earnings with the server cursor', async () => {
    reply = () => ({
      status: 200,
      data: {
        rangeLabel: 'This week',
        totalPaise: 0,
        trips: [],
        nextCursor: 'c/2',
      },
    });
    const first = await liveRiderApi.getEarnings('week');
    await liveRiderApi.getEarnings('week', first.nextCursor);
    expect(calls.map(c => c.url)).toEqual([
      '/api/v1/rider/earnings?range=week',
      '/api/v1/rider/earnings?range=week&cursor=c%2F2',
    ]);
  });

  it('asks for the daily withdrawal with the Idempotency-Key', async () => {
    await liveRiderApi.requestWithdrawal(42000, 'rider-withdraw-2026-10-20-r1');
    expect(calls[0].url).toBe('/api/v1/rider/withdrawals');
    expect(header(calls[0], 'Idempotency-Key')).toBe(
      'rider-withdraw-2026-10-20-r1',
    );
    expect(JSON.parse(calls[0].data)).toEqual({ amountPaise: 42000 });
  });
});

describe('live rider API: errors become AppApiError', () => {
  const otp = { method: 'OTP', otp: '1111' } as const;

  it('keeps attemptsLeft on a wrong OTP', async () => {
    reply = () => ({
      status: 422,
      data: { code: 'OTP_INVALID', message: 'Wrong code.', attemptsLeft: 3 },
    });
    await expect(
      liveRiderApi.tripAction('t1', 'delivered', otp, 'k'),
    ).rejects.toMatchObject({
      code: 'OTP_INVALID',
      status: 422,
      attemptsLeft: 3,
      message: 'Wrong code.',
    });
  });

  it('treats a 422 with attemptsLeft 0 like 423 OTP_LOCKED', async () => {
    reply = () => ({
      status: 422,
      data: {
        code: 'OTP_INVALID',
        message: 'Too many wrong codes.',
        attemptsLeft: 0,
      },
    });
    const error = await liveRiderApi
      .tripAction('t1', 'delivered', otp, 'k')
      .catch(e => e);
    expect(error).toBeInstanceOf(AppApiError);
    expect(error).toMatchObject({
      code: 'OTP_LOCKED',
      status: 423,
      message: 'Too many wrong codes.',
    });
    expect(error.attemptsLeft).toBeUndefined();
  });

  it('passes 423 OTP_LOCKED on with the server message', async () => {
    reply = () => ({
      status: 423,
      data: { code: 'OTP_LOCKED', message: 'Use the photo option.' },
    });
    await expect(
      liveRiderApi.tripAction('t1', 'delivered', otp, 'k'),
    ).rejects.toMatchObject({
      code: 'OTP_LOCKED',
      status: 423,
      message: 'Use the photo option.',
    });
  });

  // The Offer screen shows its own "Offer expired" for 410, so the core client's generic 410 text never shows.
  it.each([
    [
      'OFFER_TAKEN',
      409,
      'Server says OFFER_TAKEN',
      () => liveRiderApi.acceptOffer('o1', 'k'),
    ],
    [
      'OFFER_EXPIRED',
      410,
      'We could not complete that request.',
      () => liveRiderApi.acceptOffer('o1', 'k'),
    ],
    [
      'TERMS_CHANGED',
      409,
      'Server says TERMS_CHANGED',
      () => liveRiderApi.acceptTerms('v1'),
    ],
    [
      'DEVICE_NOT_BOUND',
      409,
      'Server says DEVICE_NOT_BOUND',
      () =>
        liveRiderApi.registerDevice({
          installationId: 'a',
          fcmToken: 'f',
          appVersion: '1.0.0',
          model: 'm',
        }),
    ],
  ] as const)('%s (%i) keeps its code', async (code, status, message, call) => {
    reply = () => ({ status, data: { code, message: `Server says ${code}` } });
    await expect(call()).rejects.toMatchObject({
      code,
      status,
      message,
      retriable: false,
    });
  });

  it('marks a lost connection as retriable, so the trip queue keeps the step', async () => {
    reply = config => {
      throw new AxiosError('Network Error', AxiosError.ERR_NETWORK, config);
    };
    await expect(
      liveRiderApi.tripAction('t1', 'picked-up', undefined, 'k'),
    ).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
      retriable: true,
    });
  });

  describe('401', () => {
    const getItem = SecureStore.getItemAsync as jest.Mock;
    afterEach(() => {
      tokenMemory.clear();
      getItem.mockImplementation(async () => null);
    });

    it('refreshes the session once and repeats the call with the new token', async () => {
      getItem.mockImplementation(async (key: string) =>
        key === 'craves_refresh_session_v1'
          ? JSON.stringify({
              refreshToken: 'refresh-1',
              expiresAt: '2099-01-01T00:00:00Z',
            })
          : null,
      );
      reply = config => {
        if (config.url === '/api/v1/auth/refresh') {
          return {
            status: 200,
            data: {
              accessToken: 'access-2',
              expiresIn: 900,
              refreshToken: 'refresh-2',
              refreshTokenExpiresAt: '2099-01-02T00:00:00Z',
            },
          };
        }
        return header(config, 'Authorization') === 'Bearer access-2'
          ? { status: 200, data: trip }
          : { status: 401, data: {} };
      };
      await expect(
        liveRiderApi.tripAction('t1', 'picked-up', undefined, 'k'),
      ).resolves.toEqual(trip);
      expect(calls.map(c => c.url)).toEqual([
        '/api/v1/rider/trips/t1/picked-up',
        '/api/v1/auth/refresh',
        '/api/v1/rider/trips/t1/picked-up',
      ]);
      expect(header(calls[2], 'Idempotency-Key')).toBe('k');
    });

    it('is a 401 AppApiError when the session cannot be renewed', async () => {
      reply = () => ({ status: 401, data: {} });
      await expect(liveRiderApi.getMe()).rejects.toMatchObject({ status: 401 });
    });

    // A token from before activation lacks the RIDER role: Spring answers 403 with no code until it expires.
    // Runs before the next test, which leaves a good refresh shared for a minute.
    it('tries the refresh again on the next 403 when one found no session (offline, signed out)', async () => {
      reply = () => ({ status: 403, data: {} });
      const sessionReads = () =>
        getItem.mock.calls.filter(([key]) => key === 'craves_refresh_session_v1').length;
      const before = sessionReads();
      await expect(liveRiderApi.getHome()).rejects.toMatchObject({ code: 'HTTP_403' });
      const first = sessionReads();
      expect(first).toBeGreaterThan(before);
      await expect(liveRiderApi.getHome()).rejects.toMatchObject({ code: 'HTTP_403' });
      expect(sessionReads()).toBeGreaterThan(first);
      expect(calls.map(c => c.url)).toEqual(['/api/v1/rider/home', '/api/v1/rider/home']);
    });

    it('refreshes once on a 403 for the missing role, repeats the call, and passes a lasting 403 on', async () => {
      getItem.mockImplementation(async (key: string) =>
        key === 'craves_refresh_session_v1'
          ? JSON.stringify({
              refreshToken: 'refresh-1',
              expiresAt: '2099-01-01T00:00:00Z',
            })
          : null,
      );
      reply = config => {
        if (config.url === '/api/v1/auth/refresh') {
          return {
            status: 200,
            data: {
              accessToken: 'access-3',
              expiresIn: 900,
              refreshToken: 'refresh-3',
              refreshTokenExpiresAt: '2099-01-02T00:00:00Z',
            },
          };
        }
        return config.url === '/api/v1/rider/home' &&
          header(config, 'Authorization') === 'Bearer access-3'
          ? { status: 200, data: { online: false } }
          : { status: 403, data: {} };
      };
      await expect(liveRiderApi.getHome()).resolves.toEqual({ online: false });
      expect(calls.map(c => c.url)).toEqual([
        '/api/v1/rider/home',
        '/api/v1/auth/refresh',
        '/api/v1/rider/home',
      ]);

      // Still refused with the new token: one more try on the same refresh, then the 403 goes to the screen.
      calls.length = 0;
      await expect(liveRiderApi.getTerms()).rejects.toMatchObject({
        code: 'HTTP_403',
        status: 403,
      });
      expect(calls.map(c => c.url)).toEqual([
        '/api/v1/rider/terms',
        '/api/v1/rider/terms',
      ]);
    });
  });
});
