import React from 'react';
import {Alert, Text} from 'react-native';
import renderer, {act} from 'react-test-renderer';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {AppApiError} from '../../../core/http/apiError';
import type {HomeSummary, Offer, RiderMe, Trip} from '../api/contract';
import {riderApi} from '../api/riderApi';
import {RiderShellContext} from '../navigation';
import {riderKeys} from '../state/riderQueries';
import {tripQueue} from '../state/tripQueue';
import {riderDevice} from '../native/riderDevice';
import {HomeScreen} from './HomeScreen';
import {OfferScreen} from './OfferScreen';
import {TripScreen} from './TripScreen';
import {documentBadge, ProfileScreen} from './ProfileScreen';
import {EarningsScreen} from './EarningsScreen';

const mockNavigation = {navigate: jest.fn(), goBack: jest.fn(), replace: jest.fn(), popTo: jest.fn()};
// With count > 0 the phone is offline: the queue keeps what the screen sends, and the screen shows where it leads.
const mockPending = {count: 0, entries: [] as {action: string; tripId: string}[], listeners: new Set<() => void>()};

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => mockNavigation,
}));
jest.mock('expo-image-picker', () => ({
  CameraType: {front: 'front', back: 'back'},
  requestCameraPermissionsAsync: jest.fn(async () => ({granted: true})),
  launchCameraAsync: jest.fn(async () => ({canceled: false, assets: [{uri: 'file:///photo.jpg'}]})),
}));
jest.mock('../api/riderApi', () => {
  const never = () => new Promise(() => undefined);
  return {
    idempotencyKey: jest.requireActual('../api/riderApi').idempotencyKey,
    riderApi: new Proxy({}, {get: (target: Record<string, jest.Mock>, key: string) => (target[key] ??= jest.fn(never))}),
  };
});
jest.mock('../state/tripQueue', () => ({
  tripQueue: {
    enqueue: jest.fn(async (entry: {action: string; tripId: string}) => {
      if (mockPending.count > 0) {
        mockPending.entries = [...mockPending.entries, entry];
        mockPending.listeners.forEach(listener => listener());
      }
      return {kind: 'queued'};
    }),
  },
  usePendingActions: () => mockPending.count,
  usePendingEntries: () =>
    require('react').useSyncExternalStore((listener: () => void) => {
      mockPending.listeners.add(listener);
      return () => mockPending.listeners.delete(listener);
    }, () => mockPending.entries),
}));
jest.mock('../native/riderOnlineService', () => ({
  riderOnlineService: {
    start: jest.fn(async () => undefined),
    stop: jest.fn(async () => undefined),
    testRing: jest.fn(async () => undefined),
    lastFix: () => ({lat: 17.4615, lng: 78.3657, accuracyM: 10, at: '2026-10-19T10:00:00Z'}),
  },
}));
jest.mock('../native/riderDevice', () => ({
  riderDevice: {
    state: jest.fn(async () => null),
    locationGranted: jest.fn(async () => true),
    notificationsGranted: jest.fn(async () => true),
    requestLocation: jest.fn(async () => true),
    requestNotifications: jest.fn(async () => true),
  },
}));

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
  features: {payoutsEnabled: true, withdrawEnabled: false},
};
const home: HomeSummary = {online: false, todayEarningsPaise: 123400, todayTrips: 3};
const offer: Offer = {
  offerId: 'o1',
  tripId: 't1',
  expiresAt: '2026-10-19T10:00:40Z',
  expiresInSec: 40,
  payPaise: 6800,
  pickupDistanceM: 1200,
  dropDistanceM: 3400,
  kitchenArea: 'Madhapur',
  customerLocality: 'Kondapur',
  estMinutes: 28,
  payLines: [
    {label: 'base', amountPaise: 4000},
    {label: 'drop distance', amountPaise: 1800},
    {label: 'ride to the kitchen', amountPaise: 1000},
  ],
};
const trip: Trip = {
  tripId: 't1',
  version: 3,
  step: 'AT_DROP',
  orderCode: 'CR-4107',
  itemsCount: 2,
  payPaise: 6800,
  kitchen: {kitchenName: "Lakshmi's Kitchen", area: 'Madhapur', address: 'Plot 41', lat: 17.4483, lng: 78.3915, chefPhone: '+910000000000'},
  customer: {firstName: 'Anil', area: 'Kondapur', address: 'Flat 302', lat: 17.4615, lng: 78.3657, phone: '+910000000000'},
  waitFreeSeconds: 480,
  unreachableWaitSeconds: 480,
  sealed: true,
};

