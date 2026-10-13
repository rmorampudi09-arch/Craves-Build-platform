import React from 'react';
import {Text} from 'react-native';
import renderer, {act, type ReactTestInstance} from 'react-test-renderer';
import {ChefScheduledOrdersRedirect} from './ChefScheduledOrdersRedirect';
import {
  ChefReviewsPlaceholder,
  ChefSecurityPlaceholder,
  ChefSupportTicketPlaceholder,
} from './chefPlaceholderScreens';

const mockNavigation = {
  navigate: jest.fn(),
  goBack: jest.fn(),
  replace: jest.fn(),
  getState: jest.fn(),
};

jest.mock('@react-navigation/native', () => {
  const ReactActual = require('react');
  return {
    useNavigation: () => mockNavigation,
    useFocusEffect: (effect: () => void) => ReactActual.useEffect(effect, [effect]),
  };
});
jest.mock('../../design/reducedMotion', () => ({useReducedMotionPreference: () => false}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: require('react-native').View,
  useSafeAreaInsets: () => ({top: 0, right: 0, bottom: 34, left: 0}),
}));
jest.mock('../../features/chefShell/state/ChefOperationalProvider', () => ({
  useChefOperationalState: () => ({counters: {unreadNotifications: 0}}),
}));

let tree: renderer.ReactTestRenderer;
const mount = (element: React.ReactElement) => {
  act(() => {
    tree = renderer.create(element);
  });
};
const textOf = (node: ReactTestInstance) => React.Children.toArray(node.props.children).join('');
const allText = () => tree.root.findAllByType(Text).map(textOf);
const pressables = (label: string) =>
  tree.root.findAll(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function');

describe('chef placeholder screens', () => {
  beforeEach(() => jest.clearAllMocks());
  afterEach(() => act(() => tree?.unmount()));

  it.each([
    ['Reviews', ChefReviewsPlaceholder],
    ['Security', ChefSecurityPlaceholder],
    ['Support ticket', ChefSupportTicketPlaceholder],
  ])('%s shows its title with a Coming soon note', (title, Screen) => {
    mount(<Screen />);
    expect(allText()).toEqual(expect.arrayContaining([title, 'Coming soon']));
  });

  it('offers a back arrow on sub-screens', () => {
    mount(<ChefReviewsPlaceholder />);
    act(() => pressables('Go back')[0].props.onPress());
    expect(mockNavigation.goBack).toHaveBeenCalledTimes(1);
    expect(pressables('Notifications')).toHaveLength(0);
  });
});

describe('ChefScheduledOrdersRedirect', () => {
  beforeEach(() => jest.clearAllMocks());
  afterEach(() => act(() => tree?.unmount()));

  it('leaves the Profile stack and opens Orders at Scheduled', () => {
    mockNavigation.getState.mockReturnValue({routes: [{name: 'ChefProfileHome'}, {name: 'ChefScheduledOrders'}]});
    mount(<ChefScheduledOrdersRedirect />);
    expect(mockNavigation.goBack).toHaveBeenCalledTimes(1);
    expect(mockNavigation.replace).not.toHaveBeenCalled();
    expect(mockNavigation.navigate).toHaveBeenCalledWith('Orders', {screen: 'ChefOrdersScheduled'});
    expect(tree.toJSON()).toBeNull();
  });

  it('swaps itself for the Profile home when it is the only screen in the stack', () => {
    mockNavigation.getState.mockReturnValue({routes: [{name: 'ChefScheduledOrders'}]});
    mount(<ChefScheduledOrdersRedirect />);
    expect(mockNavigation.goBack).not.toHaveBeenCalled();
    expect(mockNavigation.replace).toHaveBeenCalledWith('ChefProfileHome');
    expect(mockNavigation.navigate).toHaveBeenCalledWith('Orders', {screen: 'ChefOrdersScheduled'});
  });
});
