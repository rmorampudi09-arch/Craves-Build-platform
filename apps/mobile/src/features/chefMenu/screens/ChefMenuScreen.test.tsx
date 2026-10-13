import React from 'react';
import {StyleSheet, Switch, Text, TextInput} from 'react-native';
import renderer, {act, type ReactTestInstance} from 'react-test-renderer';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {AppApiError} from '../../../core/http/apiError';
import type {ChefMenuItem} from '../api/chefMenuApi';
import {ChefToastProvider} from '../../chefShell/components/ui';
import {ChefMenuScreen} from './ChefMenuScreen';

const mockNavigate = jest.fn();
const mockApi = {listItems: jest.fn(), updateAvailability: jest.fn(), replaceItem: jest.fn()};

jest.mock('@react-navigation/native', () => ({useNavigation: () => ({navigate: mockNavigate})}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: require('react-native').View,
  useSafeAreaInsets: () => ({top: 0, right: 0, bottom: 0, left: 0}),
}));
jest.mock('../../../design/reducedMotion', () => ({useReducedMotionPreference: () => false}));
jest.mock('../../../app/store/hooks', () => ({useAppSelector: () => 'user-1'}));
jest.mock('../api/chefMenuApi', () => ({
  ...jest.requireActual('../api/chefMenuApi'),
  chefMenuApi: {
    listItems: (...args: unknown[]) => mockApi.listItems(...args),
    updateAvailability: (...args: unknown[]) => mockApi.updateAvailability(...args),
    replaceItem: (...args: unknown[]) => mockApi.replaceItem(...args),
  },
}));

const id = (n: number) => `123e4567-e89b-42d3-a456-4266141740${String(n).padStart(2, '0')}`;
const dish = (n: number, overrides: Partial<ChefMenuItem> = {}): ChefMenuItem => ({
  id: id(n),
  kitchenId: '123e4567-e89b-42d3-a456-426614174099',
  itemName: `Dish ${n}`,
  description: null,
  category: 'Biryani',
  foodType: 'VEG',
  price: 160,
  currency: 'INR',
  servesCount: null,
  preparationTimeMinutes: 25,
  spiceLevel: null,
  unitPackageWeightGrams: 450,
  thermoboxRequired: false,
  available: true,
  status: 'ACTIVE',
  images: [],
  createdAt: '2026-10-01T10:00:00Z',
  updatedAt: '2026-10-01T10:00:00Z',
  ...overrides,
});

const DUM = dish(1, {itemName: 'Dum Chicken biriyani', foodType: 'NON_VEG', preparationTimeMinutes: 30});
const PANEER = dish(2, {itemName: 'Paneer biryani'});
const PRAWNS = dish(3, {itemName: 'Prawns biryani', foodType: 'NON_VEG', price: 180, available: false});
const EGG = dish(4, {itemName: 'Egg pulsu', foodType: 'EGG', category: 'Curry', price: 50, preparationTimeMinutes: null});
const TOMATO = dish(5, {itemName: 'Tomato curry', category: 'Curry', price: 50, status: 'DRAFT', available: false});
const MURUKKU = dish(6, {itemName: 'Murukku', category: 'Snakes', price: 40});
const ALL = [DUM, PANEER, PRAWNS, EGG, TOMATO, MURUKKU];

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return {promise, resolve, reject};
}

let tree: renderer.ReactTestRenderer;

