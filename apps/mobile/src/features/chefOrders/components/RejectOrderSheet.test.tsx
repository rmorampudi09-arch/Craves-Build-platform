import React from 'react';
import renderer, {act, type ReactTestInstance} from 'react-test-renderer';
import {Text} from 'react-native';
import {RejectOrderSheet} from './RejectOrderSheet';

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: require('react-native').View,
  useSafeAreaInsets: () => ({top: 0, right: 0, bottom: 34, left: 0}),
}));

jest.mock('../../../design/reducedMotion', () => ({useReducedMotionPreference: () => false}));

describe('RejectOrderSheet', () => {
  let tree: renderer.ReactTestRenderer;
  const onConfirm = jest.fn();
  const onClose = jest.fn();
  const mount = (props: Partial<React.ComponentProps<typeof RejectOrderSheet>> = {}) => {
    act(() => {
      tree = renderer.create(
        <RejectOrderSheet onClose={onClose} onConfirm={onConfirm} orderNumber="#DF94B" visible {...props} />,
      );
    });
  };
  const find = (label: string) =>
    tree.root.findAll(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function')[0] as
      | ReactTestInstance
      | undefined;
  const press = (label: string) => act(() => find(label)!.props.onPress());
  const note = () => tree.root.findAll(node => node.props.accessibilityLabel === 'Note for the customer' && node.props.onChangeText)[0];
  const allText = () => tree.root.findAllByType(Text).map(node => React.Children.toArray(node.props.children).join(''));

  beforeEach(() => jest.clearAllMocks());
  afterEach(() => act(() => tree?.unmount()));

  it('asks about the order and lists the five reasons, with the refund and the sold-out tip', () => {
    mount();
    expect(allText()).toEqual(
      expect.arrayContaining([
        'Reject #DF94B?',
        'The customer is told right away and gets a full refund.',
        'An item is sold out',
        'Kitchen is too busy right now',
        'Closing soon',
        "Can't deliver to this area",
        'Other reason',
        "Sold out? Switch the dish off in Menu so customers can't order it again.",
      ]),
    );
  });

  it('tells a meal-plan day what happens to it, and does not promise a refund', () => {
    mount({kind: 'meal-plan'});
    expect(allText()).toContain('The customer is told right away. This meal-plan day moves to the end of their plan.');
    expect(allText().join(' ')).not.toMatch(/refund/);
  });

  it('promises nothing about money for an order the customer has not paid for yet', () => {
    mount({kind: 'unpaid'});
    expect(allText()).toContain('The customer is told right away.');
    expect(allText().join(' ')).not.toMatch(/refund/);
  });

  it('cannot reject until a reason is picked, then sends that reason as the free text', () => {
    mount();
    expect(find('Reject order')!.props.disabled).toBe(true);
    act(() => find('Reject order')!.props.onPress());
    expect(onConfirm).not.toHaveBeenCalled();

    press('Closing soon');
    expect(find('Closing soon')!.props.accessibilityState).toEqual({checked: true});
    expect(find('Reject order')!.props.disabled).toBe(false);
    press('Reject order');
    expect(onConfirm).toHaveBeenCalledWith('Closing soon');
  });

  it('puts the note after the picked reason', () => {
    mount();
    press('An item is sold out');
    act(() => note().props.onChangeText('Paneer is over'));
    press('Reject order');
    expect(onConfirm).toHaveBeenCalledWith('An item is sold out: Paneer is over');
  });

  it('needs the note for "Other reason"', () => {
    mount();
    press('Other reason');
    expect(find('Reject order')!.props.disabled).toBe(true);
    act(() => note().props.onChangeText('   '));
    expect(find('Reject order')!.props.disabled).toBe(true);
    act(() => note().props.onChangeText('Gas ran out'));
    expect(find('Reject order')!.props.disabled).toBe(false);
    press('Reject order');
    expect(onConfirm).toHaveBeenCalledWith('Gas ran out');
  });

  it('Keep order closes it without rejecting', () => {
    mount();
    press('Keep order');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('ignores every tap while the rejection is running', () => {
    mount({busy: true});
    press('Closing soon');
    expect(find('Reject order')!.props.disabled).toBe(true);
    expect(find('Keep order')!.props.disabled).toBe(true);
  });

  it('starts empty each time it opens', () => {
    mount();
    press('Closing soon');
    act(() => tree.update(<RejectOrderSheet onClose={onClose} onConfirm={onConfirm} orderNumber="#DF94B" visible={false} />));
    act(() => tree.update(<RejectOrderSheet onClose={onClose} onConfirm={onConfirm} orderNumber="#9B2E1" visible />));
    expect(find('Closing soon')!.props.accessibilityState).toEqual({checked: false});
    expect(find('Reject order')!.props.disabled).toBe(true);
  });
});
