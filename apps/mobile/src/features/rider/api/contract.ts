// The rider API contract. contracts/openapi/rider-v1.yaml holds the same shapes for the backend.
// Money is integer paise: the app formats it and never calculates pay.

export type Paise = number;
export type Language = 'en' | 'te' | 'hi';
export type RiderStatus = 'NOT_RIDER' | 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';

/** A notice the rider must see: a suspension, a 7-day notice or a hold (Telangana Act 21, s.14). */
export interface RiderNotice {
  title: string;
  reason: string;
  deadline?: string;
  appealPhone: string;
  /** When ops sent it. */
  sentAt?: string;
  /** What ops is checking, in plain words. */
  checking?: string;
  /** The one trip whose pay is on hold, if any. */
  tripId?: string;
}

export interface RiderMe {
  riderId: string;
  name: string;
  phoneMasked: string;
  photoUrl?: string;
  status: RiderStatus;
  statusReason?: string;
  statusEffectiveAt?: string;
  notice?: RiderNotice;
  termsVersion: string;
  acceptedTermsVersion?: string;
  language: Language;
  minAppVersion: string;
  supportPhone: string;
  /** The riders' WhatsApp group, opened from Help. */
  supportWhatsappUrl?: string;
  features: {payoutsEnabled: boolean; withdrawEnabled: boolean};
}

export interface RiderProfile {
  /** kind: as the rider signed up; absent for a rider ops added before sign-up existed. */
  vehicle: {label: string; regNumberMasked?: string; kind?: VehicleKind};
  documents: {
    /** DL, RC, INSURANCE, PUC, PAN or BANK; used to upload a new photo. */
    type?: string;
    label: string;
    /** MISSING: a rider still signing up has not sent this one yet. */
    status: 'VERIFIED' | 'PENDING' | 'REJECTED' | 'EXPIRED' | 'MISSING';
    expiresOn?: string;
    /** Ops's reason for a rejection, shown to the rider. */
    reason?: string;
  }[];
  /** The account payouts go to; ops set or confirmed it. */
  payoutAccountMasked?: string;
  /** An account the rider sent that ops has not confirmed yet; nothing is paid to it until then. */
  payoutAccountSubmitted?: string;
  insurance?: {label: string; claimPhone: string; claimStatus?: string};
}

export type VehicleKind = 'PETROL' | 'ELECTRIC' | 'BICYCLE';

/**
 * POST /apply: anyone signed in with an Indian mobile number becomes a PENDING rider. A PENDING rider sends it again to
 * correct their details: 422 NAME_LOCKED once ops checked a document or payout account in the old name, 422 VEHICLE_LOCKED
 * for another vehicle or plate once ops accepted the RC.
 */
export interface RiderSignUp {
  name: string;
  language: 'en' | 'te' | 'hi';
  vehicleKind: VehicleKind;
  /** Required unless vehicleKind is BICYCLE; when a PENDING rider corrects their details, empty keeps the plate on file. */
  vehicleRegNumber?: string;
  adult: boolean;
}

/** POST /payout-account, in the rider's KYC name; ops confirms it before anything is paid. */
export type PayoutAccountInput =
  | {method: 'UPI'; holderName: string; upiId: string}
  | {method: 'BANK'; holderName: string; accountNumber: string; ifsc: string};

export interface LabelValue {
  label: string;
  value: string;
}

export interface Terms {
  version: string;
  effectiveFrom: string;
  summaryOfChanges: string[];
  rateCardLines: LabelValue[];
  grievanceLines: LabelValue[];
  fullTextUrl?: string;
  /** The rate card is draft pricing, not final; the app shows a badge saying so. */
  draft?: boolean;
  /** Newer published terms that start later; riders see changes 14 days ahead. */
  upcoming?: {version: string; effectiveFrom: string; summaryOfChanges: string[]; rateCardLines: LabelValue[]};
}

