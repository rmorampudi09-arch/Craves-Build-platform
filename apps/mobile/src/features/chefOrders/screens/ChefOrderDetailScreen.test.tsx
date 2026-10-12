import React from 'react';
import renderer, {act, type ReactTestInstance} from 'react-test-renderer';
import {Linking, Modal, Text} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import type {ChefProductStackParamList} from '../../../app/navigation/types';
import {AppApiError} from '../../../core/http/apiError';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {ChefToastProvider} from '../../chefShell/components/ui';
import {chefHandedOverRoute} from '../state/useChefHandedOver';
import type {ChefOrderDetail} from '../api/chefOrderDetailApi';
import {deriveChefOrderDetailContractModel as mockDeriveChefOrderDetailContractModel} from '../domain/chefOrderDetailModel';
import {ChefOrderDetailScreen} from './ChefOrderDetailScreen';

const ORDER_ID = '00000000-0000-4000-8000-0000000df94b';
const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
const mockAccept = jest.fn(async () => undefined);
const mockReject = jest.fn(async () => undefined);
const mockMarkReady = jest.fn(async () => undefined);
const mockHandedOverApi = jest.fn(async (..._args: unknown[]) => ({}));
const mockReconcile = jest.fn();
const mockRefresh = jest.fn(async () => undefined);
const mockCreateCase = jest.fn(async (..._args: unknown[]) => ({}));
let mockOrder: ChefOrderDetail | null;
let mockDetailState: {status: string; error: Error | null};
let mockDecisionAction: 'accept' | 'reject' | null;

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: require('react-native').View,
  useSafeAreaInsets: () => ({top: 0, right: 0, bottom: 34, left: 0}),
}));
jest.mock('../../../design/reducedMotion', () => ({useReducedMotionPreference: () => false}));
jest.mock('../state/useChefOrderDetailContract', () => ({
  ...jest.requireActual('../state/useChefOrderDetailContract'),
  useChefOrderDetailContract: () => ({
    ...mockDetailState,
    data: mockOrder ? mockDeriveChefOrderDetailContractModel(mockOrder) : null,
    isFetching: false,
    refresh: mockRefresh,
  }),
}));
jest.mock('../state/useChefOrderDecision', () => ({
  useChefOrderDecision: () => ({action: mockDecisionAction, error: null, accept: mockAccept, reject: mockReject, clearError: jest.fn()}),
}));
jest.mock('../state/useChefPreparingOrderActions', () => ({
  useChefPreparingOrderActions: () => ({actionStateByOrder: {}, feedback: null, markReady: mockMarkReady, callCustomer: jest.fn(), clearFeedback: jest.fn()}),
}));
// The real hand-over hook: whether the button shows is part of what this screen must get right.
jest.mock('../api/chefOrderDetailApi', () => ({
  ...jest.requireActual('../api/chefOrderDetailApi'),
  chefOrderDetailApi: {handedOver: (...args: unknown[]) => mockHandedOverApi(...args)},
}));
jest.mock('../../../app/store/hooks', () => ({useAppSelector: () => 'user-1'}));
jest.mock('../../chefShell/state/ChefOperationalProvider', () => ({
  useChefOperationalState: () => ({reconcileOrderStatus: mockReconcile, refresh: jest.fn(async () => undefined)}),
}));
jest.mock('../state/useChefMenuPrepTimes', () => ({useChefMenuPrepTimes: () => []}));
jest.mock('../../chefSupport/api/chefSupportCasesApi', () => ({
  ...jest.requireActual('../../chefSupport/api/chefSupportCasesApi'),
  chefSupportCasesApi: {create: (...args: unknown[]) => mockCreateCase(...args)},
}));

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

