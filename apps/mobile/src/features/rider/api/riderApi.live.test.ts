// The live rider API against a fake network: paths, methods, headers, multipart parts, timeouts and error mapping.
import type {InternalAxiosRequestConfig} from 'axios';
import {fakeHttp, type FakeReply} from './fakeHttp';
import {liveRiderApi} from './riderApi.live';

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

const scope = globalThis as unknown as {FormData: unknown};
const realFormData = scope.FormData;
let calls: InternalAxiosRequestConfig[] = [];
let reply: (config: InternalAxiosRequestConfig) => FakeReply = () => ({status: 204});

beforeEach(() => {
  scope.FormData = PartsForm;
  reply = () => ({status: 204});
  calls = fakeHttp(config => reply(config));
});

afterAll(() => {
  scope.FormData = realFormData;
});

const header = (config: InternalAxiosRequestConfig, name: string) => config.headers.get(name);
const parts = (config: InternalAxiosRequestConfig) => (config.data as PartsForm).parts;

describe('live rider API: phone binding', () => {
  it('sends the installation id with the FCM token to POST /devices', async () => {
    const device = {installationId: 'android-id-1', fcmToken: 'fcm-1', appVersion: '1.0.0', model: 'Redmi Note 13'};
    await liveRiderApi.registerDevice(device);
    expect(calls[0].method).toBe('post');
    expect(calls[0].url).toBe('/api/v1/rider/devices');
    expect(JSON.parse(calls[0].data)).toEqual(device);
  });

  it('starts the shift with the selfie and the X-Craves-Installation-Id header, and returns the credential', async () => {
    reply = () => ({status: 200, data: {shiftCredential: 'opaque', expiresAt: '2026-10-20T22:00:00Z'}});
    await expect(liveRiderApi.startShift('file:///selfie.jpg', 'android-id-1')).resolves.toEqual({
      shiftCredential: 'opaque',
      expiresAt: '2026-10-20T22:00:00Z',
    });
    expect(calls[0].url).toBe('/api/v1/rider/shift/start');
    expect(header(calls[0], 'X-Craves-Installation-Id')).toBe('android-id-1');
    expect(header(calls[0], 'Content-Type')).toBe('multipart/form-data');
    expect(parts(calls[0])).toEqual([['selfie', {uri: 'file:///selfie.jpg', name: 'selfie.jpg', type: 'image/jpeg'}]]);
    expect(calls[0].timeout).toBe(90_000);
  });

  it('leaves the header off when the phone has no Android ID, and passes on 409 DEVICE_NOT_BOUND', async () => {
    reply = () => ({status: 409, data: {code: 'DEVICE_NOT_BOUND', message: "This phone isn't approved yet."}});
    await expect(liveRiderApi.startShift('file:///selfie.jpg', null)).rejects.toMatchObject({
      code: 'DEVICE_NOT_BOUND',
      status: 409,
      message: "This phone isn't approved yet.",
    });
    expect(header(calls[0], 'X-Craves-Installation-Id')).toBeUndefined();
  });
});
