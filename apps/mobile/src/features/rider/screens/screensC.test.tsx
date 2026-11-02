// Screens 15–21: Earnings, Trip pay, Payouts, SOS, Notice, Profile and Help, in every state.
import React from 'react';
import {AccessibilityInfo, Alert, Animated, Linking, Share, Text} from 'react-native';
import renderer, {act} from 'react-test-renderer';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import {AppApiError} from '../../../core/http/apiError';
import type {EarningsPage, HomeSummary, PayoutsPage, RiderMe, RiderNotice, RiderProfile, TripEarning} from '../api/contract';
import {riderApi} from '../api/riderApi';
import {istDay} from '../domain/format';
import {riderDevice} from '../native/riderDevice';
import {RiderShellContext} from '../navigation';
import {riderKeys} from '../state/riderQueries';
import {RiderStringsProvider} from '../strings/StringsProvider';
import {en} from '../strings/en';
import {hi} from '../strings/hi';
import {kn} from '../strings/kn';
import {te} from '../strings/te';
import {EarningsScreen} from './EarningsScreen';
import {HelpScreen} from './HelpScreen';
import {PayoutsScreen} from './PayoutsScreen';
import {NoticeScreen} from './NoticeScreen';
import {ProfileScreen} from './ProfileScreen';
import {SosScreen} from './SosScreen';
import {payLabel, TripDetailScreen} from './TripDetailScreen';

const mockNavigation = {navigate: jest.fn(), goBack: jest.fn()};

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => mockNavigation,
}));
// FlashList needs real layout; FlatList renders the same props in the test renderer.
jest.mock('@shopify/flash-list', () => ({FlashList: require('react-native').FlatList}));
jest.mock('expo-image-picker', () => ({
  CameraType: {front: 'front', back: 'back'},
  requestCameraPermissionsAsync: jest.fn(async () => ({granted: true})),
  launchCameraAsync: jest.fn(async () => ({canceled: false, assets: [{uri: 'file:///policy.jpg'}]})),
}));
jest.mock('../state/tripQueue', () => ({usePendingActions: () => 0}));
jest.mock('../native/riderOnlineService', () => ({
  riderOnlineService: {lastFix: () => ({lat: 17.4615, lng: 78.3657, accuracyM: 10, at: '2026-10-21T10:00:00Z'})},
}));
jest.mock('../native/riderDevice', () => ({riderDevice: {currentPosition: jest.fn(async () => ({lat: 17.45678, lng: 78.39123}))}}));
jest.mock('../api/riderApi', () => {
  const never = () => new Promise(() => undefined);
  return {
    idempotencyKey: jest.requireActual('../api/riderApi').idempotencyKey,
    riderApi: new Proxy({}, {get: (target: Record<string, jest.Mock>, key: string) => (target[key] ??= jest.fn(never))}),
  };
});

const at = (day: number, hour: number, minute: number) => new Date(2026, 9, day, hour, minute).toISOString();
const credited: TripEarning = {
  tripId: 't1',
  completedAt: at(21, 19, 52),
  kitchenArea: 'Madhapur',
  customerLocality: 'Kondapur',
  status: 'CREDITED',
  amountPaise: 6700,
  lines: [{label: 'Base pay, first 2 km', amountPaise: 4000}],
  pickupDistanceM: 800,
  dropDistanceM: 4000,
  rateCardVersion: '2026-10-v1',
};
const held: TripEarning = {
  ...credited,
  tripId: 't4',
  completedAt: at(21, 13, 24),
  kitchenArea: 'Ameerpet',
  customerLocality: 'Kukatpally',
  status: 'HELD',
  holdReason: "You left this order with a photo after the customer didn't answer.",
  releaseOn: at(26, 12, 0),
  amountPaise: 5800,
  lines: [
    {label: 'Base pay, first 2 km', amountPaise: 4000},
    {label: 'Drop distance, 2.0 km more at ₹9', amountPaise: 1800},
  ],
};
const page = (trips: TripEarning[], extra: Partial<EarningsPage> = {}) => ({
  pages: [{rangeLabel: 'Today', totalPaise: 41400, trips, ...extra}],
  pageParams: [undefined],
});
const me: RiderMe = {
  riderId: 'r1',
  name: 'Ravi Kumar',
  phoneMasked: '+91 ••••• •4321',
  status: 'ACTIVE',
  termsVersion: 'v1',
  acceptedTermsVersion: 'v1',
  language: 'en',
  minAppVersion: '1.0.0',
  supportPhone: '+910000000000',
  supportWhatsappUrl: 'https://chat.whatsapp.com/demo',
  features: {payoutsEnabled: true, withdrawEnabled: true},
};
const home: HomeSummary = {online: false, todayEarningsPaise: 41400, todayTrips: 6};
const profile: RiderProfile = {
  vehicle: {label: 'Honda Activa 6G', regNumberMasked: 'TS 09 •• ••12'},
  documents: [],
  payoutAccountMasked: 'UPI ••••@okhdfc',
};
const payouts: PayoutsPage = {
  nextPayoutOn: '2026-10-26',
  withdrawablePaise: 82200,
  payouts: [
    {
      payoutId: 'p1',
      periodLabel: 'Week of 12 to 18 Oct',
      amountPaise: 324000,
      status: 'PAID',
      utr: '629318472051',
      paidAt: at(19, 11, 20),
    },
  ],
};
const offline = () => new AppApiError('NETWORK_ERROR', 'No internet connection.', undefined, undefined, true);

