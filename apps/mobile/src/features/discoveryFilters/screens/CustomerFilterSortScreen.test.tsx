import React from 'react';
import {Text} from 'react-native';
import renderer, {act, type ReactTestInstance} from 'react-test-renderer';
import type {NearbyDishLabels} from '../../dishLabels/state/nearbyDishLabels';
import type {TaxonomyVocabulary} from '../../dishLabels/api/taxonomyApi';
import {
  createDefaultDiscoveryFilters,
  type DiscoveryFilterSurface,
} from '../state/discoveryFilterSlice';
import {CustomerFilterSortScreen} from './CustomerFilterSortScreen';

const mockDispatch = jest.fn();
const mockNavigation = {goBack: jest.fn(), dispatch: jest.fn(), addListener: jest.fn(() => jest.fn())};
let mockOrigin: DiscoveryFilterSurface = 'HOME';
let mockTaxonomyOn = true;
let mockSnapshot: NearbyDishLabels | null = null;
let mockApplied = createDefaultDiscoveryFilters();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNavigation,
  useRoute: () => ({params: {origin: mockOrigin}}),
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: require('react-native').View,
  useSafeAreaInsets: () => ({top: 0, right: 0, bottom: 0, left: 0}),
}));
jest.mock('../../../app/store/hooks', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (select: (state: unknown) => unknown) =>
    select({
      auth: {identity: {id: 'user-1'}},
      customerShell: {selectedLocation: {addressId: 'address-1'}},
      discoveryFilters: {
        sessions: {
          HOME: {scopeKey: 'user-1:address-1', applied: mockApplied},
          CHEFS: {scopeKey: 'user-1:address-1', applied: mockApplied},
        },
      },
    }),
}));
jest.mock('../../../design/reducedMotion', () => ({useReducedMotionPreference: () => false}));
jest.mock('../../../core/advanced/advancedFeatures', () => ({
  isAdvancedFeatureOn: () => mockTaxonomyOn,
}));
jest.mock('../../dishLabels/state/nearbyDishLabels', () => ({
  getNearbyDishLabelsSnapshot: () => mockSnapshot,
}));

const cuisine = (code: string, name: string, parentCode: string | null = null) => ({
  code,
  kind: 'CUISINE' as const,
  parentCode,
  name,
});
const diet = (code: string, name: string) => ({code, kind: 'DIET' as const, parentCode: null, name});
const VOCABULARY: TaxonomyVocabulary = {
  cuisines: [
    cuisine('south-indian', 'South Indian'),
    cuisine('andhra', 'Andhra', 'south-indian'),
    cuisine('chinese', 'Chinese'),
  ],
  diets: [diet('jain', 'Jain'), diet('vegan', 'Vegan')],
};

const nearby = (...dishes: {cuisines: string[]; diets: string[]}[]): NearbyDishLabels => ({
  vocabulary: VOCABULARY,
  byId: new Map(dishes.map((labels, i) => [`dish-${i}`, {menuItemId: `dish-${i}`, ...labels}])),
});

let tree: renderer.ReactTestRenderer | null = null;

function render(): renderer.ReactTestRenderer {
  act(() => {
    tree = renderer.create(<CustomerFilterSortScreen />);
  });
  return tree!;
}

const texts = (root: ReactTestInstance) =>
  root.findAllByType(Text).map(node => node.props.children as unknown);
