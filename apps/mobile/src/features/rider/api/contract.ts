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
  vehicle: {label: string; regNumberMasked?: string};
  documents: {
    /** DL, RC, INSURANCE, PUC, PAN or BANK; used to upload a new photo. */
    type?: string;
    label: string;
    status: 'VERIFIED' | 'PENDING' | 'REJECTED' | 'EXPIRED';
    expiresOn?: string;
    /** Ops's reason for a rejection, shown to the rider. */
    reason?: string;
  }[];
  payoutAccountMasked?: string;
  insurance?: {label: string; claimPhone: string; claimStatus?: string};
}

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

/** POST /devices. 409 DEVICE_NOT_BOUND: a different phone, which ops must approve first. */
export interface DeviceRegistration {
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

export interface FailBody {
  reason: string;
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
