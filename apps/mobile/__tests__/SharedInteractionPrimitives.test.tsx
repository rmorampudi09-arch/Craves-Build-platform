/**
 * @format
 */

import React from 'react';
import {Pressable} from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import type {ReactElement} from 'react';
import {Button, SegmentedControl} from '../src/shared/components';

jest.mock('../src/design/reducedMotion', () => ({
  useReducedMotionPreference: () => false,
}));

async function render(element: ReactElement) {
  let renderer: ReturnType<typeof ReactTestRenderer.create> | undefined;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(element);
  });

  if (!renderer) {
    throw new Error('Expected renderer to be created');
  }

  return renderer;
}

describe('shared interaction primitives', () => {
  test('blocks duplicate mutation presses while a button is loading', async () => {
    const onPress = jest.fn();
    const renderer = await render(
      <Button testID="save-button" label="Save" loading onPress={onPress} />,
    );

    const button = renderer.root.findByType(Pressable);
    expect(button.props.disabled).toBe(true);
    expect(button.props.accessibilityState).toEqual({
      disabled: true,
      busy: true,
    });
    expect(renderer.root.findAllByProps({children: 'Save'})).toHaveLength(0);
  });

  test('restores button availability when mutation loading finishes', async () => {
    const onPress = jest.fn();
    const renderer = await render(
      <Button testID="save-button" label="Save" loading onPress={onPress} />,
    );

    await ReactTestRenderer.act(() => {
      renderer.update(
        <Button testID="save-button" label="Save" onPress={onPress} />,
      );
    });

    const button = renderer.root.findByType(Pressable);
    expect(button.props.disabled).toBe(false);
    expect(button.props.accessibilityState).toEqual({
      disabled: false,
      busy: false,
    });
    expect(renderer.root.findByProps({children: 'Save'})).toBeTruthy();
  });

  test('exposes selected tab state and forwards only the chosen option value', async () => {
    const onChange = jest.fn();
    const renderer = await render(
      <SegmentedControl
        testID="orders-filter"
        value="new"
        options={[
          {value: 'new', label: 'New'},
          {value: 'ready', label: 'Ready'},
        ]}
        onChange={onChange}
      />,
    );

    const group = renderer.root.findByProps({accessibilityRole: 'tablist'});
    const options = renderer.root.findAllByType(Pressable);

    expect(group.props.accessibilityRole).toBe('tablist');
    expect(options[0].props.accessibilityState).toEqual({
      disabled: false,
      selected: true,
    });
    expect(options[1].props.accessibilityState).toEqual({
      disabled: false,
      selected: false,
    });

    await ReactTestRenderer.act(() => {
      options[1].props.onPress();
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('ready');
  });

  test('preserves radio semantics and disables every option as one contract', async () => {
    const renderer = await render(
      <SegmentedControl
        value="pickup"
        accessibilityOptionRole="radio"
        disabled
        options={[
          {value: 'pickup', label: 'Pickup'},
          {value: 'delivery', label: 'Delivery'},
        ]}
        onChange={() => undefined}
      />,
    );

    const options = renderer.root.findAllByType(Pressable);
    expect(options).toHaveLength(2);
    expect(options[0].props.accessibilityState).toEqual({
      disabled: true,
      checked: true,
    });
    expect(options[1].props.accessibilityState).toEqual({
      disabled: true,
      checked: false,
    });
    expect(options.every(option => option.props.disabled)).toBe(true);
  });
});
