import React from 'react';
import {Keyboard, StyleSheet, Text} from 'react-native';
import renderer, {act, type ReactTestInstance} from 'react-test-renderer';
import {colors} from '../../design/tokens';
import {ChefTabBar} from './ChefTabBar';
import {CHEF_TABS} from './chefTabs';

let mockPending = 0;

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({top: 0, right: 0, bottom: 34, left: 0}),
}));
jest.mock('../../features/chefShell/state/ChefOperationalProvider', () => ({
  useChefOperationalState: () => ({counters: {pendingAcceptance: mockPending}}),
}));

const routes = CHEF_TABS.map(tab => ({key: `${tab.routeName}-key`, name: tab.routeName}));
const emit = jest.fn((_event: unknown) => ({defaultPrevented: false}));
const dispatch = jest.fn();
const keyboard: Record<string, () => void> = {};

let tree: renderer.ReactTestRenderer;

function mount(focusedIndex = 0) {
  const props = {
    state: {key: 'tabs', index: focusedIndex, routes, routeNames: routes.map(r => r.name), type: 'tab', stale: false},
    descriptors: Object.fromEntries(routes.map(r => [r.key, {options: {tabBarHideOnKeyboard: true}}])),
    navigation: {emit, dispatch},
    insets: {top: 0, right: 0, bottom: 34, left: 0},
  };
  act(() => {
    tree = renderer.create(<ChefTabBar {...(props as unknown as React.ComponentProps<typeof ChefTabBar>)} />);
  });
}

const textOf = (node: ReactTestInstance) => React.Children.toArray(node.props.children).join('');
const label = (text: string) => tree.root.findAllByType(Text).find(node => textOf(node) === text);
const tab = (name: string) =>
  tree.root.findAll(
    node => typeof node.props.onPress === 'function' && String(node.props.accessibilityLabel).startsWith(`${name} tab`),
  )[0];

describe('ChefTabBar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPending = 0;
    jest.spyOn(Keyboard, 'addListener').mockImplementation(((event: string, handler: () => void) => {
      keyboard[event] = handler;
      return {remove: jest.fn()};
    }) as never);
  });
  afterEach(() => act(() => tree.unmount()));

  it('shows Home, Orders, Menu, Earnings and Profile in order', () => {
    mount();
    const names = tree.root
      .findAllByType(Text)
      .map(textOf)
      .filter(text => CHEF_TABS.some(t => t.label === text));
    expect(names).toEqual(['Home', 'Orders', 'Menu', 'Earnings', 'Profile']);
  });

  it('is a plain white pill with a border, no glass', () => {
    mount();
    const pill = StyleSheet.flatten(tree.root.find(node => node.props.testID === 'chef-tab-bar').props.style);
    expect(pill.backgroundColor).toBe(colors.white);
    expect(pill.borderColor).toBe(colors.border);
    expect(pill.borderRadius).toBeGreaterThan(30);
    expect(pill.shadowOpacity).toBeGreaterThan(0);
  });

  it('paints the active label red and the others in the dark text colour', () => {
    mount(1);
    const colour = (text: string) => StyleSheet.flatten(label(text)!.props.style).color;
    expect(colour('Orders')).toBe(colors.flameRedAccessible);
    expect(colour('Home')).toBe(colors.textPrimary);
    expect(colour('Earnings')).toBe(colors.textPrimary);
    expect(tab('Orders').props.accessibilityState).toEqual({selected: true});
    expect(tab('Home').props.accessibilityState).toEqual({selected: false});
  });

  it('shows no badge without new orders and counts them on the Orders tab', () => {
    mount();
    expect(tab('Orders').props.accessibilityLabel).toBe('Orders tab');
    mockPending = 3;
    act(() => tree.unmount());
    mount();
    expect(label('3')).toBeDefined();
    expect(tab('Orders').props.accessibilityLabel).toBe('Orders tab, 3 new orders');
    expect(tab('Menu').props.accessibilityLabel).toBe('Menu tab');
  });

  it('caps the badge at 99+', () => {
    mockPending = 150;
    mount();
    expect(label('99+')).toBeDefined();
    expect(label('150')).toBeUndefined();
  });

  it('switches to a tab that is not focused after emitting tabPress', () => {
    mount(0);
    act(() => tab('Earnings').props.onPress());
    expect(emit).toHaveBeenCalledWith({type: 'tabPress', target: 'Earnings-key', canPreventDefault: true});
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch.mock.calls[0][0]).toMatchObject({payload: {name: 'Earnings'}, target: 'tabs'});
  });

  it('does not navigate when the tab is already focused or the press was prevented', () => {
    mount(0);
    act(() => tab('Home').props.onPress());
    expect(emit).toHaveBeenCalledTimes(1);
    expect(dispatch).not.toHaveBeenCalled();

    emit.mockReturnValueOnce({defaultPrevented: true});
    act(() => tab('Menu').props.onPress());
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('emits tabLongPress', () => {
    mount();
    act(() => tab('Menu').props.onLongPress());
    expect(emit).toHaveBeenCalledWith({type: 'tabLongPress', target: 'Menu-key'});
  });

  it('keeps every tab at least 48 dp tall', () => {
    mount();
    expect(StyleSheet.flatten(tab('Home').props.style({pressed: false})).minHeight).toBeGreaterThanOrEqual(48);
  });

  it('hides while the keyboard is open', () => {
    mount();
    expect(tree.toJSON()).not.toBeNull();
    act(() => keyboard.keyboardDidShow());
    expect(tree.toJSON()).toBeNull();
    act(() => keyboard.keyboardDidHide());
    expect(tree.toJSON()).not.toBeNull();
  });
});
