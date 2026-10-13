import React from 'react';
import renderer, {act, type ReactTestInstance} from 'react-test-renderer';
import {FlatList, Modal, StyleSheet, Text} from 'react-native';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {AppApiError} from '../../../core/http/apiError';
import type {ChefOperationalOrder} from '../../chefShell/api/chefOperationalApi';
import type {ChefScheduledOrder} from '../../chefScheduledOrders/api/chefScheduledOrdersApi';
import {ChefToastProvider} from '../../chefShell/components/ui';
import {chefHandedOverRoute} from '../state/useChefHandedOver';
import {ChefOrdersScreen} from './ChefOrdersScreen';

const mockNavigation = {navigate: jest.fn(), replace: jest.fn(), push: jest.fn(), goBack: jest.fn()};
let mockRouteName = 'ChefOrdersNew';
let mockOperational: Record<string, unknown>;
let mockQueue: Record<string, unknown>;
const mockRefresh = jest.fn(async () => undefined);
const mockReconcile = jest.fn();
const mockApi = {
  getOrder: jest.fn(),
  acceptOrder: jest.fn(),
  rejectOrder: jest.fn(),
  markReadyForPickup: jest.fn(),
  handedOver: jest.fn(),
  createCase: jest.fn(),
};

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNavigation,
  useRoute: () => ({name: mockRouteName}),
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: require('react-native').View,
  useSafeAreaInsets: () => ({top: 0, right: 0, bottom: 34, left: 0}),
}));
jest.mock('../../../design/reducedMotion', () => ({useReducedMotionPreference: () => false}));
jest.mock('../../../app/store/hooks', () => ({useAppSelector: () => 'user-1'}));
jest.mock('../../chefShell/state/ChefOperationalProvider', () => ({
  useChefOperationalState: () => mockOperational,
}));
jest.mock('../api/chefOrderDetailApi', () => ({
  ...jest.requireActual('../api/chefOrderDetailApi'),
  chefOrderDetailApi: {
    getOrder: (...args: unknown[]) => mockApi.getOrder(...args),
    acceptOrder: (...args: unknown[]) => mockApi.acceptOrder(...args),
    rejectOrder: (...args: unknown[]) => mockApi.rejectOrder(...args),
    markReadyForPickup: (...args: unknown[]) => mockApi.markReadyForPickup(...args),
    handedOver: (...args: unknown[]) => mockApi.handedOver(...args),
  },
}));
jest.mock('../../chefMenu/api/chefMenuApi', () => ({chefMenuApi: {listItems: jest.fn(async () => [])}}));
jest.mock('../../chefSupport/api/chefSupportCasesApi', () => ({
  ...jest.requireActual('../../chefSupport/api/chefSupportCasesApi'),
  chefSupportCasesApi: {create: (...args: unknown[]) => mockApi.createCase(...args)},
}));
jest.mock('../state/useChefMenuPrepTimes', () => ({
  useChefMenuPrepTimes: () => [{id: '00000000-0000-4000-8000-000000000001', itemName: 'Chicken curry', preparationTimeMinutes: 20}],
}));
jest.mock('../../chefScheduledOrders/query/useChefScheduledOrdersQueue', () => ({
  useChefScheduledOrdersQueue: () => mockQueue,
}));
const mockHistoryRefresh = jest.fn(async () => undefined);
jest.mock('../query/chefOrderHistoryQueries', () => ({
  useChefOrderHistoryQuery: () => ({
    orders: [],
    hasNextPage: false,
    isFetchingNextPage: false,
    loadOlder: jest.fn(),
    refresh: mockHistoryRefresh,
  }),
}));
let mockKitchenCardProps: {cookingCount: number; onChangeHours: () => void} | undefined;
jest.mock('../components/KitchenStatusCard', () => {
  const {Text: MockText} = require('react-native');
  const ReactActual = require('react');
  return {
    KitchenStatusCard: (props: {cookingCount: number; onChangeHours: () => void}) => {
      mockKitchenCardProps = props;
      return ReactActual.createElement(MockText, null, 'KITCHEN CARD');
    },
  };
});

const id = (suffix: string) => `00000000-0000-4000-8000-${suffix.padStart(12, '0')}`;
const NEW_ID = id('df94b');
const NEW_ID_2 = id('9b2e1');
const COOK_ID = id('a21c7');
const READY_ID = id('e7cd');
const ITEM = id('1');
// Every time on screen depends on the clock, so the clock is fixed: Wed 14 Oct 2026, 3:00 PM local time.
const NOW = new Date(2026, 9, 14, 15, 0, 0).getTime();
const minutesAgo = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();
const DATE_ONLY = [
  'hrtime',
  'nextTick',
  'performance',
  'queueMicrotask',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'requestIdleCallback',
  'cancelIdleCallback',
  'setImmediate',
  'clearImmediate',
  'setInterval',
  'clearInterval',
  'setTimeout',
  'clearTimeout',
] as const;

