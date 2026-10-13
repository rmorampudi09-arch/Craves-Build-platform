import React from 'react';
import {Text} from 'react-native';
import {NavigationContainer, createNavigationContainerRef} from '@react-navigation/native';
import renderer, {act, type ReactTestInstance} from 'react-test-renderer';
import type {ChefToastApi} from '../../features/chefShell/components/ui';
import {ChefRootNavigator} from './ChefRootNavigator';

function mockScreenModule(name: string) {
  const ReactActual = require('react');
  const {Text: MockText} = require('react-native');
  return {[name]: () => ReactActual.createElement(MockText, null, `SCREEN:${name}`)};
}

let mockToast: ChefToastApi | undefined;

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('../../design/reducedMotion', () => ({useReducedMotionPreference: () => false}));
const mockDispatch = jest.fn();
jest.mock('../store/hooks', () => ({useAppDispatch: () => mockDispatch}));
jest.mock('../../features/chefShell/state/chefRoleIsolation', () => ({isolateChefRole: () => Promise.resolve()}));
jest.mock('../../features/chefShell/state/ChefOperationalProvider', () => ({
  ChefOperationalProvider: ({children}: {children: React.ReactNode}) => children,
  useChefOperationalState: () => ({counters: {pendingAcceptance: 3, unreadNotifications: 0}}),
}));
jest.mock('../../features/chefProfile/state/ChefEditProfileDraftProvider', () => ({
  ChefEditProfileDraftProvider: ({children}: {children: React.ReactNode}) => children,
}));
jest.mock('./ChefMenuTabScreen', () => mockScreenModule('ChefMenuTabScreen'));
jest.mock('../../features/chefDashboard/screens/ChefDashboardScreen', () => {
  const ReactActual = require('react');
  const {Text: MockText} = require('react-native');
  const {useChefToast: useToast} = require('../../features/chefShell/components/ui');
  return {
    ChefDashboardScreen: () => {
      mockToast = useToast();
      return ReactActual.createElement(MockText, null, 'SCREEN:ChefDashboardScreen');
    },
  };
});
jest.mock('../../features/chefBusinessInformation/screens/ChefBusinessInformationScreen', () => mockScreenModule('ChefBusinessInformationScreen'));
jest.mock('../../features/chefMenu/screens/ChefAddMenuItemScreen', () => mockScreenModule('ChefAddMenuItemScreen'));
jest.mock('../../features/chefMenu/screens/ChefEditMenuItemScreen', () => mockScreenModule('ChefEditMenuItemScreen'));
jest.mock('../../features/chefMenu/screens/ChefMenuItemDetailScreen', () => mockScreenModule('ChefMenuItemDetailScreen'));
jest.mock('../../features/chefOrders/screens/ChefOrderDetailScreen', () => mockScreenModule('ChefOrderDetailScreen'));
jest.mock('../../features/chefOrders/screens/ChefOrdersScreen', () => mockScreenModule('ChefOrdersScreen'));
jest.mock('../../features/chefPayout/screens/ChefPayoutHistoryScreen', () => mockScreenModule('ChefPayoutHistoryScreen'));
jest.mock('../../features/chefPreferences/screens/ChefAppPreferencesScreen', () => mockScreenModule('ChefAppPreferencesScreen'));
jest.mock('../../features/chefProfile/screens/ChefEditProfileScreen', () => mockScreenModule('ChefEditProfileScreen'));
jest.mock('../../features/chefProfile/screens/ChefProfileScreen', () => mockScreenModule('ChefProfileScreen'));
jest.mock('../../features/chefProfile/screens/ChefSecurityScreen', () => mockScreenModule('ChefSecurityScreen'));
jest.mock('../../features/chefReferrals/screens/ChefReferralEarningsScreen', () => mockScreenModule('ChefReferralEarningsScreen'));
jest.mock('../../features/chefReferrals/screens/ChefReferralScreen', () => mockScreenModule('ChefReferralScreen'));
jest.mock('../../features/chefSchedule/screens/ChefKitchenScheduleScreen', () => mockScreenModule('ChefKitchenScheduleScreen'));
jest.mock('../../features/chefSubscription/screens/ChefMealPlanEditorScreen', () => mockScreenModule('ChefMealPlanEditorScreen'));
jest.mock('../../features/chefSubscription/screens/ChefSubscriptionPlanScreen', () => mockScreenModule('ChefSubscriptionPlanScreen'));
jest.mock('../../features/chefSupport/screens/ChefSupportScreen', () => mockScreenModule('ChefSupportScreen'));
jest.mock('../../features/chefSupport/screens/ChefSupportTicketScreen', () => mockScreenModule('ChefSupportTicketScreen'));
jest.mock('../../features/reviews/screens/ChefReviewsScreen', () => mockScreenModule('ChefReviewsScreen'));
jest.mock('../../features/chefShell/screens/ChefNotificationsScreen', () => mockScreenModule('ChefNotificationsScreen'));