function order(status: ChefOrderDetail['status'], extra: Partial<ChefOrderDetail> = {}): ChefOrderDetail {
  return {
    id: ORDER_ID,
    checkoutId: '00000000-0000-4000-8000-00000000c001',
    kitchenId: '00000000-0000-4000-8000-00000000c002',
    kitchenName: 'Kitchen',
    status,
    currency: 'INR',
    foodSubtotal: 220,
    platformFee: 22,
    taxAmount: 7.25,
    deliveryFee: 40,
    grandTotal: 289.25,
    chefResponseNote: null,
    prepTimeMinutes: 20,
    deliveryAddress: {
      sourceAddressId: '00000000-0000-4000-8000-00000000c003',
      recipientName: 'Priya Sharma',
      contactPhoneNumber: '+91 99999 99999',
      addressLine1: '16-3-v/463',
      addressLine2: 'Lane No 14/5',
      landmark: 'Hanuman temple',
      areaName: 'KPHB Colony',
      city: 'Hyderabad',
      state: 'Telangana',
      postalCode: '500072',
      latitude: 17.49,
      longitude: 78.39,
    },
    items: [
      {
        id: '00000000-0000-4000-8000-00000000d001',
        menuItemId: '00000000-0000-4000-8000-00000000d101',
        itemName: 'Chicken curry',
        category: null,
        foodType: 'NON_VEG',
        unitPrice: 80,
        quantity: 2,
        lineTotal: 160,
      },
      {
        id: '00000000-0000-4000-8000-00000000d002',
        menuItemId: '00000000-0000-4000-8000-00000000d102',
        itemName: 'Lemon rice',
        category: null,
        foodType: 'VEG',
        unitPrice: 60,
        quantity: 1,
        lineTotal: 60,
      },
    ],
    createdAt: minutesAgo(2),
    updatedAt: minutesAgo(1),
    ...extra,
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
const visibleModals = () => tree.root.findAllByType(Modal).filter(modal => modal.props.visible === true);
const mount = async () => {
  const props = {
    navigation: {navigate: mockNavigate, goBack: mockGoBack},
    route: {key: 'detail', name: 'ChefOrderDetail', params: {orderId: ORDER_ID}},
  } as unknown as NativeStackScreenProps<ChefProductStackParamList, 'ChefOrderDetail'>;
  await act(async () => {
    tree = renderer.create(
      <QueryClientProvider client={new QueryClient()}>
        <ChefToastProvider>
          <ChefOrderDetailScreen {...props} />
        </ChefToastProvider>
      </QueryClientProvider>,
    );
  });
};

let openUrl: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks();
  // Only Date is faked: the screen and its timers still run on the real ones.
  jest.useFakeTimers({now: NOW, doNotFake: [...DATE_ONLY]});
  mockOrder = order('CHEF_ACCEPTANCE_PENDING');
  mockDetailState = {status: 'success', error: null};
  mockDecisionAction = null;
  chefHandedOverRoute.missing = false;
  openUrl = jest.spyOn(Linking, 'openURL').mockResolvedValue(true as never);
});
afterEach(() => {
  act(() => tree?.unmount());
  openUrl.mockRestore();
  jest.useRealTimers();
});

describe('Order page: header', () => {
  it('is titled with the order number and shows the real status, not "New order"', async () => {
    await mount();
    expect(hasText('Order #DF94B')).toBe(true);
    expect(hasText('New')).toBe(true);
    expect(hasText('New order')).toBe(false);
    expect(hasText('Today, 2:58 PM')).toBe(true);
  });

  it.each([
    ['PREPARING', 'Preparing'],
    ['CHEF_ACCEPTED', 'Preparing'],
    ['READY_FOR_PICKUP', 'Ready'],
    ['OUT_FOR_DELIVERY', 'On the way'],
    ['DELIVERED', 'Delivered'],
    ['CHEF_REJECTED', 'Rejected'],
    ['CANCELLED', 'Cancelled'],
  ] as const)('shows %s as "%s"', async (status, label) => {
    mockOrder = order(status);
    await mount();
    expect(hasText('Order #DF94B')).toBe(true);
    expect(hasText(label)).toBe(true);
  });

  it('goes back to where it was opened from', async () => {
    await mount();
    await press('Go back');
    expect(mockGoBack).toHaveBeenCalledTimes(1);
  });
});

