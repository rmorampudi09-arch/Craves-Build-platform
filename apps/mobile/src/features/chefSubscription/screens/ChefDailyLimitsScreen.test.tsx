import React from 'react';
import {Switch, Text, TextInput} from 'react-native';
import renderer, {act, type ReactTestInstance} from 'react-test-renderer';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {AppApiError} from '../../../core/http/apiError';
import {ChefToastProvider} from '../../chefShell/components/ui';
import {ChefDailyLimitsScreen} from './ChefDailyLimitsScreen';

const mockGoBack = jest.fn();
const mockRefetch = jest.fn();
const mockInvalidate = jest.fn(async () => undefined);
const mockPutSlotRule = jest.fn();
const mockPutMenuItemRule = jest.fn();
const mockPutDateOverride = jest.fn();
const mockPutMenuItemDateOverride = jest.fn();
let mockParams: {planId?: string} | undefined = {planId: 'plan-1'};
let mockPlans: unknown[] = [];
let mockSchedules: Record<string, unknown> = {};
let mockCapacity: {data?: unknown; error?: unknown; isLoading?: boolean} = {};
let mockDishes: unknown[] = [];

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({goBack: mockGoBack}),
  useRoute: () => ({params: mockParams}),
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: require('react-native').View,
  useSafeAreaInsets: () => ({top: 0, bottom: 0, left: 0, right: 0}),
}));
jest.mock('../../../design/reducedMotion', () => ({useReducedMotionPreference: () => true}));
jest.mock('../../chefMenu/state/useChefMenuModel', () => ({
  useChefMenuModel: () => ({items: mockDishes, status: 'success'}),
}));
jest.mock('../query/chefMealPlanQueries', () => ({
  invalidateChefMealPlans: () => mockInvalidate(),
  useChefMealPlansQuery: () => ({data: mockPlans}),
  useChefMealPlanSchedulesQuery: () => mockSchedules,
  useChefCapacityQuery: () => ({isLoading: false, refetch: mockRefetch, ...mockCapacity}),
}));
jest.mock('../api/chefSubscriptionApi', () => ({
  chefSubscriptionApi: {
    putSlotRule: (...args: unknown[]) => mockPutSlotRule(...args),
    putMenuItemRule: (...args: unknown[]) => mockPutMenuItemRule(...args),
    putDateOverride: (...args: unknown[]) => mockPutDateOverride(...args),
    putMenuItemDateOverride: (...args: unknown[]) => mockPutMenuItemDateOverride(...args),
  },
}));

const CHICKEN = '44444444-4444-4444-8444-444444444444';
const LEMON = '55555555-5555-4555-8555-555555555555';
const REASON = 'Updated by Chef in Craves mobile';

const dish = (id: string, itemName: string) => ({id, itemName, status: 'ACTIVE', available: true, images: []});
const weekdayLunches = {
  recurrenceType: 'WEEKLY',
  items: [1, 2, 3, 4, 5].map(day => ({isoDayOfWeek: day, dayOfMonth: null, mealSlotCode: 'LUNCH', menuItemId: CHICKEN})),
};
const slotRule = (isoDayOfWeek: number, fields: Record<string, unknown> = {}) => ({
  isoDayOfWeek,
  mealSlotCode: 'LUNCH',
  totalCapacityUnits: 20,
  subscriptionCapacityUnits: 10,
  salesEnabled: true,
  recurringReservedUnits: 8,
  recurringAvailableUnits: 2,
  recurringDeficitUnits: 0,
  ...fields,
});
const capacity = (fields: Record<string, unknown> = {}) => ({
  adminSalesFrozen: false,
  freezeReason: null,
  slotRules: [1, 2, 3, 4, 5].map(day => slotRule(day)),
  menuItemRules: [
    {isoDayOfWeek: 1, mealSlotCode: 'LUNCH', menuItemId: CHICKEN, maxSubscriptionUnits: 10, salesEnabled: true},
  ],
  dateOverrides: [],
  menuItemDateOverrides: [],
  ...fields,
});

let tree: renderer.ReactTestRenderer;
const queryClient = new QueryClient();

function render() {
  act(() => {
    tree = renderer.create(
      <QueryClientProvider client={queryClient}>
        <ChefToastProvider>
          <ChefDailyLimitsScreen />
        </ChefToastProvider>
      </QueryClientProvider>,
    );
  });
}

