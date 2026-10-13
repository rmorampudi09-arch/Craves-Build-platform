import React from 'react';
import {Linking, Text} from 'react-native';
import renderer, {act, type ReactTestInstance} from 'react-test-renderer';
import type {CustomerAddress} from '../../customerAddresses/domain/customerAddressContract';
import type {PlanScheduleSummary} from '../../mealPlans/domain/mealPlanSchedule';
import type {
  CustomerSubscription,
  PublicSubscriptionPlan,
  PublicSubscriptionPolicy,
} from '../api/customerSubscriptionApi';
import {upcomingStartDates} from '../domain/mealPlanPresentation';
import * as queries from '../query/mealPlanQueries';
import * as checkout from '../state/MealPlanCheckoutContext';
import * as subscriptionCheckout from '../state/useSubscriptionCheckout';
import {MealPlanActivatedScreen} from './MealPlanActivatedScreen';
import {MealPlanAddressScreen} from './MealPlanAddressScreen';
import {MealPlanDetailScreen} from './MealPlanDetailScreen';
import {MealPlanPaymentScreen} from './MealPlanPaymentScreen';
import {MealPlanReviewScreen} from './MealPlanReviewScreen';
import {MealPlansScreen} from './MealPlansScreen';

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: require('react-native').View,
  useSafeAreaInsets: () => ({top: 0, bottom: 0, left: 0, right: 0}),
}));
jest.mock('../../../design/reducedMotion', () => ({
  useReducedMotionPreference: () => true,
}));
jest.mock('../query/mealPlanQueries', () => ({
  usePublicMealPlansQuery: jest.fn(),
  useNearbyMealPlansQuery: jest.fn(),
  useHasMealPlanLocation: jest.fn(() => true),
  useMySubscriptionsQuery: jest.fn(),
  usePlanCover: jest.fn(),
  usePlanScheduleQuery: jest.fn(),
  usePlanPolicyQuery: jest.fn(),
  useMenuItemPreview: jest.fn(() => ({imageUrl: null, kitchenName: null})),
  useLatestSubscriptionPaymentQuery: jest.fn(() => ({data: undefined})),
}));
jest.mock('../state/useSubscriptionCheckout', () => ({
  useSubscriptionCheckout: jest.fn(),
  useInterruptedPaymentRecovery: jest.fn(() => ({pending: null, resume: jest.fn()})),
  alertProfileIncomplete: jest.fn(),
}));
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: jest.fn(),
}));
jest.mock('../state/MealPlanCheckoutContext', () => ({
  useMealPlanCheckout: jest.fn(),
  useSelectedDeliveryAddress: jest.fn(),
}));
jest.mock('../../customerAddresses/query/customerAddressQueries', () => ({
  useCustomerAddressesQuery: () => ({addresses: [], refetch: jest.fn()}),
}));
jest.mock('../../customerAddresses/screens/CustomerAddressEditorModal', () => ({
  CustomerAddressEditorModal: jest.fn(() => null),
}));

const {CustomerAddressEditorModal: mockEditor} = jest.requireMock(
  '../../customerAddresses/screens/CustomerAddressEditorModal',
) as {CustomerAddressEditorModal: jest.Mock};

const weekly: PublicSubscriptionPlan = {
  id: '11111111-1111-4111-8111-111111111111',
  planCode: 'WEEK',
  name: 'Weekly Home Lunch Plan',
  description: 'Fresh lunches through the week.',
  billingPeriod: 'WEEKLY',
  amount: '1499',
  currency: 'INR',
};
const monthly: PublicSubscriptionPlan = {
  ...weekly,
  id: '22222222-2222-4222-8222-222222222222',
  planCode: 'MONTH',
  name: 'Monthly Dinner Plan',
  billingPeriod: 'MONTHLY',
  amount: '5200',
};
const summary: PlanScheduleSummary = {
  mealCount: 5,
  slotLabels: ['Lunch'],
  daysLabel: 'Mon – Fri',
  timeLabel: '12:30 PM',
  foodType: 'NON_VEG',
  coverMenuItemId: null,
};
const policy: PublicSubscriptionPolicy = {
  customerPauseEnabled: true,
  customerResumeEnabled: true,
  customerCancelEnabled: true,
  customerSkipEnabled: true,
  pauseCutoffMinutes: 0,
  resumeLeadMinutes: 1440,
  cancelCutoffMinutes: 0,
  skipCutoffMinutes: 1440,
  holidayPolicyReference: null,
  unusedMealPolicyReference: null,
  refundPolicyReference: 'https://craves.in/refunds',
};

