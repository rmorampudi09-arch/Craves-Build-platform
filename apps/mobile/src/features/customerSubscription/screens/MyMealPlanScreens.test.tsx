import React from 'react';
import {Alert, Text} from 'react-native';
import renderer, {act, type ReactTestInstance} from 'react-test-renderer';
import {AppApiError} from '../../../core/http/apiError';
import type {
  CustomerSubscription,
  CustomerSubscriptionOccurrence,
  PublicSubscriptionPolicy,
} from '../api/customerSubscriptionApi';
import {formatMealPlanDate, todayIso} from '../domain/mealPlanPresentation';
import * as queries from '../query/mealPlanQueries';
import {MealPlanMealScreen} from './MealPlanMealScreen';
import {MyMealPlanScreen} from './MyMealPlanScreen';

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: require('react-native').View,
  useSafeAreaInsets: () => ({top: 0, bottom: 0, left: 0, right: 0}),
}));
jest.mock('../../../design/reducedMotion', () => ({
  useReducedMotionPreference: () => true,
}));
jest.mock('../query/mealPlanQueries', () => ({
  resolveApiImageUrl: jest.fn(() => null),
  usePublicMealPlansQuery: jest.fn(() => ({data: []})),
  useMySubscriptionsQuery: jest.fn(),
  usePlanCover: jest.fn(() => ({imageUrl: null, kitchenName: null, summary: null, rating: null})),
  usePlanScheduleQuery: jest.fn(() => ({data: undefined})),
  usePlanPolicyQuery: jest.fn(),
  useSubscriptionOccurrencesQuery: jest.fn(),
  useLatestSubscriptionPaymentQuery: jest.fn(() => ({data: undefined})),
  useMenuItemPreview: jest.fn(() => ({imageUrl: null, kitchenName: null})),
  useOccurrenceOrderQuery: jest.fn(() => ({data: undefined})),
  useSubscriptionActions: jest.fn(),
}));
jest.mock('../../customerAddresses/query/customerAddressQueries', () => ({
  useCustomerAddressesQuery: () => ({
    addresses: [{id: 'addr', areaName: 'Madhapur', districtName: null, city: 'Hyderabad'}],
  }),
}));

const planId = '11111111-1111-4111-8111-111111111111';
const subscriptionId = '33333333-3333-4333-8333-333333333333';
const allOn: PublicSubscriptionPolicy = {
  customerPauseEnabled: true,
  customerResumeEnabled: true,
  customerCancelEnabled: true,
  customerSkipEnabled: true,
  pauseCutoffMinutes: 0,
  resumeLeadMinutes: 0,
  cancelCutoffMinutes: 0,
  skipCutoffMinutes: 0,
  holidayPolicyReference: null,
  unusedMealPolicyReference: null,
  refundPolicyReference: null,
};
const allOff: PublicSubscriptionPolicy = {
  ...allOn,
  customerPauseEnabled: false,
  customerResumeEnabled: false,
  customerCancelEnabled: false,
  customerSkipEnabled: false,
};

function subscription(over: Partial<CustomerSubscription> = {}): CustomerSubscription {
  return {
    id: subscriptionId,
    planId,
    status: 'ACTIVE',
    startDate: '2026-10-01',
    endDate: null,
    nextServiceDate: null,
    deliveryAddressId: 'addr',
    notes: null,
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
    planName: 'Weekly Home Lunch Plan',
    billingPeriod: 'WEEKLY',
    amount: '1499',
    currency: 'INR',
    nextBillingDate: '2026-10-19',
    ...over,
  };
}

const inAnHour = () => new Date(Date.now() + 3_600_000).toISOString();
function occurrence(over: Partial<CustomerSubscriptionOccurrence> = {}): CustomerSubscriptionOccurrence {
  return {
    id: 'occ-1',
    serviceDate: todayIso(new Date()),
    mealSlotCode: 'LUNCH',
    serviceAt: inAnHour(),
    status: 'READY_FOR_ORDER',
    items: [{menuItemId: 'dish', quantity: 2, sequenceNumber: 1}],
    ...over,
  };
}

