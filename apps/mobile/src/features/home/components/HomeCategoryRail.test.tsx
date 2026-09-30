import React from 'react';
import { ScrollView } from 'react-native-gesture-handler';
import { HomeCategoryRail } from './HomeCategoryRail';

type CategoryItemProps = {
  accessibilityLabel: string;
  accessibilityState: { selected: boolean };
  onPress: () => void;
};

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
    const initialItems = React.Children.toArray(
      initial.props.children,
    ) as React.ReactElement<CategoryItemProps>[];
    const selectedItems = React.Children.toArray(
      selected.props.children,
    ) as React.ReactElement<CategoryItemProps>[];
    expect(selected.type).toBe(initial.type);
    expect(selectedItems.map(item => item.key)).toEqual(
      initialItems.map(item => item.key),
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
});