export interface HomeSummary {
  online: boolean;
  shiftStartedAt?: string;
  zoneName?: string;
  slotEndsAt?: string;
  todayEarningsPaise: Paise;
  todayTrips: number;
  activeTripId?: string;
  nextSlot?: {startsAt: string; endsAt: string; zoneName: string};
  /** The minimum paid per online hour in a booked slot. */
  guaranteedPerHourPaise?: Paise;
  /** Where to wait between orders: water, washroom, shade and charging. */
  restPoint?: {name: string; area: string};
  /** A message from ops, e.g. a rain warning. */
  banner?: {tone: 'info' | 'warning'; text: string};
}

export interface Offer {
  offerId: string;
  tripId: string;
  expiresAt: string;
  /** The countdown uses this, never the phone clock. */
  expiresInSec: number;
  /** Locked at offer time. */
  payPaise: Paise;
  pickupDistanceM: number;
  dropDistanceM: number;
  kitchenArea: string;
  customerLocality: string;
  estMinutes: number;
  /** Items in the sealed bag; the offer shows "About 28 min in total, 2 items". */
  itemsCount?: number;
  /** How payPaise is made up, with short labels the app joins into one sentence ("₹40 base + ₹18 drop distance"). */
  payLines: PayLine[];
}

export type TripStep =
  | 'TO_KITCHEN'
  | 'AT_KITCHEN'
  | 'PICKED_UP'
  | 'AT_DROP'
  | 'DELIVERED'
  | 'FAILED'
  | 'CANCELLED';

export interface Place {
  area: string;
  address: string;
  landmark?: string;
  lat: number;
  lng: number;
}

export interface Trip {
  tripId: string;
  version: number;
  step: TripStep;
  orderCode: string;
  itemsCount: number;
  payPaise: Paise;
  kitchen: Place & {kitchenName: string; chefPhone: string};
  customer: Place & {firstName: string; phone: string};
  arrivedKitchenAt?: string;
  waitFreeSeconds: number;
  /** How long the rider waits at the door, after two calls, before the photo fallback unlocks. */
  unreachableWaitSeconds: number;
  /** Waiting pay per minute after the free wait, from the locked rate card (shown, never calculated). */
  waitPayPerMinutePaise?: Paise;
  cancelReason?: string;
  payLines?: PayLine[];
  /** The chef ticked "sealed" on the bag. */
  sealed: boolean;
  /** When the chef marked the food ready; the free wait starts at the later of this and arrival. */
  chefReadyAt?: string;
}

export interface PayLine {
  /** On Offer and Trip lines: base, drop-km, pickup-km, waiting, cancellation or return-km. TripEarning lines leave it out. */
  component?: string;
  label: string;
  amountPaise: Paise;
}

export interface TripEarning {
  tripId: string;
  completedAt: string;
  kitchenArea: string;
  customerLocality: string;
  status: 'CREDITED' | 'HELD' | 'ADJUSTED';
  holdReason?: string;
  releaseOn?: string;
  amountPaise: Paise;
  lines: PayLine[];
  pickupDistanceM: number;
  dropDistanceM: number;
  rateCardVersion: string;
}

export type EarningsRange = 'today' | 'week';

export interface EarningsPage {
  rangeLabel: string;
  totalPaise: Paise;
  trips: TripEarning[];
  nextCursor?: string;
}

export interface Payout {
  payoutId: string;
  periodLabel: string;
  amountPaise: Paise;
  status: 'SCHEDULED' | 'PROCESSING' | 'PAID' | 'FAILED';
  utr?: string;
  paidAt?: string;
}

export interface PayoutsPage {
  nextPayoutOn?: string;
  withdrawablePaise: Paise;
  payouts: Payout[];
}

/** POST /shift/start. The credential is opaque: the native online service keeps it, JS never stores it. */
export interface ShiftStart {
  shiftCredential: string;
  expiresAt: string;
}

/**
 * POST /devices. The first installationId a rider sends is bound; another one gets 409 DEVICE_NOT_BOUND and waits for
 * ops to approve it. The same installationId with a new fcmToken only updates the token.
 */
export interface DeviceRegistration {
  /** Android's Settings.Secure.ANDROID_ID for this app; also sent as X-Craves-Installation-Id on POST /shift/start. */
  installationId: string;
  fcmToken: string;
  appVersion: string;
  model: string;
}