describe('Order page: content', () => {
  it('lists the dishes with their prices, food marks and the customer note', async () => {
    mockOrder = order('CHEF_ACCEPTANCE_PENDING', {customerNote: 'Less spicy please'});
    await mount();
    expect(hasText('2×')).toBe(true);
    expect(hasText('Chicken curry')).toBe(true);
    expect(hasText('₹160')).toBe(true);
    expect(hasText('Lemon rice')).toBe(true);
    expect(hasText('“Less spicy please”')).toBe(true);
    expect(tree.root.findAll(node => node.props.accessibilityLabel === 'Non-vegetarian').length).toBeGreaterThan(0);
    expect(allText().join(' ')).not.toMatch(/NON_VEG|CHEF_ACCEPTANCE_PENDING/);
  });

  it('shows no note when the customer left none, and no "unavailable" boxes', async () => {
    await mount();
    expect(hasText(/Less spicy/)).toBe(false);
    expect(allText().join(' ')).not.toMatch(/unavailable|Guide Reference|backend|contract/i);
  });

  it('shows the countdown banner only while the order carries a response deadline', async () => {
    await mount();
    expect(hasText(/^Respond in/)).toBe(false);
    act(() => tree.unmount());
    mockOrder = order('CHEF_ACCEPTANCE_PENDING', {chefAcceptanceExpiresAt: new Date(NOW + 272_000).toISOString()});
    await mount();
    expect(hasText(/^Respond in 4:\d\d$/)).toBe(true);
    expect(hasText('Accept or reject before the timer runs out.')).toBe(true);
  });

  it('shows the customer with a short name, call, message and the address', async () => {
    await mount();
    expect(hasText('Priya S.')).toBe(true);
    expect(hasText('16-3-v/463, Lane No 14/5, KPHB Colony')).toBe(true);
    expect(hasText('Near Hanuman temple · Hyderabad')).toBe(true);
    expect(hasText(/Priya Sharma/)).toBe(false);
    await press('Call customer');
    expect(openUrl).toHaveBeenLastCalledWith('tel:+919999999999');
    await press('Message customer');
    expect(openUrl).toHaveBeenLastCalledWith('sms:+919999999999');
    await press('Open the address in Maps');
    expect(openUrl).toHaveBeenLastCalledWith('https://www.google.com/maps/search/?api=1&query=17.49,78.39');
  });

  it('shows the food the chef is paid for, and what the customer also paid, without inventing a commission', async () => {
    await mount();
    expect(hasText('Bill')).toBe(true);
    expect(hasText('Food')).toBe(true);
    expect(hasText('₹220.00')).toBe(true);
    expect(hasText('Customer also paid ₹40 delivery and ₹7.25 tax (not part of your earnings)')).toBe(true);
    expect(allText().join(' ')).not.toMatch(/Craves fee|You earn|Platform fee|commission|₹289/);
  });

  it('shows the order steps once it is past New', async () => {
    mockOrder = order('PREPARING');
    await mount();
    expect(hasText('Status')).toBe(true);
    expect(hasText('Order placed')).toBe(true);
    expect(hasText('Cooking')).toBe(true);
    expect(hasText('Ready for pickup')).toBe(true);
    act(() => tree.unmount());
    mockOrder = order('CHEF_ACCEPTANCE_PENDING');
    await mount();
    expect(hasText('Status')).toBe(false);
  });
});