let tree: renderer.ReactTestRenderer;

async function render(node: React.ReactElement, seed: Array<[readonly unknown[], unknown]> = []) {
  const client = new QueryClient({defaultOptions: {queries: {retry: false, staleTime: Infinity}}});
  // The app shows these screens only once /me has answered for a rider (RiderNavigator); the rider role gates their queries.
  client.setQueryData(riderKeys.me, me);
  seed.forEach(([key, data]) => client.setQueryData(key, data));
  await act(async () => {
    tree = renderer.create(
      <QueryClientProvider client={client}>
        <RiderShellContext.Provider value={{riderId: 'r1', signOut: jest.fn(async () => undefined)}}>{node}</RiderShellContext.Provider>
      </QueryClientProvider>,
    );
  });
  return client;
}

const allText = () =>
  tree.root
    .findAllByType(Text)
    .map(node => [node.props.children].flat().join(''))
    .join(' | ');
const has = (testID: string) => tree.root.findAll(node => node.props.testID === testID).length > 0;
/** What TalkBack reads for a chip or segment: the Pressable inside it carries the state. */
const a11y = (testID: string) =>
  tree.root.findAll(node => node.props.testID === testID && node.props.accessibilityState)[0]?.props.accessibilityState;
// Lets a rejected query reach the screen (React Query notifies on a timer).
const settle = () => act(() => new Promise<void>(resolve => setTimeout(resolve, 0)));
const press = (testID: string) =>
  act(async () => {
    await tree.root.findAll(node => node.props.testID === testID && typeof node.props.onPress === 'function')[0].props.onPress();
  });

beforeEach(() => jest.clearAllMocks());
afterEach(() => act(() => tree?.unmount()));

describe('Earnings (15)', () => {
  it("shows today's total, trip count and rows, and opens a trip", async () => {
    await render(<EarningsScreen />, [[riderKeys.earnings('today'), page([credited, held])]]);
    const text = allText();
    expect(text).toMatch(/Today, (Sun|Mon|Tue|Wed|Thu|Fri|Sat) \d+ \w{3}/);
    expect(text).toContain('₹414');
    expect(text).toContain('2 trips');
    expect(text).toContain('Payouts and withdrawals');
    expect(text).toContain('Madhapur to Kondapur | 7:52 pm | ₹67 | Credited');
    expect(text).toContain('Ameerpet to Kukatpally | 1:24 pm, tap to see why | ₹58 | On hold');
    await press('earning-t4');
    expect(mockNavigation.navigate).toHaveBeenCalledWith('TripDetail', {tripId: 't4'});
    await press('rider-open-payouts');
    expect(mockNavigation.navigate).toHaveBeenCalledWith('Payouts');
  });

  it('shows the day on each row for this week', async () => {
    await render(<EarningsScreen />, [
      [riderKeys.earnings('today'), page([credited])],
      [riderKeys.earnings('week'), {...page([held]), pages: [{rangeLabel: 'This week (Mon–Sun)', totalPaise: 5800, trips: [held]}]}],
    ]);
    await press('rider-range-week');
    expect(tree.root.findByProps({testID: 'rider-range-week'}).props.accessibilityState).toEqual({selected: true});
    expect(allText()).toContain('This week (Mon–Sun)');
    expect(allText()).toContain('Wed 21 Oct, 1:24 pm, tap to see why');
  });

  it('pages through 200 trips without counting a partial list', async () => {
    const trips = Array.from({length: 200}, (_, i) => ({...credited, tripId: `t-${i}`}));
    await render(<EarningsScreen />, [[riderKeys.earnings('today'), page(trips, {nextCursor: '200'})]]);
    expect(allText()).not.toContain('200 trips');
    const list = tree.root.findAll(node => typeof node.props.onEndReached === 'function' && typeof node.props.keyExtractor === 'function')[0];
    expect(list.props.keyExtractor(trips[5])).toBe('t-5');
    // The next page never answers here; only the request matters.
    act(() => {
      list.props.onEndReached();
    });
    expect(riderApi.getEarnings).toHaveBeenCalledWith('today', '200');
  });

  it('shows a skeleton while loading', async () => {
    await render(<EarningsScreen />);
    expect(has('rider-earnings-loading')).toBe(true);
  });

  // A sign-in token from before activation lacks the rider role; "Check again" gets a fresh one and reloads.
  it('offers to check the account again, not a plain retry, when the server refuses for the role', async () => {
    (riderApi.getEarnings as jest.Mock)
      .mockRejectedValueOnce(new AppApiError('HTTP_403', 'This action is not available for your account.', 403))
      .mockResolvedValueOnce(page([credited]).pages[0]);
    // "Check again" waits for every rider query to reload, /me included.
    const getMe = riderApi.getMe as jest.Mock;
    getMe.mockResolvedValue(me);
    try {
      await render(<EarningsScreen />);
      await settle();
      expect(allText()).toContain("Not open to your account | Your account can't use this yet.");
      expect(has('rider-retry')).toBe(false);
      // Showing it asks for the account once by itself: it may have changed.
      expect(getMe).toHaveBeenCalled();
      await press('rider-check-again');
      await settle();
      expect(allText()).toContain('Madhapur to Kondapur');
    } finally {
      getMe.mockImplementation(() => new Promise(() => undefined));
    }
  });

  it('says when the phone is offline and retries', async () => {
    (riderApi.getEarnings as jest.Mock).mockRejectedValueOnce(offline()).mockResolvedValueOnce(page([credited]).pages[0]);
    await render(<EarningsScreen />);
    await settle();
    expect(allText()).toContain("No internet | Check mobile data or Wi-Fi. This loads when you're back online. | Try again");
    await press('rider-retry');
    await settle();
    expect(riderApi.getEarnings).toHaveBeenCalledTimes(2);
    expect(allText()).toContain('Madhapur to Kondapur');
  });

  it('shows an empty state', async () => {
    await render(<EarningsScreen />, [[riderKeys.earnings('today'), page([], {totalPaise: 0})]]);
    expect(allText()).toContain('No trips yet in this period');
    expect(allText()).toContain('0 trips');
  });
});

