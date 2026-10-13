import React from 'react';
import renderer, {act, type ReactTestInstance} from 'react-test-renderer';
import {Text} from 'react-native';
import type {ChefOperationalNotice} from '../api/chefOperationalApi';
import {ChefToastProvider} from '../components/ui';
import {ChefNotificationsScreen} from './ChefNotificationsScreen';

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
const mockMarkRead = jest.fn();
const mockMarkAllRead = jest.fn(async () => true);
const mockRefresh = jest.fn(async () => undefined);
let mockState: Record<string, unknown>;

jest.mock('@react-navigation/native', () => ({useNavigation: () => ({navigate: mockNavigate, goBack: mockGoBack})}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: require('react-native').View,
  useSafeAreaInsets: () => ({top: 0, right: 0, bottom: 34, left: 0}),
}));
jest.mock('../../../design/reducedMotion', () => ({useReducedMotionPreference: () => false}));
jest.mock('../state/ChefOperationalProvider', () => ({useChefOperationalState: () => mockState}));

const ORDER_ID = '44444444-4444-4444-8444-444444444444';
const id = (n: number) => `${String(n).repeat(8)}-${String(n).repeat(4)}-4${String(n).repeat(3)}-8${String(n).repeat(3)}-${String(n).repeat(12)}`;
const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
const notice = (n: number, overrides: Partial<ChefOperationalNotice> = {}): ChefOperationalNotice => ({
  id: id(n),
  title: `Notice ${n}`,
  body: `Body ${n}`,
  noticeType: 'ACCOUNT',
  targetType: null,
  targetId: null,
  readAt: null,
  createdAt: minutesAgo(n),
  ...overrides,
});

const newOrder = notice(1, {
  title: 'New order #DF94B',
  body: '2 × Chicken curry · ₹220',
  noticeType: 'CHEF_ORDER_AWAITING_ACCEPTANCE',
  targetType: 'ORDER',
  targetId: ORDER_ID,
});
const payout = notice(2, {title: '₹2,000 sent to your bank', body: 'Payout for 6–12 Oct', noticeType: 'CHEF_PAYOUT_PAID', targetType: 'CHEF_PAYOUT', targetId: id(7)});
const review = notice(3, {title: 'New 5★ review', body: 'Biryani tasted just like home', noticeType: 'CHEF_REVIEW_PUBLISHED', targetType: 'REVIEW', targetId: id(8)});
const oldRead = notice(4, {title: 'Document verified', body: 'Aadhaar card approved', readAt: minutesAgo(3000), createdAt: minutesAgo(3 * 24 * 60)});

let tree: renderer.ReactTestRenderer;
const textOf = (node: ReactTestInstance): string =>
  React.Children.toArray(node.props.children)
    .map(child => (typeof child === 'string' || typeof child === 'number' ? String(child) : ''))
    .join('');
const hasText = (text: string | RegExp) =>
  tree.root.findAllByType(Text).some(node => (typeof text === 'string' ? textOf(node) === text : text.test(textOf(node))));
const isButton = (node: ReactTestInstance, match: (label: string) => boolean) =>
  typeof node.props.accessibilityLabel === 'string' && match(node.props.accessibilityLabel) && typeof node.props.onPress === 'function';
const buttons = (match: (label: string) => boolean) =>
  tree.root.findAll(node => isButton(node, match) && !(node.parent && isButton(node.parent, match)));
