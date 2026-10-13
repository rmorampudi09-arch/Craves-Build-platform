import React from 'react';
import {Image, StyleSheet, Switch, Text} from 'react-native';
import {touchTarget} from '../../../design/tokens';
import renderer, {act, type ReactTestInstance} from 'react-test-renderer';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {AppApiError} from '../../../core/http/apiError';
import type {ChefMealPlan, ChefMealSchedule} from '../api/chefSubscriptionApi';
import {ChefMealPlansScreen} from './ChefMealPlansScreen';

const mockNavigate = jest.fn();
const mockSetAccepting = jest.fn();
const mockRefreshMenu = jest.fn(async () => undefined);
let mockPlans: ChefMealPlan[] = [];
let mockSchedules: Record<string, Partial<ChefMealSchedule>> = {};
let mockPlansState = {isLoading: false, isError: false, isRefetching: false, isFetching: false};
let mockMenuItems: unknown[] = [];

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({navigate: mockNavigate}),
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: require('react-native').View,
  useSafeAreaInsets: () => ({top: 0, bottom: 0, left: 0, right: 0}),
}));
jest.mock('../../../design/reducedMotion', () => ({
  useReducedMotionPreference: () => true,
}));
jest.mock('../../../core/config/runtimeConfig', () => ({
  getRuntimeConfig: () => ({apiBaseUrl: 'https://api.craves.in'}),
}));
jest.mock('../../chefMenu/state/useChefMenuModel', () => ({
  useChefMenuModel: () => ({items: mockMenuItems, isRefreshing: false, refresh: mockRefreshMenu}),
}));
jest.mock('../query/chefMealPlanQueries', () => ({
  invalidateChefMealPlans: jest.fn(async () => undefined),
  useChefMealPlansQuery: () => ({data: mockPlans, ...mockPlansState}),
  useChefMealPlanSchedulesQuery: () => mockSchedules,
  useSetAcceptingSubscribers: () => mockSetAccepting,
}));

const PLAN_A = '11111111-1111-4111-8111-111111111111';
const PLAN_B = '22222222-2222-4222-8222-222222222222';
const PLAN_C = '33333333-3333-4333-8333-333333333333';
const PLAN_D = '55555555-5555-4555-8555-555555555555';
const DISH_1 = '44444444-4444-4444-8444-444444444444';

const plan = (fields: Partial<ChefMealPlan> & {id: string; name: string}): ChefMealPlan =>
  ({
    planCode: 'CODE',
    description: null,
    billingPeriod: 'WEEKLY',
    amount: '1499',
    currency: 'INR',
    status: 'ACTIVE',
    reviewReason: null,
    ...fields,
  }) as ChefMealPlan;

const weekdayLunches = {
  items: [1, 2, 3, 4, 5].map(day => ({
    menuItemId: DISH_1,
    menuItemName: 'Thali',
    menuItemFoodType: 'VEG',
    isoDayOfWeek: day,
    dayOfMonth: null,
    mealSlotCode: 'LUNCH',
    serviceTime: '12:30:00',
    sequenceNumber: 1,
    quantity: 1,
  })),
} as Partial<ChefMealSchedule>;

let tree: renderer.ReactTestRenderer;

const queryClient = new QueryClient();
const element = (hideHeader = true) => (
  <QueryClientProvider client={queryClient}>
    <ChefMealPlansScreen hideHeader={hideHeader} />
  </QueryClientProvider>
);

function render(hideHeader = true) {
  act(() => {
    tree = renderer.create(element(hideHeader));
  });
}

const texts = () =>
  tree.root
    .findAllByType(Text)
    .map(node => [node.props.children].flat().filter(child => typeof child === 'string').join(''));