const hasText = (root: ReactTestInstance, text: string) => texts(root).includes(text);
const byLabel = (root: ReactTestInstance, label: string) =>
  root.find(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function');
const chip = (root: ReactTestInstance, label: string) =>
  root.find(
    node =>
      node.props.accessibilityRole === 'checkbox' &&
      typeof node.props.onPress === 'function' &&
      node.findAllByType(Text).some(text => text.props.children === label),
  );
const press = (node: ReactTestInstance) => act(() => node.props.onPress());
const lastApplied = () =>
  mockDispatch.mock.calls
    .map(call => call[0])
    .filter(action => action.payload.filters)
    .at(-1).payload.filters;

beforeEach(() => {
  jest.clearAllMocks();
  mockOrigin = 'HOME';
  mockTaxonomyOn = true;
  mockSnapshot = null;
  mockApplied = createDefaultDiscoveryFilters();
});

afterEach(() => {
  act(() => tree?.unmount());
  tree = null;
});

describe('CustomerFilterSortScreen label choices', () => {
  it('Home origin with no labelled dishes shows no cuisine section and no coming-soon card', () => {
    const {root} = render();

    expect(hasText(root, 'Cuisine')).toBe(false);
    expect(hasText(root, 'Cuisine filters are coming soon')).toBe(false);
    expect(hasText(root, 'Vegetarian')).toBe(true);
  });

  it('Home origin hides the label choices while the taxonomy feature is off', () => {
    mockTaxonomyOn = false;
    mockSnapshot = nearby({cuisines: ['andhra'], diets: ['jain']});
    const {root} = render();

    expect(hasText(root, 'Cuisine')).toBe(false);
    expect(root.findAll(node => node.props.accessibilityLabel === 'Jain')).toHaveLength(0);
  });

  it('Home origin shows cuisine chips and diet rows from nearby dishes', () => {
    mockSnapshot = nearby({cuisines: ['andhra'], diets: ['jain']});
    const {root} = render();

    expect(hasText(root, 'Cuisine')).toBe(true);
    expect(hasText(root, 'Choose one or more cuisines.')).toBe(true);
    expect(hasText(root, 'Cuisine filters are coming soon')).toBe(false);
    expect(chip(root, 'South Indian').props.accessibilityState).toEqual({checked: false});
    expect(chip(root, 'Andhra').props.accessibilityState).toEqual({checked: false});
    expect(hasText(root, 'Chinese')).toBe(false);
    expect(byLabel(root, 'Jain').props.accessibilityRole).toBe('checkbox');
    expect(root.findAll(node => node.props.accessibilityLabel === 'Vegan')).toHaveLength(0);
  });

  it('shows no cuisine section when the dishes carry only diets', () => {
    mockSnapshot = nearby({cuisines: [], diets: ['vegan']});
    const {root} = render();

    expect(hasText(root, 'Cuisine')).toBe(false);
    expect(hasText(root, 'Cuisine filters are coming soon')).toBe(false);
    expect(byLabel(root, 'Vegan')).toBeTruthy();
  });

  it('picking a cuisine and applying stores its code', () => {
    mockSnapshot = nearby({cuisines: ['andhra'], diets: ['jain']});
    const {root} = render();

    press(chip(root, 'Andhra'));
    expect(chip(root, 'Andhra').props.accessibilityState).toEqual({checked: true});
    press(root.findByProps({testID: 'apply-discovery-filters'}));

    expect(lastApplied().cuisineIds).toEqual(['andhra']);
    expect(lastApplied().dietTags).toEqual([]);
  });

  it('customers can pick more than three cuisines and untick one', () => {
    mockSnapshot = nearby(
      {cuisines: ['andhra'], diets: []},
      {cuisines: ['chinese'], diets: []},
    );
    const {root} = render();

    ['South Indian', 'Andhra', 'Chinese'].forEach(label => press(chip(root, label)));
    press(chip(root, 'Andhra'));
    press(root.findByProps({testID: 'apply-discovery-filters'}));

    expect(lastApplied().cuisineIds).toEqual(['south-indian', 'chinese']);
  });

  it('picking a diet row stores its code in dietTags and leaves diets alone', () => {
    mockSnapshot = nearby({cuisines: ['andhra'], diets: ['jain']});
    const {root} = render();

    press(byLabel(root, 'Jain'));
    expect(byLabel(root, 'Jain').props.accessibilityState).toEqual({checked: true});
    press(root.findByProps({testID: 'apply-discovery-filters'}));

    expect(lastApplied().dietTags).toEqual(['jain']);
    expect(lastApplied().diets).toEqual([]);
  });

  it('starts from the applied cuisines and diets, and Reset clears them', () => {
    mockSnapshot = nearby({cuisines: ['andhra'], diets: ['jain']});
    mockApplied = {...createDefaultDiscoveryFilters(), cuisineIds: ['andhra'], dietTags: ['jain']};
    const {root} = render();

    expect(chip(root, 'Andhra').props.accessibilityState).toEqual({checked: true});
    expect(byLabel(root, 'Jain').props.accessibilityState).toEqual({checked: true});

    press(byLabel(root, 'Reset filter draft'));
    press(root.findByProps({testID: 'apply-discovery-filters'}));

    expect(lastApplied().cuisineIds).toEqual([]);
    expect(lastApplied().dietTags).toEqual([]);
  });

  it('Chefs origin is unchanged', () => {
    mockOrigin = 'CHEFS';
    mockSnapshot = nearby({cuisines: ['andhra'], diets: ['jain']});
    const {root} = render();

    expect(hasText(root, 'Cuisine')).toBe(true);
    expect(hasText(root, 'Cuisine filters are coming soon')).toBe(true);
    expect(hasText(root, 'Diet filters unavailable here')).toBe(true);
    expect(root.findAll(node => node.props.accessibilityLabel === 'Jain')).toHaveLength(0);
    expect(root.findAll(node => node.props.accessibilityLabel === 'Andhra')).toHaveLength(0);
  });
});
