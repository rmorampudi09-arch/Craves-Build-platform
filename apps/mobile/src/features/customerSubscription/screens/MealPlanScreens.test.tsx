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
import {MealPlanAddressScreen} from './MealPlanAddressScreen';
import {MealPlanDetailScreen} from './MealPlanDetailScreen';
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
  useMySubscriptionsQuery: jest.fn(),
  usePlanCover: jest.fn(),
  usePlanScheduleQuery: jest.fn(),
  usePlanPolicyQuery: jest.fn(),
  useMenuItemPreview: jest.fn(() => ({imageUrl: null, kitchenName: null})),
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
  goBack: jest.fn(),
  popToTop: jest.fn(),
  getParent: jest.fn(() => ({goBack: jest.fn()})),
};
const checkoutState = {
  startDate: null as string | null,
  setStartDate: jest.fn(),
  deliveryAddressId: null,
  setDeliveryAddressId: jest.fn(),
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
    expect(texts(renderList())).toContain('No meal plans yet');
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

    act(() => byLabel(root, 'Add an address delivery address').props.onPress());
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
