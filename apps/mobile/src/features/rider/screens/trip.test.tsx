import React from 'react';
import {Alert, Linking, Text} from 'react-native';
import renderer, {act} from 'react-test-renderer';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {AppApiError} from '../../../core/http/apiError';
import type {HomeSummary, RiderMe, Trip} from '../api/contract';
import {riderApi} from '../api/riderApi';
import {RiderShellContext} from '../navigation';
import {riderKeys} from '../state/riderQueries';
import {tripQueue} from '../state/tripQueue';
import {TripScreen} from './TripScreen';

const mockNavigation = {navigate: jest.fn(), goBack: jest.fn(), replace: jest.fn(), popTo: jest.fn()};
const mockPending = {count: 0};

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => mockNavigation,
}));
jest.mock('expo-image-picker', () => ({
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
type RejectListener = (entry: unknown, info: unknown) => void;
const mockRejected = new Set<RejectListener>();
jest.mock('../state/tripQueue', () => ({
  tripQueue: {
    enqueue: jest.fn(async () => ({kind: 'queued'})),
    onRejected: jest.fn((listener: RejectListener) => {
      mockRejected.add(listener);
      return () => mockRejected.delete(listener);
    }),
  },
  usePendingActions: () => mockPending.count,
}));
jest.mock('../native/riderOnlineService', () => ({
  riderOnlineService: {lastFix: () => mockFix.value},
}));
const mockFix: {value: {lat: number; lng: number; accuracyM: number; at: string} | null} = {value: null};

const me: RiderMe = {
  riderId: 'r1',
  name: 'Ravi Kumar',
  phoneMasked: '+91 ••••• •4321',
  status: 'ACTIVE',
  termsVersion: 'v1',
  acceptedTermsVersion: 'v1',
  language: 'en',
  minAppVersion: '1.0.0',
  supportPhone: '+911111111111',
  features: {payoutsEnabled: true, withdrawEnabled: false},
};
const home: HomeSummary = {online: true, todayEarningsPaise: 41400, todayTrips: 6};
const trip: Trip = {
  tripId: 't1',
  version: 1,
  step: 'TO_KITCHEN',
  orderCode: 'CR-4107',
  itemsCount: 2,
  payPaise: 6700,
  kitchen: {
    kitchenName: "Lakshmi's Kitchen",
    area: 'Madhapur',
    address: 'Plot 41, Ayyappa Society',
    landmark: 'near Image Gardens',
    lat: 17.4483,
    lng: 78.3915,
    chefPhone: '+912222222222',
  },
  customer: {
    firstName: 'Anil',
    area: 'Kondapur',
    address: 'Flat 302, Sai Residency, Kothaguda',
    landmark: 'opposite Botanical Garden gate',
    lat: 17.4615,
    lng: 78.3657,
    phone: '+913333333333',
  },
  waitFreeSeconds: 480,
  unreachableWaitSeconds: 480,
  waitPayPerMinutePaise: 150,
  sealed: true,
};

const props = {route: {key: 'Trip', name: 'Trip' as const, params: undefined}, navigation: mockNavigation as never};
let tree: renderer.ReactTestRenderer;
let client: QueryClient;

async function render(seedTrip: Trip | null | undefined, seedHome: HomeSummary | undefined = home) {
  client = new QueryClient({defaultOptions: {queries: {retry: false, staleTime: Infinity}}});
  if (seedTrip !== undefined) {
    client.setQueryData(riderKeys.activeTrip, seedTrip);
  }
  client.setQueryData(riderKeys.me, me);
  if (seedHome) {
    client.setQueryData(riderKeys.home, seedHome);
  }
  await act(async () => {
    tree = renderer.create(
      <QueryClientProvider client={client}>
        <RiderShellContext.Provider value={{riderId: 'r1', signOut: async () => undefined}}>
          <TripScreen {...props} />
        </RiderShellContext.Provider>
      </QueryClientProvider>,
    );
  });
  if (seedTrip === undefined) {
    await settle();
  }
}

// Lets a query fetch resolve or reject (real timers only).
const settle = () => act(async () => new Promise<void>(resolve => setTimeout(resolve, 0)));

const allText = () =>
  tree.root
    .findAllByType(Text)
    .map(node => [node.props.children].flat().join(''))
    .join(' | ');
const has = (testID: string) => tree.root.findAll(node => node.props.testID === testID).length > 0;
const byId = (testID: string) =>
  tree.root.findAll(node => node.props.testID === testID && typeof node.props.onPress === 'function')[0];
const press = (testID: string) => act(async () => byId(testID).props.onPress());

beforeEach(() => {
  jest.clearAllMocks();
  mockPending.count = 0;
  mockFix.value = null;
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
});

afterEach(() => {
  act(() => tree?.unmount());
  jest.useRealTimers();
});

describe('Trip: loading, error and ended', () => {
  it('shows a skeleton while the trip loads', async () => {
    await render(undefined);
    expect(has('rider-trip-loading')).toBe(true);
  });

  it('says it could not load the trip and retries', async () => {
    (riderApi.getActiveTrip as jest.Mock).mockRejectedValueOnce(new AppApiError('BOOM', 'Server error', 500));
    await render(undefined);
    expect(allText()).toContain("Couldn't load your trip");
    (riderApi.getActiveTrip as jest.Mock).mockResolvedValueOnce(trip);
    await press('rider-trip-retry');
    await settle();
    expect(has('rider-to-kitchen')).toBe(true);
  });

  it('says the rider is offline when the network is down', async () => {
    (riderApi.getActiveTrip as jest.Mock).mockRejectedValueOnce(new AppApiError('NETWORK', 'offline', undefined, undefined, true));
    await render(undefined);
    expect(allText()).toContain("You're offline");
  });

  it('says the trip has ended when there is none', async () => {
    await render(null);
    expect(allText()).toContain('This trip has ended.');
  });
});

describe('Trip: to the kitchen (step 1)', () => {
  it('shows the kitchen, the order and the locked pay', async () => {
    await render(trip);
    const text = allText();
    expect(text).toContain('Go to the kitchen');
    expect(text).toContain('Pick up from');
    expect(text).toContain("Lakshmi's Kitchen");
    expect(text).toContain('Plot 41, Ayyappa Society, Madhapur');
    expect(text).toContain('Landmark: near Image Gardens');
    expect(text).toContain('Navigate opens Google Maps in two-wheeler mode.');
    expect(text).toContain('CR-4107');
    expect(text).toContain('2, in a sealed bag');
    expect(text).toContain('₹67');
    expect(tree.root.findByProps({testID: 'rider-step-bar'}).props.accessibilityLabel).toBe('Trip step 1 of 4');
  });

  it('calls the chef and opens Google Maps in two-wheeler mode', async () => {
    await render(trip);
    await press('rider-call-chef');
    expect(Linking.openURL).toHaveBeenCalledWith('tel:+912222222222');
    await press('rider-navigate');
    expect(Linking.openURL).toHaveBeenCalledWith('google.navigation:q=17.4483,78.3915&mode=l');
  });

  it('drops "in a sealed bag" until the chef seals it', async () => {
    await render({...trip, sealed: false});
    expect(allText()).not.toContain('sealed bag');
  });

  it('moves to the kitchen step at once and says it will sync when offline', async () => {
    await render(trip);
    mockPending.count = 1;
    await press('rider-reached-kitchen');
    expect(tripQueue.enqueue).toHaveBeenCalledWith(expect.objectContaining({action: 'arrived-pickup', tripId: 't1'}));
    expect(allText()).toContain('At the kitchen');
    expect(allText()).toContain('Saved · will sync');
  });
});

describe('Trip: at the kitchen (step 2)', () => {
  const NOW = Date.parse('2026-10-20T13:00:00Z');
  const atKitchen: Trip = {
    ...trip,
    step: 'AT_KITCHEN',
    arrivedKitchenAt: new Date(NOW - 60_000).toISOString(),
    chefReadyAt: new Date(NOW - 120_000).toISOString(),
  };
  const freeWait = () => tree.root.findByProps({testID: 'rider-free-wait'});

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
  });

  it('shows the order code big, on one line, spelled out for TalkBack', async () => {
    await render({...atKitchen, orderCode: '#0BDE0101'});
    const code = tree.root.findByProps({testID: 'rider-order-code'});
    expect(code.props.children).toBe('#0BDE0101');
    expect(code.props.numberOfLines).toBe(1);
    expect(code.props.adjustsFontSizeToFit).toBe(true);
    expect(code.props.accessibilityLabel).toBe('Order code # 0 B D E 0 1 0 1');
    expect(allText()).toContain("Match this code with the chef's screen");
    expect(allText()).toContain("2 items from Lakshmi's Kitchen");
    expect(tree.root.findByProps({testID: 'rider-step-bar'}).props.accessibilityLabel).toBe('Trip step 2 of 4');
  });

  it('shows the sealed tick only when the chef sealed the bag', async () => {
    await render(atKitchen);
    expect(allText()).toContain('Chef marked the bag sealed');
    act(() => tree.unmount());
    await render({...atKitchen, sealed: false});
    expect(has('rider-sealed')).toBe(false);
  });

  it('counts the free wait from arrival, then says waiting is paid at the server rate', async () => {
    await render(atKitchen);
    expect(freeWait().props.children).toBe('Free waiting ends in 7:00');
    expect(freeWait().props.accessibilityLabel).toBe('Free waiting ends in about 7 minutes');
    expect(allText()).toContain(
      'Then you get ₹1.50 a minute until the chef hands over. The timer started when you arrived.',
    );
    act(() => jest.advanceTimersByTime(61_000));
    expect(freeWait().props.children).toBe('Free waiting ends in 5:59');
    act(() => jest.advanceTimersByTime(6 * 60_000));
    expect(freeWait().props.children).toBe('Waiting pay has started');
    expect(allText()).toContain('You get ₹1.50 a minute until the chef hands over.');
  });

  it('starts the free wait when the food is ready if that came after arrival', async () => {
    await render({...atKitchen, chefReadyAt: new Date(NOW).toISOString(), waitPayPerMinutePaise: undefined});
    expect(freeWait().props.children).toBe('Free waiting ends in 8:00');
    expect(allText()).toContain('Then waiting is paid until the chef hands over. The timer started when the food was ready.');
  });

  it('waits for the chef before the free wait starts', async () => {
    await render({...atKitchen, chefReadyAt: undefined});
    expect(freeWait().props.children).toBe('Free waiting starts when the food is ready');
  });

  it('tells ops the food is late once, and moves on with Picked up', async () => {
    await render(atKitchen);
    await press('rider-food-not-ready');
    expect(tripQueue.enqueue).toHaveBeenCalledWith(expect.objectContaining({action: 'food-not-ready'}));
    expect(byId('rider-food-not-ready').props.disabled).toBe(true);
    expect(allText()).toContain('Ops and the chef know.');
    await press('rider-picked-up');
    expect(tripQueue.enqueue).toHaveBeenCalledWith(expect.objectContaining({action: 'picked-up'}));
  });

  it('keeps Food not ready available when the server refused it', async () => {
    (tripQueue.enqueue as jest.Mock).mockResolvedValueOnce({kind: 'rejected', code: 'STEP_CONFLICT', message: 'Moved on'});
    await render(atKitchen);
    await press('rider-food-not-ready');
    expect(byId('rider-food-not-ready').props.disabled).toBeFalsy();
  });
});

describe('Trip: to the customer (step 3)', () => {
  const toCustomer: Trip = {...trip, step: 'PICKED_UP'};

  it('shows the customer, the order and the no-deadline note, never a time', async () => {
    await render(toCustomer);
    const text = allText();
    expect(text).toContain('Go to the customer');
    expect(text).toContain('Deliver to');
    expect(text).toContain('Anil');
    expect(text).toContain('Flat 302, Sai Residency, Kothaguda, Kondapur');
    expect(text).toContain('Landmark: opposite Botanical Garden gate');
    expect(text).toContain('2, in a sealed bag');
    expect(text).not.toContain('₹67'); // no pay row on this step
    expect(text).toContain("Ride at your own pace. There's no delivery deadline on this screen");
    expect(text).not.toMatch(/\d{1,2}:\d{2}\s?(am|pm)/); // no promised time anywhere
    expect(tree.root.findByProps({testID: 'rider-step-bar'}).props.accessibilityLabel).toBe('Trip step 3 of 4');
  });

  it('calls the customer, navigates, and reports arrival', async () => {
    await render(toCustomer);
    await press('rider-call-customer');
    expect(Linking.openURL).toHaveBeenCalledWith('tel:+913333333333');
    await press('rider-navigate');
    expect(Linking.openURL).toHaveBeenCalledWith('google.navigation:q=17.4615,78.3657&mode=l');
    await press('rider-reached-customer');
    expect(tripQueue.enqueue).toHaveBeenCalledWith(expect.objectContaining({action: 'arrived-drop'}));
  });
});
