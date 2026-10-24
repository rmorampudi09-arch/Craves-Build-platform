import React from 'react';
import { Animated, Text } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import { FloatingCartButton } from './FloatingCartButton';
jest.mock('../../../design/reducedMotion', () => ({
  useReducedMotionPreference: () => true,
}));

describe('FloatingCartButton', () => {
  let tree: renderer.ReactTestRenderer;
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    act(() => tree?.unmount());
    jest.useRealTimers();
  });

  const lift = new Animated.Value(0).interpolate({
    inputRange: [0, 1],
    outputRange: [0, -100],
  });
  const render = (itemCount: number, totalLabel: string) => (
    <FloatingCartButton
      visible={itemCount > 0}
      itemCount={itemCount}
      itemsLabel={`${itemCount} ${itemCount === 1 ? 'item' : 'items'}`}
      totalLabel={totalLabel}
      kitchenName="Raviteja Morampudi"
      lift={lift}
      bottom={16}
      onPress={jest.fn()}
    />
  );
  const texts = () =>
    tree.root
      .findAllByType(Text)
      .map(node => [node.props.children].flat().join(''));

  it('is one button named for the whole cart, with the count on its badge', () => {
    act(() => {
      tree = renderer.create(render(1, '₹50.00'));
    });
    const labels = tree.root
      .findAll(
        node =>
          node.props.accessibilityRole === 'button' &&
          typeof node.props.accessibilityLabel === 'string',
      )
      .map(node => node.props.accessibilityLabel);
    expect(labels).toContain(
      'View cart, 1 item from Raviteja Morampudi, ₹50.00',
    );
    expect(texts()).toContain('1');
    expect(texts().some(text => text.includes('View cart'))).toBe(false);
  });

  it('shows the new total beside the button after an add, even the first one, then folds it away after 3 seconds', () => {
    act(() => {
      tree = renderer.create(render(0, '₹0.00'));
    });
    expect(texts()).toEqual([]);
    act(() => tree.update(render(1, '₹50.00')));
    act(() => {
      jest.advanceTimersByTime(150);
    });
    expect(texts()).toContain('1 item · ₹50.00');
    act(() => tree.update(render(2, '₹170.00')));
    act(() => {
      jest.advanceTimersByTime(150);
    });
    expect(texts()).toContain('2 items · ₹170.00');
    act(() => {
      jest.advanceTimersByTime(3000);
    });
    expect(texts()).not.toContain('2 items · ₹170.00');
  });
});