describe('Trip pay (16)', () => {
  const route = (tripId: string) => ({key: 'TripDetail', name: 'TripDetail' as const, params: {tripId}});
  const screen = (tripId: string) => <TripDetailScreen route={route(tripId)} navigation={mockNavigation as never} />;

  it('explains a hold with its decision date and the 7-day limit', async () => {
    await render(screen('t4'), [[riderKeys.tripEarning('t4'), held]]);
    const text = allText();
    expect(text).toContain('Ameerpet to Kukatpally | Completed Wed 21 Oct, 1:24 pm | ₹58 | On hold');
    expect(text).toContain("Why it's on hold");
    expect(text).toContain('Decision by Mon 26 Oct. A hold never lasts more than 7 days.');
    expect(text).toContain('Drop distance, 2.0 km more at ₹9 | ₹18 | Total | ₹58');
    expect(text).toContain('To the kitchen | 0.8 km | Kitchen to customer | 4.0 km by road');
    expect(text).toContain('Rate card 2026-10-v1, locked when you accepted');
    expect(text).toContain('Support replies within 24 hours. Missing pay is fixed within 72 hours.');
  });

  it('has no hold card for credited pay', async () => {
    await render(screen('t1'), [[riderKeys.tripEarning('t1'), credited]]);
    expect(has('rider-hold')).toBe(false);
    expect(allText()).toContain('Credited');
  });

  it('reports a problem with the trip and confirms', async () => {
    (riderApi.reportIssue as jest.Mock).mockResolvedValueOnce(undefined);
    await render(screen('t4'), [[riderKeys.tripEarning('t4'), held]]);
    await press('rider-report');
    expect(tree.root.findAll(node => node.props.testID === 'rider-report-send')[0].props.disabled).toBe(true);
    await press('rider-report-MISSING_PAY');
    await press('rider-report-send');
    expect(riderApi.reportIssue).toHaveBeenCalledWith({tripId: 't4', category: 'MISSING_PAY'});
    expect(allText()).toContain('Sent. Support replies within 24 hours.');
  });

  // Offer lines carry a component; trip-pay lines only the server's English label (FleetPay.FINAL_LABELS).
  it('names each pay line in the rider’s language when the app knows it, otherwise in the server’s words', () => {
    expect(payLabel({component: 'base', label: 'Base pay', amountPaise: 4000}, te.pay.final, 'te')).toBe(te.pay.final.base);
    expect(payLabel({label: en.pay.final.waiting, amountPaise: 300}, te.pay.final, 'te')).toBe(te.pay.final.waiting);
    expect(payLabel({label: 'TDS, section 194-O', amountPaise: -100}, te.pay.final, 'te')).toBe('TDS, section 194-O');
    expect(payLabel({component: 'base', label: 'Base pay, first 2 km', amountPaise: 4000}, en.pay.final, 'en')).toBe('Base pay, first 2 km');
    // Rain mode's top-up (FleetPay "rain"): on the offer and on the finished trip, in every language.
    for (const [language, strings] of [['te', te], ['hi', hi], ['kn', kn]] as const) {
      expect(payLabel({component: 'rain', label: 'rain top-up', amountPaise: 2000}, strings.pay.offer, language)).toBe(strings.pay.offer.rain);
      expect(payLabel({component: 'rain', label: 'Rain top-up', amountPaise: 2000}, strings.pay.final, language)).toBe(strings.pay.final.rain);
    }
    expect([en.pay.offer.rain, en.pay.final.rain]).toEqual(['rain top-up', 'Rain top-up']);
  });

  it('keeps the report open when sending fails', async () => {
    (riderApi.reportIssue as jest.Mock).mockRejectedValueOnce(offline());
    await render(screen('t4'), [[riderKeys.tripEarning('t4'), held]]);
    await press('rider-report');
    await press('rider-report-OTHER');
    await press('rider-report-send');
    expect(allText()).toContain('No internet. Check your connection and try again.');
    expect(has('rider-report-send')).toBe(true);
  });

  it('shows a skeleton, then an error with retry', async () => {
    await render(screen('t9'));
    expect(has('rider-trip-loading')).toBe(true);
    act(() => tree.unmount());
    (riderApi.getTripEarning as jest.Mock)
      .mockRejectedValueOnce(new AppApiError('NOT_FOUND', 'missing', 404))
      .mockResolvedValueOnce(credited);
    await render(screen('t9'));
    await settle();
    // A refusal with a code reads the server's own words in English.
    expect(allText()).toContain("This didn't load | missing | Try again");
    await press('rider-retry');
    await settle();
    expect(riderApi.getTripEarning).toHaveBeenCalledTimes(3);
    expect(allText()).toContain('Madhapur to Kondapur');
  });
});

