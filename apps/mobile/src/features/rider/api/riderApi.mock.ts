// Demo server for the rider app. Data is invented: real Hyderabad areas, made-up kitchens, people and numbers.
// Rate-card lines are the draft pricing, not final.
import {AppApiError} from '../../../core/http/apiError';
import type {RiderApi} from './riderApi';
import type {
  DeliverBody,
  FailBody,
  Offer,
  Payout,
  RiderMe,
  RiderProfile,
  RiderStatus,
  Terms,
  Trip,
  TripAction,
  TripEarning,
  TripStep,
} from './contract';

const DEMO_PHONE = '+910000000000';
export const DEMO_OTP = '1234';
const MAX_OTP_TRIES = 5;
const PAGE_SIZE = 20;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const KITCHENS = [
  {kitchenName: "Lakshmi's Kitchen", area: 'Madhapur', address: 'Plot 41, Ayyappa Society', landmark: 'Near Image Gardens', lat: 17.4483, lng: 78.3915, chefPhone: DEMO_PHONE},
  {kitchenName: 'Amma Ruchulu', area: 'Gachibowli', address: '2-48, Telecom Nagar', landmark: 'Behind DLF gate 2', lat: 17.4401, lng: 78.3489, chefPhone: DEMO_PHONE},
  {kitchenName: 'Hyderabadi Handi', area: 'Ameerpet', address: '7-1-58, Dharam Karan Road', landmark: 'Opp. metro pillar A1120', lat: 17.4375, lng: 78.4482, chefPhone: DEMO_PHONE},
];

const CUSTOMERS = [
  {firstName: 'Anil', area: 'Kondapur', address: 'Flat 302, Sai Residency, Kothaguda', landmark: 'Opp. Botanical Garden gate', lat: 17.4615, lng: 78.3657, phone: DEMO_PHONE},
  {firstName: 'Priya', area: 'Kukatpally', address: 'H.No 4-32, KPHB Phase 3', landmark: 'Near Forum mall', lat: 17.4849, lng: 78.3995, phone: DEMO_PHONE},
  {firstName: 'Sameer', area: 'Madhapur', address: '5th floor, Cyber Towers road', landmark: 'Next to the petrol bunk', lat: 17.4504, lng: 78.3808, phone: DEMO_PHONE},
];

const BASE_POSITION = {lat: 17.4483, lng: 78.3915};

function payFor(dropM: number, pickupM: number): number {
  const dropKm = dropM / 1000;
  const pickupKm = pickupM / 1000;
  return Math.round(4000 + 900 * Math.max(0, dropKm - 2) + 900 * Math.max(0, pickupKm - 1));
}

function payLines(trip: {payPaise: number}, extraWaitPaise = 0) {
  const base = 4000;
  return [
    {label: 'Base pay (first 2 km)', amountPaise: base},
    {label: 'Distance pay', amountPaise: trip.payPaise - base},
    ...(extraWaitPaise ? [{label: 'Waiting pay', amountPaise: extraWaitPaise}] : []),
  ];
}

function apiError(code: string, message: string, status?: number, retriable = false) {
  return new AppApiError(code, message, status, undefined, retriable);
}

interface MockOptions {
  latencyMs?: () => number;
  now?: () => number;
}

