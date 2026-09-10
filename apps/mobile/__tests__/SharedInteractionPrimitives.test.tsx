/**
 * @format
 */

import React from 'react';
import {Button, SegmentedControl} from '../src/shared/components';

jest.mock('../src/design/reducedMotion', () => ({
  useReducedMotionPreference: () => false,
}));

type InteractionElementProps = {
  accessibilityRole?: string;
  accessibilityState?: {
    disabled?: boolean;
    busy?: boolean;
    selected?: boolean;
    checked?: boolean;
  };
  children?: React.ReactNode;
  disabled?: boolean;
  onPress?: () => void;
};

describe('shared interaction primitives', () => {
  test('blocks duplicate mutation presses while a button is loading', () => {
    const onPress = jest.fn();
    const button = Button({
      testID: 'save-button',
      label: 'Save',
      loading: true,
      onPress,
    }) as React.ReactElement<InteractionElementProps>;

    expect(button.props.disabled).toBe(true);
    expect(button.props.accessibilityState).toEqual({
      disabled: true,
      busy: true,
    });
  });

  test('restores button availability when mutation loading finishes', () => {
    const onPress = jest.fn();
    const button = Button({
      testID: 'save-button',
      label: 'Save',
      onPress,
    }) as React.ReactElement<InteractionElementProps>;

    expect(button.props.disabled).toBe(false);
    expect(button.props.accessibilityState).toEqual({
      disabled: false,
      busy: false,
    });
  });

  test('exposes selected tab state and forwards only the chosen option value', () => {
    const onChange = jest.fn();
    const group = SegmentedControl({
      testID: 'orders-filter',
      value: 'new',
      options: [
        {value: 'new', label: 'New'},
        {value: 'ready', label: 'Ready'},
      ],
      onChange,
    }) as React.ReactElement<InteractionElementProps>;
    const options = React.Children.toArray(
      group.props.children,
    ) as React.ReactElement<InteractionElementProps>[];

    expect(group.props.accessibilityRole).toBe('tablist');
    expect(options).toHaveLength(2);
    expect(options[0].props.accessibilityState).toEqual({
      disabled: false,
      selected: true,
    });
    expect(options[1].props.accessibilityState).toEqual({
      disabled: false,
      selected: false,
    });

    options[1].props.onPress?.();

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('ready');
  });

  test('preserves radio semantics and disables every option as one contract', () => {
    const group = SegmentedControl({
      value: 'pickup',
      accessibilityOptionRole: 'radio',
      disabled: true,
      options: [
        {value: 'pickup', label: 'Pickup'},
        {value: 'delivery', label: 'Delivery'},
      ],
      onChange: () => undefined,
    }) as React.ReactElement<InteractionElementProps>;
    const options = React.Children.toArray(
      group.props.children,
    ) as React.ReactElement<InteractionElementProps>[];

    expect(group.props.accessibilityRole).toBe('radiogroup');
    expect(options).toHaveLength(2);
    expect(options[0].props.accessibilityRole).toBe('radio');
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
