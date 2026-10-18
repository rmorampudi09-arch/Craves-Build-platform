import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {Animated, Text} from 'react-native';
import {CustomerHeader} from './CustomerHeader';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({canGoBack: () => false, goBack: jest.fn()}),
}));

jest.mock('../hooks/useCustomerHeaderState', () => ({
  browsingLocationLabel: (label: string) => label,
  useCustomerHeaderState: () => ({
    selectedLocation: {label: 'Home', displayName: 'Kukatpally'},
    locationDisplayName: 'Home',
    badgeLabel: null,
  }),
}));

describe('customer header collapse', () => {
  let tree: renderer.ReactTestRenderer;
  afterEach(() => act(() => tree?.unmount()));

  const collapse = new Animated.Value(0).interpolate({inputRange: [0, 1], outputRange: [0, 1]});
  const render = (props: Partial<React.ComponentProps<typeof CustomerHeader>>) => {
    const element = (
      <CustomerHeader
        onPressLocation={jest.fn()}
        onPressNotifications={jest.fn()}
        onPressMealPlans={jest.fn()}
        {...props}
      />
    );
    act(() => {
      if (tree) tree.update(element);
      else tree = renderer.create(element);
    });
  };
  const texts = () => tree.root.findAllByType(Text).map(node => node.props.children);

  it('keeps the plain Meal plans pill on screens that do not collapse', () => {
    tree = undefined as unknown as renderer.ReactTestRenderer;
    render({collapsedAccessory: <Text>accessory</Text>});
    expect(texts()).toContain('Meal plans');
    expect(texts()).not.toContain('accessory');
    expect(tree.root.findAll(node => node.props.testID === 'customer-header-meal-plans')).toHaveLength(0);
  });

  it('measures the pill, then moves the tap target and the accessory when collapsed', () => {
    tree = undefined as unknown as renderer.ReactTestRenderer;
    const onPressMealPlans = jest.fn();
    render({collapse, collapsed: false, onPressMealPlans, collapsedAccessory: <Text>accessory</Text>});
    const measurer = tree.root.findAll(node => typeof node.props.onLayout === 'function')[0];
    act(() => measurer.props.onLayout({nativeEvent: {layout: {width: 140, height: 44}}}));

    const hitStyle = () =>
      Object.assign(
        {},
        ...[tree.root.findByProps({testID: 'customer-header-meal-plans'}).props.style({pressed: false})]
          .flat()
          .filter(Boolean),
      );
    const accessory = () => tree.root.findByProps({testID: 'customer-header-collapsed-accessory'});

    expect(hitStyle()).toMatchObject({left: 0, width: 140});
    expect(accessory().props.pointerEvents).toBe('none');
    expect(accessory().props.importantForAccessibility).toBe('no-hide-descendants');

    render({collapse, collapsed: true, onPressMealPlans, collapsedAccessory: <Text>accessory</Text>});
    // 140 wide pill: meal circle at 140 - 44 - 8 - 44 = 44, accessory takes the last 44 dp.
    expect(hitStyle()).toMatchObject({left: 44, width: 44});
    expect(accessory().props.pointerEvents).toBe('box-none');

    act(() => tree.root.findByProps({testID: 'customer-header-meal-plans'}).props.onPress());
    expect(onPressMealPlans).toHaveBeenCalledTimes(1);
  });
});