const done = () => Promise.resolve(undefined);
const actions = {
  pause: jest.fn(done),
  resume: jest.fn((_date: string) => done()),
  skip: jest.fn((_date: string) => done()),
  cancel: jest.fn(done),
  pending: false,
};

function given({
  sub = subscription(),
  policy = allOn,
  occurrences = [] as CustomerSubscriptionOccurrence[],
}: {sub?: CustomerSubscription; policy?: PublicSubscriptionPolicy; occurrences?: CustomerSubscriptionOccurrence[]} = {}) {
  jest.mocked(queries.useMySubscriptionsQuery).mockReturnValue({data: [sub]} as never);
  jest.mocked(queries.usePlanPolicyQuery).mockReturnValue({data: policy} as never);
  jest.mocked(queries.useSubscriptionOccurrencesQuery).mockReturnValue({data: occurrences} as never);
  jest.mocked(queries.useSubscriptionActions).mockReturnValue(actions);
  jest.mocked(queries.useLatestSubscriptionPaymentQuery).mockReturnValue({data: undefined} as never);
  jest.mocked(queries.useOccurrenceOrderQuery).mockReturnValue({data: undefined} as never);
}

const navigation = {navigate: jest.fn(), goBack: jest.fn(), popToTop: jest.fn(), getParent: jest.fn()};
const route = (params: object) => ({key: 'route', name: 'route', params}) as never;

let tree: renderer.ReactTestRenderer | undefined;
function render(element: React.ReactElement) {
  act(() => {
    tree = renderer.create(element);
  });
  return tree!.root;
}
afterEach(() => {
  act(() => tree?.unmount());
  tree = undefined;
  jest.clearAllMocks();
});

const texts = (root: ReactTestInstance) =>
  root
    .findAllByType(Text)
    .map(node => [node.props.children].flat().filter(child => typeof child === 'string').join(''));
const byLabel = (root: ReactTestInstance, label: string) =>
  root.findAll(node => typeof node.type !== 'string' && node.props.accessibilityLabel === label)[0];
const pressText = (root: ReactTestInstance, text: string) => {
  let node: ReactTestInstance | null = root.findAllByType(Text).find(t => t.props.children === text) ?? null;
  while (node && !node.props.onPress) {
    node = node.parent;
  }
  act(() => node?.props.onPress());
};
/** Presses `label` in the most recent Alert. */
async function pressAlert(label: string) {
  const buttons = jest.mocked(Alert.alert).mock.calls.at(-1)?.[2] ?? [];
  await act(async () => {
    buttons.find(button => button.text === label)?.onPress?.();
  });
}