const signOut = jest.fn(async () => undefined);
let tree: renderer.ReactTestRenderer;

async function render(node: React.ReactElement, seed: Array<[readonly unknown[], unknown]>) {
  const client = new QueryClient({defaultOptions: {queries: {retry: false, staleTime: Infinity}}});
  seed.forEach(([key, data]) => client.setQueryData(key, data));
  await act(async () => {
    tree = renderer.create(
      <QueryClientProvider client={client}>
        <RiderShellContext.Provider value={{riderId: 'r1', signOut}}>{node}</RiderShellContext.Provider>
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
const byId = (testID: string) => tree.root.findAll(node => node.props.testID === testID && typeof node.props.onPress === 'function')[0];

beforeEach(() => {
  jest.clearAllMocks();
  mockPending.count = 0;
  mockPending.entries = [];
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});

afterEach(() => {
  act(() => tree?.unmount());
  jest.useRealTimers();
});

describe('Home', () => {
  it('shows today and offers Go online when offline', async () => {
    await render(<HomeScreen />, [[riderKeys.home, home], [riderKeys.me, me], [riderKeys.activeTrip, null]]);
    expect(allText()).toContain('₹1,234');
    expect(allText()).toContain('Offline');
    await act(async () => byId('rider-go-online').props.onPress());
    expect(mockNavigation.navigate).toHaveBeenCalledWith('GoOnline');
  });

  it('sends the rider to phone setup when a required check fails', async () => {
    (riderDevice.locationGranted as jest.Mock).mockResolvedValueOnce(false);
    await render(<HomeScreen />, [[riderKeys.home, home], [riderKeys.me, me], [riderKeys.activeTrip, null]]);
    expect(allText()).toContain('Finish phone setup to go online.');
    await act(async () => byId('rider-go-online').props.onPress());
    expect(mockNavigation.navigate).toHaveBeenCalledWith('PhoneSetup');
  });

  it('shows the shift and Go offline when online', async () => {
    await render(<HomeScreen />, [
      [riderKeys.home, {...home, online: true, shiftStartedAt: new Date().toISOString(), zoneName: 'Madhapur'}],
      [riderKeys.me, me],
      [riderKeys.activeTrip, null],
    ]);
    expect(allText()).toContain('Online · waiting for orders');
    expect(byId('rider-go-offline')).toBeTruthy();
  });

  it('offers to resume a trip in progress', async () => {
    await render(<HomeScreen />, [[riderKeys.home, {...home, online: true}], [riderKeys.me, me], [riderKeys.activeTrip, trip]]);
    expect(allText()).toContain('Trip · step 4 of 4');
    await act(async () => byId('rider-resume-trip').props.onPress());
    expect(mockNavigation.navigate).toHaveBeenCalledWith('Trip');
  });
});

describe('Offer', () => {
  const route = () => ({key: 'Offer', name: 'Offer' as const, params: {offer, receivedAtMs: Date.now()}});

  it('shows the locked pay first and opens the trip on accept', async () => {
    (riderApi.acceptOffer as jest.Mock).mockResolvedValueOnce({...trip, step: 'TO_KITCHEN'});
    await render(<OfferScreen route={route()} navigation={mockNavigation as never} />, []);
    expect(allText()).toContain('₹68');
    await act(async () => byId('rider-offer-accept').props.onPress());
    expect(riderApi.acceptOffer).toHaveBeenCalledWith('o1', 'rider-accept-o1-r1');
    expect(mockNavigation.replace).toHaveBeenCalledWith('Trip');
  });

  it('says when another rider took the order', async () => {
    (riderApi.acceptOffer as jest.Mock).mockRejectedValueOnce(new AppApiError('OFFER_TAKEN', 'taken', 409));
    await render(<OfferScreen route={route()} navigation={mockNavigation as never} />, []);
    await act(async () => byId('rider-offer-accept').props.onPress());
    expect(allText()).toContain('Taken by another rider');
  });

  it('expires on its own and closes', async () => {
    jest.useFakeTimers();
    await render(<OfferScreen route={route()} navigation={mockNavigation as never} />, []);
    await act(async () => {
      jest.advanceTimersByTime(40_500);
    });
    expect(allText()).toContain('Offer expired');
    await act(async () => {
      jest.advanceTimersByTime(2_100);
    });
    expect(mockNavigation.goBack).toHaveBeenCalled();
  });
});

describe('Trip', () => {
  const props = {route: {key: 'Trip', name: 'Trip' as const, params: undefined}, navigation: mockNavigation as never};
  // TripScreen listens for refused OTPs; trip.test.tsx covers the screen in full.
  beforeEach(() => Object.assign(tripQueue, {onRejected: () => () => undefined}));
  const otpInput = () => tree.root.findAll(node => node.props.testID === 'rider-otp-input' && node.props.keyboardType)[0];

  it('takes the customer OTP before Delivered and sends it through the queue', async () => {
    mockPending.count = 1; // the queue reports the delivery as waiting to sync
    await render(<TripScreen {...props} />, [[riderKeys.activeTrip, trip], [riderKeys.me, me], [riderKeys.home, home]]);
    expect(allText()).toContain('Near drop point');
    expect(byId('rider-delivered').props.disabled).toBe(true);
    await act(async () => otpInput().props.onChangeText('12a34'));
    expect(byId('rider-delivered').props.disabled).toBe(false);
    await act(async () => byId('rider-delivered').props.onPress());
    expect(tripQueue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({action: 'delivered', body: expect.objectContaining({method: 'OTP', otp: '1234'})}),
    );
    // Offline: the step moves on at once and shows it will sync.
    expect(allText()).toContain('Trip complete');
  });

  it('keeps the photo fallback locked until two calls and the wait', async () => {
    await render(<TripScreen {...props} />, [[riderKeys.activeTrip, trip], [riderKeys.me, me], [riderKeys.home, home]]);
    await act(async () => byId('rider-unreachable').props.onPress());
    expect(allText()).toContain('Unlocks when the timer ends');
    expect(byId('rider-leave-photo').props.disabled).toBe(true);
  });

  it('shows a big order code at the kitchen', async () => {
    await render(<TripScreen {...props} />, [[riderKeys.activeTrip, {...trip, step: 'AT_KITCHEN'}], [riderKeys.me, me], [riderKeys.home, home]]);
    expect(tree.root.findByProps({testID: 'rider-order-code'}).props.children).toBe('CR-4107');
    expect(allText()).toContain('Free waiting starts when the food is ready'); // no chefReadyAt yet
  });
});

describe('Profile', () => {
  it('flags expired and soon-expiring documents', () => {
    const now = Date.parse('2026-10-19');
    expect(documentBadge({label: 'PUC', status: 'VERIFIED', expiresOn: '2026-10-01'}, now).label).toBe('EXPIRED');
    expect(documentBadge({label: 'Insurance', status: 'VERIFIED', expiresOn: '2026-11-01'}, now).label).toBe('SOON');
    expect(documentBadge({label: 'DL', status: 'VERIFIED', expiresOn: '2031-05-02'}, now).label).toBe('VERIFIED');
  });

  it('blocks sign-out while trip updates are waiting to sync', async () => {
    mockPending.count = 1;
    await render(<ProfileScreen />, [[riderKeys.me, me]]);
    await act(async () => byId('rider-sign-out').props.onPress());
    expect(signOut).not.toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalledWith(expect.stringContaining("haven't synced"));
  });

  it('signs out when nothing is pending', async () => {
    await render(<ProfileScreen />, [[riderKeys.me, me]]);
    await act(async () => byId('rider-sign-out').props.onPress());
    expect(signOut).toHaveBeenCalled();
  });
});

describe('Earnings', () => {
  it('shows an empty state and the total', async () => {
    await render(<EarningsScreen />, [
      [riderKeys.earnings('today'), {pages: [{rangeLabel: 'Today', totalPaise: 0, trips: []}], pageParams: [undefined]}],
    ]);
    expect(allText()).toContain('No trips yet in this period.');
    expect(allText()).toContain('₹0');
  });
});
