import React from 'react';
import {Text} from 'react-native';
import {NavigationContainer, createNavigationContainerRef} from '@react-navigation/native';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import renderer, {act, type ReactTestInstance} from 'react-test-renderer';
import {CustomerRootNavigator} from './CustomerRootNavigator';

function mockScreenModule(...names: string[]) {
  const ReactActual = require('react');
  const {Text: MockText} = require('react-native');
  return Object.fromEntries(
    names.map(name => [name, () => ReactActual.createElement(MockText, null, `SCREEN:${name}`)]),
  );
}

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('../../design/reducedMotion', () => ({useReducedMotionPreference: () => true}));
jest.mock('../store/hooks', () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: (select: (state: unknown) => unknown) => select({auth: {identity: null}}),
}));
jest.mock('./CustomerBottomNavController', () => ({
  CustomerBottomNavVisibilityProvider: ({children}: {children: React.ReactNode}) => children,
  CustomerBottomNavScene: ({children}: {children: React.ReactNode}) => children,
  CustomerBottomTabBar: () => null,
  CustomerBottomTabButton: () => null,
  useCustomerBottomNavReveal: () => () => undefined,
}));
jest.mock('../../features/cart/components/KitchenSwitchDialog', () => mockScreenModule('KitchenSwitchHost'));
jest.mock('../../features/cart/screens/CustomerCartScreen', () => mockScreenModule('CustomerCartScreen'));
jest.mock('../../features/chefDiscovery/screens/DiscoverHomeChefsRouteScreen', () => mockScreenModule('DiscoverHomeChefsRouteScreen'));
jest.mock('../../features/customerAddresses/screens/CustomerAddressesRouteScreen', () => mockScreenModule('CustomerAddressesRouteScreen'));
jest.mock('../../features/customerOrders/screens/CustomerOrderDetailScreen', () => mockScreenModule('CustomerOrderDetailScreen'));
jest.mock('../../features/customerOrders/screens/CustomerOrdersRouteScreen', () => mockScreenModule('CustomerOrdersRouteScreen'));
jest.mock('../../features/customerOrders/screens/CustomerOrderTrackingScreen', () => mockScreenModule('CustomerOrderTrackingScreen'));
jest.mock('../../features/reviews/screens/CustomerOrderReviewScreen', () => mockScreenModule('CustomerOrderReviewScreen'));
jest.mock('../../features/customerProfile/screens/CustomerProfileEditRouteScreen', () => mockScreenModule('CustomerProfileEditRouteScreen'));
jest.mock('../../features/customerProfile/screens/CustomerProfileRouteScreen', () => mockScreenModule('CustomerProfileRouteScreen'));
jest.mock('../../features/customerSettings/screens/CustomerSettingsChildScreens', () =>
  mockScreenModule(
    'CustomerSettingsAboutScreen',
    'CustomerSettingsAppearanceScreen',
    'CustomerSettingsChangePasswordScreen',
    'CustomerSettingsLanguageScreen',
    'CustomerSettingsLegalScreen',
    'CustomerSettingsNotificationsScreen',
    'CustomerSettingsPrivacySecurityScreen',
    'CustomerSettingsReferralScreen',
    'CustomerSettingsShareScreen',
    'CustomerSettingsSubscriptionScreen',
  ),
);
jest.mock('../../features/customerSettings/screens/CustomerSettingsRouteScreen', () => mockScreenModule('CustomerSettingsRouteScreen'));
jest.mock('../../features/customerSupport/screens/CustomerHelpSupportRouteScreen', () => mockScreenModule('CustomerHelpSupportRouteScreen'));
jest.mock('../../features/dishDetail/screens/CustomerDishDetailScreen', () => mockScreenModule('CustomerDishDetailScreen'));
jest.mock('../../features/dishDetail/screens/CustomerDishIngredientsScreen', () => mockScreenModule('CustomerDishIngredientsScreen'));
jest.mock('../../features/discoveryFilters/screens/CustomerFilterSortScreen', () => mockScreenModule('CustomerFilterSortScreen'));
jest.mock('../../features/discoverySearch/screens/CustomerHomeSearchScreen', () => mockScreenModule('CustomerHomeSearchScreen'));
jest.mock('../../features/favorites/screens/CustomerFavoritesRouteScreen', () => mockScreenModule('CustomerFavoritesRouteScreen'));
jest.mock('../../features/home/screens/CustomerHomeRouteScreen', () => mockScreenModule('CustomerHomeRouteScreen'));
jest.mock('../../features/referralsV2/screens/CustomerReferralScreens', () => mockScreenModule('CustomerShareInvitationScreen'));
jest.mock('../../features/kitchenProfile/screens/CustomerKitchenProfileScreen', () => mockScreenModule('CustomerKitchenProfileScreen'));
jest.mock('../../features/notifications/screens/CustomerNotificationsRouteScreen', () => mockScreenModule('CustomerNotificationsRouteScreen'));
jest.mock('../../features/payment/screens/CustomerPaymentMethodsRouteScreen', () => mockScreenModule('CustomerPaymentMethodsRouteScreen'));
jest.mock('../../features/supportChat/screens/SupportChatRouteScreens', () => {
  const ReactActual = require('react');
  const {Text: MockText} = require('react-native');
  const {useRoute} = require('@react-navigation/native');
  return {
    CustomerSupportChatRouteScreen: () =>
      ReactActual.createElement(MockText, null, `SCREEN:CustomerSupportChat:${useRoute().params?.orderId ?? 'no order'}`),
  };
});

const navigationRef = createNavigationContainerRef<never>();
let tree: renderer.ReactTestRenderer;

const textOf = (node: ReactTestInstance) => React.Children.toArray(node.props.children).join('');
const allText = () => tree.root.findAllByType(Text).map(textOf);
const navigate = (...args: unknown[]) => act(() => (navigationRef.navigate as (...a: unknown[]) => void)(...args));

async function mount() {
  act(() => {
    tree = renderer.create(
      <QueryClientProvider client={new QueryClient()}>
        <NavigationContainer ref={navigationRef}>
          <CustomerRootNavigator />
        </NavigationContainer>
      </QueryClientProvider>,
    );
  });
  await act(async () => {
    await Promise.resolve();
  });
}

describe('CustomerRootNavigator', () => {
  beforeEach(mount);
  afterEach(() => act(() => tree.unmount()));

  it('opens the support chat from Help & support, with no order', () => {
    navigate('Profile', {screen: 'CustomerSupportChat'});
    expect(allText()).toContain('SCREEN:CustomerSupportChat:no order');
  });

  it('opens the support chat from an order with that order', () => {
    navigate('Profile', {screen: 'CustomerSupportChat', params: {orderId: 'order-1'}});
    expect(allText()).toContain('SCREEN:CustomerSupportChat:order-1');
  });

  it('keeps the existing Profile routes, Help & support included', () => {
    navigate('Profile', {screen: 'CustomerSettingsSupport'});
    expect(allText()).toContain('SCREEN:CustomerHelpSupportRouteScreen');
  });
});