export function createMockRiderApi(options: MockOptions = {}) {
  const now = options.now ?? Date.now;
  const latencyMs = options.latencyMs ?? (() => 150 + Math.random() * 450);
  const iso = (ms: number) => new Date(ms).toISOString();

  function freshMe(): RiderMe {
    return {
      riderId: 'demo-rider-1',
      name: 'Ravi Kumar',
      phoneMasked: '+91 ••••• •4321',
      status: 'ACTIVE',
      termsVersion: '2026-10-v1',
      language: 'en',
      minAppVersion: '1.0.0',
      supportPhone: DEMO_PHONE,
      features: {payoutsEnabled: true, withdrawEnabled: false},
    };
  }

  function seedEarnings(): TripEarning[] {
    const list: TripEarning[] = [];
    for (let i = 0; i < 45; i += 1) {
      const kitchen = KITCHENS[i % KITCHENS.length];
      const customer = CUSTOMERS[(i * 2) % CUSTOMERS.length];
      const dropM = 1500 + ((i * 739) % 4500);
      const pickupM = 300 + ((i * 311) % 1700);
      const amountPaise = payFor(dropM, pickupM);
      list.push({
        tripId: `past-${i + 1}`,
        completedAt: iso(now() - (i + 1) * 3.2 * HOUR),
        kitchenArea: kitchen.area,
        customerLocality: customer.area,
        status: i === 2 ? 'HELD' : i === 7 ? 'ADJUSTED' : 'CREDITED',
        ...(i === 2
          ? {holdReason: 'The customer said the order did not arrive. Ops is checking.', releaseOn: iso(now() + 4 * DAY)}
          : {}),
        amountPaise,
        lines: payLines({payPaise: amountPaise}),
        pickupDistanceM: pickupM,
        dropDistanceM: dropM,
        rateCardVersion: '2026-10-v1',
      });
    }
    return list;
  }

  function seedPayouts(): Payout[] {
    return [1, 2, 3].map(week => ({
      payoutId: `payout-${week}`,
      periodLabel: `Week ending ${new Date(now() - week * 7 * DAY).toDateString().slice(4, 10)}`,
      amountPaise: 310000 + week * 23500,
      status: 'PAID' as const,
      utr: `DEMO${(482915 + week * 7).toString().padStart(10, '0')}`,
      paidAt: iso(now() - (week * 7 - 1) * DAY),
    }));
  }

  const state = {
    me: freshMe(),
    online: false,
    shiftStartedAt: 0,
    offer: null as {offer: Offer; createdAt: number} | null,
    nextOfferAt: 0,
    activeTrip: null as Trip | null,
    endedTrip: null as Trip | null,
    otpTries: 0,
    earnings: seedEarnings(),
    payouts: seedPayouts(),
    failNext: false,
    loseNextRace: false,
    stopReason: null as string | null,
    tripCounter: 0,
    seen: new Map<string, unknown>(),
  };

  async function respond<T>(work: () => T): Promise<T> {
    await new Promise<void>(resolve => setTimeout(resolve, latencyMs()));
    if (state.failNext) {
      state.failNext = false;
      throw apiError('NETWORK_ERROR', 'No internet connection.', undefined, true);
    }
    return work();
  }

  function once<T>(key: string, work: () => T): T {
    if (state.seen.has(key)) {
      return state.seen.get(key) as T;
    }
    const result = work();
    state.seen.set(key, result);
    return result;
  }

  function makeOffer(): Offer {
    state.tripCounter += 1;
    const n = state.tripCounter;
    const kitchen = KITCHENS[n % KITCHENS.length];
    const customer = CUSTOMERS[n % CUSTOMERS.length];
    const pickupDistanceM = 400 + ((n * 523) % 1600);
    const dropDistanceM = 1800 + ((n * 977) % 4200);
    return {
      offerId: `offer-${n}`,
      tripId: `trip-${n}`,
      expiresAt: iso(now() + 40_000),
      expiresInSec: 40,
      payPaise: payFor(dropDistanceM, pickupDistanceM),
      pickupDistanceM,
      dropDistanceM,
      kitchenArea: kitchen.area,
      customerLocality: customer.area,
      estMinutes: Math.round(12 + (pickupDistanceM + dropDistanceM) / 300),
    };
  }

  function liveOffer(): Offer | null {
    if (!state.offer) {
      return null;
    }
    const left = Math.floor((state.offer.createdAt + state.offer.offer.expiresInSec * 1000 - now()) / 1000);
    if (left <= 0) {
      state.offer = null;
      state.nextOfferAt = now() + 30_000;
      return null;
    }
    return {...state.offer.offer, expiresInSec: left};
  }

  function tripFromOffer(offer: Offer): Trip {
    const n = Number(offer.tripId.split('-')[1]);
    return {
      tripId: offer.tripId,
      version: 1,
      step: 'TO_KITCHEN',
      orderCode: `CR-${String(4100 + n).slice(-4)}`,
      itemsCount: 1 + (n % 3),
      payPaise: offer.payPaise,
      kitchen: KITCHENS[n % KITCHENS.length],
      customer: CUSTOMERS[n % CUSTOMERS.length],
      waitFreeSeconds: 480,
      // Demo only: the pilot policy is 8 minutes; a minute keeps the demo short.
      unreachableWaitSeconds: 60,
    };
  }

  function endTrip(step: TripStep, extra: Partial<Trip> = {}): Trip {
    const trip = state.activeTrip as Trip;
    const ended: Trip = {...trip, ...extra, step, version: trip.version + 1};
    state.activeTrip = null;
    state.endedTrip = ended;
    state.nextOfferAt = now() + 30_000;
    return ended;
  }

  function credit(trip: Trip, held: boolean) {
    state.earnings.unshift({
      tripId: trip.tripId,
      completedAt: iso(now()),
      kitchenArea: trip.kitchen.area,
      customerLocality: trip.customer.area,
      status: held ? 'HELD' : 'CREDITED',
      ...(held
        ? {holdReason: 'Delivered with a photo. Ops checks the photo before this pay is released.', releaseOn: iso(now() + 2 * DAY)}
        : {}),
      amountPaise: trip.payPaise,
      lines: payLines(trip),
      pickupDistanceM: 0,
      dropDistanceM: 0,
      rateCardVersion: '2026-10-v1',
    });
  }

  const STEP_AFTER: Partial<Record<TripAction, [TripStep, TripStep]>> = {
    'arrived-pickup': ['TO_KITCHEN', 'AT_KITCHEN'],
    'picked-up': ['AT_KITCHEN', 'PICKED_UP'],
    'arrived-drop': ['PICKED_UP', 'AT_DROP'],
  };

  function applyAction(tripId: string, action: TripAction, body: unknown): Trip {
    const trip = state.activeTrip;
    if (!trip || trip.tripId !== tripId) {
      throw apiError('TRIP_NOT_ACTIVE', 'This trip has ended. Check Home for your next order.', 409);
    }
    const move = STEP_AFTER[action];
    if (move) {
      if (trip.step !== move[0]) {
        throw apiError('STEP_CONFLICT', 'This trip has moved on. Refreshing it now.', 409);
      }
      state.activeTrip = {
        ...trip,
        step: move[1],
        version: trip.version + 1,
        ...(move[1] === 'AT_KITCHEN' ? {arrivedKitchenAt: iso(now())} : {}),
      };
      return state.activeTrip;
    }
    if (action === 'food-not-ready') {
      state.activeTrip = {...trip, version: trip.version + 1};
      return state.activeTrip;
    }
    if (action === 'delivered') {
      const deliver = body as DeliverBody;
      if (trip.step !== 'AT_DROP') {
        throw apiError('STEP_CONFLICT', 'Tap "I\'ve reached the customer" first.', 409);
      }
      if (deliver.method === 'OTP') {
        if (state.otpTries >= MAX_OTP_TRIES) {
          throw apiError('OTP_LOCKED', 'Too many wrong OTPs. Use the photo option; ops will check it.', 423);
        }
        if (deliver.otp !== DEMO_OTP) {
          state.otpTries += 1;
          throw apiError('OTP_INVALID', "That OTP didn't match. Ask the customer to read it again.", 422);
        }
      } else if (deliver.callsMade < 2) {
        throw apiError('CALLS_REQUIRED', 'Call the customer twice before leaving the order.', 422);
      }
      credit(trip, deliver.method === 'PHOTO');
      state.otpTries = 0;
      return endTrip('DELIVERED', {payLines: payLines(trip)});
    }
    if (action === 'failed') {
      const fail = body as FailBody;
      if (trip.step !== 'AT_DROP' && trip.step !== 'PICKED_UP') {
        throw apiError('STEP_CONFLICT', 'You can only mark a trip failed after pickup.', 409);
      }
      credit(trip, true);
      return endTrip('FAILED', {cancelReason: fail.reason, payLines: payLines(trip)});
    }
    throw apiError('UNKNOWN_ACTION', 'Unknown trip action.', 400);
  }

  const api: RiderApi = {
    getMe: () => respond(() => ({...state.me})),
    getProfile: () =>
      respond(
        (): RiderProfile => ({
          vehicle: {label: 'Honda Activa 6G (petrol)', regNumberMasked: 'TS 09 •• ••12'},
          documents: [
            {label: 'Driving licence', status: 'VERIFIED', expiresOn: '2031-05-02'},
            {label: 'Vehicle RC', status: 'VERIFIED', expiresOn: '2034-01-15'},
            {label: 'Vehicle insurance', status: 'VERIFIED', expiresOn: iso(now() + 18 * DAY).slice(0, 10)},
            {label: 'Pollution (PUC)', status: 'EXPIRED', expiresOn: iso(now() - 3 * DAY).slice(0, 10)},
            {label: 'PAN', status: 'VERIFIED'},
          ],
          payoutAccountMasked: 'UPI ••••@okhdfc',
          insurance: {label: 'Group accident cover, ₹10 lakh, 24×7', claimPhone: DEMO_PHONE, claimStatus: 'No open claims'},
        }),
      ),
    getTerms: () =>
      respond(
        (): Terms => ({
          version: state.me.termsVersion,
          effectiveFrom: iso(now() - DAY),
          summaryOfChanges:
            state.me.termsVersion === '2026-10-v1'
              ? ['First version of the Craves rider terms (draft pricing, not final).']
              : ['Waiting pay now starts after 6 free minutes instead of 8.', 'This change was announced 14 days ahead.'],
          rateCardLines: [
            {label: 'Base pay, first 2 km of the drop', value: '₹40'},
            {label: 'Each drop km after 2 km', value: '₹9'},
            {label: 'Ride to the kitchen, each km after the first 1 km', value: '₹9'},
            {label: 'Waiting at the kitchen, after 8 free minutes', value: '₹1.50 a minute'},
            {label: 'Guaranteed minimum in a booked pilot slot', value: '₹80 an hour'},
            {label: 'Declining or missing an offer', value: 'Free, no penalty'},
          ],
          grievanceLines: [
            {label: 'Craves rider support (every slot)', value: DEMO_PHONE},
            {label: 'Telangana Grievance Redressal Officer', value: 'Link added when the state portal opens'},
          ],
        }),
      ),
    acceptTerms: version =>
      respond(() => {
        if (version !== state.me.termsVersion) {
          throw apiError('TERMS_CHANGED', 'The terms changed again. Please read the new version.', 409);
        }
        state.me = {...state.me, acceptedTermsVersion: version};
      }),
    getHome: () =>
      respond(() => {
        const todayStart = new Date(now()).setHours(0, 0, 0, 0);
        const today = state.earnings.filter(e => Date.parse(e.completedAt) >= todayStart);
        return {
          online: state.online,
          shiftStartedAt: state.online ? iso(state.shiftStartedAt) : undefined,
          zoneName: 'Madhapur & Kondapur',
          slotEndsAt: iso(new Date(now()).setHours(22, 0, 0, 0)),
          todayEarningsPaise: today.reduce((sum, e) => sum + e.amountPaise, 0),
          todayTrips: today.length,
          activeTripId: state.activeTrip?.tripId,
        };
      }),
    startShift: () =>
      respond(() => {
        if (state.me.status !== 'ACTIVE') {
          throw apiError('RIDER_NOT_ACTIVE', 'Your account cannot go online right now.', 403);
        }
        state.online = true;
        state.shiftStartedAt = now();
        state.nextOfferAt = now() + 12_000;
      }),
    endShift: () =>
      respond(() => {
        state.online = false;
        state.offer = null;
      }),
    postLocations: () =>
      respond(() => {
        if (state.stopReason) {
          const stopReason = state.stopReason;
          state.stopReason = null;
          state.online = false;
          state.offer = null;
          return {offers: [], stop: true, stopReason};
        }
        if (state.online && !state.activeTrip && !state.offer && now() >= state.nextOfferAt) {
          state.offer = {offer: makeOffer(), createdAt: now()};
        }
        const offer = liveOffer();
        const trip = state.activeTrip ?? state.endedTrip;
        return {
          offers: offer ? [offer] : [],
          ...(trip ? {activeTrip: {tripId: trip.tripId, step: trip.step, version: trip.version}} : {}),
        };
      }),
    acceptOffer: (offerId, key) =>
      respond(() =>
        once(key, () => {
          const offer = liveOffer();
          if (!offer || offer.offerId !== offerId) {
            throw apiError('OFFER_EXPIRED', 'This offer has expired.', 410);
          }
          if (state.loseNextRace) {
            state.loseNextRace = false;
            state.offer = null;
            state.nextOfferAt = now() + 20_000;
            throw apiError('OFFER_TAKEN', 'Another rider took this order.', 409);
          }
          state.offer = null;
          state.endedTrip = null;
          state.activeTrip = tripFromOffer(offer);
          return state.activeTrip;
        }),
      ),
    declineOffer: offerId =>
      respond(() => {
        if (state.offer?.offer.offerId === offerId) {
          state.offer = null;
          state.nextOfferAt = now() + 30_000;
        }
      }),
    getActiveTrip: () =>
      respond(() => {
        if (state.activeTrip) {
          return state.activeTrip;
        }
        // An ended trip is reported once, so the app can show how it ended.
        const ended = state.endedTrip;
        state.endedTrip = null;
        return ended;
      }),
    tripAction: (tripId, action, body, key) =>
      respond(() => once(key, () => applyAction(tripId, action, body))),
    getEarnings: (range, cursor) =>
      respond(() => {
        const today = new Date(now());
        today.setHours(0, 0, 0, 0);
        // The pay week runs Monday to Sunday.
        const since = today.getTime() - (range === 'week' ? ((today.getDay() + 6) % 7) * DAY : 0);
        const all = state.earnings.filter(e => Date.parse(e.completedAt) >= since);
        const start = Number(cursor ?? 0);
        const next = start + PAGE_SIZE;
        return {
          rangeLabel: range === 'today' ? 'Today' : 'This week (Mon–Sun)',
          totalPaise: all.reduce((sum, e) => sum + e.amountPaise, 0),
          trips: all.slice(start, next),
          nextCursor: next < all.length ? String(next) : undefined,
        };
      }),
    getTripEarning: tripId =>
      respond(() => {
        const found = state.earnings.find(e => e.tripId === tripId);
        if (!found) {
          throw apiError('NOT_FOUND', 'We could not find that trip.', 404);
        }
        return found;
      }),
    getPayouts: () =>
      respond(() => {
        const monday = new Date(now());
        monday.setDate(monday.getDate() + ((8 - monday.getDay()) % 7 || 7));
        return {
          nextPayoutOn: monday.toISOString().slice(0, 10),
          withdrawablePaise: state.earnings
            .filter(e => e.status === 'CREDITED' && Date.parse(e.completedAt) < now() - DAY)
            .slice(0, 12)
            .reduce((sum, e) => sum + e.amountPaise, 0),
          payouts: state.payouts,
        };
      }),
    requestWithdrawal: amountPaise =>
      respond(() => {
        state.payouts = [
          {payoutId: `withdrawal-${now()}`, periodLabel: 'Withdrawal', amountPaise, status: 'PROCESSING'},
          ...state.payouts,
        ];
      }),
    reportIssue: () => respond(() => undefined),
    sendSos: () => respond(() => undefined),
  };

  /** Dev panel buttons. Only reachable in mock builds. */
  const controls = {
    sendOfferNow() {
      if (!state.activeTrip) {
        state.offer = {offer: makeOffer(), createdAt: now()};
      }
    },
    failNextCall() {
      state.failNext = true;
    },
    loseNextRace() {
      state.loseNextRace = true;
    },
    setStatus(status: RiderStatus) {
      state.me = {
        ...state.me,
        status,
        statusReason: status === 'SUSPENDED' ? 'A customer reported a safety concern. Ops is reviewing it.' : undefined,
        statusEffectiveAt: status === 'ACTIVE' ? undefined : iso(now()),
      };
    },
    giveNotice() {
      state.me = {
        ...state.me,
        notice: state.me.notice
          ? undefined
          : {
              title: 'Notice: review of a delivery',
              reason: 'A customer said order CR-4107 did not arrive. Pay for that order is on hold while we check.',
              deadline: iso(now() + 7 * DAY),
              appealPhone: DEMO_PHONE,
            },
      };
    },
    publishNewTerms() {
      state.me = {...state.me, termsVersion: `2026-11-v${now()}`};
    },
    cancelActiveTrip() {
      if (state.activeTrip) {
        endTrip('CANCELLED', {
          cancelReason: 'The customer cancelled the order. You are paid for the ride to the kitchen.',
          payLines: [{label: 'Pickup-leg pay', amountPaise: 2000}],
        });
      }
    },
    stopShift() {
      state.stopReason = 'Ops ended your shift.';
    },
    toggleWithdraw() {
      state.me = {
        ...state.me,
        features: {...state.me.features, withdrawEnabled: !state.me.features.withdrawEnabled},
      };
    },
    reset() {
      Object.assign(state, {
        me: freshMe(),
        online: false,
        offer: null,
        activeTrip: null,
        endedTrip: null,
        otpTries: 0,
        earnings: seedEarnings(),
        payouts: seedPayouts(),
        failNext: false,
        loseNextRace: false,
        stopReason: null,
      });
      state.seen.clear();
    },
  };

  /** Where the demo rider "is": at the kitchen until pickup, then at the customer. */
  function position(): {lat: number; lng: number} {
    const trip = state.activeTrip;
    if (!trip) {
      return BASE_POSITION;
    }
    return trip.step === 'TO_KITCHEN' || trip.step === 'AT_KITCHEN' ? trip.kitchen : trip.customer;
  }

  return {api, controls, position};
}

export const mockRider = createMockRiderApi();
