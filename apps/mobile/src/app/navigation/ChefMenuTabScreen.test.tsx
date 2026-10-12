import React from 'react';
import {Text} from 'react-native';
import renderer, {act, type ReactTestInstance} from 'react-test-renderer';
import {ChefMenuTabScreen} from './ChefMenuTabScreen';

const mockNavigate = jest.fn();
let mockDishes: {items: unknown[]; status: string} = {items: new Array(16).fill({}), status: 'success'};
let mockPlans: {data: unknown[] | undefined} = {data: [{}]};
let mockPlansProps: Record<string, unknown> | undefined;

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({navigate: mockNavigate}),
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: require('react-native').View,
  useSafeAreaInsets: () => ({top: 0, right: 0, bottom: 0, left: 0}),
}));
jest.mock('../../design/reducedMotion', () => ({useReducedMotionPreference: () => false}));
jest.mock('../../features/chefMenu/state/useChefMenuModel', () => ({useChefMenuModel: () => mockDishes}));
jest.mock('../../features/chefSubscription/query/chefMealPlanQueries', () => ({useChefMealPlansQuery: () => mockPlans}));
jest.mock('../../features/chefMenu/screens/ChefMenuScreen', () => {
  const {Text: MockText} = require('react-native');
  return {ChefMenuScreen: () => <MockText>DISHES_LIST</MockText>};
});
jest.mock('../../features/chefSubscription/screens/ChefMealPlansScreen', () => {
  const {Text: MockText} = require('react-native');
  return {
    ChefMealPlansScreen: (props: Record<string, unknown>) => {
      mockPlansProps = props;
      return <MockText>PLANS_LIST</MockText>;
    },
  };
});

let tree: renderer.ReactTestRenderer;

const lines = () =>
  tree.root
    .findAllByType(Text)
    .map(node => node.props.children)
    .flat()
    .filter((child: unknown): child is string => typeof child === 'string');
const button = (label: string): ReactTestInstance | undefined =>
  tree.root.findAll(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function')[0];
const press = (label: string) => act(() => button(label)!.props.onPress());

describe('ChefMenuTabScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDishes = {items: new Array(16).fill({}), status: 'success'};
    mockPlans = {data: [{}]};
    mockPlansProps = undefined;
    act(() => {
      tree = renderer.create(<ChefMenuTabScreen />);
    });
  });
  afterEach(() => act(() => tree.unmount()));

  it('starts on Dishes with "Add dish" in the header, the counts in the toggle, and no bar at the bottom', () => {
    expect(lines()).toEqual(expect.arrayContaining(['Menu', 'Dishes · 16', 'Meal plans · 1', 'Add dish', 'DISHES_LIST']));
    expect(lines()).not.toContain('PLANS_LIST');
    expect(lines().join(' ')).not.toMatch(/\+ Add new/);
    expect(button('Dishes · 16')!.props.accessibilityState.selected).toBe(true);
    expect(button('Meal plans · 1')!.props.accessibilityState.selected).toBe(false);

    press('Add dish');
    expect(mockNavigate).toHaveBeenCalledWith('ChefAddMenuItem');
  });

  it('switches to Meal plans, where the header button becomes "New plan"', () => {
    press('Meal plans · 1');

    expect(lines()).toEqual(expect.arrayContaining(['PLANS_LIST', 'New plan']));
    expect(lines()).not.toContain('DISHES_LIST');
    expect(lines()).not.toContain('Add dish');
    // This screen owns the header and the toggle; the plans list only draws its own body.
    expect(mockPlansProps).toEqual({hideHeader: true});

    press('New plan');
    expect(mockNavigate).toHaveBeenCalledWith('ChefMealPlanEditor', {});

    press('Dishes · 16');
    expect(lines()).toContain('DISHES_LIST');
    expect(button('Add dish')).toBeTruthy();
  });

  it('shows no count until the number is known', () => {
    act(() => tree.unmount());
    mockDishes = {items: [], status: 'pending'};
    mockPlans = {data: undefined};
    act(() => {
      tree = renderer.create(<ChefMenuTabScreen />);
    });
    expect(lines()).toEqual(expect.arrayContaining(['Dishes', 'Meal plans']));
    expect(lines().join(' ')).not.toContain('·');
  });

  it('shows a real zero for an empty kitchen', () => {
    act(() => tree.unmount());
    mockDishes = {items: [], status: 'success'};
    mockPlans = {data: []};
    act(() => {
      tree = renderer.create(<ChefMenuTabScreen />);
    });
    expect(lines()).toEqual(expect.arrayContaining(['Dishes · 0', 'Meal plans · 0']));
  });
});
