import React from 'react';
import renderer, {act, type ReactTestInstance} from 'react-test-renderer';
import {InteractionManager, Modal, RefreshControl, StyleSheet, Text} from 'react-native';
import type {ChefOperationalOrder} from '../../chefShell/api/chefOperationalApi';
import {ChefToastProvider, StatTile} from '../../chefShell/components/ui';
import type {KitchenOpenState} from '../../chefProfile/state/useKitchenOpenState';
import {ChefDashboardScreen} from './ChefDashboardScreen';

const mockNavigate = jest.fn();
const mockAccept = jest.fn(async () => ({}));
const mockMarkReady = jest.fn(async () => undefined);
const mockRefresh = jest.fn(async () => undefined);
const mockSetOpen = jest.fn(async () => true);
const mockPause = jest.fn(async () => true);
const mockResume = jest.fn(async () => true);
const mockKitchenRefresh = jest.fn(async () => undefined);
const mockReviewsRefresh = jest.fn(async () => undefined);
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
  customerName: 'Priya S.',
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
    closedReason: null,
    kitchen: {kitchenName: 'Relangi mavayya kitchen'} as KitchenOpenState['kitchen'],
    pausedUntil: null,
    opensAt: null,
    hoursToday: '11:00 AM – 10:00 PM',
    saving: false,
    pauseAvailable: true,
    unavailable: false,
    refresh: mockKitchenRefresh,
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
    tree = renderer.create(
      <ChefToastProvider>
        <ChefDashboardScreen />
      </ChefToastProvider>,
    );
  });
};
// A Modal that is closing must be gone before the next one opens or the page changes, so the screen waits for
// interactions to finish. Tests hold those callbacks until they say the sheet has finished closing.
let queuedInteractions: (() => void)[] = [];
let interactionsSpy: jest.SpyInstance;
const finishInteractions = async () => {
  await act(async () => {
    queuedInteractions.splice(0).forEach(run => run());
  });
};
const statTile = (label: string) => tree.root.findAllByType(StatTile).find(tile => tile.props.label === label);

beforeEach(() => {
  jest.clearAllMocks();
  mockUnread = 0;
  mockModel = baseModel();
  mockKitchen = baseKitchen();
  mockReviews = {available: true, reviews: [], summary: {overallAverage: 4.6, reviewCount: 12}, isPending: false, isRefreshing: false, error: null, refresh: mockReviewsRefresh};
  mockNewActions = {actionStateByOrder: {}, feedback: null, accept: mockAccept, reject: jest.fn(), clearFeedback: jest.fn()};
  mockPrepActions = {actionStateByOrder: {}, feedback: null, markReady: mockMarkReady, callCustomer: jest.fn(), clearFeedback: jest.fn()};
  mockPrepTimers = {};
  queuedInteractions = [];
  interactionsSpy = jest.spyOn(InteractionManager, 'runAfterInteractions').mockImplementation(((run: () => void) => {
    queuedInteractions.push(run);
    return {cancel: jest.fn()};
  }) as never);
});
afterEach(() => {
  act(() => tree?.unmount());
  interactionsSpy.mockRestore();
});

