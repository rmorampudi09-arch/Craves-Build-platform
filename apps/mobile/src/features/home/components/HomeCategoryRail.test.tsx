import React from 'react';
import { Animated } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { CATEGORY_RAIL_PINNED_LIFT, HomeCategoryRail } from './HomeCategoryRail';

type CategoryItemProps = {
  accessibilityLabel: string;
  accessibilityState: { selected: boolean };
  onPress: () => void;
};

// Each category sits in an Animated.View that slides it closer while the row is pinned.
const pressables = (rail: React.ReactElement<{ children: React.ReactNode }>) =>
  (React.Children.toArray(rail.props.children) as React.ReactElement<{ children: React.ReactElement<CategoryItemProps> }>[])
    .map(slot => slot.props.children);

describe('Home category rail', () => {
  it('uses native horizontal gesture handling without taking over vertical pinning', () => {
    const rail = HomeCategoryRail({
      selectedCategory: null,
      onSelect: jest.fn(),
    });
    expect(rail.type).toBe(ScrollView);
    expect(rail.props.horizontal).toBe(true);
    expect(rail.props.nestedScrollEnabled).toBe(true);
    expect(rail.props.directionalLockEnabled).toBe(true);
    expect(rail.props.scrollEnabled).not.toBe(false);
    expect(rail.props.shouldActivateOnStart).not.toBe(true);
  });

  it('keeps category keys and dispatches the same filter values after selection changes', () => {
    const onSelect = jest.fn();
    const initial = HomeCategoryRail({ selectedCategory: null, onSelect });
    const selected = HomeCategoryRail({ selectedCategory: 'Rice', onSelect });
    const selectedItems = pressables(selected);
    expect(selected.type).toBe(initial.type);
    expect(React.Children.toArray(selected.props.children).map(slot => (slot as React.ReactElement).key)).toEqual(
      React.Children.toArray(initial.props.children).map(slot => (slot as React.ReactElement).key),
    );
    const rice = selectedItems.find(
      item => item.props.accessibilityLabel === 'Rice category',
    );
    expect(rice?.props.accessibilityState.selected).toBe(true);
    rice?.props.onPress();
    expect(onSelect).toHaveBeenLastCalledWith('Rice');
    selectedItems[0].props.onPress();
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });

  it('reads Snacks for the stored category Snakes and still filters by the stored value', () => {
    const onSelect = jest.fn();
    const items = pressables(HomeCategoryRail({ selectedCategory: null, onSelect }));
    expect(items.some(item => item.props.accessibilityLabel === 'Snakes category')).toBe(false);
    items.find(item => item.props.accessibilityLabel === 'Snacks category')?.props.onPress();
    expect(onSelect).toHaveBeenLastCalledWith('Snakes');
  });

  it('shrinks while pinned with transforms only, so the row keeps its size in the list', () => {
    const progress = new Animated.Value(1);
    const rail = HomeCategoryRail({ selectedCategory: null, onSelect: jest.fn(), pinProgress: progress, pinned: true });
    const slots = React.Children.toArray(rail.props.children) as React.ReactElement<{ style: unknown[] }>[];
    const shift = (slot: React.ReactElement<{ style: unknown[] }>) =>
      ((slot.props.style[0] as { transform: { translateX: { __getValue: () => number } }[] }).transform[0].translateX).__getValue();
    // The first stays put; each next one slides 12 dp further left, and the row's end is pulled in by the same total.
    expect(shift(slots[0])).toBe(0);
    expect(shift(slots[3])).toBe(-36);
    expect(slots[slots.length - 1].props.style[1]).toEqual({ marginRight: -(slots.length - 1) * 12 });
    expect(slots[0].props.style[1]).toBe(false);
    expect(CATEGORY_RAIL_PINNED_LIFT).toBe(10);
  });
});