describe('Payouts (17)', () => {
  const seed = (overrides: Partial<RiderMe['features']> = {}, data: PayoutsPage = payouts): Array<[readonly unknown[], unknown]> => [
    [riderKeys.me, {...me, features: {...me.features, ...overrides}}],
    [riderKeys.home, home],
    [riderKeys.profile, profile],
    [riderKeys.payouts, data],
  ];
  // Pressing the dialog's last button confirms.
  const confirmAlerts = () =>
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      buttons?.[buttons.length - 1].onPress?.();
    });

  afterEach(() => jest.restoreAllMocks());

  it('shows the withdraw card, the next weekly payout and the paid list', async () => {
    await render(<PayoutsScreen />, seed());
    const text = allText();
    expect(text).toContain('You can withdraw now | ₹822');
    expect(text).toContain("Pay from trips more than 24 hours ago. Today's ₹414 can be withdrawn from tomorrow.");
    expect(text).toContain('Withdraw ₹822 | Free, once a day. Reaches you by 1 pm tomorrow.');
    expect(text).toContain('Next weekly payout: Mon 26 Oct, by 3 pm');
    expect(text).toContain('Your whole balance goes to UPI ••••@okhdfc. No minimum amount.');
    expect(text).toContain('Paid | Week of 12 to 18 Oct | ₹3,240 | Paid | Mon 19 Oct, 11:20 am | Bank ref (UTR) 629318472051');
    expect(text).toContain('Craves never takes fees, deposits or penalties from your pay.');
  });

  it('withdraws once a day with a repeatable key and confirms', async () => {
    confirmAlerts();
    (riderApi.requestWithdrawal as jest.Mock).mockResolvedValueOnce(undefined);
    await render(<PayoutsScreen />, seed());
    await press('rider-withdraw');
    await settle();
    const day = istDay();
    // Kept by the server only once accepted: a retry after a lost answer is the same request (FleetPayouts.withdraw).
    expect(riderApi.requestWithdrawal).toHaveBeenCalledWith(82200, `rider-withdraw-${day}-82200-r1`);
    expect(allText()).toContain('Withdrawal requested. It reaches you by 1 pm tomorrow.');
    expect(has('rider-withdraw')).toBe(false);
  });

  it("shows the server's reason when a withdrawal fails", async () => {
    confirmAlerts();
    (riderApi.requestWithdrawal as jest.Mock).mockRejectedValueOnce(new AppApiError('ALREADY_WITHDRAWN', 'You already withdrew today.', 409));
    await render(<PayoutsScreen />, seed());
    await press('rider-withdraw');
    await settle();
    expect(allText()).toContain('You already withdrew today.');
    expect(has('rider-withdraw')).toBe(true);
  });

  it('explains when daily withdrawals are off, and when payouts have not started', async () => {
    await render(<PayoutsScreen />, seed({withdrawEnabled: false}));
    expect(allText()).toContain("Daily withdrawals aren't on yet.");
    expect(has('rider-withdraw')).toBe(false);
    act(() => tree.unmount());
    await render(<PayoutsScreen />, seed({payoutsEnabled: false}));
    expect(allText()).toContain('Payouts will appear here once they start.');
  });

  it('reports a problem with a payout from its card', async () => {
    (riderApi.reportIssue as jest.Mock).mockResolvedValueOnce(undefined);
    await render(<PayoutsScreen />, seed());
    await press('rider-report');
    await press('rider-report-PAYOUT_NOT_RECEIVED');
    await press('rider-report-send');
    expect(riderApi.reportIssue).toHaveBeenCalledWith({payoutId: 'p1', category: 'PAYOUT_NOT_RECEIVED'});
    expect(allText()).toContain('Sent. Support replies within 24 hours.');
  });

  it('lists a withdrawal on the way apart from paid ones', async () => {
    const processing = {payoutId: 'w1', periodLabel: 'Withdrawal', amountPaise: 82200, status: 'PROCESSING' as const};
    await render(<PayoutsScreen />, seed({}, {withdrawablePaise: 0, payouts: [processing]}));
    expect(allText()).toContain('On the way | Withdrawal | ₹822 | Processing');
    expect(allText()).toContain('Paid | No payouts yet |');
    expect(has('rider-withdraw')).toBe(false);
  });

  it('shows a skeleton, then an offline error with retry', async () => {
    await render(<PayoutsScreen />, [[riderKeys.me, me]]);
    expect(has('rider-payouts-loading')).toBe(true);
    act(() => tree.unmount());
    (riderApi.getPayouts as jest.Mock).mockRejectedValueOnce(offline());
    await render(<PayoutsScreen />, [[riderKeys.me, me]]);
    await settle();
    expect(allText()).toContain("No internet | Check mobile data or Wi-Fi. This loads when you're back online.");
    expect(has('rider-retry')).toBe(true);
  });
});

