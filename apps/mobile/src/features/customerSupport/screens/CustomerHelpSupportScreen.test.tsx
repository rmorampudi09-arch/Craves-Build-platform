import React from 'react';
import {Linking} from 'react-native';
import renderer, {act} from 'react-test-renderer';
import {CustomerHelpSupportScreen} from './CustomerHelpSupportScreen';

const mockNavigate = jest.fn();
const mockTabNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
    goBack: jest.fn(),
    getParent: () => ({navigate: mockTabNavigate}),
  }),
}));
jest.mock('../../../app/navigation/CustomerBottomNavController', () => ({
  useCustomerBottomNavScroll: () => ({}),
}));
jest.mock('../components/CustomerSupportCasesSection', () => ({
  CustomerSupportCasesSection: () => null,
}));

function press(tree: renderer.ReactTestRenderer, label: string) {
  const button = tree.root.find(
    node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function',
  );
  act(() => {
    button.props.onPress();
  });
}

describe('CustomerHelpSupportScreen', () => {
  let tree: renderer.ReactTestRenderer;
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    act(() => {
      tree = renderer.create(<CustomerHelpSupportScreen />);
    });
  });
  afterEach(() => act(() => tree.unmount()));

  it('calls, emails and chats with Craves support', () => {
    press(tree, 'Call');
    press(tree, 'Email');
    press(tree, 'Chat');

    expect(Linking.openURL).toHaveBeenNthCalledWith(1, 'tel:+918367366787');
    expect(Linking.openURL).toHaveBeenNthCalledWith(2, 'mailto:support@craves.in?subject=Craves%20support');
    expect(mockNavigate).toHaveBeenCalledWith('CustomerSupportChat');
  });

  it('opens the place in the app that answers each common question', () => {
    press(tree, 'Where is my order?');
    press(tree, 'Refunds and cancellations');
    press(tree, 'Meal plans: pause, skip and cancel');
    press(tree, 'Payments and failed payments');
    press(tree, 'Changing my delivery address');

    expect(mockTabNavigate).toHaveBeenCalledWith('Orders', {screen: 'CustomerOrdersRoot'});
    expect(mockNavigate.mock.calls).toEqual([
      ['CustomerSupportChat'],
      ['CustomerSettingsSubscription', {screen: 'MealPlanHowItWorks'}],
      ['CustomerSupportChat'],
      ['CustomerAddresses'],
    ]);
  });
});
