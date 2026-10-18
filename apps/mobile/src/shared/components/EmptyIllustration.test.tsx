import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {EmptyIllustration, type EmptyIllustrationName} from './EmptyIllustration';
import {TerminalState} from './LifecycleStates';

const NAMES: EmptyIllustrationName[] = [
  'cart', 'orders', 'comingSoonArea', 'location', 'search', 'kitchenNoDishes', 'saved', 'addresses', 'mealPlans', 'notifications',
  'offline', 'loadError', 'newOrders', 'menu', 'earnings', 'payouts', 'reviews', 'chefMealPlans', 'support', 'comingSoon',
];

describe('EmptyIllustration', () => {
  it.each(NAMES)('draws %s at the 240 × 190 ratio, hidden from screen readers', name => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<EmptyIllustration name={name} width={120} />);
    });
    const svg = tree.root.findByProps({testID: `empty-illustration-${name}`});
    expect(svg.props.width).toBe(120);
    expect(svg.props.height).toBe(95);
    expect(svg.props.importantForAccessibility).toBe('no-hide-descendants');
  });

  it('shows above a TerminalState title only when asked', () => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<TerminalState illustration="offline" title="You're offline" />);
    });
    expect(tree.root.findAllByProps({testID: 'empty-illustration-offline'})).not.toHaveLength(0);
    act(() => {
      tree.update(<TerminalState title="You're offline" />);
    });
    expect(tree.root.findAllByProps({testID: 'empty-illustration-offline'})).toHaveLength(0);
  });
});