describe('SOS (18)', () => {
  const screen = (tripId?: string) => (
    <SosScreen route={{key: 'Sos', name: 'Sos', params: {tripId}}} navigation={mockNavigation as never} />
  );
  beforeEach(() => jest.spyOn(Linking, 'openURL').mockResolvedValue(true));
  afterEach(() => jest.restoreAllMocks());

  it('sends the location on open, then offers both calls and the accident promise', async () => {
    (riderApi.sendSos as jest.Mock).mockResolvedValueOnce(undefined);
    await render(screen('t1'), [[riderKeys.me, me]]);
    await settle();
    expect(riderApi.sendSos).toHaveBeenCalledWith({tripId: 't1', fix: expect.objectContaining({lat: 17.4615})});
    const text = allText();
    expect(text).toContain('Emergency | Stop somewhere safe first if you can. | Craves ops has your location');
    expect(text).toContain('Call 112 | Police, fire, ambulance');
    expect(text).toContain("If you've had an accident | Ops calls you back within 15 minutes.");
    await press('rider-sos-ops');
    expect(Linking.openURL).toHaveBeenCalledWith('tel:+910000000000');
    await press('rider-sos-112');
    expect(Linking.openURL).toHaveBeenCalledWith('tel:112');
    await press('rider-sos-close');
    expect(mockNavigation.goBack).toHaveBeenCalled();
  });

  it('says while it is sending', async () => {
    await render(screen(), [[riderKeys.me, me]]);
    expect(allText()).toContain('Sending your location to Craves ops…');
  });

  it('says when the location did not reach ops and sends it again', async () => {
    (riderApi.sendSos as jest.Mock).mockRejectedValueOnce(offline()).mockResolvedValueOnce(undefined);
    await render(screen(), [[riderKeys.me, me]]);
    await settle();
    expect(allText()).toContain("Couldn't send your location. Call ops and tell them where you are.");
    await press('rider-sos-again');
    expect(riderApi.sendSos).toHaveBeenCalledTimes(2);
    expect(has('rider-sos-shared')).toBe(true);
  });

  // Signing up or closed: no rider role, so the server would refuse the location. The calls never depend on Craves.
  it('gives someone without the rider role both calls, without sending a location that would be refused', async () => {
    await render(screen(), [[riderKeys.me, {...me, status: 'PENDING'}]]);
    await settle();
    expect(riderApi.sendSos).not.toHaveBeenCalled();
    expect(allText()).toContain('Calls work any time. Your location goes to ops once your rider account is active.');
    expect(has('rider-sos-again')).toBe(false);
    await press('rider-sos-112');
    expect(Linking.openURL).toHaveBeenCalledWith('tel:112');
  });

  it('tells an active rider the location did not go, with Send again, when the server refuses it', async () => {
    (riderApi.sendSos as jest.Mock)
      .mockRejectedValueOnce(new AppApiError('HTTP_403', 'This action is not available for your account.', 403))
      .mockResolvedValueOnce(undefined);
    await render(screen(), [[riderKeys.me, me]]);
    await settle();
    expect(has('rider-sos-failed')).toBe(true);
    expect(has('rider-sos-calls-only')).toBe(false);
    await press('rider-sos-again');
    expect(has('rider-sos-shared')).toBe(true);
  });
});

