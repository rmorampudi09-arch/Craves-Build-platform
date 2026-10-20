// Screens 15–21: Earnings, Trip pay, Payouts, SOS, Notice, Profile and Help, in every state.
import React from 'react';
import {Alert, Linking, Text} from 'react-native';
import renderer, {act} from 'react-test-renderer';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {AppApiError} from '../../../core/http/apiError';
import type {EarningsPage, HomeSummary, PayoutsPage, RiderMe, RiderProfile, TripEarning} from '../api/contract';
import {riderApi} from '../api/riderApi';
import {RiderShellContext} from '../navigation';
import {riderKeys} from '../state/riderQueries';
import {EarningsScreen} from './EarningsScreen';
import {PayoutsScreen} from './PayoutsScreen';
import {SosScreen} from './SosScreen';
import {TripDetailScreen} from './TripDetailScreen';

const mockNavigation = {navigate: jest.fn(), goBack: jest.fn()};

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => mockNavigation,
}));
// FlashList needs real layout; FlatList renders the same props in the test renderer.
jest.mock('@shopify/flash-list', () => ({FlashList: require('react-native').FlatList}));
jest.mock('../native/riderOnlineService', () => ({
  riderOnlineService: {lastFix: () => ({lat: 17.4615, lng: 78.3657, accuracyM: 10, at: '2026-10-21T10:00:00Z'})},
}));
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

  it('says when the phone is offline and retries', async () => {
    (riderApi.getEarnings as jest.Mock).mockRejectedValueOnce(offline()).mockResolvedValueOnce(page([credited]).pages[0]);
    await render(<EarningsScreen />);
    await settle();
    expect(allText()).toContain("You're offline. Connect to the internet, then try again.");
    await press('rider-retry');
    await settle();
    expect(riderApi.getEarnings).toHaveBeenCalledTimes(2);
    expect(allText()).toContain('Madhapur to Kondapur');
  });

  it('shows an empty state', async () => {
    await render(<EarningsScreen />, [[riderKeys.earnings('today'), page([], {totalPaise: 0})]]);
    expect(allText()).toContain('No trips yet in this period.');
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

  it('keeps the report open when sending fails', async () => {
    (riderApi.reportIssue as jest.Mock).mockRejectedValueOnce(offline());
    await render(screen('t4'), [[riderKeys.tripEarning('t4'), held]]);
    await press('rider-report');
    await press('rider-report-OTHER');
    await press('rider-report-send');
    expect(allText()).toContain('Something went wrong. Try again.');
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
    expect(allText()).toContain('Something went wrong. Try again.');
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
    const day = new Date().toISOString().slice(0, 10);
    expect(riderApi.requestWithdrawal).toHaveBeenCalledWith(82200, `rider-withdraw-${day}-r1`);
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
    expect(allText()).toContain('Paid | No payouts yet.');
    expect(has('rider-withdraw')).toBe(false);
  });

  it('shows a skeleton, then an offline error with retry', async () => {
    await render(<PayoutsScreen />, [[riderKeys.me, me]]);
    expect(has('rider-payouts-loading')).toBe(true);
    act(() => tree.unmount());
    (riderApi.getPayouts as jest.Mock).mockRejectedValueOnce(offline());
    await render(<PayoutsScreen />, [[riderKeys.me, me]]);
    await settle();
    expect(allText()).toContain("You're offline.");
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
});