// Every string in a subtree, in reading order (a row's meta line nests a red "Off for customers").
const textIn = (node: unknown): string => {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textIn).join('');
  const instance = node as ReactTestInstance;
  return instance.type === Text ? textIn(instance.props.children) : '';
};
// The text of each outermost Text on screen.
const lines = () => {
  const all = tree.root.findAllByType(Text);
  return all.filter(node => !all.some(outer => outer !== node && outer.findAllByType(Text).includes(node))).map(node => textIn(node.props.children));
};
const has = (text: string) => lines().includes(text);
const withLabel = (label: string): ReactTestInstance | undefined =>
  tree.root.findAll(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function')[0];
const rowNamed = (name: string): ReactTestInstance =>
  tree.root.findAll(
    node =>
      typeof node.props.accessibilityLabel === 'string' &&
      node.props.accessibilityLabel.startsWith(`${name},`) &&
      typeof node.props.onPress === 'function',
  )[0];
const switchFor = (name: string): ReactTestInstance | undefined =>
  tree.root.findAll(node => node.props.accessibilityLabel === `${name} availability` && node.type === Switch)[0];
// The dishes on screen, in order: each row has a switch or, for a draft, a Publish button.
const dishNames = () =>
  ALL.map(item => item.itemName).filter(name => switchFor(name) || withLabel(`Publish ${name}`));
// The handler's own promise is not awaited: a save the test holds open would never let the press finish.
const press = (label: string) =>
  act(async () => {
    withLabel(label)!.props.onPress();
  });
const settle = () => act(async () => new Promise<void>(resolve => setTimeout(resolve, 0)));

const element = () => (
  <QueryClientProvider client={new QueryClient({defaultOptions: {queries: {retry: false, gcTime: Infinity}}})}>
    <ChefToastProvider>
      <ChefMenuScreen />
    </ChefToastProvider>
  </QueryClientProvider>
);

async function mount(items: ChefMenuItem[] = ALL) {
  mockApi.listItems.mockResolvedValue(items);
  await act(async () => {
    tree = renderer.create(element());
  });
  await settle();
}

describe('ChefMenuScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  afterEach(() => act(() => tree.unmount()));

  it('lists every dish with its price, category and minutes, and flags what is missing', async () => {
    await mount();
    expect(dishNames()).toHaveLength(6);
    expect(rowNamed('Dum Chicken biriyani').props.accessibilityLabel).toBe('Dum Chicken biriyani, Biryani · 30 min, ₹160');
    expect(rowNamed('Prawns biryani').props.accessibilityLabel).toBe('Prawns biryani, Biryani · Off for customers, ₹180');
    expect(rowNamed('Egg pulsu').props.accessibilityLabel).toBe('Egg pulsu, Curry · prep time missing, ₹50');
    expect(rowNamed('Murukku').props.accessibilityLabel).toBe('Murukku, Snacks · 25 min, ₹40');
    expect(has('4 of 6 dishes customers can order')).toBe(true);
    expect(lines().join(' ')).not.toMatch(/Snakes|NON_VEG|ACTIVE|INACTIVE/);
  });

  it('shows a price with paise exactly (₹49.50) and a whole price without them (₹50)', async () => {
    await mount([dish(8, {itemName: 'Lemon rice', price: 49.5}), dish(9, {itemName: 'Curd rice', price: 50})]);
    expect(rowNamed('Lemon rice').props.accessibilityLabel).toBe('Lemon rice, Biryani · 25 min, ₹49.50');
    expect(rowNamed('Curd rice').props.accessibilityLabel).toBe('Curd rice, Biryani · 25 min, ₹50');
    expect(has('₹49.50')).toBe(true);
    expect(has('₹50')).toBe(true);
  });

  it('makes every filter pill itself 48 dp tall, not a smaller pill with a hit slop the scroll view would clip', async () => {
    await mount();
    for (const label of ['All 6', 'On 4', 'Off 1', 'Drafts 1', 'Biryani', 'Curry', 'Snacks']) {
      const tap = tree.root.findAll(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function' && node.props.style)[0];
      expect(tap.props.hitSlop).toBeUndefined();
      expect(StyleSheet.flatten(tap.props.style).minHeight).toBeGreaterThanOrEqual(48);
    }
  });

  it('shows the counts in the filter chips and each filter narrows the list', async () => {
    await mount();
    expect(['All 6', 'On 4', 'Off 1', 'Drafts 1', 'Biryani', 'Curry', 'Snacks'].map(label => Boolean(withLabel(label)))).toEqual(
      Array(7).fill(true),
    );
    await press('Off 1');
    expect(dishNames()).toEqual(['Prawns biryani']);
    await press('Drafts 1');
    expect(dishNames()).toEqual(['Tomato curry']);
    await press('On 4');
    expect(dishNames()).toEqual(['Dum Chicken biriyani', 'Paneer biryani', 'Egg pulsu', 'Murukku']);
    await press('Curry');
    expect(dishNames()).toEqual(['Egg pulsu', 'Tomato curry']);
    await press('Snacks');
    expect(dishNames()).toEqual(['Murukku']);
    await press('All 6');
    expect(dishNames()).toHaveLength(6);
  });

  it('searches by dish name as you type and says so when nothing matches', async () => {
    await mount();
    const search = () => tree.root.findAllByType(TextInput).find(input => input.props.accessibilityLabel === 'Search dishes')!;
    await act(async () => search().props.onChangeText('paneer'));
    expect(dishNames()).toEqual(['Paneer biryani']);
    await act(async () => search().props.onChangeText('zzz'));
    expect(has('No dishes match')).toBe(true);
    await press('Clear filters');
    expect(dishNames()).toHaveLength(6);
  });

  it('switches a dish off at once, says so with Undo, and Undo switches it back on', async () => {
    await mount();
    const save = deferred<ChefMenuItem>();
    mockApi.updateAvailability.mockReturnValue(save.promise);
    await act(async () => {
      switchFor('Dum Chicken biriyani')!.props.onValueChange(false);
    });
    await settle();
    // Shown before the server has answered.
    expect(switchFor('Dum Chicken biriyani')!.props.value).toBe(false);
    expect(mockApi.updateAvailability).toHaveBeenCalledWith(DUM.id, {available: false});

    mockApi.listItems.mockResolvedValue(ALL.map(item => (item === DUM ? {...DUM, available: false} : item)));
    await act(async () => save.resolve({...DUM, available: false}));
    await settle();
    expect(has('Dum Chicken biriyani is off')).toBe(true);
    expect(withLabel('Off 2')).toBeTruthy();

    mockApi.updateAvailability.mockResolvedValue({...DUM, available: true});
    mockApi.listItems.mockResolvedValue(ALL);
    await press('Undo');
    await settle();
    expect(mockApi.updateAvailability).toHaveBeenLastCalledWith(DUM.id, {available: true});
    expect(switchFor('Dum Chicken biriyani')!.props.value).toBe(true);
    expect(has('Dum Chicken biriyani is on')).toBe(true);
    expect(withLabel('Undo')).toBeUndefined();
  });

  it('when Undo cannot be saved, the dish stays as it was and a plain message says so (without another Undo)', async () => {
    await mount();
    mockApi.updateAvailability.mockResolvedValueOnce({...DUM, available: false});
    // From now on the server holds the dish switched off.
    mockApi.listItems.mockResolvedValue(ALL.map(item => (item === DUM ? {...DUM, available: false} : item)));
    await act(async () => {
      switchFor('Dum Chicken biriyani')!.props.onValueChange(false);
    });
    await settle();
    expect(has('Dum Chicken biriyani is off')).toBe(true);

    mockApi.updateAvailability.mockRejectedValueOnce(new Error('offline'));
    await press('Undo');
    await settle();
    expect(mockApi.updateAvailability).toHaveBeenLastCalledWith(DUM.id, {available: true});
    expect(switchFor('Dum Chicken biriyani')!.props.value).toBe(false);
    expect(has("We couldn't update Dum Chicken biriyani. Try again.")).toBe(true);
    expect(has('Dum Chicken biriyani is on')).toBe(false);
    expect(withLabel('Undo')).toBeUndefined();
  });

  it('puts the switch back and says it could not save when the server refuses', async () => {
    await mount();
    mockApi.updateAvailability.mockRejectedValue(new AppApiError('HTTP_500', 'raw server text', 500));
    await act(async () => {
      switchFor('Paneer biryani')!.props.onValueChange(false);
    });
    await settle();
    expect(switchFor('Paneer biryani')!.props.value).toBe(true);
    expect(has("We couldn't update Paneer biryani. Try again.")).toBe(true);
    expect(lines().join(' ')).not.toContain('raw server text');
  });

  it('a draft shows Publish, asks first, and then saves it as ACTIVE and on with one request', async () => {
    await mount();
    expect(withLabel('Publish Paneer biryani')).toBeUndefined();
    expect(withLabel('Publish Tomato curry')).toBeTruthy();
    expect(switchFor('Tomato curry')).toBeUndefined();

    await press('Publish Tomato curry');
    expect(has('Publish Tomato curry?')).toBe(true);
    expect(mockApi.replaceItem).not.toHaveBeenCalled();

    const save = deferred<ChefMenuItem>();
    mockApi.replaceItem.mockReturnValue(save.promise);
    const confirm = withLabel('Publish dish')!;
    await act(async () => {
      confirm.props.onPress();
      confirm.props.onPress();
    });
    await settle();
    expect(mockApi.replaceItem).toHaveBeenCalledTimes(1);
    expect(mockApi.replaceItem).toHaveBeenCalledWith(
      TOMATO.id,
      expect.objectContaining({itemName: 'Tomato curry', status: 'ACTIVE', available: true, category: 'Curry'}),
    );
    mockApi.listItems.mockResolvedValue(ALL.map(item => (item === TOMATO ? {...TOMATO, status: 'ACTIVE', available: true} : item)));
    await act(async () => save.resolve({...TOMATO, status: 'ACTIVE', available: true}));
    await settle();
    expect(has('Tomato curry is live')).toBe(true);
    expect(withLabel('Publish Tomato curry')).toBeUndefined();
    expect(switchFor('Tomato curry')!.props.value).toBe(true);
  });

  it('says a dish could not be published and keeps it a draft', async () => {
    await mount();
    mockApi.replaceItem.mockRejectedValue(new Error('offline'));
    await press('Publish Tomato curry');
    await press('Publish dish');
    await settle();
    expect(has("We couldn't publish Tomato curry. Try again.")).toBe(true);
    expect(withLabel('Publish Tomato curry')).toBeTruthy();
  });

  it('opens the dish form from a row', async () => {
    await mount();
    await act(async () => {
      rowNamed('Egg pulsu').props.onPress();
    });
    expect(mockNavigate).toHaveBeenCalledWith('ChefEditMenuItem', {menuItemId: EGG.id});
  });

  it('an empty kitchen shows one next step: add a dish', async () => {
    await mount([]);
    expect(has('No dishes yet')).toBe(true);
    expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
    await press('Add a dish');
    expect(mockNavigate).toHaveBeenCalledWith('ChefAddMenuItem');
  });

  it('shows a plain message with Try again when the dishes cannot be loaded', async () => {
    mockApi.listItems.mockRejectedValue(new Error('boom'));
    await act(async () => {
      tree = renderer.create(element());
    });
    await settle();
    expect(has("Couldn't load your dishes")).toBe(true);
    mockApi.listItems.mockResolvedValue(ALL);
    await press('Try again');
    await settle();
    expect(dishNames()).toHaveLength(6);
  });

  it('wraps a 60-character dish name to two lines instead of pushing the switch away', async () => {
    const long = dish(7, {itemName: 'Hyderabadi dum chicken biryani with extra raita and a boiled egg'.slice(0, 60)});
    await mount([long]);
    const name = tree.root.findAllByType(Text).find(node => textIn(node.props.children) === long.itemName)!;
    expect(long.itemName).toHaveLength(60);
    expect(name.props.numberOfLines).toBe(2);
    expect(switchFor(long.itemName)).toBeTruthy();
  });
});