describe('Notice (19)', () => {
  const notice: RiderNotice = {
    title: 'Review of a delivery',
    reason: "The customer for order CR-4093 says it didn't arrive. ₹58 is on hold while we check.",
    deadline: at(28, 18, 0),
    appealPhone: '+911111111111',
    sentAt: at(21, 18, 5),
    checking: 'Your photo at the door (1:24 pm), your two call attempts and your location on that trip.',
    tripId: 't4',
  };
  const side = () => tree.root.findAll(node => node.props.testID === 'rider-notice-side' && typeof node.props.onChangeText === 'function')[0];
  beforeEach(() => jest.spyOn(Linking, 'openURL').mockResolvedValue(true));
  afterEach(() => jest.restoreAllMocks());

  it('explains the notice, keeps the rider working and sets out what happens next', async () => {
    await render(<NoticeScreen />, [[riderKeys.me, {...me, notice}]]);
    const text = allText();
    expect(text).toContain('Notice | SOS | Review of a delivery | Sent Wed 21 Oct, 6:05 pm');
    expect(text).toContain('You can keep working. Your account is not paused. Only the pay for this one order is on hold.');
    expect(text).toContain("What happened | The customer for order CR-4093 says it didn't arrive.");
    expect(text).toContain("What we're checking | Your photo at the door (1:24 pm)");
    expect(tree.root.findAll(node => node.props.accessibilityLabel === '1. Tell us your side by Wed 28 Oct.').length).toBeGreaterThan(0);
    expect(text).toContain('Wed 28 Oct');
    expect(text).toContain('A person at Craves looks at everything. The app never decides on its own.');
    expect(text).toContain('Telangana Grievance Redressal Officer');
    await press('rider-notice-call');
    expect(Linking.openURL).toHaveBeenCalledWith('tel:+911111111111');
  });

  it('takes the rider’s side in writing and sends it for this trip', async () => {
    (riderApi.reportIssue as jest.Mock).mockResolvedValueOnce(undefined);
    await render(<NoticeScreen />, [[riderKeys.me, {...me, notice}]]);
    await press('rider-notice-give');
    expect(tree.root.findAll(node => node.props.testID === 'rider-notice-send')[0].props.disabled).toBe(true);
    await act(async () => side().props.onChangeText('  I left it at the door and called twice.  '));
    await press('rider-notice-send');
    expect(riderApi.reportIssue).toHaveBeenCalledWith({category: 'OTHER', tripId: 't4', note: 'I left it at the door and called twice.'});
    expect(allText()).toContain('Sent. A person at Craves reads it before deciding.');
    expect(has('rider-notice-give')).toBe(false);
    expect(has('rider-notice-side')).toBe(false);
  });

  it('keeps what the rider wrote when sending fails', async () => {
    (riderApi.reportIssue as jest.Mock).mockRejectedValueOnce(offline());
    await render(<NoticeScreen />, [[riderKeys.me, {...me, notice}]]);
    await press('rider-notice-give');
    await act(async () => side().props.onChangeText('My side'));
    await press('rider-notice-send');
    expect(allText()).toContain('No internet. Check your connection and try again.');
    expect(side().props.value).toBe('My side');
  });

  it('does not say "keep working" to a paused rider', async () => {
    await render(<NoticeScreen />, [[riderKeys.me, {...me, status: 'SUSPENDED', notice: {...notice, deadline: undefined}}]]);
    expect(has('rider-notice-keep-working')).toBe(false);
    expect(allText()).toContain('Tell us your side.');
  });

  it('shows an empty state without a notice', async () => {
    await render(<NoticeScreen />, [[riderKeys.me, me]]);
    expect(allText()).toContain('No notices');
    expect(has('rider-notice-give')).toBe(false);
    expect(has('rider-notice-call')).toBe(true);
  });
});