const newOrder: ChefOperationalOrder = {
  id: NEW_ID,
  status: 'CHEF_ACCEPTANCE_PENDING',
  checkoutId: id('c0'),
  createdAt: minutesAgo(2),
  foodSubtotal: 220,
  customerName: 'Priya S.',
  deliverySummary: {areaName: 'KPHB Colony', city: 'Hyderabad'},
  items: [
    {id: ITEM, itemName: 'Chicken curry', quantity: 2, foodType: 'NON_VEG', menuItemId: ITEM},
    {id: id('2'), itemName: 'Lemon rice', quantity: 1, foodType: 'VEG'},
  ],
};
const newOrder2: ChefOperationalOrder = {...newOrder, id: NEW_ID_2, customerName: 'Kiran R.', foodSubtotal: 160, createdAt: minutesAgo(6)};
const cookingOrder: ChefOperationalOrder = {
  id: COOK_ID,
  status: 'PREPARING',
  createdAt: minutesAgo(30),
  updatedAt: minutesAgo(20),
  prepTimeMinutes: 30,
  foodSubtotal: 290,
  customerName: 'Meena V.',
  items: [{id: id('3'), itemName: 'Dum Chicken biriyani', quantity: 1, foodType: 'NON_VEG'}],
};
const readyOrder: ChefOperationalOrder = {
  id: READY_ID,
  status: 'READY_FOR_PICKUP',
  createdAt: minutesAgo(50),
  updatedAt: minutesAgo(10),
  foodSubtotal: 160,
  customerName: 'Arjun M.',
  chefHandedOverAt: null,
  items: [{id: id('4'), itemName: 'Dum Chicken biriyani', quantity: 1}],
};
const rejectedOrder: ChefOperationalOrder = {
  id: id('c3b0d'),
  status: 'CHEF_REJECTED',
  updatedAt: minutesAgo(90),
  foodSubtotal: 130,
  customerName: 'Sana K.',
  items: [{id: id('5'), itemName: 'Chicken Pulavu rice', quantity: 1}],
};
const deliveredOrder: ChefOperationalOrder = {
  id: id('79f4f'),
  status: 'DELIVERED',
  updatedAt: minutesAgo(120),
  foodSubtotal: 48,
  items: [{id: id('6'), itemName: "Ravi's test", quantity: 1}],
};

function detail(orderId: string, status: string, extra: Record<string, unknown> = {}) {
  return {
    id: orderId,
    checkoutId: id('b1'),
    kitchenId: id('b2'),
    kitchenName: 'Kitchen',
    status,
    currency: 'INR',
    foodSubtotal: 220,
    platformFee: 0,
    taxAmount: 11,
    deliveryFee: 40,
    grandTotal: 271,
    chefResponseNote: null,
    prepTimeMinutes: 20,
    deliveryAddress: null,
    items: [],
    createdAt: '2026-10-14T08:00:00.000Z',
    updatedAt: '2026-10-14T08:01:00.000Z',
    ...extra,
  };
}

function scheduledItem(overrides: Partial<ChefScheduledOrder> = {}): ChefScheduledOrder {
  const when = new Date();
  when.setDate(when.getDate() + 1);
  when.setHours(13, 0, 0, 0);
  return {
    scheduleRequestId: id('5a1'),
    checkoutId: id('5a2'),
    orderId: id('7af02'),
    kitchenId: id('5a3'),
    requestedFulfilmentAt: when.toISOString(),
    requestedTimezone: 'Asia/Kolkata',
    scheduleStatus: 'PENDING_CHEF_CONFIRMATION',
    responseStatus: 'PENDING',
    paymentGate: 'PAYMENT_AFTER_ALL_CHEFS_CONFIRM',
    responseNote: null,
    responseVersion: 1,
    respondedAt: null,
    createdAt: minutesAgo(30),
    ...overrides,
  };
}

function baseQueue(overrides: Record<string, unknown> = {}) {
  return {
    unavailable: false,
    sessionRequired: false,
    pending: [],
    confirmed: [],
    status: 'success',
    isRefreshing: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    respondingOrderId: null,
    refresh: jest.fn(async () => undefined),
    loadOlder: jest.fn(async () => undefined),
    respond: jest.fn(async () => undefined),
    ...overrides,
  };
}

function baseOperational(orders: ChefOperationalOrder[], overrides: Record<string, unknown> = {}) {
  return {
    orders,
    ordersStatus: 'success',
    isRefreshing: false,
    refresh: mockRefresh,
    reconcileOrderStatus: mockReconcile,
    counters: {unreadNotifications: 0},
    orderTabs: {prepTimers: {}},
    ...overrides,
  };
}

let tree: renderer.ReactTestRenderer;
const textOf = (node: ReactTestInstance): string =>
  React.Children.toArray(node.props.children)
    .map(child => (typeof child === 'string' || typeof child === 'number' ? String(child) : ''))
    .join('');
const allText = () => tree.root.findAllByType(Text).map(textOf);
const hasText = (text: string | RegExp) => allText().some(value => (typeof text === 'string' ? value === text : text.test(value)));
const isButton = (node: ReactTestInstance, label: string) =>
  node.props.accessibilityLabel === label && typeof node.props.onPress === 'function';