export interface RiderFix {
  lat: number;
  lng: number;
  accuracyM: number;
  at: string;
  /** Android reported a mock location; the server logs it and never uses it for pay decisions. */
  mock?: boolean;
  /** How old the fix was when sent, by the monotonic clock (0 to 3,600,000); the server then times it by its own clock. */
  ageMs?: number;
}

/** An offer's first arrival on the phone (sent by the native service on /locations, app 1.1.0). */
export interface OfferReceipt {
  offerId: string;
  channel: 'fcm' | 'locations';
  /** How long before the call it arrived, by the monotonic clock: 0 to 3,600,000. */
  ageMs: number;
}

export interface LocationBatch {
  fixes: RiderFix[];
  offerReceipts?: OfferReceipt[];
}

export interface LocationBatchResponse {
  offers: Offer[];
  activeTrip?: {tripId: string; step: TripStep; version: number};
  stop?: boolean;
  stopReason?: string;
}

export type TripAction =
  | 'arrived-pickup'
  | 'food-not-ready'
  | 'picked-up'
  | 'arrived-drop'
  | 'delivered'
  | 'failed';

/** OTP first; the photo is only for the unreachable-customer flow. */
export type DeliverBody =
  | {method: 'OTP'; otp: string; fix?: RiderFix}
  | {method: 'PHOTO'; photoUri?: string; callsMade: number; fix?: RiderFix};

export type FailReason = 'CUSTOMER_UNREACHABLE' | 'WRONG_ADDRESS' | 'CUSTOMER_REFUSED' | 'UNSAFE';

export interface FailBody {
  reason: FailReason;
  note?: string;
}

export type SupportCategory =
  | 'MISSING_PAY'
  | 'WRONG_DISTANCE'
  | 'PAYOUT_NOT_RECEIVED'
  | 'WRONG_DEDUCTION'
  | 'APP_PROBLEM'
  | 'OTHER';

export interface SupportIssue {
  tripId?: string;
  payoutId?: string;
  category: SupportCategory;
  note?: string;
}

/** The codes a refusal carries (rider-v1 ErrorBody); each operation in rider-v1.yaml says which it returns. */
export type RiderErrorCode =
  | 'VALIDATION_FAILED'
  | 'IDEMPOTENCY_KEY_REQUIRED'
  | 'IDEMPOTENCY_KEY_REUSED'
  | 'SIGN_IN_REQUIRED'
  | 'FORBIDDEN'
  | 'NOT_A_RIDER'
  | 'TERMS_CHANGED'
  | 'TERMS_UNAVAILABLE'
  | 'DOCUMENT_TYPE_NOT_ALLOWED'
  | 'DOCUMENT_FILE_INVALID'
  | 'RIDER_NOT_ACTIVE'
  | 'DEVICE_NOT_BOUND'
  | 'APP_UPDATE_REQUIRED'
  | 'DOCUMENTS_EXPIRED'
  | 'SELFIE_INVALID'
  | 'SHIFT_OPEN'
  | 'SHIFT_CREDENTIAL_INVALID'
  | 'OFFER_TAKEN'
  | 'OFFER_EXPIRED'
  | 'OFFER_NOT_FOUND'
  | 'ORDER_CANCELLED'
  | 'TRIP_IN_PROGRESS'
  | 'TRIP_NOT_FOUND'
  | 'TRIP_NOT_ACTIVE'
  | 'STEP_CONFLICT'
  | 'OTP_INVALID'
  | 'OTP_LOCKED'
  | 'OTP_UNAVAILABLE'
  | 'CALLS_REQUIRED'
  | 'WAIT_NOT_OVER'
  | 'PHOTO_REQUIRED'
  | 'WITHDRAWAL_LIMIT'
  | 'AMOUNT_OVER_BALANCE'
  | 'PAYOUT_ACCOUNT_REQUIRED'
  | 'PAYOUTS_PAUSED'
  | 'PAYOUT_NOT_FOUND';

/** A refusal; the message is safe to show the rider. attemptsLeft comes only with 422 OTP_INVALID. */
export interface ErrorBody {
  code: RiderErrorCode;
  message: string;
  attemptsLeft?: number;
}
