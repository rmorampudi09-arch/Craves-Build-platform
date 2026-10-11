import React from 'react';
import {Image, Switch, Text, TextInput} from 'react-native';
import renderer, {act, type ReactTestInstance} from 'react-test-renderer';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {AppApiError} from '../../../core/http/apiError';
import type {ChefMealPlan, ChefMealSchedule} from '../api/chefSubscriptionApi';
import {ChefMealPlansScreen} from './ChefMealPlansScreen';

const mockNavigate = jest.fn();
const mockSetAccepting = jest.fn();
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
jest.mock('../../chefShell/components/ChefHeader', () => ({ChefHeader: () => null}));
jest.mock('../../chefMenu/state/useChefMenuModel', () => ({
  useChefMenuModel: () => ({
    items: mockMenuItems,
    isRefreshing: false,
    refresh: jest.fn(async () => undefined),
  }),
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
const element = (accessory?: React.ReactNode) => (
  <QueryClientProvider client={queryClient}>
    <ChefMealPlansScreen headerAccessory={accessory} />
  </QueryClientProvider>
);

function render(accessory?: React.ReactNode) {
  act(() => {
    tree = renderer.create(element(accessory));
  });
}

const texts = () =>
  tree.root
    .findAllByType(Text)
    .map(node => node.props.children)
    .flat()
    .filter((child: unknown): child is string => typeof child === 'string');

const openButton = (label: string): ReactTestInstance =>
  tree.root.findAll(node => node.props.accessibilityLabel === label && node.props.onPress)[0];

describe('ChefMealPlansScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPlans = [];
    mockSchedules = {};
    mockMenuItems = [];
    mockPlansState = {isLoading: false, isError: false, isRefetching: false, isFetching: false};
  });
  afterEach(() => act(() => tree?.unmount()));

  it('shows the metrics, the accessory and a card per plan', () => {
    mockPlans = [
      plan({id: PLAN_A, name: 'Weekly Home Lunch Plan', description: 'Fresh lunches.'}),
      plan({id: PLAN_B, name: 'Healthy Veg Plan', status: 'PENDING_APPROVAL'}),
      plan({
        id: PLAN_C,
        name: 'Monthly Dinner Plan',
        billingPeriod: 'MONTHLY',
        amount: '5499',
        status: 'DRAFT',
      }),
    ];
    mockSchedules = {[PLAN_A]: weekdayLunches};
    render(<Text>SEGMENT_ACCESSORY</Text>);

    const all = texts();
    expect(all).toEqual(
      expect.arrayContaining([
        'SEGMENT_ACCESSORY',
        'Your menu',
        'Total',
        'Live',
        'Pending approval',
        'Draft',
        'Meal plans',
        'Weekly Home Lunch Plan',
        'Weekly · 5 lunches · Mon – Fri',
        'Fresh lunches.',
        '₹1,499 / week',
        '₹5,499 / month',
        'Monthly',
      ]),
    );
    expect(tree.root.findAllByType(TextInput)[0].props.placeholder).toBe('Search your meal plans');
    expect(tree.root.findAllByType(Text).some(node => node.props.children?.join?.('') === '3 of 3')).toBe(true);
  });

  it('still renders a plan whose schedule is empty, with the chef icon instead of a photo', () => {
    mockPlans = [plan({id: PLAN_A, name: 'No Schedule Plan'})];
    mockSchedules = {[PLAN_A]: {items: []}};
    render();

    expect(texts()).toEqual(expect.arrayContaining(['No Schedule Plan', 'Weekly', '₹1,499 / week']));
    expect(tree.root.findAllByType(Image)).toHaveLength(0);
  });

  it('prefers the plan photo, then the first dish photo', () => {
    mockMenuItems = [{id: DISH_1, images: [{primary: true, publicUrl: 'https://img.craves.in/thali.jpg'}]}];
    mockPlans = [
      plan({id: PLAN_A, name: 'Has Photo', imageUrl: `/api/v1/subscriptions/plans/${PLAN_A}/image?v=2`}),
      plan({id: PLAN_B, name: 'Dish Photo', imageUrl: null}),
      plan({id: PLAN_C, name: 'No Photo'}),
    ];
    mockSchedules = {[PLAN_A]: weekdayLunches, [PLAN_B]: weekdayLunches, [PLAN_C]: {items: []}};
    render();

    expect(tree.root.findAllByType(Image).map(image => image.props.source.uri)).toEqual([
      `https://api.craves.in/api/v1/subscriptions/plans/${PLAN_A}/image?v=2`,
      'https://img.craves.in/thali.jpg',
    ]);
  });

  it('shows the admin reason on a plan with requested changes', () => {
    mockPlans = [plan({id: PLAN_A, name: 'Rejected', status: 'REJECTED', reviewReason: 'Add a photo'})];
    render();

    expect(texts()).toEqual(expect.arrayContaining(['Changes requested']));
    expect(tree.root.findAllByType(Text).some(node => node.props.children?.join?.('') === 'Admin: Add a photo')).toBe(true);
  });

  it('shows the switch only for a live plan that reports acceptingSubscribers', () => {
    mockPlans = [
      plan({id: PLAN_A, name: 'Live', acceptingSubscribers: true}),
      plan({id: PLAN_B, name: 'Old backend'}),
      plan({id: PLAN_C, name: 'Draft', status: 'DRAFT', acceptingSubscribers: true}),
    ];
    render();

    const switches = tree.root.findAllByType(Switch);
    expect(switches).toHaveLength(1);
    expect(switches[0].props.value).toBe(true);
    expect(texts()).toEqual(
      expect.arrayContaining(['Accepting new subscribers', 'Live and visible to customers.']),
    );
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
    mockSetAccepting.mockRejectedValue(
      new AppApiError('PLAN_NOT_ACTIVE', 'This plan is no longer live.', 409),
    );
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

  it('describes each card by name, status and price, with the admin reason as the hint', () => {
    mockPlans = [
      plan({id: PLAN_A, name: 'Rejected', status: 'REJECTED', reviewReason: 'Add a photo'}),
      plan({id: PLAN_B, name: 'Fine'}),
    ];
    render();

    expect(openButton('Rejected, Changes requested, ₹1,499 per week').props.accessibilityHint).toBe(
      'Admin: Add a photo',
    );
    expect(openButton('Fine, Live, ₹1,499 per week').props.accessibilityHint).toBeUndefined();
  });

  it('opens the editor for a tapped plan', () => {
    mockPlans = [plan({id: PLAN_A, name: 'Lunch Plan'})];
    render();

    act(() => openButton('Lunch Plan, Live, ₹1,499 per week').props.onPress());

    expect(mockNavigate).toHaveBeenCalledWith('ChefMealPlanEditor', {planId: PLAN_A});
  });

  it('filters by name', () => {
    mockPlans = [plan({id: PLAN_A, name: 'Weekly Lunch'}), plan({id: PLAN_B, name: 'Monthly Dinner'})];
    render();

    act(() => tree.root.findByType(TextInput).props.onChangeText('dinner'));

    expect(texts()).toContain('Monthly Dinner');
    expect(texts()).not.toContain('Weekly Lunch');
    expect(tree.root.findAllByType(Text).some(node => node.props.children?.join?.('') === '1 of 2')).toBe(true);
  });

  it('explains an empty list', () => {
    render();

    expect(texts()).toEqual(
      expect.arrayContaining([
        'No meal plans yet',
        'Create a weekly or monthly plan from dishes on your menu.',
      ]),
    );
  });
});