const buttons = (label: string) =>
  tree.root.findAll(node => isButton(node, label) && !(node.parent && isButton(node.parent, label)));
const press = async (label: string) => {
  const target = buttons(label)[0];
  if (!target) throw new Error(`No button labelled "${label}"`);
  await act(async () => {
    await target.props.onPress();
  });
};
/** The chip's own Pressable: a hitSlop would be clipped by the horizontal ScrollView, so its own box must be 48 dp. */
const expectOwn48 = (label: string) => {
  const tap = tree.root.findAll(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function' && node.props.style)[0];
  expect(tap).toBeDefined();
  expect(tap.props.hitSlop).toBeUndefined();
  expect(StyleSheet.flatten(tap.props.style).minHeight).toBeGreaterThanOrEqual(48);
};
const visibleModals = () => tree.root.findAllByType(Modal).filter(modal => modal.props.visible === true);
const mount = async (route = 'ChefOrdersNew') => {
  mockRouteName = route;
  await act(async () => {
    tree = renderer.create(
      <QueryClientProvider client={new QueryClient({defaultOptions: {queries: {retry: false}}})}>
        <ChefToastProvider>
          <ChefOrdersScreen />
        </ChefToastProvider>
      </QueryClientProvider>,
    );
  });
};
const flush = () => act(async () => undefined);

beforeEach(() => {
  jest.clearAllMocks();
  // Only Date is faked: React Query and the screens still use the real timers.
  jest.useFakeTimers({now: NOW, doNotFake: [...DATE_ONLY]});
  chefHandedOverRoute.missing = false;
  mockOperational = baseOperational([newOrder, newOrder2, cookingOrder, readyOrder]);
  mockQueue = baseQueue({pending: [scheduledItem()]});
  mockApi.getOrder.mockImplementation(async (orderId: string) => detail(orderId, 'CHEF_ACCEPTANCE_PENDING'));
  mockApi.acceptOrder.mockImplementation(async (orderId: string) => detail(orderId, 'CHEF_ACCEPTED'));
  mockApi.rejectOrder.mockImplementation(async (orderId: string) => detail(orderId, 'CHEF_REJECTED'));
  mockApi.markReadyForPickup.mockImplementation(async (orderId: string) => detail(orderId, 'READY_FOR_PICKUP'));
  mockApi.handedOver.mockImplementation(async (orderId: string) =>
    detail(orderId, 'READY_FOR_PICKUP', {chefHandedOverAt: '2026-10-14T09:00:00.000Z'}),
  );
  mockApi.createCase.mockResolvedValue({});
});
afterEach(() => {
  act(() => tree?.unmount());
  jest.useRealTimers();
});

describe('Orders: filters', () => {
  it('shows the five filters with their counts, New first and selected', async () => {
    await mount();
    expect(buttons('New, 2 orders')[0].props.accessibilityState).toEqual({selected: true});
    for (const label of ['Preparing, 1 order', 'Ready, 1 order', 'Scheduled, 1 order', 'Past']) {
      expect(buttons(label)).toHaveLength(1);
    }
    expect(buttons('Past')[0].props.accessibilityState).toEqual({selected: false});
  });

  it('switches the list in place: replaces the route, never pushes a page', async () => {
    await mount();
    await press('Preparing, 1 order');
    expect(mockNavigation.replace).toHaveBeenCalledWith('ChefOrdersPreparing');
    await press('Ready, 1 order');
    expect(mockNavigation.replace).toHaveBeenCalledWith('ChefOrdersReady');
    await press('Scheduled, 1 order');
    expect(mockNavigation.replace).toHaveBeenCalledWith('ChefOrdersScheduled');
    await press('Past');
    expect(mockNavigation.replace).toHaveBeenCalledWith('ChefOrdersCompleted');
    expect(mockNavigation.navigate).not.toHaveBeenCalled();
    expect(mockNavigation.push).not.toHaveBeenCalled();
  });

  it('makes every filter chip itself 48 dp tall, not 38 dp with a hit slop the scroll view would clip', async () => {
    await mount();
    for (const label of ['New, 2 orders', 'Preparing, 1 order', 'Ready, 1 order', 'Scheduled, 1 order', 'Past']) {
      expectOwn48(label);
    }
  });

  it('does nothing when the filter that is already on is pressed', async () => {
    await mount();
    await press('New, 2 orders');
    expect(mockNavigation.replace).not.toHaveBeenCalled();
  });

  it.each([
    ['ChefOrdersNew', 'New, 2 orders'],
    ['ChefOrdersPreparing', 'Preparing, 1 order'],
    ['ChefOrdersReady', 'Ready, 1 order'],
    ['ChefOrdersScheduled', 'Scheduled, 1 order'],
    ['ChefOrdersCompleted', 'Past'],
  ])('%s turns on its own filter', async (route, label) => {
    await mount(route);
    expect(buttons(label)[0].props.accessibilityState).toEqual({selected: true});
  });

  it('leaves the Scheduled count off while scheduled orders are not published', async () => {
    mockQueue = baseQueue({unavailable: true});
    await mount();
    expect(buttons('Scheduled')).toHaveLength(1);
  });

  it('shows no Scheduled count, not a 0, while the list loads or when it could not be read', async () => {
    for (const status of ['pending', 'error']) {
      mockQueue = baseQueue({status});
      await mount();
      expect(buttons('Scheduled')).toHaveLength(1);
      expect(buttons('Scheduled, 0 orders')).toHaveLength(0);
      act(() => tree.unmount());
    }
    mockQueue = baseQueue();
    await mount();
    expect(buttons('Scheduled, 0 orders')).toHaveLength(1);
  });
});

describe('Orders: New', () => {
  it('shows each order with customer, area, age, total, dishes and one Accept and Reject', async () => {
    await mount();
    expect(hasText('#DF94B')).toBe(true);
    expect(hasText('#9B2E1')).toBe(true);
    expect(hasText('₹220')).toBe(true);
    expect(hasText(/^Priya S\. · KPHB Colony · 2 min ago$/)).toBe(true);
    expect(buttons('Accept order #DF94B')).toHaveLength(1);
    expect(buttons('Reject order #DF94B')).toHaveLength(1);
    expect(hasText('Accept · 20 min')).toBe(true);
    expect(allText().join(' ')).not.toMatch(/Accept All|NON_VEG/);
  });

  it('puts the longest-waiting order first', async () => {
    await mount();
    const numbers = allText().filter(value => /^#(DF94B|9B2E1)$/.test(value));
    expect(numbers).toEqual(['#9B2E1', '#DF94B']);
  });

  it('shows the response countdown and the customer note only when the order carries them', async () => {
    await mount();
    expect(hasText(/^Respond in/)).toBe(false);
    expect(hasText(/Less spicy/)).toBe(false);
    act(() => tree.unmount());
    mockOperational = baseOperational([
      {...newOrder, chefAcceptanceExpiresAt: new Date(Date.now() + 272_000).toISOString(), customerNote: 'Less spicy please'},
    ]);
    await mount();
    expect(hasText(/^Respond in 4:\d\d$/)).toBe(true);
    expect(hasText('“Less spicy please”')).toBe(true);
  });

  it('opens the order page from the card', async () => {
    await mount();
    await press('Order #DF94B, ₹220, Priya S., 3 items');
    expect(mockNavigation.navigate).toHaveBeenCalledWith('ChefOrderDetail', {orderId: NEW_ID});
  });

  it('accepts once even when Accept is pressed twice, and is disabled while accepting', async () => {
    let finish: (value: unknown) => void = () => undefined;
    mockApi.acceptOrder.mockReturnValueOnce(new Promise(resolve => (finish = resolve)));
    mockOperational = baseOperational([newOrder]);
    await mount();
    const accept = buttons('Accept order #DF94B')[0];
    expect(accept.props.disabled).toBe(false);
    await act(async () => {
      accept.props.onPress();
      accept.props.onPress();
    });
    expect(mockApi.acceptOrder).toHaveBeenCalledTimes(1);
    expect(mockApi.acceptOrder).toHaveBeenCalledWith(NEW_ID, {prepTimeMinutes: 20, note: null}, expect.any(String));
    expect(buttons('Accept order #DF94B')[0].props.disabled).toBe(true);
    expect(buttons('Reject order #DF94B')[0].props.disabled).toBe(true);
    await act(async () => finish(detail(NEW_ID, 'CHEF_ACCEPTED')));
    expect(mockReconcile).toHaveBeenCalledWith(NEW_ID, 'CHEF_ACCEPTED', expect.anything(), 20);
    expect(hasText('Order accepted and moved to Preparing.')).toBe(true);
  });

  it('shows an empty state with the kitchen card when nothing is waiting', async () => {
    mockOperational = baseOperational([cookingOrder]);
    await mount();
    expect(hasText('No new orders')).toBe(true);
    expect(hasText('New orders show up here. Keep the app open while your kitchen is open.')).toBe(true);
    // The app has no new-order sound, so it must not promise one.
    expect(allText().join(' ')).not.toMatch(/sound|hear/i);
    expect(hasText('KITCHEN CARD')).toBe(true);
  });

  it('opens Opening hours with Profile home beneath it, so Back and the Profile tab still work', async () => {
    mockOperational = baseOperational([cookingOrder]);
    await mount();
    act(() => mockKitchenCardProps!.onChangeHours());
    expect(mockNavigation.navigate).toHaveBeenCalledWith('Profile', {screen: 'ChefKitchenSchedule', initial: false});
  });

  it('counts only the orders being cooked for the kitchen card, never the ones already packed and waiting', async () => {
    mockOperational = baseOperational([cookingOrder, {...cookingOrder, id: id('a21c8'), status: 'CHEF_ACCEPTED'}, readyOrder, {...readyOrder, id: id('e7ce')}]);
    await mount();
    expect(mockKitchenCardProps?.cookingCount).toBe(2);
  });

  it('shows a plain loading state, then a retry when the orders cannot be loaded', async () => {
    mockOperational = baseOperational([], {ordersStatus: 'pending'});
    await mount();
    expect(hasText('No new orders')).toBe(false);
    act(() => tree.unmount());
    mockOperational = baseOperational([], {ordersStatus: 'error'});
    await mount();
    expect(hasText("We couldn't load your orders")).toBe(true);
    await press('Try again');
    expect(mockRefresh).toHaveBeenCalled();
  });
});

describe('Orders: Reject', () => {
  const openSheet = async () => {
    await mount();
    await press('Reject order #DF94B');
  };

  it('opens the reasons sheet for that order instead of rejecting straight away', async () => {
    await openSheet();
    expect(visibleModals()).toHaveLength(1);
    expect(hasText('Reject #DF94B?')).toBe(true);
    expect(mockApi.rejectOrder).not.toHaveBeenCalled();
  });

  it('says the customer gets a full refund for a paid order', async () => {
    await openSheet();
    expect(hasText('The customer is told right away and gets a full refund.')).toBe(true);
  });

  it('says where a meal-plan day goes (an order with no checkout), and promises no refund', async () => {
    const mealPlan: ChefOperationalOrder = {...newOrder};
    delete mealPlan.checkoutId;
    mockOperational = baseOperational([mealPlan]);
    await openSheet();
    expect(hasText('The customer is told right away. This meal-plan day moves to the end of their plan.')).toBe(true);
    expect(allText().join(' ')).not.toMatch(/refund/);
  });

  it('stays open while the first rejection is still running, even if Reject is pressed again', async () => {
    let finish: (value: unknown) => void = () => undefined;
    mockApi.rejectOrder.mockReturnValueOnce(new Promise(resolve => (finish = resolve)));
    await openSheet();
    await press('An item is sold out');
    const reject = buttons('Reject order')[0];
    await act(async () => {
      reject.props.onPress();
      reject.props.onPress();
    });
    // The second press gets the hook's own "already in progress" answer, which must not close the sheet.
    expect(mockApi.rejectOrder).toHaveBeenCalledTimes(1);
    expect(visibleModals()).toHaveLength(1);
    await act(async () => finish(detail(NEW_ID, 'CHEF_REJECTED')));
    await flush();
    expect(visibleModals()).toHaveLength(0);
  });

  it('closes the sheet when the order moved on while it was open, and shows the plain status', async () => {
    mockApi.getOrder.mockImplementation(async (orderId: string) => detail(orderId, 'CHEF_REJECTED'));
    await openSheet();
    await press('An item is sold out');
    await press('Reject order');
    await flush();
    expect(mockApi.rejectOrder).not.toHaveBeenCalled();
    expect(visibleModals()).toHaveLength(0);
    expect(hasText('This order is now Rejected. Refreshing the latest status.')).toBe(true);
    expect(allText().join(' ')).not.toMatch(/Chef Rejected/);
  });

  it('needs a reason, and for "Other reason" a note', async () => {
    await openSheet();
    expect(buttons('Reject order')[0].props.disabled).toBe(true);
    await press('Other reason');
    expect(buttons('Reject order')[0].props.disabled).toBe(true);
    await act(async () =>
      tree.root
        .findAll(node => node.props.accessibilityLabel === 'Note for the customer' && node.props.onChangeText)[0]
        .props.onChangeText('Gas ran out'),
    );
    expect(buttons('Reject order')[0].props.disabled).toBe(false);
  });

  it('sends the picked reason as the reject reason, once, and closes the sheet', async () => {
    await openSheet();
    await press('An item is sold out');
    const reject = buttons('Reject order')[0];
    await act(async () => {
      reject.props.onPress();
      reject.props.onPress();
    });
    await flush();
    expect(mockApi.rejectOrder).toHaveBeenCalledTimes(1);
    expect(mockApi.rejectOrder).toHaveBeenCalledWith(NEW_ID, {reason: 'An item is sold out'}, expect.any(String));
    expect(visibleModals()).toHaveLength(0);
  });

  it('Keep order closes the sheet without rejecting', async () => {
    await openSheet();
    await press('Keep order');
    expect(visibleModals()).toHaveLength(0);
    expect(mockApi.rejectOrder).not.toHaveBeenCalled();
  });
});

describe('Orders: Preparing', () => {
  const timer = (overrides: Record<string, unknown> = {}) => ({
    orderId: COOK_ID,
    serverStartedAtMs: Date.now() - 20 * 60_000,
    serverDueAtMs: Date.now() + 10 * 60_000,
    elapsedMs: 20 * 60_000,
    remainingMs: 10 * 60_000,
    isOverdue: false,
    ...overrides,
  });

  it('shows the cooking order with when it was accepted, the time left, Call and Mark ready', async () => {
    mockOperational = baseOperational([cookingOrder], {orderTabs: {prepTimers: {[COOK_ID]: timer()}}});
    await mount('ChefOrdersPreparing');
    expect(hasText('#A21C7')).toBe(true);
    expect(hasText(/^Meena V\. · Accepted 2:40 PM$/)).toBe(true);
    expect(hasText('Ready in 10 min')).toBe(true);
    expect(buttons('Mark #A21C7 ready')).toHaveLength(1);
    expect(buttons('Call customer for #A21C7')).toHaveLength(1);
  });

  it('says how late an overdue order is', async () => {
    mockOperational = baseOperational([cookingOrder], {
      orderTabs: {prepTimers: {[COOK_ID]: timer({isOverdue: true, remainingMs: 0, serverDueAtMs: Date.now() - 5 * 60_000})}},
    });
    await mount('ChefOrdersPreparing');
    expect(hasText('5 min late')).toBe(true);
  });

  it('asks before marking ready, and sends the ready request once even when confirmed twice', async () => {
    mockApi.getOrder.mockImplementation(async (orderId: string) => detail(orderId, 'PREPARING'));
    mockOperational = baseOperational([cookingOrder], {orderTabs: {prepTimers: {}}});
    await mount('ChefOrdersPreparing');
    await press('Mark #A21C7 ready');
    expect(visibleModals()).toHaveLength(1);
    expect(hasText('Is #A21C7 packed and ready?')).toBe(true);
    expect(hasText('1 × Dum Chicken biriyani. The delivery partner is told to pick it up.')).toBe(true);
    expect(mockApi.markReadyForPickup).not.toHaveBeenCalled();

    const confirm = buttons("Yes, it's ready")[0];
    await act(async () => {
      confirm.props.onPress();
      confirm.props.onPress();
    });
    await flush();
    expect(mockApi.markReadyForPickup).toHaveBeenCalledTimes(1);
    expect(mockApi.markReadyForPickup).toHaveBeenCalledWith(COOK_ID);
    expect(visibleModals()).toHaveLength(0);
  });

  it('Not yet closes the dialog without marking ready', async () => {
    mockOperational = baseOperational([cookingOrder]);
    await mount('ChefOrdersPreparing');
    await press('Mark #A21C7 ready');
    await press('Not yet');
    expect(visibleModals()).toHaveLength(0);
    expect(mockApi.markReadyForPickup).not.toHaveBeenCalled();
  });

  it('shows an empty state with one next action', async () => {
    mockOperational = baseOperational([newOrder]);
    await mount('ChefOrdersPreparing');
    expect(hasText('Nothing cooking')).toBe(true);
    await press('See new orders');
    expect(mockNavigation.replace).toHaveBeenCalledWith('ChefOrdersNew');
  });
});

describe('Orders: Ready', () => {
  it('shows the waiting partner line and the safety tip, and both buttons when the server supports hand-over', async () => {
    await mount('ChefOrdersReady');
    expect(hasText('#0E7CD')).toBe(true);
    expect(hasText('Ready')).toBe(true);
    expect(hasText(/^Arjun M\. · Ready since 2:50 PM$/)).toBe(true);
    expect(hasText('Waiting for a delivery partner')).toBe(true);
    expect(hasText('Hand the bag only to the partner shown here. Check the order number on the bag.')).toBe(true);
    expect(buttons('Not picked up #0E7CD')).toHaveLength(1);
    expect(buttons('Handed over #0E7CD')).toHaveLength(1);
  });

  it('shows the courier, the arrival time and a call button when the server sends them', async () => {
    mockOperational = baseOperational([
      {
        ...readyOrder,
        deliveryPartner: {name: 'Suresh', phone: '+919999999999', photoUrl: null, pickupEtaAt: new Date(Date.now() + 4 * 60_000).toISOString()},
      },
    ]);
    await mount('ChefOrdersReady');
    expect(hasText('Suresh · Craves delivery')).toBe(true);
    expect(hasText(/^Arriving in [34] min$/)).toBe(true);
    expect(buttons('Call Suresh')).toHaveLength(1);
    expect(hasText('Waiting for a delivery partner')).toBe(false);
  });

  it('hides Handed over unless the order reports a hand-over that is still to do', async () => {
    const withoutField: ChefOperationalOrder = {...readyOrder};
    delete withoutField.chefHandedOverAt;
    mockOperational = baseOperational([withoutField]);
    await mount('ChefOrdersReady');
    expect(buttons('Handed over #0E7CD')).toHaveLength(0);
    expect(buttons('Not picked up #0E7CD')).toHaveLength(1);
    act(() => tree.unmount());
    mockOperational = baseOperational([{...readyOrder, chefHandedOverAt: '2026-10-14T09:00:00.000Z'}]);
    await mount('ChefOrdersReady');
    expect(buttons('Handed over #0E7CD')).toHaveLength(0);
  });

  it('shows Handed over only on the order whose field is present and null, not on one that does not carry it', async () => {
    const noField: ChefOperationalOrder = {...readyOrder, id: id('e7ce')};
    delete noField.chefHandedOverAt;
    mockOperational = baseOperational([readyOrder, noField]);
    await mount('ChefOrdersReady');
    expect(buttons('Handed over #0E7CD')).toHaveLength(1);
    expect(buttons('Handed over #0E7CE')).toHaveLength(0);
    expect(buttons('Not picked up #0E7CD')).toHaveLength(1);
    expect(buttons('Not picked up #0E7CE')).toHaveLength(1);
  });

  it('posts the hand-over once and hides the button; the order stays Ready', async () => {
    await mount('ChefOrdersReady');
    const handedOver = buttons('Handed over #0E7CD')[0];
    await act(async () => {
      handedOver.props.onPress();
      handedOver.props.onPress();
    });
    await flush();
    expect(mockApi.handedOver).toHaveBeenCalledTimes(1);
    expect(mockApi.handedOver).toHaveBeenCalledWith(READY_ID);
    expect(buttons('Handed over #0E7CD')).toHaveLength(0);
    expect(hasText('Marked as handed over')).toBe(true);
  });

  it('says "Handed over is coming soon." when the server has no such route, and keeps the button instead of hiding it silently', async () => {
    mockApi.handedOver.mockRejectedValueOnce(new AppApiError('HTTP_404', 'nope', 404));
    await mount('ChefOrdersReady');
    await press('Handed over #0E7CD');
    await flush();
    expect(hasText('Handed over is coming soon.')).toBe(true);
    expect(buttons('Handed over #0E7CD')).toHaveLength(1);
    expect(allText().join(' ')).not.toMatch(/nope|couldn't save/);
  });

  it('sends "Not picked up" to support with the order and the reason', async () => {
    await mount('ChefOrdersReady');
    await press('Not picked up #0E7CD');
    expect(hasText('What happened with #0E7CD?')).toBe(true);
    await press('Partner left without the order');
    await press('Send to support');
    await flush();
    expect(mockApi.createCase).toHaveBeenCalledWith({
      contextRole: 'CHEF',
      orderId: READY_ID,
      subject: 'Not picked up · #0E7CD',
      message: 'Partner left without the order',
    });
  });

  it('shows an empty state with one next action', async () => {
    mockOperational = baseOperational([]);
    await mount('ChefOrdersReady');
    expect(hasText('Nothing waiting for pickup')).toBe(true);
    expect(buttons('See new orders')).toHaveLength(1);
  });
});

describe('Orders: an order left in Ready for over a day', () => {
  const forgotten: ChefOperationalOrder = {...readyOrder, id: id('f0f0f'), updatedAt: minutesAgo(30 * 60), foodSubtotal: 175};

  it('leaves Ready and its count', async () => {
    mockOperational = baseOperational([forgotten, readyOrder]);
    await mount('ChefOrdersReady');
    expect(buttons('Ready, 1 order')).toHaveLength(1);
    expect(hasText('#F0F0F')).toBe(false);
    expect(hasText('#0E7CD')).toBe(true);
  });

  it('shows in Past with the chip "Not picked up"', async () => {
    mockOperational = baseOperational([forgotten, deliveredOrder]);
    await mount('ChefOrdersCompleted');
    expect(hasText('#F0F0F · ₹175')).toBe(true);
    expect(hasText('Not picked up')).toBe(true);
    expect(hasText('Delivered')).toBe(true);
    await press('Delivered');
    expect(hasText('#F0F0F · ₹175')).toBe(false);
    await press('All');
    expect(hasText('#F0F0F · ₹175')).toBe(true);
  });
});

describe('Orders: Scheduled', () => {
  it('shows Coming soon, not an error, when scheduled orders are not published', async () => {
    mockQueue = baseQueue({unavailable: true});
    await mount('ChefOrdersScheduled');
    expect(hasText('Scheduled orders are coming soon')).toBe(true);
    expect(hasText('Coming soon')).toBe(true);
    expect(hasText(/couldn't load|Try again/)).toBe(false);
  });

  it('shows the time as the main line, the order and what the customer pays', async () => {
    await mount('ChefOrdersScheduled');
    expect(hasText('Waiting for you to confirm')).toBe(true);
    expect(hasText(/^Tomorrow, 1:00 PM$/)).toBe(true);
    expect(hasText('#7AF02')).toBe(true);
    expect(hasText('Customer pays when you confirm.')).toBe(true);
    expect(buttons('Decline scheduled order #7AF02')).toHaveLength(1);
  });

  it('says the customer has already paid when payment came first', async () => {
    mockQueue = baseQueue({pending: [scheduledItem({paymentGate: 'PAYMENT_BEFORE_CHEF_CONFIRMATION'})]});
    await mount('ChefOrdersScheduled');
    expect(hasText('Customer has already paid.')).toBe(true);
  });

  it('asks before confirming, then confirms the request', async () => {
    const item = scheduledItem();
    const respond = jest.fn(async () => undefined);
    mockQueue = baseQueue({pending: [item], respond});
    await mount('ChefOrdersScheduled');
    await press('Confirm scheduled order #7AF02');
    expect(hasText('Confirm for tomorrow, 1:00 PM?')).toBe(true);
    expect(respond).not.toHaveBeenCalled();
    await press('Confirm');
    expect(respond).toHaveBeenCalledTimes(1);
    expect(respond).toHaveBeenCalledWith(item, 'ACCEPT', undefined);
  });

  it('leaves the dialog alone when the answer was already on its way (a second press)', async () => {
    const respond = jest.fn(async () => false);
    mockQueue = baseQueue({pending: [scheduledItem()], respond});
    await mount('ChefOrdersScheduled');
    await press('Confirm scheduled order #7AF02');
    await press('Confirm');
    expect(respond).toHaveBeenCalledTimes(1);
    expect(visibleModals()).toHaveLength(1);
  });

  it('tells a request the customer has not paid for yet that nothing is refunded, and a paid one that it is', async () => {
    mockQueue = baseQueue({pending: [scheduledItem()]});
    await mount('ChefOrdersScheduled');
    await press('Decline scheduled order #7AF02');
    expect(hasText('The customer is told right away.')).toBe(true);
    expect(hasText('The customer is told right away and gets a full refund.')).toBe(false);
    act(() => tree.unmount());
    mockQueue = baseQueue({pending: [scheduledItem({paymentGate: 'PAYMENT_BEFORE_CHEF_CONFIRMATION'})]});
    await mount('ChefOrdersScheduled');
    await press('Decline scheduled order #7AF02');
    expect(hasText('The customer is told right away and gets a full refund.')).toBe(true);
  });

  it('declines with the same reasons sheet as Reject, sending the reason with the response', async () => {
    const item = scheduledItem();
    const respond = jest.fn(async () => undefined);
    mockQueue = baseQueue({pending: [item], respond});
    await mount('ChefOrdersScheduled');
    await press('Decline scheduled order #7AF02');
    expect(hasText('Reject #7AF02?')).toBe(true);
    for (const reason of ['An item is sold out', 'Kitchen is too busy right now', 'Closing soon', "Can't deliver to this area", 'Other reason']) {
      expect(buttons(reason)).toHaveLength(1);
    }
    await press('Kitchen is too busy right now');
    await press('Reject order');
    expect(respond).toHaveBeenCalledWith(item, 'REJECT', 'Kitchen is too busy right now');
  });

  it('lists confirmed requests and opens their order', async () => {
    mockQueue = baseQueue({confirmed: [scheduledItem({orderId: id('41de9'), responseStatus: 'ACCEPTED', scheduleStatus: 'CONFIRMED'})]});
    await mount('ChefOrdersScheduled');
    expect(hasText('Confirmed')).toBe(true);
    await press('Scheduled order #41DE9, Tomorrow, 1:00 PM, confirmed');
    expect(mockNavigation.navigate).toHaveBeenCalledWith('ChefOrderDetail', {orderId: id('41de9')});
  });

  it('shows an empty state with one next action', async () => {
    mockQueue = baseQueue();
    await mount('ChefOrdersScheduled');
    expect(hasText('No scheduled orders')).toBe(true);
    await press('See new orders');
    expect(mockNavigation.replace).toHaveBeenCalledWith('ChefOrdersNew');
  });
});

describe('Orders: Past', () => {
  it('lists a rejected order next to a delivered one, grouped by day with a count and a food total', async () => {
    mockOperational = baseOperational([rejectedOrder, deliveredOrder, newOrder]);
    await mount('ChefOrdersCompleted');
    expect(hasText('Rejected')).toBe(true);
    expect(hasText('Delivered')).toBe(true);
    expect(hasText('#C3B0D · ₹130')).toBe(true);
    expect(hasText(/^Today · 2 orders · ₹48$/)).toBe(true);
    expect(hasText('#DF94B')).toBe(false);
  });

  it('pull to refresh reads the live orders, the scheduled orders and the older history again', async () => {
    mockOperational = baseOperational([rejectedOrder, deliveredOrder]);
    await mount('ChefOrdersCompleted');
    await act(async () => {
      tree.root.findByType(FlatList).props.onRefresh();
    });
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect((mockQueue.refresh as jest.Mock).mock.calls).toHaveLength(1);
    expect(mockHistoryRefresh).toHaveBeenCalledTimes(1);
  });

  it('makes the Past filter chips themselves 48 dp tall', async () => {
    mockOperational = baseOperational([rejectedOrder, deliveredOrder]);
    await mount('ChefOrdersCompleted');
    for (const label of ['All', 'Delivered', 'Rejected']) {
      expectOwn48(label);
    }
  });

  it('filters by Rejected and opens a row', async () => {
    mockOperational = baseOperational([rejectedOrder, deliveredOrder]);
    await mount('ChefOrdersCompleted');
    await press('Rejected');
    expect(hasText('#C3B0D · ₹130')).toBe(true);
    expect(hasText('#79F4F · ₹48')).toBe(false);
    await press('Order #C3B0D, ₹130, Rejected');
    expect(mockNavigation.navigate).toHaveBeenCalledWith('ChefOrderDetail', {orderId: rejectedOrder.id});
  });

  it('shows an empty state with one next action', async () => {
    mockOperational = baseOperational([newOrder]);
    await mount('ChefOrdersCompleted');
    expect(hasText('No past orders yet')).toBe(true);
    await press('See new orders');
    expect(mockNavigation.replace).toHaveBeenCalledWith('ChefOrdersNew');
  });
});