const press = async (match: string | ((label: string) => boolean)) => {
  const test = typeof match === 'string' ? (label: string) => label === match : match;
  const target = buttons(test)[0];
  if (!target) throw new Error('No matching button');
  await act(async () => {
    await target.props.onPress();
  });
};
const mount = async () => {
  await act(async () => {
    tree = renderer.create(
      <ChefToastProvider>
        <ChefNotificationsScreen />
      </ChefToastProvider>,
    );
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  mockState = {
    notices: [newOrder, payout, review, oldRead],
    notificationsStatus: 'success',
    isRefreshing: false,
    refresh: mockRefresh,
    markNotificationRead: mockMarkRead,
    markAllNotificationsRead: mockMarkAllRead,
    markingAllNotificationsRead: false,
    counters: {unreadNotifications: 3},
  };
});
afterEach(() => act(() => tree?.unmount()));

describe('ChefNotificationsScreen', () => {
  it('lists the chef notices under Today and Earlier with their times', async () => {
    await mount();
    expect(hasText('Notifications')).toBe(true);
    expect(hasText('Today')).toBe(true);
    expect(hasText('Earlier')).toBe(true);
    expect(hasText('New order #DF94B')).toBe(true);
    expect(hasText('2 × Chicken curry · ₹220')).toBe(true);
    expect(hasText('1 min ago')).toBe(true);
    expect(hasText('Document verified')).toBe(true);
  });

  it('marks an unread row in its label and leaves a read row plain', async () => {
    await mount();
    expect(buttons(label => label.startsWith('New order #DF94B') && label.endsWith('Unread'))).toHaveLength(1);
    expect(buttons(label => label.startsWith('Document verified') && !label.endsWith('Unread'))).toHaveLength(1);
  });

  it('opens the order and marks the notice read when an order notice is tapped', async () => {
    await mount();
    await press(label => label.startsWith('New order #DF94B'));
    expect(mockMarkRead).toHaveBeenCalledWith(newOrder.id);
    expect(mockNavigate).toHaveBeenCalledWith('ChefOrderDetail', {orderId: ORDER_ID});
  });

  it('opens Payout history for a payout and Reviews for a review', async () => {
    await mount();
    await press(label => label.startsWith('₹2,000 sent to your bank'));
    expect(mockNavigate).toHaveBeenCalledWith('ChefTabs', {screen: 'Profile', params: {screen: 'ChefPayoutHistory', initial: false}});
    await press(label => label.startsWith('New 5★ review'));
    expect(mockNavigate).toHaveBeenCalledWith('ChefTabs', {screen: 'Profile', params: {screen: 'ChefReviews', initial: false}});
  });

  it('opens the Menu tab on Meal plans for a meal-plan notice', async () => {
    mockState.notices = [notice(5, {title: 'Plan approved', body: 'Weekly lunch box is live', noticeType: 'MEAL_PLAN_APPROVED', targetType: 'MEAL_PLAN', targetId: id(9)})];
    await mount();
    await press(label => label.startsWith('Plan approved'));
    expect(mockNavigate).toHaveBeenCalledWith('ChefTabs', {screen: 'Menu', params: {segment: 'plans'}});
  });

  it('does not mark an already read notice again', async () => {
    await mount();
    await press(label => label.startsWith('Document verified'));
    expect(mockMarkRead).not.toHaveBeenCalled();
  });

  it('filters by type', async () => {
    await mount();
    await press('Orders, 1 unread');
    expect(hasText('New order #DF94B')).toBe(true);
    expect(hasText('₹2,000 sent to your bank')).toBe(false);
    await press('Money, 1 unread');
    expect(hasText('₹2,000 sent to your bank')).toBe(true);
    expect(hasText('New order #DF94B')).toBe(false);
    await press('All');
    expect(hasText('New 5★ review')).toBe(true);
  });

  it('marks everything read, and hides the button when nothing is unread', async () => {
    await mount();
    await press('Mark all read');
    expect(mockMarkAllRead).toHaveBeenCalledTimes(1);
    act(() => tree.unmount());
    mockState = {...mockState, notices: [oldRead]};
    await mount();
    expect(buttons(label => label === 'Mark all read')).toHaveLength(0);
  });

  it('keeps the button and says so when only some notices could be marked read', async () => {
    mockMarkAllRead.mockResolvedValueOnce(false);
    await mount();
    await press('Mark all read');
    expect(hasText('Some notifications could not be marked as read.')).toBe(true);
    expect(buttons(label => label === 'Mark all read')).toHaveLength(1);
  });

  it('says so when marking everything read fails outright', async () => {
    mockMarkAllRead.mockRejectedValueOnce(new Error('offline'));
    await mount();
    await press('Mark all read');
    expect(hasText("We couldn't mark your notifications as read. Try again.")).toBe(true);
  });

  it('goes back from the arrow', async () => {
    await mount();
    await press('Go back');
    expect(mockGoBack).toHaveBeenCalledTimes(1);
  });

  it('shows a designed empty state', async () => {
    mockState = {...mockState, notices: []};
    await mount();
    expect(hasText('No notifications yet')).toBe(true);
  });

  it('names the empty filter instead of saying there are no notifications at all', async () => {
    mockState = {...mockState, notices: [newOrder]};
    await mount();
    await press('Reviews');
    expect(hasText('No Reviews notifications')).toBe(true);
    expect(hasText('No notifications yet')).toBe(false);
    await press('Money');
    expect(hasText('No Money notifications')).toBe(true);
    await press('Orders, 1 unread');
    expect(hasText('New order #DF94B')).toBe(true);
    expect(hasText(/^No .* notifications$/)).toBe(false);
  });

  it('offers a retry, not error details, when the notices cannot be loaded', async () => {
    mockState = {...mockState, notices: [], notificationsStatus: 'error'};
    await mount();
    expect(hasText("We couldn't load your notifications")).toBe(true);
    await press('Try again');
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });
});