describe('Home: new orders', () => {
  it('shows the first pending order with its accept time, a Reject button and the new-order count link', async () => {
    mockModel = baseModel({pendingOrders: [pendingOrder, {...pendingOrder, id: NEW_ID_2}]});
    await mount();
    expect(hasText('Needs you now')).toBe(true);
    expect(hasText('#DF94B')).toBe(true);
    expect(hasText('#B2E1C')).toBe(false);
    expect(hasText('₹220')).toBe(true);
    expect(hasText(/^Priya S\. · KPHB Colony · /)).toBe(true);
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

  it('opens the order when the card is tapped', async () => {
    await mount();
    await press('Order #DF94B, ₹220, Priya S., 3 items');
    expect(mockNavigate).toHaveBeenCalledWith('ChefOrderDetail', {orderId: NEW_ID});
  });

  it('opens the reject sheet from Reject, and rejects with the reason picked', async () => {
    const reject = jest.fn(async () => ({}));
    mockNewActions = {...mockNewActions, reject};
    await mount();
    await press('Reject order #DF94B');
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(hasText('Reject #DF94B?')).toBe(true);
    expect(pressables('Reject order')[0].props.disabled).toBe(true);
    await press('Closing soon');
    await press('Reject order');
    expect(reject).toHaveBeenCalledTimes(1);
    expect(reject).toHaveBeenCalledWith(NEW_ID, 'Closing soon');
    expect(tree.root.findAllByType(Modal).some(modal => modal.props.visible === true)).toBe(false);
  });

  it('keeps the reject sheet open when the rejection fails', async () => {
    const reject = jest.fn(async () => {
      throw new Error('offline');
    });
    mockNewActions = {...mockNewActions, reject};
    await mount();
    await press('Reject order #DF94B');
    await press('Closing soon');
    await press('Reject order');
    expect(reject).toHaveBeenCalledTimes(1);
    expect(hasText('Reject #DF94B?')).toBe(true);
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

  it('asks first when orders are still cooking, but only once the sheet has finished closing', async () => {
    await mount();
    await press('Kitchen status: Open · taking orders');
    await press('Close kitchen until I open it');
    expect(mockSetOpen).not.toHaveBeenCalled();
    const visibleModals = () => tree.root.findAllByType(Modal).filter(modal => modal.props.visible === true);
    // The sheet is closing and the dialog has not opened yet: never two Modals changing places in one tick.
    expect(visibleModals()).toHaveLength(0);
    expect(hasText('Close your kitchen?')).toBe(false);
    await finishInteractions();
    expect(visibleModals()).toHaveLength(1);
    expect(hasText('Close your kitchen?')).toBe(true);
    await press('Close kitchen');
    expect(mockSetOpen).toHaveBeenCalledWith(false);
  });

  it('opens the opening-hours screen from the sheet once the sheet has closed', async () => {
    await mount();
    await press('Kitchen status: Open · taking orders');
    await press('Change opening hours');
    expect(mockNavigate).not.toHaveBeenCalled();
    await finishInteractions();
    expect(mockNavigate).toHaveBeenCalledWith('Profile', {screen: 'ChefKitchenSchedule'});
  });

  it('shows a kitchen the chef closed with just "Closed" and one button to open it', async () => {
    mockKitchen = baseKitchen({status: 'closed', closedReason: 'chef', opensAt: null});
    mockModel = baseModel({pendingOrders: [], kitchenOrders: []});
    await mount();
    expect(hasText('Closed')).toBe(true);
    expect(hasText(/opens/)).toBe(false);
    expect(hasText('Your kitchen is closed')).toBe(true);
    await press('Open kitchen');
    expect(mockSetOpen).toHaveBeenCalledWith(true);
  });

  it('says "not taking orders" when the schedule has orders switched off, and can switch them on', async () => {
    mockKitchen = baseKitchen({status: 'closed', closedReason: 'not-accepting'});
    await mount();
    expect(hasText('Closed · not taking orders')).toBe(true);
    await press('Open kitchen');
    expect(mockSetOpen).toHaveBeenCalledWith(true);
  });

  it('shows the next opening only for a kitchen that is outside its hours, and does not offer a pointless Open button', async () => {
    mockKitchen = baseKitchen({status: 'closed', closedReason: 'outside-hours', opensAt: '11:00 AM'});
    await mount();
    expect(hasText('Closed · opens 11:00 AM')).toBe(true);
    expect(pressables('Open kitchen')).toHaveLength(0);
    await press('Change opening hours');
    expect(mockNavigate).toHaveBeenCalledWith('Profile', {screen: 'ChefKitchenSchedule'});
  });

  it('does not offer to open a kitchen Craves has suspended', async () => {
    mockKitchen = baseKitchen({
      status: 'suspended',
      kitchen: {kitchenName: 'Relangi mavayya kitchen', status: 'SUSPENDED'} as KitchenOpenState['kitchen'],
    });
    await mount();
    expect(hasText('Your kitchen is paused by Craves')).toBe(true);
    expect(hasText('Paused by Craves')).toBe(true);
    expect(pressables('Open kitchen')).toHaveLength(0);
    expect(pressables('Kitchen status: Paused by Craves')[0].props.disabled).toBe(true);
  });

  it('says so, and lets the chef try again by tapping the pill, when the kitchen status could not be read', async () => {
    mockKitchen = baseKitchen({status: 'unknown', kitchen: null, unavailable: true});
    await mount();
    expect(hasText('Your kitchen')).toBe(true);
    expect(hasText('Kitchen status unavailable')).toBe(true);
    await press('Kitchen status: Kitchen status unavailable');
    expect(mockKitchenRefresh).toHaveBeenCalledTimes(1);
    expect(tree.root.findAllByType(Modal).some(modal => modal.props.visible === true)).toBe(false);
  });

  it('shows no tappable pill while the kitchen status is still loading', async () => {
    mockKitchen = baseKitchen({status: 'unknown', kitchen: null, unavailable: false});
    await mount();
    expect(hasText('Checking kitchen status')).toBe(true);
    expect(pressables('Kitchen status: Checking kitchen status')[0].props.disabled).toBe(true);
  });

  it('lets the status pill grow with large text instead of clipping it', async () => {
    await mount();
    const pill = StyleSheet.flatten(pressables('Kitchen status: Open · taking orders')[0].props.style);
    expect(pill.minHeight).toBeGreaterThanOrEqual(28);
    expect(pill.height).toBeUndefined();
  });

  it('refreshes the kitchen status together with everything else on pull to refresh', async () => {
    await mount();
    await act(async () => {
      tree.root.findByType(RefreshControl).props.onRefresh();
    });
    expect(mockKitchenRefresh).toHaveBeenCalledTimes(1);
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(mockReviewsRefresh).toHaveBeenCalledTimes(1);
  });

  it('toasts only after the kitchen really changed, never for a press that was skipped', async () => {
    mockModel = baseModel({kitchenOrders: []});
    await mount();
    mockSetOpen.mockResolvedValueOnce(false);
    await press('Kitchen status: Open · taking orders');
    await press('Close kitchen until I open it');
    expect(mockSetOpen).toHaveBeenCalledTimes(1);
    expect(hasText('Your kitchen is closed')).toBe(false);

    await press('Kitchen status: Open · taking orders');
    await press('Close kitchen until I open it');
    expect(mockSetOpen).toHaveBeenCalledTimes(2);
    expect(hasText('Your kitchen is closed')).toBe(true);
  });

  it('says plainly when the kitchen could not be changed', async () => {
    mockModel = baseModel({kitchenOrders: []});
    mockSetOpen.mockRejectedValueOnce(new Error('KITCHEN_SUSPENDED'));
    await mount();
    await press('Kitchen status: Open · taking orders');
    await press('Close kitchen until I open it');
    expect(hasText("We couldn't update your kitchen. Check your connection and try again.")).toBe(true);
    expect(hasText(/KITCHEN_SUSPENDED/)).toBe(false);
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
    expect(statTile('Earned')?.props.value).toBe('₹1,240');
    expect(statTile('Orders')?.props.value).toBe(8);
    expect(statTile('Rating')?.props.value).toBe('4.6 ★');
    act(() => tree.unmount());
    mockReviews = {...mockReviews, available: false, summary: null};
    await mount();
    expect(statTile('Earned')?.props.value).toBe('₹1,240');
    expect(statTile('Rating')).toBeUndefined();
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

  it('does not claim there are no orders while the orders are still loading', async () => {
    mockModel = baseModel({
      pendingOrders: [],
      kitchenOrders: [],
      sources: {orders: 'pending', earnings: 'pending', menu: 'success', notifications: 'success', balance: 'success'},
    });
    await mount();
    expect(hasText('No orders right now')).toBe(false);
    expect(statTile('Orders')?.props.value).toBe('—');
  });

  it('offers a retry instead of "No orders right now" when the orders could not be loaded', async () => {
    mockModel = baseModel({
      pendingOrders: [],
      kitchenOrders: [],
      sources: {orders: 'error', earnings: 'success', menu: 'success', notifications: 'success', balance: 'success'},
    });
    await mount();
    expect(hasText('No orders right now')).toBe(false);
    expect(hasText("We couldn't load your orders")).toBe(true);
    await press('Try again');
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it('shows a neutral row, not "Add your first dish", while the menu is still loading', async () => {
    mockModel = baseModel({
      data: {menu: {totalItems: 0, activeItems: 0, sellableItems: 0, activeItemsWithPublicImage: 0}},
      sources: {orders: 'success', earnings: 'success', menu: 'pending', notifications: 'success', balance: 'success'},
      menuItems: [],
    });
    await mount();
    expect(hasText('Add your first dish')).toBe(false);
    expect(pressables('Add your first dish')).toHaveLength(0);
    expect(hasText('Checking your menu')).toBe(true);
  });

  it('offers a retry, not "Add your first dish", when the menu could not be loaded', async () => {
    mockModel = baseModel({
      data: {menu: {totalItems: 0, activeItems: 0, sellableItems: 0, activeItemsWithPublicImage: 0}},
      sources: {orders: 'success', earnings: 'success', menu: 'error', notifications: 'success', balance: 'success'},
      menuItems: [],
    });
    await mount();
    expect(hasText('Add your first dish')).toBe(false);
    expect(hasText("We couldn't load your menu")).toBe(true);
    await press('Try again');
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it('keeps showing the dish counts when a later refresh of the menu fails', async () => {
    mockModel = baseModel({
      sources: {orders: 'success', earnings: 'success', menu: 'error', notifications: 'success', balance: 'success'},
      menuItems: [menuItem('Chicken curry', 20)],
    });
    await mount();
    expect(hasText('12 of 16 dishes available')).toBe(true);
    expect(hasText("We couldn't load your menu")).toBe(false);
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
