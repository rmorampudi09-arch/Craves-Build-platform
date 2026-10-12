import React from 'react';
import renderer, {act, type ReactTestInstance} from 'react-test-renderer';
import {Modal, Text} from 'react-native';
import type {ChefOperationalOrder} from '../../chefShell/api/chefOperationalApi';
import type {KitchenOpenState} from '../../chefProfile/state/useKitchenOpenState';
import {ChefDashboardScreen} from './ChefDashboardScreen';

const mockNavigate = jest.fn();
const mockAccept = jest.fn(async () => ({}));
const mockMarkReady = jest.fn(async () => undefined);
const mockRefresh = jest.fn(async () => undefined);
const mockSetOpen = jest.fn(async () => undefined);
const mockPause = jest.fn(async () => undefined);
const mockResume = jest.fn(async () => undefined);
let mockUnread = 0;
let mockModel: Record<string, unknown>;
let mockKitchen: KitchenOpenState;
let mockReviews: Record<string, unknown>;
let mockNewActions: Record<string, unknown>;
let mockPrepActions: Record<string, unknown>;
let mockPrepTimers: Record<string, unknown>;

jest.mock('@react-navigation/native', () => ({useNavigation: () => ({navigate: mockNavigate})}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: require('react-native').View,
  useSafeAreaInsets: () => ({top: 0, right: 0, bottom: 34, left: 0}),
}));
jest.mock('../../../design/reducedMotion', () => ({useReducedMotionPreference: () => false}));
jest.mock('../../chefShell/state/ChefOperationalProvider', () => ({
  useChefOperationalState: () => ({counters: {unreadNotifications: mockUnread}, orderTabs: {prepTimers: mockPrepTimers}}),
}));
jest.mock('../state/useChefDashboardModel', () => ({useChefDashboardModel: () => mockModel}));
jest.mock('../../chefProfile/state/useKitchenOpenState', () => ({useKitchenOpenState: () => mockKitchen}));
jest.mock('../../reviews/query/useChefReviewPreview', () => ({useChefReviewPreview: () => mockReviews}));
jest.mock('../../chefOrders/state/useChefNewOrderActions', () => ({useChefNewOrderActions: () => mockNewActions}));
jest.mock('../../chefOrders/state/useChefPreparingOrderActions', () => ({useChefPreparingOrderActions: () => mockPrepActions}));

const NEW_ID = '00000000-0000-4000-8000-0000000df94b';
const NEW_ID_2 = '00000000-0000-4000-8000-0000009b2e1c';
const COOK_ID = '00000000-0000-4000-8000-0000000a21c7';
const READY_ID = '00000000-0000-4000-8000-00000000e7cd';
const ITEM = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;

const pendingOrder: ChefOperationalOrder = {
  id: NEW_ID,
  status: 'CHEF_ACCEPTANCE_PENDING',
  createdAt: new Date(Date.now() - 2 * 60_000).toISOString(),
  foodSubtotal: 220,
  deliverySummary: {areaName: 'KPHB Colony', city: 'Hyderabad'},
  items: [
    {id: ITEM(1), itemName: 'Chicken curry', quantity: 2, foodType: 'NON_VEG'},
    {id: ITEM(2), itemName: 'Lemon rice', quantity: 1, foodType: 'VEG'},
  ],
};
const cookingOrder: ChefOperationalOrder = {
  id: COOK_ID,
  status: 'PREPARING',
  items: [{id: ITEM(3), itemName: 'Dum biriyani', quantity: 3}],
};
const readyOrder: ChefOperationalOrder = {id: READY_ID, status: 'READY_FOR_PICKUP', items: []};
const menuItem = (itemName: string, preparationTimeMinutes: number) => ({id: ITEM(5), itemName, preparationTimeMinutes});

function baseModel(overrides: Record<string, unknown> = {}) {
  return {
    data: {menu: {totalItems: 16, activeItems: 16, sellableItems: 12, activeItemsWithPublicImage: 10}},
    sources: {orders: 'success', earnings: 'success', menu: 'success', notifications: 'success', balance: 'success'},
    pendingOrders: [pendingOrder],
    kitchenOrders: [cookingOrder, readyOrder],
    menuItems: [menuItem('Chicken curry', 20), menuItem('Lemon rice', 10)],
    today: {earned: 1240, delivered: 8},
    balance: {available: '3450.00'},
    isRefreshing: false,
    refresh: mockRefresh,
    ...overrides,
  };
}