const button = (label: string): ReactTestInstance | undefined =>
  tree.root.findAll(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function')[0];
const press = (label: string) => act(() => button(label)!.props.onPress());

const mixedPlans = () => [
  plan({id: PLAN_A, name: 'Monthly Tiffin plan', billingPeriod: 'MONTHLY', amount: '1050', acceptingSubscribers: true, activeSubscriberCount: 8}),
  plan({id: PLAN_B, name: 'Weekly lunch box', amount: '499', status: 'PENDING_APPROVAL'}),
  plan({id: PLAN_C, name: 'Dinner trial', status: 'DRAFT'}),
  plan({id: PLAN_D, name: 'Old breakfast', status: 'INACTIVE'}),
];

describe('ChefMealPlansScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPlans = [];
    mockSchedules = {};
    mockMenuItems = [];
    mockPlansState = {isLoading: false, isError: false, isRefetching: false, isFetching: false};
  });
  afterEach(() => act(() => tree?.unmount()));

  it('draws its own title only when the Menu tab does not already draw one above it', () => {
    render(false);
    expect(texts()).toContain('Meal plans');

    act(() => tree.unmount());
    render(true);
    expect(texts()).not.toContain('Meal plans');
  });

  it('filters by status, with the counts in the pills', () => {
    mockPlans = [...mixedPlans(), plan({id: '66666666-6666-4666-8666-666666666666', name: 'Sent back', status: 'REJECTED', reviewReason: 'Add a photo'})];
    render();

    expect(texts()).toEqual(expect.arrayContaining(['All 5', 'Live 1', 'Waiting approval 1', 'Drafts 2']));
    expect(texts()).toEqual(expect.arrayContaining(['Monthly Tiffin plan', 'Weekly lunch box', 'Dinner trial', 'Old breakfast', 'Sent back']));

    press('Live 1');
    expect(texts()).toContain('Monthly Tiffin plan');
    expect(texts()).not.toContain('Weekly lunch box');

    press('Waiting approval 1');
    expect(texts()).toContain('Weekly lunch box');
    expect(texts()).not.toContain('Monthly Tiffin plan');

    press('Drafts 2');
    expect(texts()).toEqual(expect.arrayContaining(['Dinner trial', 'Sent back']));
    expect(texts()).not.toContain('Weekly lunch box');

    press('All 5');
    expect(texts()).toContain('Old breakfast');
  });

  it('shows the plan the way the board does: photo, name, status, meals, price', () => {
    mockMenuItems = [{id: DISH_1, images: [{primary: true, publicUrl: 'https://img.craves.in/thali.jpg'}]}];
    mockPlans = [plan({id: PLAN_A, name: 'Weekly lunch box', amount: '499'})];
    mockSchedules = {[PLAN_A]: weekdayLunches};
    render();

    expect(texts()).toEqual(expect.arrayContaining(['Weekly lunch box', 'Live', 'Weekly · Lunch · Mon – Fri', '₹499 / week']));
    expect(tree.root.findAllByType(Image).map(image => image.props.source.uri)).toEqual(['https://img.craves.in/thali.jpg']);
  });

  it('prefers the plan photo and falls back to a plain tile when there is none', () => {
    mockPlans = [
      plan({id: PLAN_A, name: 'Has Photo', imageUrl: `/api/v1/subscriptions/plans/${PLAN_A}/image?v=2`}),
      plan({id: PLAN_B, name: 'No Photo'}),
    ];
    render();

    expect(tree.root.findAllByType(Image).map(image => image.props.source.uri)).toEqual([
      `https://api.craves.in/api/v1/subscriptions/plans/${PLAN_A}/image?v=2`,
    ]);
  });

  it('shows "Taking new subscribers" with a switch for live plans only', () => {
    mockPlans = [
      plan({id: PLAN_A, name: 'Live', acceptingSubscribers: true}),
      plan({id: PLAN_B, name: 'Old backend'}),
      plan({id: PLAN_C, name: 'Draft', status: 'DRAFT', acceptingSubscribers: true}),
      plan({id: PLAN_D, name: 'Waiting', status: 'PENDING_APPROVAL', acceptingSubscribers: true}),
    ];
    render();

    const switches = tree.root.findAllByType(Switch);
    expect(switches).toHaveLength(1);
    expect(switches[0].props.value).toBe(true);
    expect(texts().filter(line => line === 'Taking new subscribers')).toHaveLength(1);
  });

  it('says when a live plan has stopped taking new subscribers', () => {
    mockPlans = [plan({id: PLAN_A, name: 'Live', acceptingSubscribers: false})];
    render();

    expect(tree.root.findByType(Switch).props.value).toBe(false);
    expect(texts()).toEqual(expect.arrayContaining(['Not taking new subscribers', 'Current subscribers keep getting meals.']));
  });

  it('shows the subscriber count only when the backend sends it', () => {
    mockPlans = [
      plan({id: PLAN_A, name: 'With count', acceptingSubscribers: true, activeSubscriberCount: 8}),
      plan({id: PLAN_B, name: 'One', acceptingSubscribers: true, activeSubscriberCount: 1}),
      plan({id: PLAN_C, name: 'Without', acceptingSubscribers: true}),
    ];
    render();

    expect(texts().filter(line => /subscribers?$/.test(line) && /^\d/.test(line))).toEqual(['8 subscribers', '1 subscriber']);
  });

  it('toggles the switch through the API', async () => {
    mockSetAccepting.mockResolvedValue(undefined);
    mockPlans = [plan({id: PLAN_A, name: 'Live', acceptingSubscribers: true})];
    render();

    await act(async () => {
      tree.root.findByType(Switch).props.onValueChange(false);
    });

    expect(mockSetAccepting).toHaveBeenCalledWith(PLAN_A, false);
  });

  it('reverts the switch and shows the server message on that card when the toggle fails', async () => {
    mockSetAccepting.mockRejectedValue(
      new AppApiError('PLAN_NOT_ACTIVE', 'Only live plans can change who they accept.', 409),
    );
    mockPlans = [plan({id: PLAN_A, name: 'Live', acceptingSubscribers: true})];
    render();

    await act(async () => {
      tree.root.findByType(Switch).props.onValueChange(false);
    });

    expect(tree.root.findByType(Switch).props.value).toBe(true);
    expect(texts()).toContain('Only live plans can change who they accept.');
  });

  it('keeps the server message when the failed toggle leaves the plan no longer live', async () => {
    mockSetAccepting.mockRejectedValue(new AppApiError('PLAN_NOT_ACTIVE', 'This plan is no longer live.', 409));
    mockPlans = [plan({id: PLAN_A, name: 'Live', acceptingSubscribers: true})];
    render();

    await act(async () => {
      tree.root.findByType(Switch).props.onValueChange(false);
    });
    mockPlans = [plan({id: PLAN_A, name: 'Live', status: 'INACTIVE', acceptingSubscribers: true})];
    act(() => tree.update(element()));

    expect(tree.root.findAllByType(Switch)).toHaveLength(0);
    expect(texts()).toContain('This plan is no longer live.');
  });

  it('puts Schedule and Daily limits on live plans only', () => {
    mockPlans = [plan({id: PLAN_A, name: 'Live'}), plan({id: PLAN_B, name: 'Waiting', status: 'PENDING_APPROVAL'})];
    render();

    expect(tree.root.findAll(node => node.props.accessibilityLabel === 'Schedule' && node.props.onPress)).toHaveLength(1);

    press('Schedule');
    expect(mockNavigate).toHaveBeenLastCalledWith('ChefMealPlanEditor', {planId: PLAN_A, step: 2});
    press('Daily limits');
    expect(mockNavigate).toHaveBeenLastCalledWith('ChefDailyLimits', {planId: PLAN_A});
  });

  it('explains why a waiting plan is locked and what a sent-back plan needs', () => {
    mockPlans = [
      plan({id: PLAN_A, name: 'Waiting', status: 'PENDING_APPROVAL'}),
      plan({id: PLAN_B, name: 'Sent back', status: 'REJECTED', reviewReason: 'Add a photo'}),
      plan({id: PLAN_C, name: 'Sent back, no reason', status: 'REJECTED'}),
    ];
    render();

    expect(texts()).toEqual(
      expect.arrayContaining([
        "Craves is checking this plan. You can't edit it until then.",
        'Craves asked for changes: Add a photo',
        'Craves asked for changes. Update the plan and submit it again.',
      ]),
    );
    expect(texts().join(' ')).not.toContain('Admin');
  });

  it('describes each card by name, status and price', () => {
    mockPlans = [plan({id: PLAN_A, name: 'Fine'})];
    render();

    expect(button('Fine, Live, ₹1,499 per week')).toBeDefined();
  });

  it('gives every button and filter at least 48 dp to tap, in its own box (a hit slop is clipped by the filter scroll view)', () => {
    mockPlans = mixedPlans();
    render();
    const tooSmall = tree.root
      .findAll(node => typeof node.props.onPress === 'function' && node.props.accessibilityRole !== undefined)
      .flatMap(node => {
        const raw = typeof node.props.style === 'function' ? node.props.style({pressed: false}) : node.props.style;
        const style = StyleSheet.flatten(raw) ?? {};
        const declared = (style.height ?? style.minHeight) as number | undefined;
        return declared !== undefined && declared < touchTarget.minimum ? [`${node.props.accessibilityLabel}: ${declared}`] : [];
      });

    expect(tooSmall).toEqual([]);
    for (const label of ['All 4', 'Live 1', 'Waiting approval 1', 'Drafts 1']) {
      const tap = tree.root.findAll(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function' && node.props.style)[0];
      expect(tap.props.hitSlop).toBeUndefined();
      expect(StyleSheet.flatten(tap.props.style).minHeight).toBeGreaterThanOrEqual(touchTarget.minimum);
    }
  });

  it('opens the editor for a tapped plan', () => {
    mockPlans = [plan({id: PLAN_A, name: 'Lunch Plan'})];
    render();

    press('Lunch Plan, Live, ₹1,499 per week');

    expect(mockNavigate).toHaveBeenCalledWith('ChefMealPlanEditor', {planId: PLAN_A});
  });

  it('offers one next step when there are no plans', () => {
    render();

    expect(texts()).toEqual(expect.arrayContaining(['No meal plans yet', 'Create a weekly or monthly plan from dishes on your menu.']));
    press('Create a plan');
    expect(mockNavigate).toHaveBeenCalledWith('ChefMealPlanEditor', {});
  });

  it('says so when a filter has no plans, and shows everything again from there', () => {
    mockPlans = [plan({id: PLAN_A, name: 'Live'})];
    render();

    press('Drafts 0');
    expect(texts()).toContain('No plans here');
    press('Show all plans');
    expect(texts()).toContain('Live');
  });

  it('shows a retry when the plans cannot be loaded, and never a half-empty list', () => {
    mockPlansState = {...mockPlansState, isError: true};
    render();

    expect(texts()).toContain("Couldn't load your meal plans");
    expect(texts()).not.toContain('No meal plans yet');
    press('Try again');
    expect(mockRefreshMenu).toHaveBeenCalled();
  });
});
