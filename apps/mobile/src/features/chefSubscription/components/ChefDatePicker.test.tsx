import React from 'react';
import {Text} from 'react-native';
import renderer, {act, type ReactTestInstance} from 'react-test-renderer';
import {ChefDatePicker} from './ChefDatePicker';

let tree: renderer.ReactTestRenderer;
const onChange = jest.fn();

const render = (value: string | null = null, min = '2026-10-13') =>
  act(() => {
    tree = renderer.create(<ChefDatePicker min={min} onChange={onChange} value={value} />);
  });
const button = (label: string): ReactTestInstance | undefined =>
  tree.root.findAll(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function')[0];
const press = (label: string) => act(() => button(label)!.props.onPress());
const lines = () =>
  tree.root
    .findAllByType(Text)
    .map(node => [node.props.children].flat().filter(child => typeof child === 'string' || typeof child === 'number').join(''));

describe('ChefDatePicker', () => {
  beforeEach(() => jest.clearAllMocks());
  afterEach(() => act(() => tree?.unmount()));

  it('opens on the month of the chosen date, else the first month you can pick', () => {
    render('2026-12-05');
    expect(lines()).toContain('December 2026');

    act(() => tree.unmount());
    render(null);
    expect(lines()).toContain('October 2026');
  });

  it('picks a date with a tap, no typing', () => {
    render();
    press('25 October 2026');

    expect(onChange).toHaveBeenCalledWith('2026-10-25');
  });

  it('marks the chosen date and will not take a day that has passed', () => {
    render('2026-10-20');

    expect(button('20 October 2026')!.props.accessibilityState).toEqual({selected: true, disabled: false});
    expect(tree.root.findAll(node => node.props.accessibilityLabel === '12 October 2026')[0].props.accessibilityState).toEqual({
      selected: false,
      disabled: true,
    });
    expect(button('13 October 2026')!.props.accessibilityState.disabled).toBe(false);
  });

  it('moves between months, but not back before the first month you can pick', () => {
    render();
    expect(tree.root.findAll(node => node.props.accessibilityLabel === 'Previous month')[0].props.accessibilityState.disabled).toBe(true);

    press('Next month');
    expect(lines()).toContain('November 2026');
    press('1 November 2026');
    expect(onChange).toHaveBeenCalledWith('2026-11-01');

    press('Previous month');
    expect(lines()).toContain('October 2026');
  });

  it('starts weeks on Monday', () => {
    render();
    // 1 October 2026 is a Thursday: three blanks before it.
    const days = tree.root.find(node => node.props.testID === 'date-picker-days' && typeof node.type === 'string');
    expect(days.children).toHaveLength(3 + 31);
  });
});
