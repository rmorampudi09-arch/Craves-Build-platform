import {apiClient} from '../../../core/http/apiClient';
import {AppApiError} from '../../../core/http/apiError';
import type {QueuedTap, RiderApi} from './riderApi';
import type {DeliverBody, StepTap} from './contract';

const BASE = '/api/v1/rider';
const keyed = (key: string) => ({headers: {'Idempotency-Key': key}});
// Photos on 2G/3G need longer than the default 12 s timeout.
const multipart = {headers: {'Content-Type': 'multipart/form-data'}, timeout: 90_000};

function imagePart(uri: string, name: string): Blob {
  return {uri, name, type: 'image/jpeg'} as unknown as Blob;
}

// shortcut: a fetch of the local file tells us whether the camera photo still exists; replace with a file-system check if one is added.
async function fileExists(uri: string): Promise<boolean> {
  try {
    await fetch(uri);
    return true;
  } catch {
    return false;
  }
}

/**
 * The server answers 423 once no tries are left; a 422 with attemptsLeft 0 means the same, so the rider never sees "0 tries
 * left". Also for the native trip outbox's answers (tripQueue).
 */
export function lockedAtZero(error: AppApiError): AppApiError {
  return error.code === 'OTP_INVALID' && error.attemptsLeft === 0
    ? new AppApiError('OTP_LOCKED', error.message, 423, error.correlationId)
    : error;
}

function lockAtZero(error: unknown): never {
  throw error instanceof AppApiError ? lockedAtZero(error) : error;
}

/**
 * The tap as sent (blueprint A4): how long ago it was, and its fix aged to now. Both ages come from the phone's own
 * clocks read close together, so a wrong wall clock doesn't matter. A fix without ageMs (the mock loop's) is aged from
 * its own stamp.
 */
export function stepTap(tap: QueuedTap | undefined, now = Date.now()): StepTap {
  if (!tap) {
    return {};
  }
  const sinceTap = Math.max(0, Math.round(now - tap.occurredAt));
  const atTap = tap.fix ? tap.fix.ageMs ?? tap.occurredAt - Date.parse(tap.fix.at) : NaN;
  return tap.fix && Number.isFinite(atTap)
    ? {ageMs: sinceTap, fix: {...tap.fix, ageMs: Math.max(0, Math.round(atTap)) + sinceTap}}
    : {ageMs: sinceTap};
}

async function get<T>(path: string): Promise<T> {
  return (await apiClient.get<T>(`${BASE}${path}`)).data;
}

export const liveRiderApi: RiderApi = {
  getMe: () => get('/me'),
  getProfile: () => get('/profile'),
  async signUp(input) {
    return (await apiClient.post(`${BASE}/apply`, input)).data;
  },
  async submitPayoutAccount(input) {
    await apiClient.post(`${BASE}/payout-account`, input);
  },
  getTerms: () => get('/terms'),
  async acceptTerms(version) {
    await apiClient.post(`${BASE}/terms/accept`, {version});
  },
  getHome: () => get('/home'),
  async startShift(selfieUri, installationId) {
    const form = new FormData();
    form.append('selfie', imagePart(selfieUri, 'selfie.jpg'));
    // Without an id the server can't match the bound phone and answers 409 DEVICE_NOT_BOUND.
    const headers = installationId
      ? {...multipart.headers, 'X-Craves-Installation-Id': installationId}
      : multipart.headers;
    return (await apiClient.post(`${BASE}/shift/start`, form, {...multipart, headers})).data;
  },
  async endShift() {
    await apiClient.post(`${BASE}/shift/end`);
  },
  async registerDevice(device) {
    await apiClient.post(`${BASE}/devices`, device);
  },
  async uploadDocument(type, photoUri) {
    const form = new FormData();
    form.append('type', type);
    form.append('photo', imagePart(photoUri, 'document.jpg'));
    await apiClient.post(`${BASE}/documents`, form, multipart);
  },
  // Live builds upload fixes from the native service, which holds the shift credential; JS calls this only in mock mode.
  async postLocations(fixes) {
    return (await apiClient.post(`${BASE}/locations`, {fixes})).data;
  },
  async acceptOffer(offerId, key) {
    return (await apiClient.post(`${BASE}/offers/${offerId}/accept`, undefined, keyed(key))).data;
  },
  async declineOffer(offerId, key) {
    await apiClient.post(`${BASE}/offers/${offerId}/decline`, undefined, keyed(key));
  },
  async getActiveTrip() {
    const response = await apiClient.get(`${BASE}/trips/active`);
    return response.status === 204 ? null : response.data;
  },
  async tripAction(tripId, action, body, key, tap) {
    const url = `${BASE}/trips/${tripId}/${action}`;
    const sent = stepTap(tap);
    const deliver = body as DeliverBody | undefined;
    if (action === 'delivered' && deliver?.method === 'PHOTO') {
      // Never a delivery without its photo: a refusal the queue keeps on screen asks the rider for another (P1-07).
      if (!deliver.photoUri || !(await fileExists(deliver.photoUri))) {
        throw new AppApiError('PHOTO_MISSING', 'The delivery photo is gone from this phone. Take the photo again.', 422);
      }
      const form = new FormData();
      form.append('photo', imagePart(deliver.photoUri, 'delivery.jpg'));
      form.append('method', 'PHOTO');
      form.append('callsMade', String(deliver.callsMade));
      const fix = sent.fix ?? deliver.fix;
      if (fix) {
        form.append('fix', JSON.stringify(fix));
      }
      if (sent.ageMs !== undefined) {
        form.append('ageMs', String(sent.ageMs));
      }
      return (await apiClient.post(url, form, {...multipart, headers: {...multipart.headers, 'Idempotency-Key': key}})).data;
    }
    const json = tap ? {...(body as object | undefined), ...sent} : body;
    return (await apiClient.post(url, json, keyed(key)).catch(lockAtZero)).data;
  },
  getEarnings: (range, cursor) =>
    get(`/earnings?range=${range}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`),
  getTripEarning: tripId => get(`/earnings/trips/${tripId}`),
  getPayouts: () => get('/payouts'),
  async requestWithdrawal(amountPaise, key) {
    await apiClient.post(`${BASE}/withdrawals`, {amountPaise}, keyed(key));
  },
  async reportIssue(issue) {
    await apiClient.post(`${BASE}/support/issues`, issue);
  },
  async sendSos(input) {
    await apiClient.post(`${BASE}/sos`, input);
  },
};