const navigationRef = createNavigationContainerRef<never>();
let tree: renderer.ReactTestRenderer;

const textOf = (node: ReactTestInstance) => React.Children.toArray(node.props.children).join('');
const allText = () => tree.root.findAllByType(Text).map(textOf);
const tab = (name: string) =>
  tree.root.findAll(
    node => typeof node.props.onPress === 'function' && String(node.props.accessibilityLabel).startsWith(`${name} tab`),
  )[0];
const press = (label: string) =>
  act(() => tree.root.findAll(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function')[0].props.onPress());
const navigate = (...args: unknown[]) =>
  act(() => (navigationRef.navigate as (...a: unknown[]) => void)(...args));

async function mount() {
  act(() => {
    tree = renderer.create(
      <NavigationContainer ref={navigationRef}>
        <ChefRootNavigator />
      </NavigationContainer>,
    );
  });
  await act(async () => {
    await Promise.resolve();
  });
}

describe('ChefRootNavigator', () => {
  beforeEach(async () => {
    mockToast = undefined;
    await mount();
  });
  afterEach(() => act(() => tree.unmount()));

  it('opens on Home with the five tabs and the new-order count on Orders', () => {
    expect(allText()).toContain('SCREEN:ChefDashboardScreen');
    expect(allText()).toEqual(expect.arrayContaining(['Home', 'Orders', 'Menu', 'Earnings', 'Profile', '3']));
    expect(tab('Orders').props.accessibilityLabel).toBe('Orders tab, 3 new orders');
  });

  it('switches tabs from the bar: Orders opens the New list and Earnings the placeholder', () => {
    act(() => tab('Orders').props.onPress());
    expect(allText()).toContain('SCREEN:ChefOrdersScreen');
    act(() => tab('Earnings').props.onPress());
    expect(allText()).toEqual(expect.arrayContaining(['Earnings', 'Coming soon']));
  });

  it('sends the old Profile Scheduled orders route to Orders and leaves Profile usable', () => {
    act(() => tab('Profile').props.onPress());
    navigate('ChefTabs', {screen: 'Profile', params: {screen: 'ChefScheduledOrders'}});
    expect(allText()).toContain('SCREEN:ChefOrdersScreen');
    act(() => tab('Profile').props.onPress());
    expect(allText()).toContain('SCREEN:ChefProfileScreen');
    expect(tab('Profile').props.accessibilityState).toEqual({selected: true});
  });

  it('does the same when the redirect is opened straight into an unmounted Profile stack', () => {
    navigate('ChefTabs', {screen: 'Profile', params: {screen: 'ChefScheduledOrders'}});
    expect(allText()).toContain('SCREEN:ChefOrdersScreen');
    act(() => tab('Profile').props.onPress());
    expect(allText()).toContain('SCREEN:ChefProfileScreen');
    expect(tab('Profile').props.accessibilityState).toEqual({selected: true});
  });

  it('reaches every new route without a crash', () => {
    navigate('ChefTabs', {screen: 'Orders', params: {screen: 'ChefOrdersScheduled'}});
    expect(allText()).toContain('SCREEN:ChefOrdersScreen');
    for (const [route, text] of [
      ['ChefReviews', 'SCREEN:ChefReviewsScreen'],
      ['ChefSecurity', 'SCREEN:ChefSecurityScreen'],
      ['ChefBankAccount', 'Bank account'],
    ]) {
      navigate('ChefTabs', {screen: 'Profile', params: {screen: route}});
      expect(allText()).toContain(text);
    }
    navigate('ChefDailyLimits', {planId: 'p1'});
    expect(allText()).toContain('Daily limits');
    navigate('ChefSupportTicket', {topic: 'payout'});
    expect(allText()).toContain('SCREEN:ChefSupportTicketScreen');
  });

  it('opens the notifications screen from the bell', () => {
    act(() => tab('Earnings').props.onPress());
    press('Notifications');
    expect(allText()).toContain('SCREEN:ChefNotificationsScreen');
  });

  it('provides the toast to every chef screen', () => {
    expect(mockToast).toBeDefined();
    act(() => mockToast!.show('Saved'));
    expect(allText()).toContain('Saved');
  });
});