function address(id: string, overrides: Partial<CustomerAddress> = {}): CustomerAddress {
  return {
    id,
    identityId: null,
    addressLabel: 'HOME',
    recipientName: 'Asha',
    contactPhoneNumber: '+919999999999',
    addressLine1: 'Flat 102, Skyline Apartments',
    addressLine2: null,
    landmark: null,
    areaName: 'Madhapur',
    districtName: null,
    city: 'Hyderabad',
    state: 'Telangana',
    postalCode: '500081',
    latitude: 17.4,
    longitude: 78.4,
    isDefault: false,
    active: true,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

const navigation = {
  navigate: jest.fn(),
  replace: jest.fn(),
  reset: jest.fn(),
  setOptions: jest.fn(),
  addListener: jest.fn((_event: string, _listener: (event: {preventDefault(): void}) => void) => jest.fn()),
  goBack: jest.fn(),
  popToTop: jest.fn(),
  getParent: jest.fn(() => ({goBack: jest.fn()})),
};
const checkoutState = {
  startDate: null as string | null,
  setStartDate: jest.fn(),
  deliveryAddressId: null,
  setDeliveryAddressId: jest.fn(),
  checkoutAttempt: {current: null},
};

function given({
  plans = [weekly, monthly],
  subscriptions = [],
  covers = {},
  addresses = [],
}: {
  plans?: PublicSubscriptionPlan[];
  subscriptions?: CustomerSubscription[];
  covers?: Record<string, Partial<ReturnType<typeof queries.usePlanCover>>>;
  addresses?: CustomerAddress[];
} = {}) {
  const selected = addresses[0] ?? null;
  jest.mocked(queries.usePublicMealPlansQuery).mockReturnValue({
    data: plans,
    isLoading: false,
    isError: false,
  } as never);
  jest.mocked(queries.useNearbyMealPlansQuery).mockReturnValue({
    data: plans,
    isLoading: false,
    isError: false,
  } as never);
  jest.mocked(queries.useMySubscriptionsQuery).mockReturnValue({data: subscriptions} as never);
  jest.mocked(queries.usePlanCover).mockImplementation(planId => ({
    imageUrl: null,
    kitchenName: null,
    summary: null,
    rating: null,
    ...covers[planId ?? ''],
  }));
  jest.mocked(queries.usePlanScheduleQuery).mockReturnValue({data: undefined} as never);
  jest.mocked(queries.usePlanPolicyQuery).mockReturnValue({data: policy} as never);
  jest.mocked(checkout.useMealPlanCheckout).mockReturnValue(checkoutState);
  jest.mocked(checkout.useSelectedDeliveryAddress).mockReturnValue({
    address: selected,
    addresses,
    loading: false,
    isError: false,
  });
}

let tree: renderer.ReactTestRenderer | undefined;
function render(element: React.ReactElement) {
  let created: renderer.ReactTestRenderer | undefined;
  act(() => {
    tree?.unmount();
    created = renderer.create(element);
  });
  tree = created;
  return tree!.root;
}
afterEach(() => {
  act(() => tree?.unmount());
  tree = undefined;
  jest.clearAllMocks();
  checkoutState.startDate = null;
});

// Own string children only, so a nested <Text> shows up as its own entry.
const texts = (root: ReactTestInstance) =>
  root
    .findAllByType(Text)
    .map(node =>
      [node.props.children]
        .flat()
        .filter(child => typeof child === 'string' || typeof child === 'number')
        .join(''),
    );
// The Pressable element (not its host View) carries onPress/disabled.
const byProp = (root: ReactTestInstance, prop: string, value: unknown) =>
  root.findAll(node => typeof node.type !== 'string' && node.props[prop] === value)[0];
const byLabel = (root: ReactTestInstance, label: string) =>
  byProp(root, 'accessibilityLabel', label);
const cards = (root: ReactTestInstance) =>
  root
    .findAll(node => typeof node.type === 'string' && /^meal-plan-card-/.test(node.props.testID))
    .map(node => node.props.testID.replace('meal-plan-card-', ''));
const route = (params?: object) => ({key: 'route', name: 'route', params}) as never;

describe('MealPlansScreen', () => {
  const renderList = () => render(<MealPlansScreen navigation={navigation as never} route={route()} />);
  beforeEach(() => {
    jest.mocked(subscriptionCheckout.useInterruptedPaymentRecovery).mockReturnValue({
      pending: null,
      resume: jest.fn(),
      busy: false,
      settled: null,
      dismissSettled: jest.fn(),
    });
  });

  it('renders a card per plan and filters by billing period', () => {
    given();
    const root = renderList();
    expect(cards(root)).toEqual([weekly.id, monthly.id]);

    act(() => byLabel(root, 'Monthly').props.onPress());
    expect(cards(root)).toEqual([monthly.id]);
    act(() => byLabel(root, 'Weekly').props.onPress());
    expect(cards(root)).toEqual([weekly.id]);
  });

  it('labels the card with price and unit and opens the plan', () => {
    given();
    const root = renderList();
    act(() => byLabel(root, 'Weekly Home Lunch Plan, ₹1,499 per week').props.onPress());
    expect(navigation.navigate).toHaveBeenCalledWith('MealPlanDetail', {planId: weekly.id});
  });

  it('searches by plan name and by kitchen name', () => {
    given({covers: {[monthly.id]: {kitchenName: "Lakshmi's Kitchen"}}});
    const root = renderList();
    const search = byLabel(root, 'Search meal plans');
    act(() => search.props.onChangeText('lakshmi'));
    expect(cards(root)).toEqual([monthly.id]);
    act(() => search.props.onChangeText('weekly home'));
    expect(cards(root)).toEqual([weekly.id]);
    expect(texts(root)).not.toContain('No plans match "weekly home".');

    act(() => search.props.onChangeText(' biryani '));
    expect(cards(root)).toEqual([]);
    expect(texts(root)).toContain('No plans match "biryani".');
    act(() => search.props.onChangeText(''));
    expect(cards(root)).toEqual([weekly.id, monthly.id]);
    expect(texts(root).some(text => text.startsWith('No plans match'))).toBe(false);
  });

  it('reports an interrupted payment that went through and opens the plan', () => {
    const dismissSettled = jest.fn();
    jest.mocked(subscriptionCheckout.useInterruptedPaymentRecovery).mockReturnValue({
      pending: null,
      resume: jest.fn(),
      busy: false,
      settled: {kind: 'paid', subscriptionId: 'sub-9'},
      dismissSettled,
    });
    given();
    const root = renderList();
    expect(texts(root)).toContain('Your meal plan payment went through.');
    act(() => byLabel(root, 'View My Plan').props.onPress());
    expect(dismissSettled).toHaveBeenCalled();
    expect(navigation.navigate).toHaveBeenCalledWith('MyMealPlan', {subscriptionId: 'sub-9'});
  });

  it('reports an interrupted payment that did not complete, dismissibly', () => {
    const dismissSettled = jest.fn();
    jest.mocked(subscriptionCheckout.useInterruptedPaymentRecovery).mockReturnValue({
      pending: null,
      resume: jest.fn(),
      busy: false,
      settled: {kind: 'failed'},
      dismissSettled,
    });
    given();
    const root = renderList();
    expect(texts(root)).toContain("Your last meal plan payment didn't complete. You can try again safely.");
    expect(byLabel(root, 'View My Plan')).toBeUndefined();
    act(() => byLabel(root, 'Dismiss').props.onPress());
    expect(dismissSettled).toHaveBeenCalled();
  });

  it('keeps a card without a schedule: name and price, no meal meta', () => {
    given({covers: {[weekly.id]: {summary, kitchenName: "Lakshmi's Kitchen"}}});
    const shown = texts(renderList());
    expect(shown).toEqual(expect.arrayContaining(['5 meals · Lunch', "By Lakshmi's Kitchen"]));
    expect(shown).toEqual(expect.arrayContaining(['Monthly Dinner Plan', '₹5,200', ' / month']));
    expect(shown.filter(text => text.includes('meals ·'))).toHaveLength(1);
  });

  it('offers My plans in the header for one plan and as cards for several', () => {
    const sub = (id: string, status: string) =>
      ({id, planId: weekly.id, status, planName: null}) as unknown as CustomerSubscription;
    given({subscriptions: [sub('cancelled', 'CANCELLED'), sub('active', 'ACTIVE')]});
    let root = renderList();
    act(() => byLabel(root, 'My plans').props.onPress());
    expect(navigation.navigate).toHaveBeenCalledWith('MyMealPlan', {subscriptionId: 'active'});

    given({subscriptions: [sub('one', 'ACTIVE'), sub('two', 'PENDING_PAYMENT')]});
    root = renderList();
    expect(byLabel(root, 'My plans')).toBeUndefined();
    act(() => byLabel(root, 'Weekly Home Lunch Plan, Payment pending').props.onPress());
    expect(navigation.navigate).toHaveBeenCalledWith('MyMealPlan', {subscriptionId: 'two'});
  });

  it('leaves the meal-plan flow from the back button', () => {
    given();
    const parent = {goBack: jest.fn()};
    navigation.getParent.mockReturnValue(parent);
    const root = renderList();
    act(() => byLabel(root, 'Go back').props.onPress());
    expect(parent.goBack).toHaveBeenCalled();
  });

  it('shows the empty state', () => {
    given({plans: []});
    expect(texts(renderList())).toContain('No meal plans near you yet');
  });

  it('asks for a delivery location before listing nearby plans', () => {
    given({plans: []});
    jest.mocked(queries.useHasMealPlanLocation).mockReturnValueOnce(false);
    expect(texts(renderList())).toContain('Choose a delivery location to see meal plans near you');
  });
});

describe('MealPlanDetailScreen', () => {
  it('sets the first upcoming start date when none is chosen and opens Review', () => {
    given({covers: {[weekly.id]: {summary}}, addresses: [address('home')]});
    const root = render(
      <MealPlanDetailScreen navigation={navigation as never} route={route({planId: weekly.id})} />,
    );
    expect(texts(root)).toEqual(
      expect.arrayContaining(['5 lunches', 'Mon – Fri', '12:30 PM', 'Home · Madhapur, Hyderabad']),
    );
    act(() => byLabel(root, 'Choose plan').props.onPress());
    expect(checkoutState.setStartDate).toHaveBeenCalledWith(upcomingStartDates(new Date())[0]);
    expect(navigation.navigate).toHaveBeenCalledWith('MealPlanReview', {planId: weekly.id});
  });
});

describe('MealPlanReviewScreen', () => {
  const renderReview = () =>
    render(
      <MealPlanReviewScreen navigation={navigation as never} route={route({planId: weekly.id})} />,
    );

  it('disables payment without an address and offers to add one', () => {
    given({covers: {[weekly.id]: {summary}}});
    const root = renderReview();
    expect(byLabel(root, 'Proceed to payment').props.disabled).toBe(true);

    act(() => byLabel(root, 'Add an address for delivery').props.onPress());
    const props = mockEditor.mock.calls.at(-1)?.[0];
    expect(props.mode).toBe('add');
    act(() => props.onSaved(address('new')));
    expect(checkoutState.setDeliveryAddressId).toHaveBeenCalledWith('new');
  });

  it('shows the plan details and proceeds to payment with a fresh start date', () => {
    checkoutState.startDate = '2000-01-01';
    given({covers: {[weekly.id]: {summary}}, addresses: [address('home')]});
    const root = renderReview();
    expect(texts(root)).toEqual(
      expect.arrayContaining(['Madhapur, Hyderabad', 'Weekly', '5 lunches · Mon – Fri']),
    );
    act(() => byLabel(root, 'Proceed to payment').props.onPress());
    expect(checkoutState.setStartDate).toHaveBeenCalledWith(upcomingStartDates(new Date())[0]);
    expect(navigation.navigate).toHaveBeenCalledWith('MealPlanPayment', {planId: weekly.id});
  });

  it('links the full policy only when the reference is a URL', () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    given({addresses: [address('home')]});
    const root = renderReview();
    act(() => byProp(root, 'accessibilityRole', 'link').props.onPress());
    expect(openURL).toHaveBeenCalledWith('https://craves.in/refunds');

    jest.mocked(queries.usePlanPolicyQuery).mockReturnValue({
      data: {...policy, refundPolicyReference: 'Refunds per Craves terms'},
    } as never);
    expect(texts(renderReview())).not.toContain('View full policy');
    openURL.mockRestore();
  });
});

describe('MealPlanAddressScreen', () => {
  it('delivers to the picked address', () => {
    const home = address('home', {isDefault: true});
    const office = address('office', {addressLabel: 'WORK', areaName: 'Hitech City'});
    given({addresses: [home, office]});
    const root = render(<MealPlanAddressScreen navigation={navigation as never} route={route()} />);
    const radio = (id: string) => byProp(root, 'testID', `meal-plan-address-${id}`);
    expect(radio('home').props.accessibilityState).toEqual({checked: true});

    act(() => radio('office').props.onPress());
    expect(radio('office').props.accessibilityState).toEqual({checked: true});
    expect(checkoutState.setDeliveryAddressId).not.toHaveBeenCalled();

    act(() => byLabel(root, 'Deliver here').props.onPress());
    expect(checkoutState.setDeliveryAddressId).toHaveBeenCalledWith('office');
    expect(navigation.goBack).toHaveBeenCalled();
  });

  it('opens the editor to edit or add an address', () => {
    given({addresses: [address('home')]});
    const root = render(<MealPlanAddressScreen navigation={navigation as never} route={route()} />);
    act(() => byLabel(root, 'Edit Home').props.onPress());
    expect(mockEditor.mock.calls.at(-1)?.[0]).toMatchObject({mode: 'edit', address: {id: 'home'}});
    act(() => mockEditor.mock.calls.at(-1)?.[0].onClose());
    act(() => byLabel(root, 'Add new address').props.onPress());
    expect(mockEditor.mock.calls.at(-1)?.[0].mode).toBe('add');
  });
});

describe('MealPlanPaymentScreen', () => {
  const payNew = jest.fn();
  const payExisting = jest.fn();
  const renderPayment = (params: object = {planId: weekly.id}) =>
    render(<MealPlanPaymentScreen navigation={navigation as never} route={route(params)} />);
  const pay = async (root: ReactTestInstance) => {
    await act(async () => {
      byLabel(root, 'Pay & Subscribe').props.onPress();
    });
  };
  beforeEach(() => {
    jest.mocked(subscriptionCheckout.useSubscriptionCheckout).mockReturnValue({
      payNew,
      payExisting,
      busy: false,
    });
  });

  it('disables paying without an address and offers to add one', () => {
    given({covers: {[weekly.id]: {summary}}});
    const root = renderPayment();
    expect(byLabel(root, 'Pay & Subscribe').props.disabled).toBe(true);
    act(() => byLabel(root, 'Add an address delivery address').props.onPress());
    expect(mockEditor.mock.calls.at(-1)?.[0].mode).toBe('add');
  });

  it('subscribes with the selected address and replaces itself with Activated when paid', async () => {
    checkoutState.startDate = upcomingStartDates(new Date())[1];
    given({covers: {[weekly.id]: {summary}}, addresses: [address('home')]});
    payNew.mockResolvedValue({kind: 'paid', subscriptionId: 'sub-1', payment: {}});
    const root = renderPayment();
    expect(texts(root)).toEqual(
      expect.arrayContaining(['5 lunches · Mon – Fri', 'Every week', 'You can cancel anytime. No lock-in period.']),
    );
    await pay(root);
    expect(payNew).toHaveBeenCalledWith({
      planId: weekly.id,
      startDate: checkoutState.startDate,
      deliveryAddressId: 'home',
    });
    expect(navigation.replace).toHaveBeenCalledWith('MealPlanActivated', {subscriptionId: 'sub-1'});
  });

  it('stays on Payment with an inline message when Razorpay does not complete', async () => {
    given({addresses: [address('home')]});
    payNew.mockResolvedValue({kind: 'not-completed', subscriptionId: 'sub-1', message: 'Payment not completed. Closed.'});
    const root = renderPayment();
    await pay(root);
    expect(texts(root)).toContain('Payment not completed. Closed.');
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it('pays an existing subscription and hides the footnote when cancelling is off', async () => {
    given();
    jest.mocked(queries.usePlanPolicyQuery).mockReturnValue({
      data: {...policy, customerCancelEnabled: false},
    } as never);
    payExisting.mockResolvedValue({kind: 'processing', subscriptionId: 'sub-1'});
    const root = renderPayment({planId: weekly.id, subscriptionId: 'sub-1'});
    expect(texts(root)).not.toContain('You can cancel anytime. No lock-in period.');
    await pay(root);
    expect(payExisting).toHaveBeenCalledWith('sub-1');
    expect(texts(root)).toContain("Payment is processing. We'll update your plan shortly.");
    act(() => byLabel(root, 'Go to My Meal Plan').props.onPress());
    expect(navigation.reset).toHaveBeenCalledWith({
      index: 1,
      routes: [{name: 'MealPlans'}, {name: 'MyMealPlan', params: {subscriptionId: 'sub-1'}}],
    });
  });

  it('blocks leaving while checkout is open and releases before its own navigation', async () => {
    given({addresses: [address('home')]});
    let finish: (outcome: unknown) => void = () => undefined;
    payNew.mockReturnValue(new Promise(resolve => (finish = resolve)));
    const root = renderPayment();
    const beforeRemove = navigation.addListener.mock.calls.find(([event]) => event === 'beforeRemove')![1];
    const leave = () => {
      const event = {preventDefault: jest.fn()};
      beforeRemove(event);
      return event.preventDefault;
    };

    expect(leave()).not.toHaveBeenCalled();
    let paying: Promise<void> | undefined;
    act(() => {
      paying = byLabel(root, 'Pay & Subscribe').props.onPress();
    });
    let prevented: jest.Mock | undefined;
    act(() => {
      prevented = leave();
    });
    expect(prevented).toHaveBeenCalled();
    expect(texts(root)).toContain('Payment in progress — please wait.');
    navigation.replace.mockImplementation(() => expect(leave()).not.toHaveBeenCalled());
    await act(async () => {
      finish({kind: 'paid', subscriptionId: 'sub-1', payment: {}});
      await paying;
    });
    expect(navigation.replace).toHaveBeenCalledWith('MealPlanActivated', {subscriptionId: 'sub-1'});
    expect(texts(root)).not.toContain('Payment in progress — please wait.');
    navigation.replace.mockReset();
  });

  it('completes payment for a subscription whose plan is no longer listed', () => {
    given({
      plans: [],
      subscriptions: [
        {
          id: 'sub-1',
          planId: weekly.id,
          startDate: '2026-10-14',
          deliveryAddressId: 'home',
          planName: 'Old Lunch Plan',
          billingPeriod: 'MONTHLY',
          amount: '999',
          currency: 'INR',
        } as never,
      ],
      addresses: [address('home')],
    });
    jest.mocked(queries.useLatestSubscriptionPaymentQuery).mockReturnValue({
      data: {amount: {amount: '1250.00', currency: 'INR'}},
    } as never);
    const shown = texts(renderPayment({planId: weekly.id, subscriptionId: 'sub-1'}));
    expect(shown).toEqual(
      expect.arrayContaining(['Old Lunch Plan', 'Monthly', '₹1,250', ' / month', 'Wed, 14 Oct 2026', 'Every month']),
    );
  });
});

describe('MealPlanActivatedScreen', () => {
  it('summarises the plan and leaves the meal-plan flow for Home', () => {
    const startDate = '2026-10-14'; // a Wednesday
    given({
      subscriptions: [
        {id: '3f2a9c1e-5b6d-4e7f-8a9b-0c1d2e3f4a5b', planId: weekly.id, startDate, planName: null} as never,
      ],
    });
    jest.mocked(queries.usePlanScheduleQuery).mockReturnValue({
      data: {
        items: [
          {menuItemId: 'a', menuItemName: 'Pulao', isoDayOfWeek: 5, mealSlotCode: 'LUNCH', serviceTime: '12:30:00', sequenceNumber: 2, quantity: 1},
          {menuItemId: 'b', menuItemName: 'Dal Rice', isoDayOfWeek: 3, mealSlotCode: 'LUNCH', serviceTime: '12:30:00', sequenceNumber: 1, quantity: 1},
        ],
      },
    } as never);
    jest.mocked(queries.useLatestSubscriptionPaymentQuery).mockReturnValue({
      data: {status: 'PAID', amount: {amount: '1499.00', currency: 'INR'}},
    } as never);
    const tabs = {navigate: jest.fn()};
    const tabStack = {goBack: jest.fn(), getParent: () => tabs};
    navigation.getParent.mockReturnValue(tabStack as never);

    const root = render(
      <MealPlanActivatedScreen
        navigation={navigation as never}
        route={route({subscriptionId: '3f2a9c1e-5b6d-4e7f-8a9b-0c1d2e3f4a5b'})}
      />,
    );
    expect(texts(root)).toEqual(
      expect.arrayContaining([
        'CRV-3F2A9C1E',
        'Weekly Home Lunch Plan',
        '₹1,499',
        'Wed, 14 Oct 2026',
        'Dal Rice · 12:30 PM',
      ]),
    );

    act(() => byLabel(root, 'View My Plan').props.onPress());
    expect(navigation.reset).toHaveBeenCalledWith({
      index: 1,
      routes: [
        {name: 'MealPlans'},
        {name: 'MyMealPlan', params: {subscriptionId: '3f2a9c1e-5b6d-4e7f-8a9b-0c1d2e3f4a5b'}},
      ],
    });
    act(() => byLabel(root, 'Back to Home').props.onPress());
    expect(tabStack.goBack).toHaveBeenCalled();
    expect(tabs.navigate).toHaveBeenCalledWith('Home', {screen: 'CustomerHomeRoot', pop: true});
  });
});
