import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {Modal, View} from 'react-native';
import {HomeFoodTypeMenu, foodTypePillLabel} from './HomeFoodTypeMenu';
import {buildTopKitchenCards} from './HomePromoAndKitchens';
import type {NearbyKitchen} from '../../chefDiscovery/api/nearbyChefDiscoveryApi';
import type {NearbyDish} from '../api/homeFeedApi';

jest.mock('../../../design/reducedMotion', () => ({
  useReducedMotionPreference: () => false,
}));

describe('home food type menu', () => {
  let tree: renderer.ReactTestRenderer;
  // React Native's jest View stubs measure without calling back; report a fixed frame instead.
  beforeEach(() => {
    jest
      .spyOn((View as unknown as {prototype: {measure: () => void}}).prototype, 'measure')
      .mockImplementation(((callback: (...frame: number[]) => void) => callback(0, 0, 90, 52, 240, 120)) as () => void);
  });
  afterEach(() => {
    act(() => tree?.unmount());
    jest.restoreAllMocks();
  });

  const render = (diets: ('VEG' | 'EGG' | 'NON_VEG')[], onChange = jest.fn()) => {
    act(() => {
      tree = renderer.create(<HomeFoodTypeMenu diets={diets} onChange={onChange} />);
    });
    return onChange;
  };
  const open = () => {
    act(() => tree.root.findByProps({testID: 'home-food-type-pill'}).props.onPress());
    const backdrop = tree.root.findByProps({accessibilityLabel: 'Close food type choices'});
    act(() => backdrop.props.onLayout());
  };
  const row = (label: string) =>
    tree.root.findAll(node => node.props.accessibilityRole === 'radio' && node.props.accessibilityLabel === label)[0];

  it('labels the pill by the chosen diets', () => {
    expect(foodTypePillLabel([])).toBe('All');
    expect(foodTypePillLabel(['VEG'])).toBe('Veg');
    expect(foodTypePillLabel(['NON_VEG'])).toBe('Non-veg');
    expect(foodTypePillLabel(['VEG', 'EGG'])).toBe('Veg +1');
  });

  it('opens under the pill and applies one diet, then closes', () => {
    const onChange = render([]);
    expect(tree.root.findByType(Modal).props.visible).toBe(false);
    open();
    expect(tree.root.findByType(Modal).props.visible).toBe(true);
    expect(row('All food').props.accessibilityState).toEqual({checked: true});
    act(() => row('Veg only').props.onPress());
    expect(onChange).toHaveBeenCalledWith(['VEG']);
    expect(tree.root.findByType(Modal).props.visible).toBe(false);
  });

  it('shows only the symbol in the round header version', () => {
    act(() => {
      tree = renderer.create(<HomeFoodTypeMenu compact diets={['EGG']} onChange={jest.fn()} testID="header" />);
    });
    expect(tree.root.findAll(node => node.props.children === 'Egg')).toHaveLength(0);
    const button = tree.root.findAll(node => node.props.testID === 'header' && node.props.accessibilityRole === 'button')[0];
    expect(button?.props.accessibilityLabel).toBe('Food type, Egg');
  });

  it('clears the diet with All food and checks nothing when Filter & sort set two', () => {
    const onChange = render(['VEG', 'EGG']);
    open();
    expect(['All food', 'Veg only', 'Egg', 'Non-veg'].map(label => row(label).props.accessibilityState.checked)).toEqual([
      false,
      false,
      false,
      false,
    ]);
    act(() => row('All food').props.onPress());
    expect(onChange).toHaveBeenCalledWith([]);
  });
});

describe('top kitchens with a food type', () => {
  const kitchen = (id: string) => ({id, kitchenName: `Kitchen ${id}`}) as unknown as NearbyKitchen;
  const dish = (kitchenId: string, foodType: NearbyDish['foodType'], price: number) =>
    ({kitchenId, foodType, price, currency: 'INR', primaryImageUrl: `${kitchenId}-${foodType}.jpg`}) as unknown as NearbyDish;
  const kitchens = [kitchen('a'), kitchen('b')];
  const dishes = [dish('a', 'VEG', 120), dish('a', 'NON_VEG', 90), dish('b', 'NON_VEG', 150)];

  it('keeps every kitchen when no diet is chosen', () => {
    expect(buildTopKitchenCards(kitchens, dishes).map(card => card.kitchenId)).toEqual(['a', 'b']);
  });

  it('drops kitchens without a matching dish and uses only matching photos and prices', () => {
    const cards = buildTopKitchenCards(kitchens, dishes, ['VEG']);
    expect(cards.map(card => card.kitchenId)).toEqual(['a']);
    expect(cards[0]?.imageUrls).toEqual(['a-VEG.jpg']);
    expect(cards[0]?.startingPriceLabel).toContain('120');
  });
});