function baseKitchen(overrides: Partial<KitchenOpenState> = {}): KitchenOpenState {
  return {
    status: 'open',
    kitchen: {kitchenName: 'Relangi mavayya kitchen'} as KitchenOpenState['kitchen'],
    pausedUntil: null,
    opensAt: null,
    hoursToday: '11:00 AM – 10:00 PM',
    saving: false,
    pauseAvailable: true,
    unavailable: false,
    setOpen: mockSetOpen,
    pause: mockPause,
    resume: mockResume,
    ...overrides,
  };
}

let tree: renderer.ReactTestRenderer;
const textOf = (node: ReactTestInstance): string =>
  React.Children.toArray(node.props.children)
    .map(child => (typeof child === 'string' || typeof child === 'number' ? String(child) : ''))
    .join('');
const allText = () => tree.root.findAllByType(Text).map(textOf);
const hasText = (text: string | RegExp) =>
  allText().some(value => (typeof text === 'string' ? value === text : text.test(value)));
// A button is the outermost element that carries its label and onPress (a wrapper may pass both down to a Pressable).
const isButton = (node: ReactTestInstance, label: string) =>
  node.props.accessibilityLabel === label && typeof node.props.onPress === 'function';
const pressables = (label: string) =>
  tree.root.findAll(node => isButton(node, label) && !(node.parent && isButton(node.parent, label)));