describe('Profile (20)', () => {
  const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
  const full: RiderProfile = {
    ...profile,
    documents: [
      {type: 'DL', label: 'Driving licence', status: 'VERIFIED', expiresOn: '2031-05-02'},
      {type: 'INSURANCE', label: 'Vehicle insurance', status: 'VERIFIED', expiresOn: inDays(18)},
      {type: 'PUC', label: 'Pollution certificate (PUC)', status: 'PENDING'},
      {type: 'RC', label: 'Vehicle RC', status: 'REJECTED', reason: 'The photo is blurred. Take it in daylight.'},
      {type: 'PAN', label: 'PAN card', status: 'VERIFIED'},
    ],
    insurance: {label: 'Group accident cover, 24×7', claimPhone: '+912222222222', claimStatus: 'No open claims.'},
  };
  const screen = () => (
    <RiderStringsProvider>
      <ProfileScreen />
    </RiderStringsProvider>
  );
  const seed: Array<[readonly unknown[], unknown]> = [
    [riderKeys.me, me],
    [riderKeys.profile, full],
  ];
  beforeEach(() => jest.spyOn(Linking, 'openURL').mockResolvedValue(true));
  afterEach(() => jest.restoreAllMocks());

  it('shows the rider, vehicle, documents, payout account, insurance, language and links', async () => {
    await render(screen(), seed);
    const text = allText();
    expect(text).toContain('RK | Ravi Kumar | +91 ••••• •4321');
    expect(text).toContain('Vehicle | Honda Activa 6G | TS 09 •• ••12');
    expect(text).toContain('Driving licence | Expires 2 May 2031 | Verified');
    expect(text).toMatch(/Vehicle insurance \| Expires \d+ \w{3} \| Expires soon \| Renew it and upload the new one before \d+ \w{3} to keep going online\. \| Upload new policy/);
    expect(text).toContain('Pollution certificate (PUC) | Uploaded, ops checks it by hand | Checking');
    expect(text).toContain('Vehicle RC | Not accepted | The photo is blurred. Take it in daylight. | Upload a new photo');
    expect(text).toContain('PAN card | Verified');
    expect(text).toContain('UPI ••••@okhdfc | To change it, visit the Craves office with your ID.');
    expect(text).toContain('Accident insurance | Group accident cover, 24×7 | No open claims. | Call for a claim');
    expect(has('rider-upload-DL')).toBe(false);
    await press('rider-claim-call');
    expect(Linking.openURL).toHaveBeenCalledWith('tel:+912222222222');
    await press('rider-language-te');
    expect(a11y('rider-language-te')).toEqual({checked: true});
    expect(a11y('rider-language-en')).toEqual({checked: false});
    await press('rider-open-setup');
    expect(mockNavigation.navigate).toHaveBeenCalledWith('PhoneSetup');
  });

  it('lets the rider choose the farthest pickup and drop, saved on tap, only when the server offers it', async () => {
    await render(screen(), seed);
    expect(allText()).not.toContain('Orders you hear of');
    (riderApi.setPreferences as jest.Mock).mockResolvedValueOnce({maxPickupM: 2000, maxDropM: null});
    await render(screen(), [[riderKeys.me, me], [riderKeys.profile, {...full, preferences: {maxPickupM: null, maxDropM: null}}]]);
    expect(allText()).toContain('Orders you hear of | Only hear of orders within these distances.');
    expect(allText()).toContain('Ride to the kitchen, at most | Any | 1 km | 2 km | 3 km | 5 km');
    expect(allText()).toContain('Kitchen to customer, at most | Any | 3 km | 5 km | 8 km | 12 km');
    expect(a11y('rider-pickup-limit-any')).toEqual({checked: true});
    await press('rider-pickup-limit-2000');
    expect(riderApi.setPreferences).toHaveBeenCalledWith({maxPickupM: 2000, maxDropM: null});
    await settle();
    expect(a11y('rider-pickup-limit-2000')).toEqual({checked: true});
  });

  it('saves the home spot rounded on the phone to about a kilometre, only while the server offers rider choices', async () => {
    const choosing = {...me, features: {...me.features, riderChoices: true}};
    await render(screen(), seed);
    expect(has('rider-home-spot-save')).toBe(false);
    (riderApi.saveHomeSpot as jest.Mock).mockResolvedValueOnce({savedAt: '2026-10-28T07:00:00Z'});
    await render(screen(), [[riderKeys.me, choosing], [riderKeys.profile, full]]);
    expect(allText()).toContain('Home spot for heading home | At home? Save this spot. Craves keeps only an area about 1 km across, never your address.');
    await press('rider-home-spot-save');
    expect(riderDevice.currentPosition).toHaveBeenCalled();
    expect(riderApi.saveHomeSpot).toHaveBeenCalledWith(17.46, 78.39);
  });

  it('says when the phone cannot tell where it is, and sends nothing', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    (riderDevice.currentPosition as jest.Mock).mockResolvedValueOnce(null);
    await render(screen(), [[riderKeys.me, {...me, features: {...me.features, riderChoices: true}}], [riderKeys.profile, full]]);
    await press('rider-home-spot-save');
    expect(alert).toHaveBeenCalledWith("We couldn't find where you are. Turn on location and try again.");
    expect(riderApi.saveHomeSpot).not.toHaveBeenCalled();
  });

  it('always lets the rider delete a saved home spot, even with rider choices off', async () => {
    (riderApi.forgetHomeSpot as jest.Mock).mockResolvedValueOnce(undefined);
    await render(screen(), [[riderKeys.me, me], [riderKeys.profile, {...full, homeSavedAt: '2026-10-20T07:00:00Z'}]]);
    expect(allText()).toContain('Saved on 20 Oct. Craves keeps only an area about 1 km across, never your address, and staff never see it.');
    await press('rider-home-spot-delete');
    expect(riderApi.forgetHomeSpot).toHaveBeenCalled();
  });

  it('shares a copy of the rider data from the phone, or sends a big one through rider support', async () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({action: 'sharedAction'});
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    (riderApi.getMyData as jest.Mock).mockResolvedValueOnce({about: {generatedAt: '2026-10-28T04:41:02Z'}, profile: {name: 'Ravi Kumar'}});
    await render(screen(), seed);
    expect(allText()).toContain('Your data | Get a copy of everything Craves keeps about you');
    await press('rider-share-data');
    expect(share).toHaveBeenCalledWith({title: 'Your data', message: expect.stringContaining('"name": "Ravi Kumar"')});
    (riderApi.getMyData as jest.Mock).mockResolvedValueOnce({trips: 'x'.repeat(400_001)});
    await press('rider-share-data');
    expect(alert).toHaveBeenCalledWith('Your copy is too big to share from the phone. Call rider support and they will send it to you.');
    expect(share).toHaveBeenCalledTimes(1);
  });

  it('uploads a new photo of a document from the back camera and refreshes', async () => {
    (riderApi.uploadDocument as jest.Mock).mockResolvedValueOnce(undefined);
    (riderApi.getProfile as jest.Mock).mockResolvedValueOnce(full);
    await render(screen(), seed);
    await press('rider-upload-INSURANCE');
    expect(ImagePicker.launchCameraAsync).toHaveBeenCalledWith(expect.objectContaining({cameraType: 'back'}));
    expect(riderApi.uploadDocument).toHaveBeenCalledWith('INSURANCE', 'file:///policy.jpg');
    expect(riderApi.getProfile).toHaveBeenCalled();
  });

  it('asks for the camera, with a way to settings, when it is denied', async () => {
    (ImagePicker.requestCameraPermissionsAsync as jest.Mock).mockResolvedValueOnce({granted: false});
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
    await render(screen(), seed);
    await press('rider-upload-RC');
    expect(riderApi.uploadDocument).not.toHaveBeenCalled();
    expect(allText()).toContain('Allow the camera to take a photo of the document. | Open settings');
    await act(async () => tree.root.findAll(node => node.props.accessibilityLabel === 'Open settings' && typeof node.props.onPress === 'function')[0].props.onPress());
    expect(openSettings).toHaveBeenCalled();
  });

  it('says when an upload fails', async () => {
    (riderApi.uploadDocument as jest.Mock).mockRejectedValueOnce(offline());
    await render(screen(), seed);
    await press('rider-upload-RC');
    expect(allText()).toContain("Couldn't upload it. Check your internet and try again.");
  });

  it('shows a skeleton, then an error with retry, and still offers sign-out', async () => {
    await render(screen(), [[riderKeys.me, me]]);
    expect(has('rider-profile-loading')).toBe(true);
    act(() => tree.unmount());
    (riderApi.getProfile as jest.Mock).mockRejectedValueOnce(offline());
    await render(screen(), [[riderKeys.me, me]]);
    await settle();
    expect(has('rider-retry')).toBe(true);
    expect(has('rider-sign-out')).toBe(true);
  });
});

