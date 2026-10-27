import React from 'react';
import {Alert, BackHandler, Linking, Text, TextInput} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import renderer, {act} from 'react-test-renderer';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {AppApiError} from '../../../core/http/apiError';
import type {HomeSummary, RiderMe, Trip} from '../api/contract';
import {riderApi} from '../api/riderApi';
import {riderDevice} from '../native/riderDevice';
import {RiderShellContext} from '../navigation';
import {riderKeys} from '../state/riderQueries';
import {tripQueue} from '../state/tripQueue';
import {RiderRuntime} from '../components/RiderRuntime';
import {TripScreen} from './TripScreen';

const mockNavigation = {navigate: jest.fn(), goBack: jest.fn(), replace: jest.fn(), popTo: jest.fn()};
// Offline, the queue keeps what the screen sends; the screen shows the step those entries lead to (P1-06).
const mockPending = {offline: false, entries: [] as {action: string; tripId: string}[], listeners: new Set<() => void>()};
function mockSetEntries(entries: {action: string; tripId: string}[]) {
  mockPending.entries = entries;
  mockPending.listeners.forEach(listener => listener());
}

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
const mockRefusals: {list: {tripId: string; code: string; message: string}[]} = {list: []};
jest.mock('../state/tripQueue', () => {
  const {useSyncExternalStore} = require('react');
  const subscribe = (listener: () => void) => {
    mockPending.listeners.add(listener);
    return () => mockPending.listeners.delete(listener);
  };
  return {
    tripQueue: {
      enqueue: jest.fn(async (entry: {action: string; tripId: string}) => {
        if (mockPending.offline) {
          mockSetEntries([...mockPending.entries, entry]);
        }
        return {kind: 'queued'};
      }),
      onRejected: jest.fn((listener: RejectListener) => {
        mockRejected.add(listener);
        return () => mockRejected.delete(listener);
      }),
      onSent: () => () => undefined,
      flush: jest.fn(async () => new Map()),
      dismissRefusal: jest.fn(async () => undefined),
    },
    useRefusals: (_riderId: string, tripId?: string) => mockRefusals.list.filter(r => tripId === undefined || r.tripId === tripId),
    usePendingEntries: () => useSyncExternalStore(subscribe, () => mockPending.entries),
    usePendingActions: () => useSyncExternalStore(subscribe, () => mockPending.entries.length),
  };
});
jest.mock('../native/riderOnlineService', () => ({
  riderOnlineService: {
    lastFix: () => mockFix.value,
    onOffer: () => () => undefined,
    onTripChanged: () => () => undefined,
    onStatus: () => () => undefined,
    fcmToken: async () => null,
    onFcmToken: () => () => undefined,
    pendingOffer: async () => null,
  },
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
  mockPending.offline = false;
  mockPending.entries = [];
  mockRefusals.list = [];
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

  it('opens on the step the queued steps lead to, after a restart while offline (blueprint A3)', async () => {
    mockSetEntries([
      {action: 'arrived-pickup', tripId: 't1'},
      {action: 'picked-up', tripId: 't1'},
    ]);
    await render(trip);
    expect(has('rider-reached-customer')).toBe(true);
    expect(allText()).toContain('Saved · will sync');
  });

  it("keeps this trip's refused step on screen with the server's reason until dismissed (P1-08)", async () => {
    mockRefusals.list = [
      {tripId: 't1', code: 'STEP_CONFLICT', message: 'Ops moved this trip on. Check the step below.'},
      {tripId: 't9', code: 'TRIP_NOT_ACTIVE', message: 'Another trip ended.'},
    ];
    await render(trip);
    expect(allText()).toContain("A trip step didn't go through | Ops moved this trip on. Check the step below.");
    expect(allText()).not.toContain('Another trip ended.');
    await press('rider-refusal-call');
    expect(Linking.openURL).toHaveBeenCalledWith('tel:+911111111111');
    await press('rider-refusal-dismiss');
    expect(tripQueue.dismissRefusal).toHaveBeenCalledWith('t1');
  });

  it('moves to the kitchen step at once and says it will sync when offline', async () => {
    await render(trip);
    mockPending.offline = true;
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

describe('Trip: deliver with the OTP (step 4)', () => {
  const atDrop: Trip = {...trip, step: 'AT_DROP', version: 4};
  const nearFix = {lat: 17.4615, lng: 78.3657, accuracyM: 10, at: '2026-10-20T13:00:00Z'};
  const otpInput = () => tree.root.findByType(TextInput);
  const typeOtp = (value: string) => act(async () => otpInput().props.onChangeText(value));
  // Like the real queue: listeners hear the refusal before enqueue resolves.
  const refuse = (info: {code: string; message: string; attemptsLeft?: number}) =>
    (tripQueue.enqueue as jest.Mock).mockImplementationOnce(async (entry: {tripId: string; action: string}) => {
      mockRejected.forEach(listener => listener(entry, info));
      return {kind: 'rejected', ...info};
    });

  it('asks for the OTP in four boxes and keeps Delivered locked until all 4 digits', async () => {
    mockFix.value = nearFix;
    await render(atDrop);
    const text = allText();
    expect(text).toContain('At the customer');
    expect(text).toContain('Flat 302, Sai Residency, Kothaguda, Kondapur');
    expect(text).toContain('Near drop point');
    expect(text).toContain('Ask Anil for the 4-digit OTP');
    expect(text).toContain('Use only the OTP Anil reads to you at the door. Craves never asks for it on a call.');
    expect(tree.root.findByProps({testID: 'rider-step-bar'}).props.accessibilityLabel).toBe('Trip step 4 of 4');
    expect(byId('rider-delivered').props.disabled).toBe(true);
    await typeOtp('471');
    expect(byId('rider-delivered').props.disabled).toBe(true);
    await typeOtp('4719');
    expect(byId('rider-delivered').props.disabled).toBe(false);
    await press('rider-delivered');
    expect(tripQueue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({action: 'delivered', body: expect.objectContaining({method: 'OTP', otp: '4719', fix: nearFix})}),
    );
  });

  it('says how far the drop point is, or nothing without a GPS fix', async () => {
    mockFix.value = {...nearFix, lat: 17.4483, lng: 78.3915};
    await render(atDrop);
    expect(allText()).toMatch(/Far from drop point · \d+\.\d km/);
    act(() => tree.unmount());
    mockFix.value = null;
    await render(atDrop);
    expect(allText()).not.toContain('drop point');
  });

  it('shows a wrong code inline with the tries left, clears the boxes and never alerts', async () => {
    refuse({code: 'OTP_INVALID', message: "That OTP didn't match.", attemptsLeft: 4});
    await render(atDrop);
    await typeOtp('9999');
    await press('rider-delivered');
    expect(allText()).toContain('Wrong code. 4 tries left.');
    expect(otpInput().props.value).toBe('');
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(has('rider-deliver')).toBe(true);
  });

  it('after the lock shows the server message and sends the rider to the photo steps', async () => {
    refuse({code: 'OTP_LOCKED', message: 'Too many wrong OTPs. Use the photo option; ops will check it.'});
    await render(atDrop);
    await typeOtp('9999');
    await press('rider-delivered');
    expect(allText()).toContain('Too many wrong OTPs. Use the photo option; ops will check it.');
    expect(otpInput().props.editable).toBe(false);
    expect(has('rider-delivered')).toBe(false);
    expect(has('rider-unreachable')).toBe(false);
    await press('rider-photo-route');
    expect(allText()).toContain('Take a photo and leave the order');
  });

  it('shows a refusal of a code that was replayed after going offline', async () => {
    await render(atDrop);
    act(() => {
      mockRejected.forEach(listener => listener({tripId: 'other', action: 'delivered'}, {code: 'OTP_INVALID', message: 'x', attemptsLeft: 1}));
    });
    expect(allText()).not.toContain('Wrong code.');
    act(() => {
      mockRejected.forEach(listener => listener({tripId: 't1', action: 'delivered'}, {code: 'OTP_INVALID', message: 'x', attemptsLeft: 2}));
    });
    expect(allText()).toContain('Wrong code. 2 tries left.');
  });

  it('says the delivery is saved and the rider can go when the OTP waits offline (P1-05)', async () => {
    await render(atDrop);
    mockPending.offline = true;
    await typeOtp('4719');
    await press('rider-delivered');
    expect(allText()).toContain("Delivery saved | We'll check the code when you're back online. You can go.");
    expect(allText()).toContain('Saved · will sync');
    expect(allText()).not.toContain('Trip complete');
  });

  it('calls the customer from the door', async () => {
    await render(atDrop);
    await press('rider-call-customer');
    expect(Linking.openURL).toHaveBeenCalledWith('tel:+913333333333');
  });
});

describe('RiderRuntime', () => {
  it('never alerts a refusal: the trip refreshes and the screens keep the notice (P1-08)', async () => {
    await act(async () => {
      tree = renderer.create(
        <QueryClientProvider client={new QueryClient()}>
          <RiderRuntime riderId="r1" openOffer={jest.fn()} />
        </QueryClientProvider>,
      );
    });
    act(() => mockRejected.forEach(listener => listener({tripId: 't1'}, {code: 'OTP_INVALID', message: 'Wrong'})));
    act(() => mockRejected.forEach(listener => listener({tripId: 't1'}, {code: 'OTP_LOCKED', message: 'Locked'})));
    expect(Alert.alert).not.toHaveBeenCalled();
    act(() => mockRejected.forEach(listener => listener({tripId: 't1'}, {code: 'TRIP_NOT_ACTIVE', message: 'Ended'})));
    expect(Alert.alert).not.toHaveBeenCalled();
  });
});

describe('Trip: customer not answering', () => {
  const atDrop: Trip = {...trip, step: 'AT_DROP', version: 4};
  const NOW = Date.parse('2026-10-20T13:00:00Z');

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
  });

  async function openSteps() {
    await render(atDrop);
    await press('rider-unreachable');
  }

  it('shows the paid-either-way steps with the photo locked', async () => {
    await openSteps();
    const text = allText();
    expect(text).toContain('Customer not answering');
    expect(text).toContain("Follow these steps and you're paid for this trip either way.");
    expect(text).toContain('Call Anil');
    expect(text).toContain('Unlocks when the timer ends');
    expect(text).toContain('Anil gets it straight away, with a button to say it didn');
    expect(text).toContain('Not safe to leave it?');
    expect(has('rider-step-bar')).toBe(false);
    expect(byId('rider-leave-photo').props.disabled).toBe(true);
    expect(has('rider-fail')).toBe(false);
    expect(byId('rider-call-2')).toBeUndefined(); // "Call again" waits for the first call
  });

  it('records each call, waits at the door, then unlocks the photo', async () => {
    await openSteps();
    await press('rider-call-1');
    expect(Linking.openURL).toHaveBeenCalledWith('tel:+913333333333');
    expect(allText()).toMatch(/\d{1,2}:\d{2} (am|pm), no answer/);
    await act(async () => {
      jest.advanceTimersByTime(2 * 60_000);
    });
    await press('rider-call-2');
    expect(tree.root.findByProps({testID: 'rider-door-wait-left'}).props.children).toBe('8:00');
    expect(byId('rider-leave-photo').props.disabled).toBe(true);
    await act(async () => {
      jest.advanceTimersByTime(5 * 60_000 + 42_000);
    });
    expect(tree.root.findByProps({testID: 'rider-door-wait-left'}).props.children).toBe('2:18');
    await act(async () => {
      jest.advanceTimersByTime(2 * 60_000 + 18_000);
    });
    expect(byId('rider-leave-photo').props.disabled).toBe(false);
    expect(allText()).toContain('You can leave the order now');
    // The queue gets the copy kept in the app's files, not the camera's cache file (P1-07).
    const keep = jest.spyOn(riderDevice, 'keepPhoto').mockResolvedValue('file:///files/rider-photos/kept.jpg');
    await press('rider-leave-photo');
    expect(keep).toHaveBeenCalledWith('file:///photo.jpg');
    expect(tripQueue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'delivered',
        body: expect.objectContaining({method: 'PHOTO', photoUri: 'file:///files/rider-photos/kept.jpg', callsMade: 2}),
      }),
    );
    keep.mockRestore();
  });

  it('counts a call made from the OTP screen as the first call', async () => {
    await render(atDrop);
    await press('rider-call-customer');
    await press('rider-unreachable');
    expect(allText()).toMatch(/no answer/);
    expect(byId('rider-call-2')).toBeDefined();
  });

  async function unlock() {
    await openSteps();
    await press('rider-call-1');
    await press('rider-call-2');
    await act(async () => {
      jest.advanceTimersByTime(8 * 60_000);
    });
  }

  it('explains how to allow the camera when it was denied', async () => {
    (ImagePicker.requestCameraPermissionsAsync as jest.Mock).mockResolvedValueOnce({granted: false});
    jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
    await unlock();
    await press('rider-leave-photo');
    expect(allText()).toContain('Allow the camera to take the photo.');
    expect(tripQueue.enqueue).not.toHaveBeenCalled();
    await press('rider-open-settings');
    expect(Linking.openSettings).toHaveBeenCalled();
  });

  it('marks the trip failed with a reason, after asking', async () => {
    await unlock();
    expect(byId('rider-mark-failed').props.disabled).toBe(true);
    await press('rider-fail-WRONG_ADDRESS');
    await press('rider-mark-failed');
    const buttons = (Alert.alert as jest.Mock).mock.calls[0][2] as Array<{style?: string; onPress?: () => void}>;
    expect(tripQueue.enqueue).not.toHaveBeenCalled();
    await act(async () => buttons.find(button => button.style === 'destructive')?.onPress?.());
    expect(tripQueue.enqueue).toHaveBeenCalledWith(expect.objectContaining({action: 'failed', body: {reason: 'WRONG_ADDRESS'}}));
  });

  it('goes back to the OTP boxes when the customer comes out, or on system Back', async () => {
    const back = jest.spyOn(BackHandler, 'addEventListener');
    await openSteps();
    await press('rider-came-out');
    expect(has('rider-deliver')).toBe(true);
    await press('rider-unreachable');
    const handler = back.mock.calls[back.mock.calls.length - 1][1] as () => boolean;
    let handled = false;
    await act(async () => {
      handled = handler();
    });
    expect(handled).toBe(true);
    expect(has('rider-deliver')).toBe(true);
  });

  it('drops "enter the OTP" once the OTP is locked', async () => {
    await render(atDrop);
    await act(async () => {
      mockRejected.forEach(listener => listener({tripId: 't1', action: 'delivered'}, {code: 'OTP_LOCKED', message: 'Locked'}));
    });
    await press('rider-photo-route');
    expect(has('rider-not-answering')).toBe(true);
    expect(has('rider-came-out')).toBe(false);
  });

  it('opens the photo at once after the OTP lock, without the calls or the wait', async () => {
    await render(atDrop);
    await act(async () => {
      mockRejected.forEach(listener => listener({tripId: 't1', action: 'delivered'}, {code: 'OTP_LOCKED', message: 'Locked'}));
    });
    await press('rider-photo-route');
    expect(byId('rider-leave-photo').props.disabled).toBe(false);
    expect(allText()).toContain('You can leave the order now');
    await press('rider-leave-photo');
    expect(tripQueue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({action: 'delivered', body: expect.objectContaining({method: 'PHOTO', callsMade: 0})}),
    );
  });
});

describe('Trip: complete, failed and cancelled', () => {
  const lines = [
    {label: 'Base pay, first 2 km', amountPaise: 4000},
    {label: 'Drop distance, 2.0 km more at ₹9', amountPaise: 1800},
    {label: 'Ride to the kitchen, 1.0 km at ₹9', amountPaise: 900},
  ];
  const delivered: Trip = {...trip, step: 'DELIVERED', payLines: lines};

  it('shows what was earned, with the lines from the server, and today so far', async () => {
    await render(delivered);
    const text = allText();
    expect(text).toContain('Trip complete');
    expect(text).toMatch(/CR-4107 delivered to Anil at \d{1,2}:\d{2} (am|pm)/);
    expect(tree.root.findByProps({testID: 'rider-earned'}).props.paise).toBe(6700);
    expect(text).toContain('₹67');
    expect(text).toContain('Drop distance, 2.0 km more at ₹9 | ₹18');
    expect(text).toContain('Credited now. You can withdraw it 24 hours from now.');
    expect(text).toContain('₹414');
    expect(text).toContain('6 trips');
    expect(has('rider-step-bar')).toBe(false);
  });

  it('shows the order code exactly as the server sends it', async () => {
    await render({...delivered, orderCode: '#0BDE0101'});
    expect(allText()).toMatch(/\| #0BDE0101 delivered to Anil at /);
  });

  it('reports a problem on this trip and goes back to waiting', async () => {
    await render(delivered);
    await press('rider-report');
    expect(mockNavigation.navigate).toHaveBeenCalledWith('TripDetail', {tripId: 't1'});
    await press('rider-back-to-waiting');
    expect(mockNavigation.popTo).toHaveBeenCalledWith('Tabs');
    expect(client.getQueryData(riderKeys.activeTrip)).toBeNull();
  });

  it('while offline says it will sync and holds the credited note and today', async () => {
    await render({...trip, step: 'AT_DROP'});
    mockPending.offline = true;
    await act(async () => tree.root.findByType(TextInput).props.onChangeText('4719'));
    await press('rider-delivered');
    const text = allText();
    expect(text).toContain('Delivery saved');
    expect(text).toContain('Saved · will sync');
    expect(text).toContain('Pay details appear once this syncs.');
    expect(text).not.toContain('Credited now');
    expect(text).not.toContain('₹414');
  });

  it('says a photo delivery is paid after ops checks the photo', async () => {
    jest.useFakeTimers();
    await render({...trip, step: 'AT_DROP'});
    await press('rider-unreachable');
    await press('rider-call-1');
    await press('rider-call-2');
    await act(async () => {
      jest.advanceTimersByTime(8 * 60_000);
    });
    (tripQueue.enqueue as jest.Mock).mockResolvedValueOnce({kind: 'sent', trip: delivered});
    await press('rider-leave-photo');
    expect(allText()).toContain('Pay for a photo delivery is released after ops checks the photo.');
    expect(allText()).not.toContain('Credited now');
  });

  it('shows a failed delivery in the same layout, with the reason and the held pay', async () => {
    await render({...delivered, step: 'FAILED', cancelReason: 'WRONG_ADDRESS'});
    const text = allText();
    expect(text).toContain('Delivery not completed');
    expect(text).toContain('Wrong address');
    expect(text).toContain('₹67');
    expect(text).toContain('Ops checks what happened before this pay is released.');
  });

  it('shows a cancelled trip with the step the server refused while offline', async () => {
    mockRefusals.list = [{tripId: 't1', code: 'TRIP_NOT_ACTIVE', message: 'This trip has ended. Check Home for your next order.'}];
    await render({...trip, step: 'CANCELLED'});
    expect(allText()).toContain('Trip cancelled');
    expect(allText()).toContain("A trip step didn't go through | This trip has ended. Check Home for your next order.");
    expect(has('rider-refusal-dismiss')).toBe(true);
  });

  it('shows a cancelled trip with the reason and no made-up total', async () => {
    await render({...trip, step: 'CANCELLED', cancelReason: 'The chef cancelled this order.'});
    const text = allText();
    expect(text).toContain('Trip cancelled');
    expect(text).toContain('The chef cancelled this order.');
    expect(has('rider-earned')).toBe(false);
    expect(text).not.toContain('You earned');
  });
});