const allText = () =>
  tree.root
    .findAllByType(Text)
    .map(node => [node.props.children].flat().filter(child => typeof child === 'string' || typeof child === 'number').join(''));
const pressable = (label: string): ReactTestInstance | undefined =>
  tree.root.findAll(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function')[0];
const press = (label: string) => act(() => pressable(label)!.props.onPress());
const input = (label: string) => tree.root.findAllByType(TextInput).find(node => node.props.accessibilityLabel === label)!;
const toggle = (label: string, value: boolean) =>
  act(() => tree.root.findAllByType(Switch).find(node => node.props.accessibilityLabel === label)!.props.onValueChange(value));
const saveAll = () => act(async () => pressable('Save')!.props.onPress());

describe('ChefDailyLimitsScreen', () => {
  beforeAll(() => {
    // Only the clock is fixed: the calendar must know what "today" is.
    jest.useFakeTimers({
      now: new Date(2026, 9, 13, 10, 0),
      doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'clearImmediate', 'nextTick', 'queueMicrotask'],
    });
  });
  afterAll(() => jest.useRealTimers());
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = {planId: 'plan-1'};
    mockPlans = [{id: 'plan-1'}];
    mockSchedules = {'plan-1': weekdayLunches};
    mockCapacity = {data: capacity()};
    mockDishes = [dish(CHICKEN, 'Chicken curry'), dish(LEMON, 'Lemon rice')];
    mockPutSlotRule.mockResolvedValue({});
    mockPutMenuItemRule.mockResolvedValue({});
    mockPutDateOverride.mockResolvedValue({});
    mockPutMenuItemDateOverride.mockResolvedValue({});
  });
  afterEach(() => act(() => tree?.unmount()));

  it('opens on the meal the plan serves, in plain words', () => {
    render();

    expect(allText()).toEqual(
      expect.arrayContaining([
        'Daily limits',
        'How many plates you can cook',
        'Every weekday lunch',
        'Total plates',
        'All orders together',
        'Kept for subscribers',
        'The rest are for normal orders',
        'New subscribers can join',
        '8 subscriber plates booked · 2 free · 10 for normal orders',
        'Limits per dish',
        'Chicken curry: max 10 a day',
        'Change a single date',
        'Festival, holiday or fewer plates',
      ]),
    );
    expect(pressable('Lunch')!.props.accessibilityState.checked).toBe(true);
    expect(input('Total plates').props.value).toBe('20');
    expect(input('Kept for subscribers').props.value).toBe('10');
    expect(allText().join(' ')).not.toMatch(/deficit|reserved\/max|incident|override|units/i);
  });

  it('saves the stepper values for every weekday the plan serves that meal', async () => {
    render();
    press('More total plates');
    press('More total plates');
    press('Fewer kept for subscribers');
    toggle('New subscribers can join', false);
    await saveAll();

    expect(mockPutSlotRule).toHaveBeenCalledTimes(5);
    expect(mockPutSlotRule.mock.calls.map(([request]) => request.isoDayOfWeek)).toEqual([1, 2, 3, 4, 5]);
    expect(mockPutSlotRule).toHaveBeenCalledWith({
      isoDayOfWeek: 3,
      mealSlotCode: 'LUNCH',
      totalCapacityUnits: 22,
      subscriptionCapacityUnits: 9,
      salesEnabled: false,
      reason: REASON,
    });
    expect(mockInvalidate).toHaveBeenCalled();
    expect(allText()).toContain('Limits saved');
  });

  it('takes a typed plate count too, and keeps kept-for-subscribers within the total', async () => {
    render();
    act(() => input('Total plates').props.onChangeText('6'));

    expect(input('Total plates').props.value).toBe('6');
    expect(input('Kept for subscribers').props.value).toBe('6');
    act(() => input('Total plates').props.onChangeText('abc'));
    expect(input('Total plates').props.value).toBe('0');
    act(() => input('Total plates').props.onChangeText('30'));
    await saveAll();
    expect(mockPutSlotRule).toHaveBeenCalledWith(expect.objectContaining({totalCapacityUnits: 30, subscriptionCapacityUnits: 0}));
  });

  it('shows a bar of booked, free and normal plates that follows the steppers', () => {
    render();
    press('More kept for subscribers');

    expect(allText()).toContain('8 subscriber plates booked · 3 free · 9 for normal orders');
  });

  it('warns when subscribers have booked more plates than the limit', () => {
    mockCapacity = {data: capacity({slotRules: [slotRule(1, {recurringReservedUnits: 12, recurringDeficitUnits: 2})]})};
    render();

    expect(allText()).toContain('Subscribers have booked more plates than this limit. Raise it so every subscriber is served.');
  });

  it('switches meal, starting from 20 and 10 when that meal has no limit yet', async () => {
    render();
    press('Dinner');

    expect(allText()).toContain('Every weekday dinner');
    expect(input('Total plates').props.value).toBe('20');
    expect(allText()).toContain('No limits set');
    await saveAll();
    expect(mockPutSlotRule).toHaveBeenCalledWith(expect.objectContaining({mealSlotCode: 'DINNER', isoDayOfWeek: 1}));
  });

  it('uses the days of every plan when opened from the profile without a plan', async () => {
    mockParams = undefined;
    mockPlans = [{id: 'plan-1'}, {id: 'plan-2'}];
    mockSchedules = {
      'plan-1': weekdayLunches,
      'plan-2': {recurrenceType: 'WEEKLY', items: [{isoDayOfWeek: 6, dayOfMonth: null, mealSlotCode: 'LUNCH', menuItemId: CHICKEN}]},
    };
    render();

    expect(allText()).toContain('Lunch on Mon – Sat');
    await saveAll();
    expect(mockPutSlotRule).toHaveBeenCalledTimes(6);
  });

  it('says what went wrong without technical words, and keeps what was typed', async () => {
    mockPutSlotRule.mockRejectedValue(new AppApiError('CAPACITY_REJECTED', 'Chef slot capacity rule could not be verified.', 500));
    render();
    press('More total plates');
    await saveAll();

    expect(allText()).toContain("We couldn't save your limits. Try again.");
    expect(allText().join(' ')).not.toContain('verified');
    expect(input('Total plates').props.value).toBe('21');
  });

  it('will not save while Craves has paused subscriptions', () => {
    mockCapacity = {data: capacity({adminSalesFrozen: true, freezeReason: 'Under review'})};
    render();

    expect(allText()).toContain('Craves has paused new subscriptions for now. Under review');
    expect(pressable('Save')!.props.disabled).toBe(true);
  });

  describe('when the server has not published the limits yet', () => {
    it.each([
      ['a missing route', new AppApiError('NOT_FOUND', 'Not found', 404)],
      ['a gateway refusal with no body', new AppApiError('HTTP_403', 'Forbidden', 403)],
    ])('shows Coming soon, not an error or a retry, for %s', (_name, error) => {
      mockCapacity = {error};
      render();

      expect(allText()).toEqual(expect.arrayContaining(['Daily limits are on their way', 'Coming soon']));
      expect(pressable('Try again')).toBeUndefined();
      expect(pressable('Save')).toBeUndefined();
    });

    it('also shows Coming soon when only saving finds out', async () => {
      mockPutSlotRule.mockRejectedValue(new AppApiError('NOT_FOUND', 'Not found', 404));
      render();
      await saveAll();

      expect(allText()).toContain('Daily limits are on their way');
    });
  });

  it('retries a failed load', () => {
    mockCapacity = {error: new AppApiError('SERVER', 'Boom', 500)};
    render();

    expect(allText()).toContain("Couldn't load your daily limits");
    press('Try again');
    expect(mockRefetch).toHaveBeenCalled();
  });

  it('waits for the limits to load', () => {
    mockCapacity = {isLoading: true};
    render();

    expect(pressable('Save')).toBeUndefined();
    expect(allText()).not.toContain("Couldn't load your daily limits");
  });

  describe('limits per dish', () => {
    it('saves a dish limit for the same days', async () => {
      render();
      press('Limits per dish, Chicken curry: max 10 a day');

      expect(pressable('Chicken curry')!.props.accessibilityState.checked).toBe(true);
      expect(input('Plates of this dish').props.value).toBe('10');
      press('Lemon rice');
      expect(input('Plates of this dish').props.value).toBe('10');
      press('More plates of this dish');
      toggle('Subscribers can order this dish', false);
      await act(async () => pressable('Save dish limit')!.props.onPress());

      expect(mockPutMenuItemRule).toHaveBeenCalledTimes(5);
      expect(mockPutMenuItemRule).toHaveBeenCalledWith({
        menuItemId: LEMON,
        isoDayOfWeek: 2,
        mealSlotCode: 'LUNCH',
        maxSubscriptionUnits: 11,
        salesEnabled: false,
        reason: REASON,
      });
      expect(allText()).toContain('Dish limit saved');
    });

    it('asks for a dish on the menu first when there is none', () => {
      mockDishes = [];
      mockCapacity = {data: capacity({menuItemRules: []})};
      render();
      press('Limits per dish, No limits set');

      expect(allText()).toContain('Turn on a dish on your menu first.');
      expect(pressable('Save dish limit')).toBeUndefined();
    });
  });

  describe('change a single date', () => {
    it('uses a calendar, never typed dates', () => {
      render();
      press('Change a single date, Festival, holiday or fewer plates');

      expect(tree.root.findAllByType(TextInput).map(node => node.props.accessibilityLabel)).not.toEqual(
        expect.arrayContaining([expect.stringMatching(/date/i)]),
      );
      expect(pressable('25 October 2026')).toBeDefined();
      expect(pressable('Save date')!.props.disabled).toBe(true);
    });

    it('saves the plates for one date, on the chosen meal', async () => {
      render();
      press('Change a single date, Festival, holiday or fewer plates');
      press('25 October 2026');
      expect(allText()).toContain('Changing Sun 25 Oct');
      press('Fewer total plates that day');
      toggle('Close this meal that day', true);
      await act(async () => pressable('Save date')!.props.onPress());

      expect(mockPutDateOverride).toHaveBeenCalledWith({
        serviceDate: '2026-10-25',
        mealSlotCode: 'LUNCH',
        totalCapacityUnits: 19,
        subscriptionCapacityUnits: 10,
        closed: true,
        reason: 'Date override updated by Chef in Craves mobile',
      });
      expect(mockInvalidate).toHaveBeenCalled();
      expect(allText()).toContain('Date saved');
    });

    it('saves a limit for one dish on one date', async () => {
      render();
      press('Change a single date, Festival, holiday or fewer plates');
      press('One dish');
      press('26 October 2026');
      press('Lemon rice');
      press('More plates of this dish that day');
      await act(async () => pressable('Save date')!.props.onPress());

      expect(mockPutMenuItemDateOverride).toHaveBeenCalledWith({
        menuItemId: LEMON,
        serviceDate: '2026-10-26',
        mealSlotCode: 'LUNCH',
        maxSubscriptionUnits: 11,
        closed: false,
        reason: 'Dish date override updated by Chef in Craves mobile',
      });
      expect(mockPutDateOverride).not.toHaveBeenCalled();
    });

    it('lists the dates already changed for the meal', () => {
      mockCapacity = {
        data: capacity({
          dateOverrides: [{serviceDate: '2026-10-25', mealSlotCode: 'LUNCH', totalCapacityUnits: 15, subscriptionCapacityUnits: 5, closed: false}],
          menuItemDateOverrides: [{serviceDate: '2026-10-14', mealSlotCode: 'LUNCH', menuItemId: CHICKEN, maxSubscriptionUnits: 0, closed: true}],
        }),
      };
      render();
      press('Change a single date, Festival, holiday or fewer plates');

      expect(allText()).toEqual(
        expect.arrayContaining(['Tomorrow · Chicken curry: closed', 'Sun 25 Oct · 15 plates, 5 for subscribers']),
      );
    });

    it('shows Coming soon when the date route is not published', async () => {
      mockPutDateOverride.mockRejectedValue(new AppApiError('NOT_FOUND', 'Not found', 404));
      render();
      press('Change a single date, Festival, holiday or fewer plates');
      press('25 October 2026');
      await act(async () => pressable('Save date')!.props.onPress());

      expect(allText()).toContain('Daily limits are on their way');
    });
  });

  it('goes back', () => {
    render();
    press('Go back');

    expect(mockGoBack).toHaveBeenCalled();
  });
});
