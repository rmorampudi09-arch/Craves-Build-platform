import React from 'react';
import {Text} from 'react-native';
import renderer, {act, type ReactTestInstance} from 'react-test-renderer';
import {DateRangeSheet} from './DateRangeSheet';

jest.mock('react-native-safe-area-context', () => ({useSafeAreaInsets: () => ({top: 0, right: 0, bottom: 0, left: 0})}));
jest.mock('../../../design/reducedMotion', () => ({useReducedMotionPreference: () => false}));

const NOW = new Date(2026, 9, 13, 12, 0);
const onApply = jest.fn();

let tree: renderer.ReactTestRenderer;
const textOf = (node: ReactTestInstance): string =>
  React.Children.toArray(node.props.children)
    .map(child => (typeof child === 'string' || typeof child === 'number' ? String(child) : ''))
    .join('');
const allText = () => tree.root.findAllByType(Text).map(textOf);
const button = (label: string) =>
  tree.root.findAll(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function')[0];
const day = (label: string) => button(`${label} 2026`);

beforeEach(() => {
  jest.clearAllMocks();
  act(() => {
    tree = renderer.create(<DateRangeSheet now={NOW} onApply={onApply} onClose={jest.fn()} visible />);
  });
});
afterEach(() => act(() => tree.unmount()));

describe('DateRangeSheet', () => {
  it('opens on this month and starts with Show switched off', () => {
    expect(allText()).toEqual(expect.arrayContaining(['Pick dates', 'October 2026']));
    expect(button('Show').props.accessibilityState).toMatchObject({disabled: true});
  });

  it('applies the first and last day tapped, in order', () => {
    act(() => day('5 October').props.onPress());
    act(() => day('9 October').props.onPress());
    act(() => button('Show').props.onPress());
    expect(onApply).toHaveBeenCalledWith({from: new Date(2026, 9, 5), to: new Date(2026, 9, 9)});
  });

  it('a tap before the first day moves the start, and one tap alone is a single day', () => {
    act(() => day('9 October').props.onPress());
    act(() => day('5 October').props.onPress());
    act(() => button('Show').props.onPress());
    expect(onApply).toHaveBeenCalledWith({from: new Date(2026, 9, 5), to: new Date(2026, 9, 5)});
  });

  it('does not offer days that have not happened, or more than 31 days from the start', () => {
    expect(day('14 October').props.accessibilityState).toMatchObject({disabled: true});
    act(() => button('Show earlier month').props.onPress());
    act(() => day('1 September').props.onPress());
    expect(day('30 September').props.accessibilityState).toMatchObject({disabled: false});
    act(() => button('Show next month').props.onPress());
    expect(day('2 October').props.accessibilityState).toMatchObject({disabled: true});
    expect(day('1 October').props.accessibilityState).toMatchObject({disabled: false});
  });

  it('cannot go past the current month', () => {
    expect(button('Show next month').props.disabled).toBe(true);
  });
});