describe('MyMealPlanScreen', () => {
  const renderPlan = () =>
    render(<MyMealPlanScreen navigation={navigation as never} route={route({subscriptionId})} />);
  beforeEach(() => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });

  it('shows the plan with Renews for an active plan, and the next meal', () => {
    given({occurrences: [occurrence()]});
    const root = renderPlan();
    const shown = texts(root);
    expect(shown).toEqual(
      expect.arrayContaining(['Weekly Home Lunch Plan', 'Active', '₹1,499', 'Renews ', 'Mon, 19 Oct', 'Madhapur']),
    );
    expect(shown.find(text => text.startsWith('Today · '))).toBeDefined();
    act(() => byLabel(root, 'View details').props.onPress());
    expect(navigation.navigate).toHaveBeenCalledWith('MealPlanMeal', {subscriptionId, occurrenceId: 'occ-1'});
  });

  it('keeps loading while the list refetches without the new plan, then says it is gone', () => {
    given();
    const unavailable = 'This meal plan is no longer available';
    jest.mocked(queries.useMySubscriptionsQuery).mockReturnValue({
      data: [],
      isLoading: false,
      isFetching: true,
    } as never);
    expect(texts(renderPlan())).not.toContain(unavailable);

    jest.mocked(queries.useMySubscriptionsQuery).mockReturnValue({
      data: [],
      isLoading: false,
      isFetching: false,
    } as never);
    act(() => tree?.update(<MyMealPlanScreen navigation={navigation as never} route={route({subscriptionId})} />));
    expect(texts(tree!.root)).toContain(unavailable);
  });

  it('offers a retry when meals fail to load and refreshes everything on pull', async () => {
    given();
    const refetch = {
      subscriptions: jest.fn(async () => undefined),
      occurrences: jest.fn(async () => undefined),
      payment: jest.fn(async () => undefined),
    };
    jest.mocked(queries.useMySubscriptionsQuery).mockReturnValue({
      data: [subscription()],
      refetch: refetch.subscriptions,
    } as never);
    jest.mocked(queries.useSubscriptionOccurrencesQuery).mockReturnValue({
      data: undefined,
      isError: true,
      refetch: refetch.occurrences,
    } as never);
    jest.mocked(queries.useLatestSubscriptionPaymentQuery).mockReturnValue({
      data: undefined,
      refetch: refetch.payment,
    } as never);
    const root = renderPlan();
    expect(texts(root)).not.toContain("Your meals will show here once they're scheduled.");
    act(() => byLabel(root, 'Try again').props.onPress());
    expect(refetch.occurrences).toHaveBeenCalledTimes(1);

    const scroll = root.findAll(node => node.props.refreshControl !== undefined)[0];
    await act(async () => scroll.props.refreshControl.props.onRefresh());
    expect(refetch.subscriptions).toHaveBeenCalled();
    expect(refetch.occurrences).toHaveBeenCalledTimes(2);
    expect(refetch.payment).toHaveBeenCalled();
  });

  it('shows Paid until instead of Renews when the plan is not active', () => {
    given({sub: subscription({status: 'PAUSED'})});
    jest.mocked(queries.useLatestSubscriptionPaymentQuery).mockReturnValue({
      data: {status: 'PAID', cycleEnd: '2026-10-18'},
    } as never);
    const shown = texts(renderPlan());
    expect(shown).not.toContain('Renews ');
    expect(shown).toEqual(expect.arrayContaining(['Paid until ', 'Sun, 18 Oct']));
    expect(shown).toContain("Your meals will show here once they're scheduled.");
  });

  it('hides Pause, Skip and Cancel when the policy disables them', () => {
    given({policy: allOff});
    const root = renderPlan();
    for (const label of ['Pause plan', 'Resume plan', 'Skip a meal', 'Cancel plan']) {
      expect(byLabel(root, label)).toBeUndefined();
    }
  });

  it('pauses after confirming and shows the server message when it fails', async () => {
    given();
    const message = 'The administrator-configured cutoff has passed';
    actions.pause.mockRejectedValueOnce(new AppApiError('SUBSCRIPTION_PAUSE_CUTOFF', message, 409));
    const root = renderPlan();
    expect(byLabel(root, 'Resume plan')).toBeUndefined();
    act(() => byLabel(root, 'Pause plan').props.onPress());
    await pressAlert('Pause plan');
    expect(actions.pause).toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenLastCalledWith('Plan not updated', message);
  });

  it('resumes a paused plan from tomorrow', async () => {
    given({sub: subscription({status: 'PAUSED'})});
    const root = renderPlan();
    expect(byLabel(root, 'Pause plan')).toBeUndefined();
    expect(byLabel(root, 'Skip a meal')).toBeUndefined();
    act(() => byLabel(root, 'Resume plan').props.onPress());
    await pressAlert('Resume plan');
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    expect(actions.resume).toHaveBeenCalledWith(todayIso(tomorrow));
  });

  it('turns Pause off when the bill has no pause days left', () => {
    given({sub: subscription({pauseDaysPerBill: 1, pauseDaysLeft: 0})});
    const root = renderPlan();
    expect(byLabel(root, 'Pause plan')).toBeUndefined();
    expect(byLabel(root, 'No pause days left this bill').props.disabled).toBe(true);
  });

  it('shows the automatic restart and hides a resume that would come later', () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const restart = todayIso(tomorrow);
    given({sub: subscription({status: 'PAUSED', pauseDaysLeft: 0, pauseAutoResumeDate: restart})});
    const root = renderPlan();
    expect(texts(root)).toContain(`Restarts on ${formatMealPlanDate(restart, 'long')}`);
    expect(byLabel(root, 'Resume plan')).toBeUndefined();
  });

  it('offers Resume when the automatic restart never happened', () => {
    given({sub: subscription({status: 'PAUSED', pauseDaysLeft: 0, pauseAutoResumeDate: '2026-01-01'})});
    const root = renderPlan();
    expect(texts(root).some(text => text.startsWith('Restarts on'))).toBe(false);
    expect(byLabel(root, 'Resume plan')).toBeDefined();
  });

  it('skips a date picked from the sheet', async () => {
    const later = occurrence({id: 'occ-2', serviceDate: '2099-01-02', serviceAt: '2099-01-02T07:00:00Z'});
    given({occurrences: [later]});
    const root = renderPlan();
    act(() => byLabel(root, 'Skip a meal').props.onPress());
    pressText(root, formatMealPlanDate('2099-01-02', 'long'));
    await pressAlert('Skip meal');
    expect(actions.skip).toHaveBeenCalledWith('2099-01-02');
  });

  it('cancels after a destructive confirm', async () => {
    given();
    const root = renderPlan();
    act(() => byLabel(root, 'Cancel plan').props.onPress());
    const buttons = jest.mocked(Alert.alert).mock.calls.at(-1)?.[2];
    expect(buttons?.find(button => button.text === 'Cancel plan')?.style).toBe('destructive');
    await pressAlert('Cancel plan');
    expect(actions.cancel).toHaveBeenCalled();
  });

  it('offers Complete payment with both ids while payment is pending', () => {
    given({sub: subscription({status: 'PENDING_PAYMENT', nextBillingDate: null})});
    const root = renderPlan();
    act(() => byLabel(root, 'Complete payment').props.onPress());
    expect(navigation.navigate).toHaveBeenCalledWith('MealPlanPayment', {planId, subscriptionId});
  });
});

