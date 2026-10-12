import React from 'react';
import renderer, {act, type ReactTestInstance} from 'react-test-renderer';
import {Modal, Text} from 'react-native';
import {ChefToastProvider} from '../../chefShell/components/ui';
import type {KitchenOpenState} from '../../chefProfile/state/useKitchenOpenState';
import {KitchenStatusCard} from './KitchenStatusCard';

const mockSetOpen = jest.fn(async () => true);
const mockPause = jest.fn(async () => true);
let mockKitchen: KitchenOpenState;
let mockMenu: Record<string, unknown>[];

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: require('react-native').View,
  useSafeAreaInsets: () => ({top: 0, right: 0, bottom: 34, left: 0}),
}));
jest.mock('../../chefProfile/state/useKitchenOpenState', () => ({useKitchenOpenState: () => mockKitchen}));
jest.mock('../state/useChefMenuPrepTimes', () => ({useChefMenuPrepTimes: () => mockMenu}));

const kitchen = (overrides: Partial<KitchenOpenState> = {}): KitchenOpenState => ({
  status: 'open',
  closedReason: null,
  kitchen: null,
  pausedUntil: null,
  opensAt: null,
  hoursToday: '11:00 AM – 10:00 PM',
  saving: false,
  pauseAvailable: true,
  unavailable: false,
  refresh: jest.fn(async () => undefined),
  setOpen: mockSetOpen,
  pause: mockPause,
  resume: jest.fn(async () => true),
  ...overrides,
});
const dish = (available: boolean, status = 'ACTIVE') => ({id: String(Math.random()), status, available});

describe('KitchenStatusCard', () => {
  let tree: renderer.ReactTestRenderer;
  const textOf = (node: ReactTestInstance): string => React.Children.toArray(node.props.children).join('');
  const hasText = (text: string) => tree.root.findAllByType(Text).some(node => textOf(node) === text);
  const button = (label: string) =>
    tree.root.findAll(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function')[0];
  const visibleModals = () => tree.root.findAllByType(Modal).filter(modal => modal.props.visible === true);
  const mount = async (cookingCount = 0, onChangeHours = jest.fn()) => {
    await act(async () => {
      tree = renderer.create(
        <ChefToastProvider>
          <KitchenStatusCard cookingCount={cookingCount} onChangeHours={onChangeHours} />
        </ChefToastProvider>,
      );
    });
    return onChangeHours;
  };
  // What waits for a closing sheet runs on the next frame; tests hold those frames until the sheet has finished closing.
  let queued: (() => void)[] = [];
  let frameSpy: jest.SpyInstance;
  const sheetClosed = () => act(async () => queued.splice(0).forEach(run => run()));

  beforeEach(() => {
    jest.clearAllMocks();
    mockKitchen = kitchen();
    mockMenu = [...Array(12).fill(0).map(() => dish(true)), ...Array(4).fill(0).map(() => dish(false)), dish(true, 'DRAFT')];
    queued = [];
    frameSpy = jest.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(((run: () => void) => {
      queued.push(run);
      return queued.length;
    }) as never);
  });
  afterEach(() => {
    act(() => tree?.unmount());
    frameSpy.mockRestore();
  });

  it('says the kitchen is open and how many dishes can be ordered', async () => {
    await mount();
    expect(hasText('Kitchen is open')).toBe(true);
    expect(hasText('12 of 16 dishes available')).toBe(true);
  });

  it('opens the Kitchen status sheet from Change', async () => {
    await mount();
    expect(visibleModals()).toHaveLength(0);
    await act(async () => button('Change').props.onPress());
    expect(visibleModals()).toHaveLength(1);
    expect(hasText('Kitchen status')).toBe(true);
  });

  it('closes the kitchen straight away when nothing is cooking', async () => {
    await mount(0);
    await act(async () => button('Change').props.onPress());
    await act(async () => button('Close kitchen until I open it').props.onPress());
    expect(mockSetOpen).toHaveBeenCalledWith(false);
    expect(hasText('Close your kitchen?')).toBe(false);
  });

  it('asks first when orders are cooking, once the sheet has finished closing, and closes only on confirm', async () => {
    await mount(2);
    await act(async () => button('Change').props.onPress());
    await act(async () => button('Close kitchen until I open it').props.onPress());
    expect(mockSetOpen).not.toHaveBeenCalled();
    expect(hasText('Close your kitchen?')).toBe(false);
    await sheetClosed();
    expect(hasText('Close your kitchen?')).toBe(true);
    expect(
      hasText("2 orders are still cooking. They carry on, but you won't get new orders until you open the kitchen again."),
    ).toBe(true);
    await act(async () => button('Close kitchen').props.onPress());
    expect(mockSetOpen).toHaveBeenCalledWith(false);
  });

  it('keeps the kitchen open when the chef says keep open', async () => {
    await mount(1);
    await act(async () => button('Change').props.onPress());
    await act(async () => button('Close kitchen until I open it').props.onPress());
    await sheetClosed();
    expect(
      hasText("1 order is still cooking. It carries on, but you won't get new orders until you open the kitchen again."),
    ).toBe(true);
    await act(async () => button('Keep open').props.onPress());
    expect(mockSetOpen).not.toHaveBeenCalled();
  });

  it('runs "Change opening hours" only after the sheet has finished closing', async () => {
    const onChangeHours = await mount(0);
    await act(async () => button('Change').props.onPress());
    await act(async () => button('Change opening hours').props.onPress());
    expect(onChangeHours).not.toHaveBeenCalled();
    await sheetClosed();
    expect(onChangeHours).toHaveBeenCalledTimes(1);
  });

  it('shows nothing until the kitchen status is known', async () => {
    mockKitchen = kitchen({status: 'unknown'});
    await mount();
    expect(tree.toJSON()).toBeNull();
  });

  it('gives the chef no Change button when Craves has paused the kitchen', async () => {
    mockKitchen = kitchen({status: 'suspended'});
    await mount();
    expect(hasText('Paused by Craves')).toBe(true);
    expect(button('Change')).toBeUndefined();
  });

  it('says when new orders are paused', async () => {
    mockKitchen = kitchen({status: 'paused', pausedUntil: null});
    await mount();
    expect(hasText('New orders paused')).toBe(true);
  });
});
