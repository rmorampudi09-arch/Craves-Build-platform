import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {PlatformPressable} from '@react-navigation/elements';
import type {BottomTabBarProps} from '@react-navigation/bottom-tabs';
import {LiquidBottomTabBar, LiquidTabButton, renderLiquidBottomTabBar} from './LiquidBottomTabBar';
import {customerHaptics} from '../haptics/customerHaptics';

jest.mock('@react-navigation/elements', () => ({PlatformPressable: 'PlatformPressable'}));
jest.mock('../haptics/customerHaptics', () => ({customerHaptics: {selection: jest.fn(async () => undefined)}}));

it('returns a component from the navigation callback without invoking hooks outside React', () => {
  const element = renderLiquidBottomTabBar({} as BottomTabBarProps);
  expect(element.type).toBe(LiquidBottomTabBar);
});

it('removes the Android ripple while preserving navigation, long press and selection accessibility', () => {
  const press = jest.fn();
  const longPress = jest.fn();
  let tree: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(<LiquidTabButton onPress={press} onLongPress={longPress} accessibilityState={{selected: true}}>{null}</LiquidTabButton>);
  });
  const button = tree!.root.findByType(PlatformPressable);
  expect(button.props.android_ripple).toEqual({color: 'transparent', borderless: false});
  expect(button.props.pressColor).toBe('transparent');
  expect(button.props.accessibilityState.selected).toBe(true);
  act(() => button.props.onPress({}));
  expect(press).toHaveBeenCalledTimes(1);
  expect(customerHaptics.selection).toHaveBeenCalledTimes(1);
  act(() => button.props.onLongPress({}));
  expect(longPress).toHaveBeenCalledTimes(1);
  act(() => tree!.unmount());
});
