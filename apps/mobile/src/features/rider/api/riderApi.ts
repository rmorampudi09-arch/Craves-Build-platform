import type {
  DeviceRegistration,
  EarningsPage,
  EarningsRange,
  HomeSummary,
  LocationBatchResponse,
  Paise,
  PayoutsPage,
  RiderFix,
  RiderMe,
  RiderProfile,
  ShiftStart,
  SupportIssue,
  Terms,
  Trip,
  TripAction,
  TripEarning,
} from './contract';
import {riderApiMode} from '../riderConfig';
import {liveRiderApi} from './riderApi.live';
import {mockRider} from './riderApi.mock';

/** Every call the rider app makes, under /api/v1/rider. Mock and live builds implement the same interface. */
export interface RiderApi {
  getMe(): Promise<RiderMe>;
  getProfile(): Promise<RiderProfile>;
  getTerms(): Promise<Terms>;
  acceptTerms(version: string): Promise<void>;
  getHome(): Promise<HomeSummary>;
  /** The Go Online selfie is checked by ops in the pilot. */
  startShift(selfieUri: string): Promise<ShiftStart>;
  endShift(): Promise<void>;
  /** After sign-in and whenever the FCM token changes. Rejects with 409 DEVICE_NOT_BOUND on an unapproved phone. */
  registerDevice(device: DeviceRegistration): Promise<void>;
  /** A new photo of one document (multipart "photo"); ops reviews it by hand. */
  uploadDocument(type: string, photoUri: string): Promise<void>;
  postLocations(fixes: RiderFix[]): Promise<LocationBatchResponse>;
  acceptOffer(offerId: string, key: string): Promise<Trip>;
  declineOffer(offerId: string, key: string): Promise<void>;
  /** null when no trip is in progress (HTTP 204). */
  getActiveTrip(): Promise<Trip | null>;
  tripAction(tripId: string, action: TripAction, body: unknown, key: string): Promise<Trip>;
  getEarnings(range: EarningsRange, cursor?: string): Promise<EarningsPage>;
  getTripEarning(tripId: string): Promise<TripEarning>;
  getPayouts(): Promise<PayoutsPage>;
  requestWithdrawal(amountPaise: Paise, key: string): Promise<void>;
  reportIssue(issue: SupportIssue): Promise<void>;
  sendSos(input: {tripId?: string; fix?: RiderFix}): Promise<void>;
}

/** Idempotency-Key: rider-{action}-{offerId or tripId}-{riderId}, plus an attempt for retried OTPs. */
export function idempotencyKey(action: string, id: string, riderId: string, attempt?: number): string {
  return `rider-${action}-${id}-${riderId}${attempt ? `-${attempt}` : ''}`;
}

export const riderApi: RiderApi = riderApiMode === 'live' ? liveRiderApi : mockRider.api;