describe('Order page: New', () => {
  it('has Reject and Accept in the dock, with the minutes it promises', async () => {
    await mount();
    expect(buttons('Reject order')).toHaveLength(1);
    expect(hasText('Accept · ready in 20 min')).toBe(true);
  });

  it('accepts and returns to Orders', async () => {
    await mount();
    await press('Accept order');
    expect(mockAccept).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith('ChefTabs', {screen: 'Orders'});
  });

  it('does not leave the page or claim success when accepting fails', async () => {
    mockAccept.mockRejectedValueOnce(new AppApiError('X', 'No', 500));
    await mount();
    await press('Accept order');
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('disables Accept and Reject while a decision is running', async () => {
    mockDecisionAction = 'accept';
    await mount();
    expect(buttons('Accept order')[0].props.disabled).toBe(true);
    expect(buttons('Reject order')[0].props.disabled).toBe(true);
  });

  it('tells a paid order the customer gets a full refund', async () => {
    await mount();
    await press('Reject order');
    expect(hasText('The customer is told right away and gets a full refund.')).toBe(true);
  });

  it('tells a meal-plan day (no checkout) where it goes, and promises no refund', async () => {
    mockOrder = order('CHEF_ACCEPTANCE_PENDING', {checkoutId: null});
    await mount();
    await press('Reject order');
    expect(hasText('The customer is told right away. This meal-plan day moves to the end of their plan.')).toBe(true);
    expect(allText().join(' ')).not.toMatch(/refund/);
  });

  it('rejects through the same reasons sheet, then returns to Orders', async () => {
    await mount();
    await press('Reject order');
    expect(hasText('Reject #DF94B?')).toBe(true);
    expect(mockReject).not.toHaveBeenCalled();
    await press('Closing soon');
    await press('Reject order');
    expect(mockReject).toHaveBeenCalledTimes(1);
    expect(mockReject).toHaveBeenCalledWith('Closing soon');
    expect(mockNavigate).toHaveBeenCalledWith('ChefTabs', {screen: 'Orders'});
    expect(visibleModals()).toHaveLength(0);
  });
});

describe('Order page: Preparing', () => {
  beforeEach(() => {
    mockOrder = order('PREPARING', {prepTimeMinutes: 30, updatedAt: minutesAgo(22)});
  });

  it('shows the time left and what was promised, with Call and Mark ready in the dock', async () => {
    await mount();
    expect(hasText('Ready in 8 min')).toBe(true);
    expect(hasText('You promised 3:08 PM')).toBe(true);
    expect(buttons('Mark ready')).toHaveLength(1);
    expect(buttons('Reject order')).toHaveLength(0);
  });

  it('says how late it is, in the same banner', async () => {
    mockOrder = order('PREPARING', {prepTimeMinutes: 15, updatedAt: minutesAgo(20)});
    await mount();
    expect(hasText('5 min late')).toBe(true);
  });

  it('calls the customer', async () => {
    await mount();
    await act(async () => {
      tree.root.findAll(node => isButton(node, 'Call customer'))[0].props.onPress();
    });
    expect(openUrl).toHaveBeenCalledWith('tel:+919999999999');
  });

  it('asks before marking ready, then marks it once', async () => {
    await mount();
    await press('Mark ready');
    expect(hasText('Is #DF94B packed and ready?')).toBe(true);
    expect(hasText('2 × Chicken curry, 1 × Lemon rice. The delivery partner is told to pick it up.')).toBe(true);
    expect(mockMarkReady).not.toHaveBeenCalled();
    const confirm = buttons("Yes, it's ready")[0];
    await act(async () => {
      await confirm.props.onPress();
    });
    expect(mockMarkReady).toHaveBeenCalledTimes(1);
    expect(mockMarkReady).toHaveBeenCalledWith(ORDER_ID);
    expect(visibleModals()).toHaveLength(0);
  });
});

describe('Order page: Ready', () => {
  beforeEach(() => {
    mockOrder = order('READY_FOR_PICKUP', {chefHandedOverAt: null});
  });

  it('shows Handed over when the order reports a hand-over still to do (the field is null), and sends it once', async () => {
    mockHandedOverApi.mockResolvedValueOnce(order('READY_FOR_PICKUP', {chefHandedOverAt: minutesAgo(0)}));
    await mount();
    expect(buttons('Not picked up')).toHaveLength(1);
    expect(buttons('Handed over')).toHaveLength(1);
    const handedOver = buttons('Handed over')[0];
    await act(async () => {
      handedOver.props.onPress();
      handedOver.props.onPress();
    });
    expect(mockHandedOverApi).toHaveBeenCalledTimes(1);
    expect(mockHandedOverApi).toHaveBeenCalledWith(ORDER_ID);
    expect(buttons('Handed over')).toHaveLength(0);
  });

  it('shows no Handed over button when the order does not carry the field at all', async () => {
    mockOrder = order('READY_FOR_PICKUP');
    expect(mockOrder).not.toHaveProperty('chefHandedOverAt');
    await mount();
    expect(buttons('Handed over')).toHaveLength(0);
    expect(buttons('Not picked up')).toHaveLength(1);
  });

  it('shows no Handed over button once the hand-over has a time', async () => {
    mockOrder = order('READY_FOR_PICKUP', {chefHandedOverAt: minutesAgo(5)});
    await mount();
    expect(buttons('Handed over')).toHaveLength(0);
  });

  it('labels an order left in Ready for over a day "Not picked up"', async () => {
    mockOrder = order('READY_FOR_PICKUP', {chefHandedOverAt: null, updatedAt: minutesAgo(30 * 60)});
    await mount();
    expect(hasText('Not picked up')).toBe(true);
    expect(hasText('Ready')).toBe(false);
  });

  it('opens the support sheet from Not picked up', async () => {
    await mount();
    await press('Not picked up');
    expect(hasText('What happened with #DF94B?')).toBe(true);
    await press('Send to support');
    expect(mockCreateCase).toHaveBeenCalledWith({
      contextRole: 'CHEF',
      orderId: ORDER_ID,
      subject: 'Not picked up · #DF94B',
      message: "Partner hasn't arrived yet",
    });
  });
});

describe('Order page: finished orders', () => {
  it('shows the steps first, no dock and no customer contact, and a way to ask about the order', async () => {
    mockOrder = order('DELIVERED', {
      statusHistory: [
        {status: 'CHEF_ACCEPTANCE_PENDING', at: minutesAgo(60)},
        {status: 'CHEF_ACCEPTED', at: minutesAgo(58)},
        {status: 'READY_FOR_PICKUP', at: minutesAgo(40)},
        {status: 'OUT_FOR_DELIVERY', at: minutesAgo(30)},
        {status: 'DELIVERED', at: minutesAgo(10)},
      ],
    });
    await mount();
    expect(hasText('Delivered')).toBe(true);
    expect(hasText('You accepted')).toBe(true);
    expect(hasText('Marked ready')).toBe(true);
    expect(hasText('2:00 PM')).toBe(true);
    expect(hasText('2:50 PM')).toBe(true);
    expect(buttons('Accept order')).toHaveLength(0);
    expect(buttons('Mark ready')).toHaveLength(0);
    expect(buttons('Handed over')).toHaveLength(0);
    expect(hasText('Customer')).toBe(false);
    await press('Problem with this order?');
    expect(mockNavigate).toHaveBeenCalledWith('ChefSupportTicket', {orderId: ORDER_ID});
  });

  it('also offers it for a rejected order', async () => {
    mockOrder = order('CHEF_REJECTED');
    await mount();
    expect(hasText('You rejected the order')).toBe(true);
    expect(buttons('Problem with this order?')).toHaveLength(1);
  });

  it('does not offer it while the order is still open', async () => {
    mockOrder = order('PREPARING');
    await mount();
    expect(buttons('Problem with this order?')).toHaveLength(0);
  });
});

describe('Order page: loading and errors', () => {
  it('shows a plain loading state while the order loads', async () => {
    mockOrder = null;
    mockDetailState = {status: 'pending', error: null};
    await mount();
    expect(hasText("We can't find this order")).toBe(false);
    expect(hasText("We couldn't load this order")).toBe(false);
  });

  it('says the order cannot be found when the server says there is no such order', async () => {
    mockOrder = null;
    mockDetailState = {status: 'error', error: new AppApiError('HTTP_404', 'Not found', 404)};
    await mount();
    expect(hasText("We can't find this order")).toBe(true);
    await press('Back to orders');
    expect(mockGoBack).toHaveBeenCalled();
  });

  it('offers to try again on any other failure', async () => {
    mockOrder = null;
    mockDetailState = {status: 'error', error: new AppApiError('HTTP_500', 'boom', 500)};
    await mount();
    expect(hasText("We couldn't load this order")).toBe(true);
    expect(allText().join(' ')).not.toContain('boom');
    await press('Try again');
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });
});
