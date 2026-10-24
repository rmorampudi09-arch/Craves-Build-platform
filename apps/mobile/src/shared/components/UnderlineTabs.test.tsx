import React from 'react';
import {Text} from 'react-native';
import renderer, {act} from 'react-test-renderer';
import {UnderlineTabs} from './UnderlineTabs';

describe('UnderlineTabs', () => {
  it('marks the chosen tab, shows only non-zero counts, and reports taps', () => {
    const onSelect = jest.fn();
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <UnderlineTabs
          onSelect={onSelect}
          selected="ready"
          tabs={[
            {key: 'new', label: 'New', count: 0},
            {key: 'ready', label: 'Ready', count: 3, accessibilityLabel: 'Ready, 3 orders'},
          ]}
        />,
      );
    });
    const tabs = tree.root.findAll(node => typeof node.type !== 'string' && node.props.accessibilityRole === 'tab' && node.props.onPress);
    expect(tabs.map(tab => tab.props.accessibilityState)).toEqual([{selected: false}, {selected: true}]);
    expect(tabs[1].props.accessibilityLabel).toBe('Ready, 3 orders');
    expect(tree.root.findAllByType(Text).map(text => text.props.children)).toEqual(['New', 'Ready', 3]);
    act(() => tabs[0].props.onPress());
    expect(onSelect).toHaveBeenCalledWith('new');
  });
});