describe('MealPlanMealScreen', () => {
  const renderMeal = () =>
    render(
      <MealPlanMealScreen
        navigation={navigation as never}
        route={route({subscriptionId, occurrenceId: 'occ-1'})}
      />,
    );

  it('tracks a placed order through the parent stack', () => {
    given({occurrences: [occurrence({status: 'ORDER_CREATED', orderId: 'order-1'})]});
    jest.mocked(queries.useOccurrenceOrderQuery).mockReturnValue({data: {status: 'OUT_FOR_DELIVERY'}} as never);
    const parent = {navigate: jest.fn()};
    navigation.getParent.mockReturnValue(parent);
    const root = renderMeal();
    expect(texts(root)).toEqual(
      expect.arrayContaining(["Today's Meal", 'Your meal is on the way.', 'Madhapur, Hyderabad', '2 servings']),
    );
    expect(byLabel(root, 'Out for delivery, current step')).toBeDefined();
    act(() => byLabel(root, 'Track order').props.onPress());
    expect(parent.navigate).toHaveBeenCalledWith('CustomerOrderTracking', {orderId: 'order-1'});
  });

  it('shows Order cancelled for a cancelled order', () => {
    given({occurrences: [occurrence({status: 'ORDER_CREATED', orderId: 'order-1'})]});
    jest.mocked(queries.useOccurrenceOrderQuery).mockReturnValue({data: {status: 'CHEF_REJECTED'}} as never);
    expect(texts(renderMeal())).toContain('Order cancelled');
  });

  it('uses the two-step tracker without an order', () => {
    given({occurrences: [occurrence({serviceDate: '2099-01-02'})]});
    const root = renderMeal();
    expect(texts(root)).toContain('Upcoming Meal');
    expect(byLabel(root, 'Scheduled, current step')).toBeDefined();
    expect(byLabel(root, 'Track order')).toBeUndefined();
  });

  it('shows only the badge and line for a skipped meal', () => {
    given({occurrences: [occurrence({status: 'SKIPPED', orderId: 'order-1'})]});
    const root = renderMeal();
    expect(texts(root)).toEqual(expect.arrayContaining(['Skipped', 'You skipped this meal.']));
    expect(byLabel(root, 'Track order')).toBeUndefined();
  });
});
