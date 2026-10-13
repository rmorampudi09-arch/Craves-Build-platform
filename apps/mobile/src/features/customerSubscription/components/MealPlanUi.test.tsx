import React from 'react';
import {Image, StyleSheet, Text} from 'react-native';
import renderer, {act, type ReactTestInstance} from 'react-test-renderer';
import {
  BottomPriceBar,
  FoodTypePill,
  InfoRow,
  MealPlanHeader,
  MealPlanPhoto,
} from './MealPlanUi';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({top: 0, bottom: 34, left: 0, right: 0}),
}));
jest.mock('../../../design/reducedMotion', () => ({
  useReducedMotionPreference: () => true,
}));

let tree: renderer.ReactTestRenderer;
const render = (element: React.ReactElement) => {
  act(() => {
    tree = renderer.create(element);
  });
  return tree.root;
};
afterEach(() => act(() => tree?.unmount()));

const texts = (root: ReactTestInstance) =>
  root.findAllByType(Text).map(node => String(node.props.children));
// The Pressable element (not its host View) carries onPress/disabled.
const byLabel = (root: ReactTestInstance, label: string) =>
  root.findAll(
    node => typeof node.type !== 'string' && node.props.accessibilityLabel === label,
  )[0];

describe('FoodTypePill', () => {
  it.each([
    ['VEG', 'Veg'],
    ['EGG', 'Egg'],
    ['NON_VEG', 'Non-veg'],
  ] as const)('labels %s as %s', (foodType, label) => {
    expect(texts(render(<FoodTypePill foodType={foodType} />))).toEqual([label]);
  });

  it('renders nothing without a food type', () => {
    render(<FoodTypePill foodType={null} />);
    expect(tree.toJSON()).toBeNull();
  });
});

describe('BottomPriceBar', () => {
  const props = {
    price: '₹1,499',
    unitLabel: 'per week',
    buttonLabel: 'Proceed to payment',
  };

  it('fires onPress when enabled', () => {
    const onPress = jest.fn();
    const root = render(<BottomPriceBar {...props} onPress={onPress} />);
    act(() => byLabel(root, 'Proceed to payment').props.onPress());
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('is disabled and silent when disabled', () => {
    const onPress = jest.fn();
    const root = render(<BottomPriceBar {...props} disabled onPress={onPress} />);
    const button = byLabel(root, 'Proceed to payment');
    expect(button.props.accessibilityState).toMatchObject({disabled: true});
    expect(button.props.disabled).toBe(true);
    expect(texts(root)).toEqual(expect.arrayContaining(['₹1,499', 'per week']));
  });

  it('is blocked while loading and shows the footnote', () => {
    const root = render(
      <BottomPriceBar {...props} loading footnote="Secure payment" onPress={jest.fn()} />,
    );
    expect(
      byLabel(root, 'Proceed to payment').props.accessibilityState,
    ).toMatchObject({disabled: true, busy: true});
    expect(texts(root)).toContain('Secure payment');
  });
});

describe('InfoRow', () => {
  it('draws a top divider except on the first row', () => {
    const rowStyle = (first: boolean) => {
      const root = render(<InfoRow first={first} label="Plan type" value="Weekly" />);
      return StyleSheet.flatten(root.findAll(n => typeof n.type === 'string')[0].props.style);
    };
    expect(rowStyle(true).borderTopWidth).toBeUndefined();
    expect(rowStyle(false).borderTopWidth).toBe(1);
    expect(rowStyle(true).minHeight).toBe(48);
  });

  it('exposes the change action with the row label', () => {
    const onPress = jest.fn();
    const root = render(
      <InfoRow label="Start date" value="Mon, 29 Sep" action={{label: 'Change', onPress}} />,
    );
    act(() => byLabel(root, 'Change start date').props.onPress());
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('MealPlanPhoto', () => {
  it('shows the chef fallback tile without a uri', () => {
    const root = render(<MealPlanPhoto size={{width: 96, height: 80}} />);
    expect(root.findAllByType(Image)).toHaveLength(0);
    const style = StyleSheet.flatten(root.findAll(n => typeof n.type === 'string')[0].props.style);
    expect(style).toMatchObject({width: 96, height: 80});
  });

  it('falls back after the image fails to load', () => {
    const root = render(<MealPlanPhoto uri="https://img.example/a.jpg" size={64} />);
    const image = root.findByType(Image);
    act(() => image.props.onError());
    expect(root.findAllByType(Image)).toHaveLength(0);
  });
});

describe('MealPlanHeader', () => {
  it('goes back and shows the subtitle', () => {
    const onBack = jest.fn();
    const root = render(<MealPlanHeader title="Review" subtitle="Almost there" onBack={onBack} />);
    expect(texts(root)).toEqual(['Review', 'Almost there']);
    act(() => byLabel(root, 'Go back').props.onPress());
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
