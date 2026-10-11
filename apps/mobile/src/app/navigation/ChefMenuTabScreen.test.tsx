import React from 'react';
import {Text} from 'react-native';
import renderer, {act} from 'react-test-renderer';
import {ChefMenuTabScreen} from './ChefMenuTabScreen';

const mockNavigate = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({navigate: mockNavigate}),
}));
jest.mock('../../features/chefMenu/screens/ChefMenuScreen', () => {
  const {Text: MockText, View} = require('react-native');
  return {
    ChefMenuScreen: ({headerAccessory}: {headerAccessory?: React.ReactNode}) => (
      <View>
        <MockText>ITEMS_LIST</MockText>
        {headerAccessory}
      </View>
    ),
  };
});
jest.mock('../../features/chefSubscription/screens/ChefMealPlansScreen', () => {
  const {Text: MockText, View} = require('react-native');
  return {
    ChefMealPlansScreen: ({headerAccessory}: {headerAccessory?: React.ReactNode}) => (
      <View>
        <MockText>PLANS_LIST</MockText>
        {headerAccessory}
      </View>
    ),
  };
});

let tree: renderer.ReactTestRenderer;

const labels = () =>
  tree.root
    .findAllByType(Text)
    .map(node => node.props.children)
    .filter((child: unknown): child is string => typeof child === 'string');
const press = (accessibilityLabel: string) =>
  act(() =>
    tree.root
      .findAll(node => node.props.accessibilityLabel === accessibilityLabel && node.props.onPress)[0]
      .props.onPress(),
  );

describe('ChefMenuTabScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    act(() => {
      tree = renderer.create(<ChefMenuTabScreen />);
    });
  });
  afterEach(() => act(() => tree.unmount()));

  it('starts on the items list with the add-item bar', () => {
    expect(labels()).toEqual(expect.arrayContaining(['ITEMS_LIST', 'Items', 'Meal plans', '+ Add new item']));
    expect(labels()).not.toContain('PLANS_LIST');

    press('Add new Chef menu item');
    expect(mockNavigate).toHaveBeenCalledWith('ChefAddMenuItem');
  });

  it('switches to the meal plans list and the add-plan bar', () => {
    press('Meal plans');

    expect(labels()).toEqual(expect.arrayContaining(['PLANS_LIST', '+ Add new plan']));
    expect(labels()).not.toContain('ITEMS_LIST');
    expect(labels()).not.toContain('+ Add new item');

    press('Add new meal plan');
    expect(mockNavigate).toHaveBeenCalledWith('ChefMealPlanEditor', {});

    press('Items');
    expect(labels()).toContain('ITEMS_LIST');
  });
});