describe('Help (21)', () => {
  const week = (trips: TripEarning[]) => ({pages: [{rangeLabel: 'This week', totalPaise: 0, trips}], pageParams: [undefined]});
  const recent = [credited, {...credited, tripId: 't2', kitchenArea: 'Gachibowli', amountPaise: 7900}, held, {...credited, tripId: 't5'}];
  const questions = () => tree.root.findAll(node => node.props.accessibilityState?.expanded !== undefined && typeof node.props.onPress === 'function');
  beforeEach(() => jest.spyOn(Linking, 'openURL').mockResolvedValue(true));
  afterEach(() => jest.restoreAllMocks());

  it('offers a person to talk to, the questions and the last three trips', async () => {
    await render(<HelpScreen />, [[riderKeys.me, me], [riderKeys.earnings('week'), week(recent)]]);
    const text = allText();
    expect(text).toContain('Talk to a person | Rider support answers in every slot, in Telugu, Hindi or English. | Call rider support');
    expect(text).toContain("Open the riders' WhatsApp group");
    expect(text).toContain('Do I lose anything if I decline an offer? | No. Declining, or letting an offer run out, is free');
    expect(text).not.toContain('Every Monday by 3 pm');
    expect(text).toContain('21 Oct, Madhapur to Kondapur | ₹67 | 21 Oct, Gachibowli to Kondapur | ₹79 | 21 Oct, Ameerpet to Kukatpally | ₹58');
    expect(has('rider-help-trip-t5')).toBe(false);
    await press('rider-help-call');
    expect(Linking.openURL).toHaveBeenCalledWith('tel:+910000000000');
    await press('rider-help-whatsapp');
    expect(Linking.openURL).toHaveBeenCalledWith('https://chat.whatsapp.com/demo');
    await press('rider-help-trip-t4');
    expect(mockNavigation.navigate).toHaveBeenCalledWith('TripDetail', {tripId: 't4'});
  });

  it('opens one answer at a time and says which is expanded', async () => {
    await render(<HelpScreen />, [[riderKeys.me, me], [riderKeys.earnings('week'), week([])]]);
    expect(questions().map(node => node.props.accessibilityState.expanded)).toEqual([true, false, false, false, false]);
    await act(async () => questions()[3].props.onPress());
    expect(questions().map(node => node.props.accessibilityState.expanded)).toEqual([false, false, false, true, false]);
    expect(allText()).toContain('Every Monday by 3 pm');
    await act(async () => questions()[3].props.onPress());
    expect(questions().every(node => !node.props.accessibilityState.expanded)).toBe(true);
    expect(allText()).toContain('No recent trips');
  });

  it('animates only opacity and transform, natively, in 200 ms or less, unless reduce motion is on', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    const timing = jest.spyOn(Animated, 'timing');
    await render(<HelpScreen />, [[riderKeys.me, me], [riderKeys.earnings('week'), week([])]]);
    await settle();
    timing.mockClear();
    await act(async () => questions()[1].props.onPress());
    expect(timing).toHaveBeenCalled();
    timing.mock.calls.forEach(([, config]) => {
      expect(config.useNativeDriver).toBe(true);
      expect(config.duration).toBeLessThanOrEqual(200);
    });
    act(() => tree.unmount());
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    await render(<HelpScreen />, [[riderKeys.me, me], [riderKeys.earnings('week'), week([])]]);
    await settle();
    timing.mockClear();
    await act(async () => questions()[1].props.onPress());
    expect(timing).not.toHaveBeenCalled();
  });

  it('hides WhatsApp without a group link, and handles loading and errors for recent trips', async () => {
    await render(<HelpScreen />, [[riderKeys.me, {...me, supportWhatsappUrl: undefined}]]);
    expect(has('rider-help-whatsapp')).toBe(false);
    expect(has('rider-help-loading')).toBe(true);
    act(() => tree.unmount());
    (riderApi.getEarnings as jest.Mock).mockRejectedValueOnce(offline());
    await render(<HelpScreen />, [[riderKeys.me, me]]);
    await settle();
    expect(allText()).toContain("No internet | Check mobile data or Wi-Fi. This loads when you're back online.");
    expect(has('rider-retry')).toBe(true);
  });
});