const press = async (label: string) => {
  const target = pressables(label)[0];
  if (!target) throw new Error(`No button labelled "${label}"`);
  await act(async () => {
    await target.props.onPress();
  });
};
const mount = async () => {
  await act(async () => {
    tree = renderer.create(<ChefDashboardScreen />);
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  mockUnread = 0;
  mockModel = baseModel();
  mockKitchen = baseKitchen();
  mockReviews = {available: true, reviews: [], summary: {overallAverage: 4.6, reviewCount: 12}, isPending: false, isRefreshing: false, error: null, refresh: jest.fn()};
  mockNewActions = {actionStateByOrder: {}, feedback: null, accept: mockAccept, reject: jest.fn(), clearFeedback: jest.fn()};
  mockPrepActions = {actionStateByOrder: {}, feedback: null, markReady: mockMarkReady, callCustomer: jest.fn(), clearFeedback: jest.fn()};
  mockPrepTimers = {};
});
afterEach(() => act(() => tree?.unmount()));

describe('Home: new orders', () => {
  it('shows the first pending order with its accept time, a Reject button and the new-order count link', async () => {
    mockModel = baseModel({pendingOrders: [pendingOrder, {...pendingOrder, id: NEW_ID_2}]});
    await mount();
    expect(hasText('Needs you now')).toBe(true);
    expect(hasText('#DF94B')).toBe(true);
    expect(hasText('#B2E1C')).toBe(false);
    expect(hasText('₹220')).toBe(true);
    expect(pressables('Accept · ready in 20 min')).toHaveLength(1);
    expect(pressables('Reject order #DF94B')).toHaveLength(1);
    await press('2 new orders');
    expect(mockNavigate).toHaveBeenCalledWith('Orders', {screen: 'ChefOrdersNew'});
  });

  it('shows no "Needs you now" section when nothing is waiting', async () => {
    mockModel = baseModel({pendingOrders: []});
    await mount();
    expect(hasText('Needs you now')).toBe(false);
    expect(pressables('Accept · ready in 20 min')).toHaveLength(0);
  });

  it('accepts through the existing accept action', async () => {
    await mount();
    await press('Accept · ready in 20 min');
    expect(mockAccept).toHaveBeenCalledTimes(1);
    expect(mockAccept).toHaveBeenCalledWith(NEW_ID);
  });

  it('disables Accept and Reject while the order is being accepted', async () => {
    mockNewActions = {...mockNewActions, actionStateByOrder: {[NEW_ID]: 'accepting'}};
    await mount();
    expect(pressables('Accept · ready in 20 min')[0].props.disabled).toBe(true);
    expect(pressables('Reject order #DF94B')[0].props.disabled).toBe(true);
  });

  it('opens the order when the card is tapped and sends Reject to the New orders list', async () => {
    await mount();
    await press('Order #DF94B, ₹220, 3 items');
    expect(mockNavigate).toHaveBeenCalledWith('ChefOrderDetail', {orderId: NEW_ID});
    await press('Reject order #DF94B');
    expect(mockNavigate).toHaveBeenCalledWith('Orders', {screen: 'ChefOrdersNew'});
  });

  it('shows the response countdown and the customer note only when the order carries them', async () => {
    await mount();
    expect(hasText(/Respond in/)).toBe(false);
    expect(hasText(/Less spicy/)).toBe(false);
    act(() => tree.unmount());
    mockModel = baseModel({
      pendingOrders: [
        {...pendingOrder, chefAcceptanceExpiresAt: new Date(Date.now() + 272_000).toISOString(), customerNote: 'Less spicy please'},
      ],
    });
    await mount();
    expect(hasText(/^Respond in 4:\d\d$/)).toBe(true);
    expect(hasText('“Less spicy please”')).toBe(true);
  });
});

describe('Home: kitchen status', () => {
  it('shows the open pill with the kitchen name and opens the Kitchen status sheet', async () => {
    await mount();
    expect(hasText('Relangi mavayya kitchen')).toBe(true);
    expect(hasText('Open · taking orders')).toBe(true);
    await press('Kitchen status: Open · taking orders');
    expect(tree.root.findAllByType(Modal).some(modal => modal.props.visible === true)).toBe(true);
    expect(hasText('Kitchen status')).toBe(true);
    expect(hasText('Pause new orders for')).toBe(true);
    expect(pressables('Pause for 1 hour')).toHaveLength(1);
  });

  it('pauses for the chosen time', async () => {
    await mount();
    await press('Kitchen status: Open · taking orders');
    await press('2 hours');
    await press('Pause for 2 hours');
    expect(mockPause).toHaveBeenCalledWith(120);
  });

  it('hides the pause options when the schedule is not published for the app yet', async () => {
    mockKitchen = baseKitchen({pauseAvailable: false});
    await mount();
    await press('Kitchen status: Open · taking orders');
    expect(hasText('Pause new orders for')).toBe(false);
    expect(pressables('Close kitchen until I open it')).toHaveLength(1);
  });

  it('closes the kitchen straight away when nothing is cooking', async () => {
    mockModel = baseModel({kitchenOrders: []});
    await mount();
    await press('Kitchen status: Open · taking orders');
    await press('Close kitchen until I open it');
    expect(mockSetOpen).toHaveBeenCalledWith(false);
  });

  it('asks first when orders are still cooking', async () => {
    await mount();
    await press('Kitchen status: Open · taking orders');
    await press('Close kitchen until I open it');
    expect(mockSetOpen).not.toHaveBeenCalled();
    expect(hasText('Close your kitchen?')).toBe(true);
    await press('Close kitchen');
    expect(mockSetOpen).toHaveBeenCalledWith(false);
  });

  it('opens the opening-hours screen from the sheet', async () => {
    await mount();
    await press('Kitchen status: Open · taking orders');
    await press('Change opening hours');
    expect(mockNavigate).toHaveBeenCalledWith('Profile', {screen: 'ChefKitchenSchedule'});
  });

  it('shows a closed kitchen with one button to open it', async () => {
    mockKitchen = baseKitchen({status: 'closed', opensAt: '11:00 AM'});
    mockModel = baseModel({pendingOrders: [], kitchenOrders: []});
    await mount();
    expect(hasText('Closed · opens 11:00 AM')).toBe(true);
    expect(hasText('Your kitchen is closed')).toBe(true);
    await press('Open kitchen');
    expect(mockSetOpen).toHaveBeenCalledWith(true);
  });

  it('does not offer to open a suspended kitchen', async () => {
    mockKitchen = baseKitchen({
      status: 'closed',
      kitchen: {kitchenName: 'Relangi mavayya kitchen', status: 'SUSPENDED'} as KitchenOpenState['kitchen'],
    });
    await mount();
    expect(hasText('Your kitchen is suspended')).toBe(true);
    expect(hasText('Suspended')).toBe(true);
    expect(pressables('Open kitchen')).toHaveLength(0);
    expect(pressables('Kitchen status: Suspended')[0].props.disabled).toBe(true);
  });

  it('says so when the kitchen status could not be read', async () => {
    mockKitchen = baseKitchen({status: 'unknown', kitchen: null, unavailable: true});
    await mount();
    expect(hasText('Your kitchen')).toBe(true);
    expect(hasText('Kitchen status unavailable')).toBe(true);
  });

  it('shows a paused kitchen with the time it comes back and a Resume button', async () => {
    const until = new Date(2026, 9, 14, 13, 30).toISOString();
    mockKitchen = baseKitchen({status: 'paused', pausedUntil: until});
    await mount();
    expect(hasText('Paused · back at 1:30 PM')).toBe(true);
    expect(hasText(/New orders paused until 1:30 PM/)).toBe(true);
    await press('Resume now');
    expect(mockResume).toHaveBeenCalledTimes(1);
  });
});

describe('Home: kitchen, today and balance', () => {
  it('lists cooking and ready orders; Mark ready asks before it changes anything', async () => {
    await mount();
    expect(hasText('In the kitchen')).toBe(true);
    expect(hasText('#A21C7 · Preparing')).toBe(true);
    expect(hasText('#0E7CD · Ready')).toBe(true);
    expect(hasText('Waiting for pickup')).toBe(true);

    await press('Mark #A21C7 ready');
    expect(mockMarkReady).not.toHaveBeenCalled();
    expect(hasText('Is #A21C7 packed and ready?')).toBe(true);
    await press('Not yet');
    expect(mockMarkReady).not.toHaveBeenCalled();

    await press('Mark #A21C7 ready');
    await press("Yes, it's ready");
    expect(mockMarkReady).toHaveBeenCalledTimes(1);
    expect(mockMarkReady).toHaveBeenCalledWith(COOK_ID);
  });

  it('names the delivery partner on a ready order only when the server sends one', async () => {
    mockModel = baseModel({
      kitchenOrders: [
        {...readyOrder, deliveryPartner: {name: 'Suresh', phone: null, photoUrl: null, pickupEtaAt: new Date(Date.now() + 4 * 60_000 + 5_000).toISOString()}},
      ],
    });
    await mount();
    expect(hasText('Suresh picks up in 4 min')).toBe(true);
    expect(hasText('Waiting for pickup')).toBe(false);
  });

  it("shows today's earnings, orders and rating, and hides the rating when reviews are not published", async () => {
    await mount();
    expect(hasText('₹1,240')).toBe(true);
    expect(hasText('8')).toBe(true);
    expect(hasText('4.6 ★')).toBe(true);
    act(() => tree.unmount());
    mockReviews = {...mockReviews, available: false, summary: null};
    await mount();
    expect(hasText('₹1,240')).toBe(true);
    expect(hasText('Rating')).toBe(false);
    expect(hasText('Latest reviews')).toBe(false);
  });

  it('shows the latest review when there is one', async () => {
    mockReviews = {
      ...mockReviews,
      reviews: [{reviewId: 'r1', overallRating: 5, reviewText: 'Biryani tasted just like home!', publishedAt: new Date().toISOString(), tagCodes: []}],
    };
    await mount();
    expect(hasText('Latest reviews')).toBe(true);
    expect(hasText('Biryani tasted just like home!')).toBe(true);
    await press('See all');
    expect(mockNavigate).toHaveBeenCalledWith('Profile', {screen: 'ChefReviews'});
  });

  it('shows the balance with paise and Withdraw opens Earnings', async () => {
    await mount();
    expect(hasText('Available to withdraw')).toBe(true);
    expect(hasText('₹3,450.00')).toBe(true);
    await press('Withdraw');
    expect(mockNavigate).toHaveBeenCalledWith('Earnings');
  });

  it('shows how many dishes are available and opens the Menu tab', async () => {
    await mount();
    expect(hasText('12 of 16 dishes available')).toBe(true);
    expect(hasText('4 dishes are switched off')).toBe(true);
    await press('Manage');
    expect(mockNavigate).toHaveBeenCalledWith('Menu');
  });

  it('points an empty kitchen to its next step: add a dish', async () => {
    mockModel = baseModel({
      pendingOrders: [],
      kitchenOrders: [],
      today: {earned: 0, delivered: 0},
      balance: {available: '0.00'},
      data: {menu: {totalItems: 0, activeItems: 0, sellableItems: 0, activeItemsWithPublicImage: 0}},
    });
    await mount();
    expect(hasText('No orders right now')).toBe(true);
    expect(hasText('₹0.00')).toBe(true);
    expect(hasText('Add your first dish')).toBe(true);
    await press('Add your first dish');
    expect(mockNavigate).toHaveBeenCalledWith('Menu');
  });

  it('has no Quick actions list and never says Analytics', async () => {
    await mount();
    expect(hasText(/Quick actions/i)).toBe(false);
    expect(hasText(/Analytics/i)).toBe(false);
    expect(pressables('Open Analytics')).toHaveLength(0);
    await press('Earnings');
    expect(mockNavigate).toHaveBeenCalledWith('Earnings');
  });

  it('shows the unread chef notification count on the bell', async () => {
    mockUnread = 3;
    await mount();
    await press('Notifications, 3 unread');
    expect(mockNavigate).toHaveBeenCalledWith('ChefNotifications');
  });
});
