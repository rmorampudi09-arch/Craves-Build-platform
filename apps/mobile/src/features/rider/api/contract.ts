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
  /**
   * nativeTripOutbox (P2-02): trip steps go through the phone's native outbox, which sends them after a kill or reboot.
   * riderChoices (Phase 4): the rider can take a break while online and choose the farthest pickup and drop.
   */
  features: {payoutsEnabled: boolean; withdrawEnabled: boolean; nativeTripOutbox?: boolean; riderChoices?: boolean};
  /** P2-09: the privacy notice in force, absent while none is set; url may hold {language}. */
  privacyNotice?: {version: string; url: string; accepted: boolean};
}

export interface RiderProfile {
  /** kind: as the rider signed up; absent for a rider ops added before sign-up existed. */
  vehicle: {label: string; regNumberMasked?: string; kind?: VehicleKind};
  documents: {
    /**
     * DL, RC, INSURANCE, PUC, PAN, BANK or SELFIE (app 1.3.0: the reference selfie, every vehicle, front camera, JPEG only);
     * used to upload a new photo.
     */
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
  /** True when no account is on file because the one sent was set aside (ops asked again, or a new name): send it again. */
  payoutAccountReturned?: boolean;
  insurance?: {label: string; claimPhone: string; claimStatus?: string};
  /** Phase 4, while rider choices are on: the farthest pickup and drop the rider wants to hear of. */
  preferences?: OrderPreferences;
  /** Phase 5: when the rider saved their home spot for heading home; absent while none is saved. Never the spot itself. */
  homeSavedAt?: string;
}

/** The farthest pickup (as offers show it) and drop, in metres; null or absent is any distance. */
export interface OrderPreferences {
  maxPickupM?: number | null;
  maxDropM?: number | null;
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
  /** The make and model, like "Honda Activa 6G" (app 1.2.0); ops sees it beside the RC. Absent keeps the one on file. */
  vehicleModel?: string;
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
  upcoming?: {
    version: string;
    effectiveFrom: string;
    summaryOfChanges: string[];
    rateCardLines: LabelValue[];
    /** How orders are offered then (Phase 4); left out by older servers. */
    offerRules?: OfferRules;
  };
  /** How orders are offered (Phase 4, docs/riders/DISPATCH.md); left out by older servers and before any dispatch policy. */
  offerRules?: OfferRules;
}

/** How orders are offered. Declining or missing an offer is always free. */
export interface OfferRules {
  /** Riders who see an order at the same time; the first to accept gets it. */
  offersAtOnce: number;
  /** When everyone asked passes or the time runs out, the next riders not yet asked hear, in up to this many rounds. */
  offerRounds: number;
  offerSeconds: number;
  /** Only riders this close to the kitchen hear of an order. */
  radiusM: number;
  /** 0: nearest first. Above 0: among the free riders this close to the nearest, the one who has earned least per online hour today. */
  fairBandM: number;
  /**
   * Phase 5: true when the free rider who can reach the kitchen soonest (Craves's travel-time estimate) hears first, and a
   * fair band counts minutes (bandMinutes); left out: by distance.
   */
  byTravelTime?: boolean;
}

/** Why this rider heard of this order, stored with the offer: the rider and ops see the same reason. */
export interface OfferReason {
  /** SOONEST (Phase 5): ranked by travel time, the rider can reach the kitchen soonest. */
  rule: 'NEAREST' | 'FAIR' | 'SOONEST';
  /** The rider's place in this round's order. */
  place: number;
  /** Free riders considered in this round (each round ranks the riders not yet asked). */
  riders: number;
  atOnce: number;
  round: number;
  bandM?: number;
  bandRiders?: number;
  earnedPerHourPaise?: Paise;
  freeMinutes?: number;
  /** Phase 5: the rider is heading home, and this order's drop leaves them this many metres nearer home. */
  homeNearerM?: number;
  /** FAIR only, Phase 5: riders were ranked by travel time, so the band was counted in these minutes. */
  bandMinutes?: number;
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
  /** Phase 4: on a break, with no offers, until then. */
  offersPausedUntil?: string;
  /** Phase 4: minutes online today, shifts less breaks. */
  todayOnlineMinutes?: number;
  /** Phase 4: today's pay per online hour, once online 30 minutes today. */
  todayPerHourPaise?: Paise;
  /** Phase 4: the middle pay per online hour today over 5 or more riders online 30 minutes or more. */
  fleetPerHourPaise?: Paise;
  /** Phase 5, only while rider choices are on: the rider has a home spot, so Home can offer heading home. */
  homeSaved?: boolean;
  /** Phase 5: heading home is on until then. */
  headingHomeUntil?: string;
}

export interface Offer {
  offerId: string;
  tripId: string;
  /**
   * When the offer ends, ISO-8601 (as Jackson writes an Instant, e.g. 2026-11-01T06:10:40.123456Z). The native service moves
   * it onto the phone's clock with the offset from /locations' Date header (app 1.3.0), so a late push counts down less.
   */
  expiresAt: string;
  /** Seconds left when the server sent it: the countdown never runs past arrival plus this. */
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
  /** Why this offer came to this rider (Phase 4); left out by older servers. */
  reason?: OfferReason;
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
  /** On Offer and Trip lines: base, drop-km, pickup-km, rain (rain mode's top-up), waiting, cancellation or return-km. TripEarning lines leave it out. */
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

/** The phone's health, sent by the native service about once a minute (app 1.1.0). Every field is optional. */
export interface DeviceHealth {
  batteryPct?: number;
  charging?: boolean;
  powerSave?: boolean;
  /** Notifications on and the offers channel still at high importance; false keeps offers away. */
  canRing?: boolean;
  /** Battery used and minutes spent unplugged since the service started. */
  drainPct?: number;
  unpluggedMin?: number;
  /** Why the app's last process ended (Android 11+), sent once after a start. */
  lastExitReason?: string;
  queuePending?: number;
  queueOldestAgeS?: number;
}

export interface LocationBatch {
  fixes: RiderFix[];
  offerReceipts?: OfferReceipt[];
  health?: DeviceHealth;
}

export interface LocationBatchResponse {
  offers: Offer[];
  activeTrip?: {tripId: string; step: TripStep; version: number};
  stop?: boolean;
  stopReason?: string;
  /** P2-03 and P2-04, read by the native service: the most fixes per call, and the idle upload period. */
  maxFixes?: number;
  nextPollSec?: number;
  /** P2-10: upload on location callbacks with short wake locks instead of one for the whole shift. */
  callbackUploads?: boolean;
}

export type TripAction =
  | 'arrived-pickup'
  | 'food-not-ready'
  | 'picked-up'
  | 'arrived-drop'
  | 'delivered'
  | 'failed';

/**
 * When and where the rider tapped a step (app 1.1.0), sent with every step: ageMs is how long before the request, and
 * fix the phone's fix then, with its own ageMs. The server counts the step from the tap.
 */
export interface StepTap {
  ageMs?: number;
  fix?: RiderFix;
}

/** OTP first; the photo is only for the unreachable-customer flow. */
export type DeliverBody =
  // capturedOffline (app 1.1.0): the queue sent it after the tap, so the rider may have left the door (P1-05).
  | {method: 'OTP'; otp: string; fix?: RiderFix; capturedOffline?: boolean}
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
  | 'PAYOUT_NOT_FOUND'
  | 'NOT_ONLINE'
  | 'RIDER_CHOICES_OFF'
  | 'HOME_NOT_SAVED';

/** A refusal; the message is safe to show the rider. attemptsLeft comes only with 422 OTP_INVALID. */
export interface ErrorBody {
  code: RiderErrorCode;
  message: string;
  attemptsLeft?: number;
}
