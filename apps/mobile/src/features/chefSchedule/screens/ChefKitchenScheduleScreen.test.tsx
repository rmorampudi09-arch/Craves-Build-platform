import React from 'react';
import {TextInput} from 'react-native';
import renderer, {act} from 'react-test-renderer';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {AppApiError} from '../../../core/http/apiError';
import {ChefToastProvider} from '../../chefShell/components/ui';
import {screenQueries} from '../../chefProfile/testing/screenTestKit';
import {createChefKitchenScheduleQueryKey} from '../state/chefKitchenScheduleQuery';
import {ChefKitchenScheduleScreen} from './ChefKitchenScheduleScreen';

jest.setTimeout(20_000);

const mockApi = {get: jest.fn(), replace: jest.fn(), getOverride: jest.fn(), putOverride: jest.fn(), deleteOverride: jest.fn()};
const mockKitchen = {
  status: 'open',
  closedReason: null as string | null,
  opensAt: null as string | null,
  saving: false,
  setOpen: jest.fn(),
};

jest.mock('@react-navigation/native', () => ({useNavigation: () => ({navigate: jest.fn(), goBack: jest.fn()})}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: require('react-native').View,
  useSafeAreaInsets: () => ({top: 0, right: 0, bottom: 0, left: 0}),
}));
jest.mock('../../../design/reducedMotion', () => ({useReducedMotionPreference: () => false}));
jest.mock('../../../app/store/hooks', () => ({
  useAppSelector: (select: (state: unknown) => unknown) => select({auth: {identity: {id: 'user-1'}}}),
}));
jest.mock('../../chefProfile/state/useKitchenOpenState', () => ({useKitchenOpenState: () => mockKitchen}));
jest.mock('../api/chefKitchenScheduleApi', () => ({
  ...jest.requireActual('../api/chefKitchenScheduleApi'),
  chefKitchenScheduleApi: {
    get: (...args: unknown[]) => mockApi.get(...args),
    replace: (...args: unknown[]) => mockApi.replace(...args),
    getOverride: (...args: unknown[]) => mockApi.getOverride(...args),
    putOverride: (...args: unknown[]) => mockApi.putOverride(...args),
    deleteOverride: (...args: unknown[]) => mockApi.deleteOverride(...args),
  },
}));

const KITCHEN_ID = '77777777-7777-4777-8777-777777777777';
const win = (dayOfWeek: number, opensAt = '11:00:00', closesAt = '22:00:00') => ({
  id: `88888888-8888-4888-8888-88888888${dayOfWeek}${dayOfWeek}${dayOfWeek}${dayOfWeek}`,
  dayOfWeek,
  opensAt,
  closesAt,
});
const schedule = (weeklyWindows = [win(1), win(2), win(3), win(4), win(5)]) => ({
  kitchenId: KITCHEN_ID,
  timezoneId: 'Asia/Kolkata',
  acceptingOrders: true,
  pausedUntil: null,
  pauseReason: null,
  weeklyWindows,
});
const range = (dayOfWeek: number, opensAt: string, closesAt: string) => ({dayOfWeek, opensAt, closesAt});

let tree: renderer.ReactTestRenderer;
let client: QueryClient;
const ui = screenQueries(() => tree);

async function mount() {
  client = new QueryClient({defaultOptions: {queries: {retry: false, gcTime: Infinity}}});
  await act(async () => {
    tree = renderer.create(
      <QueryClientProvider client={client}>
        <ChefToastProvider>
          <ChefKitchenScheduleScreen />
        </ChefToastProvider>
      </QueryClientProvider>,
    );
  });
  await ui.settle();
}

const isoDate = (daysFromNow: number) => {
  const date = new Date(Date.now() + daysFromNow * 86_400_000);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

describe('ChefKitchenScheduleScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockKitchen.status = 'open';
    mockKitchen.closedReason = null;
    mockKitchen.opensAt = null;
    mockKitchen.setOpen.mockResolvedValue(true);
    mockApi.get.mockResolvedValue(schedule());
    mockApi.replace.mockImplementation(async (request: {weeklyWindows: ReturnType<typeof range>[]}) =>
      schedule(request.weeklyWindows.map((window, index) => ({...window, id: `99999999-9999-4999-8999-99999999${String(index).padStart(4, '0')}`}))),
    );
  });
  afterEach(() => act(() => tree.unmount()));

  it('shows the Taking orders switch and every day of the week with its hours', async () => {
    mockApi.get.mockResolvedValue(schedule([win(1, '11:00:00', '15:00:00'), win(1, '18:00:00', '22:00:00'), win(2)]));
    await mount();
    expect(ui.has('Taking orders')).toBe(true);
    expect(ui.has('Customers can order now')).toBe(true);
    expect(ui.switchFor('Taking orders')?.props.value).toBe(true);
    expect(ui.has('Every week')).toBe(true);
    expect(ui.byPrefix('Monday')?.props.accessibilityLabel).toBe('Monday, 11:00 AM – 3:00 PM, 6:00 PM – 10:00 PM');
    expect(ui.byPrefix('Tuesday')?.props.accessibilityLabel).toBe('Tuesday, 11:00 AM – 10:00 PM');
    expect(ui.byPrefix('Saturday')?.props.accessibilityLabel).toBe('Saturday, Closed');
    expect(ui.byPrefix('Sunday')?.props.accessibilityLabel).toBe('Sunday, Closed');
  });

  it('keeps the week in the same cache entry the kitchen open state reads', async () => {
    await mount();
    expect(client.getQueryData(createChefKitchenScheduleQueryKey('user-1'))).toMatchObject({kitchenId: KITCHEN_ID});
  });

  it('says hours are not set, rather than closed, when the week has no hours at all', async () => {
    mockApi.get.mockResolvedValue(schedule([]));
    await mount();
    expect(ui.byPrefix('Monday')?.props.accessibilityLabel).toBe('Monday, Not set');
    expect(ui.anyText(/No hours set yet/)).toBe(true);
  });

  it('closes and opens the kitchen from the switch, and says what happened', async () => {
    await mount();
    await ui.toggle('Taking orders', false);
    expect(mockKitchen.setOpen).toHaveBeenCalledWith(false);
    expect(ui.has('Your kitchen is closed')).toBe(true);

    mockKitchen.setOpen.mockResolvedValue(false);
    await ui.toggle('Taking orders', true);
    expect(ui.has('Your kitchen is open')).toBe(false);

    mockKitchen.setOpen.mockRejectedValue(new Error('network'));
    await ui.toggle('Taking orders', true);
    expect(ui.has("We couldn't update your kitchen. Check your connection and try again.")).toBe(true);
  });

  it('shows a closed kitchen as off, and a kitchen Craves has paused as locked', async () => {
    mockKitchen.status = 'closed';
    mockKitchen.closedReason = 'chef';
    await mount();
    expect(ui.switchFor('Taking orders')?.props.value).toBe(false);
    expect(ui.has("Customers can't order right now")).toBe(true);
    act(() => tree.unmount());

    mockKitchen.status = 'suspended';
    await mount();
    expect(ui.switchFor('Taking orders')?.props.disabled).toBe(true);
    expect(ui.anyText(/Craves has paused your kitchen/)).toBe(true);
  });

  it('edits Monday to 11 AM to 3 PM and 6 PM to 10 PM and copies it to Tuesday to Friday in one save', async () => {
    await mount();
    await ui.press('Monday');
    await ui.press('Closing time 1');
    await ui.press('3:00 PM');
    await ui.press('Add another time');
    for (const day of ['Tue', 'Wed', 'Thu', 'Fri']) {
      await ui.press(day);
    }
    await ui.press('Save');
    await ui.settle();

    expect(mockApi.replace).toHaveBeenCalledTimes(1);
    const request = mockApi.replace.mock.calls[0][0];
    expect(request).toMatchObject({acceptingOrders: true, pausedUntil: null, pauseReason: null});
    expect(request.weeklyWindows).toHaveLength(10);
    for (const day of [1, 2, 3, 4, 5]) {
      expect(request.weeklyWindows).toEqual(
        expect.arrayContaining([range(day, '11:00', '15:00'), range(day, '18:00', '22:00')]),
      );
    }
    expect(ui.byPrefix('Monday')?.props.accessibilityLabel).toBe('Monday, 11:00 AM – 3:00 PM, 6:00 PM – 10:00 PM');
    expect(ui.byPrefix('Friday')?.props.accessibilityLabel).toBe('Friday, 11:00 AM – 3:00 PM, 6:00 PM – 10:00 PM');
    expect(ui.has('Opening hours saved')).toBe(true);
  });

  it('opens a closed day with 11 AM to 10 PM and saves only that day as new', async () => {
    await mount();
    await ui.press('Saturday');
    await ui.toggle('Open', true);
    await ui.press('Save');
    await ui.settle();
    const {weeklyWindows} = mockApi.replace.mock.calls[0][0];
    expect(weeklyWindows).toHaveLength(6);
    expect(weeklyWindows).toEqual(expect.arrayContaining([range(6, '11:00', '22:00')]));
  });

  it('closes a day when Open is switched off', async () => {
    await mount();
    await ui.press('Monday');
    await ui.toggle('Open', false);
    await ui.press('Save');
    await ui.settle();
    const {weeklyWindows} = mockApi.replace.mock.calls[0][0];
    expect(weeklyWindows.filter((window: {dayOfWeek: number}) => window.dayOfWeek === 1)).toHaveLength(0);
    expect(weeklyWindows).toHaveLength(4);
    expect(ui.byPrefix('Monday')?.props.accessibilityLabel).toBe('Monday, Closed');
  });

  it('does not save a time that closes before it opens, and says why', async () => {
    await mount();
    await ui.press('Monday');
    await ui.press('Closing time 1');
    await ui.press('10:00 AM');
    await ui.press('Save');
    expect(mockApi.replace).not.toHaveBeenCalled();
    expect(ui.has('Each time must close after it opens.')).toBe(true);
  });

  it('keeps the sheet open and says so when the hours could not be saved', async () => {
    mockApi.replace.mockRejectedValue(new Error('network'));
    await mount();
    await ui.press('Monday');
    await ui.press('Save');
    await ui.settle();
    expect(ui.has("We couldn't save your hours. Please try again.")).toBe(true);
    expect(ui.byLabel('Save')).toBeDefined();
  });

  it('shows Coming soon for the hours when the route is not published, and the switch still works', async () => {
    mockApi.get.mockRejectedValue(new AppApiError('HTTP_404', 'Not found', 404));
    await mount();
    expect(ui.has('Opening hours are on their way')).toBe(true);
    expect(ui.switchFor('Taking orders')).toBeDefined();
    expect(ui.byPrefix('Monday')).toBeUndefined();
    expect(ui.byLabel('Add a special day')).toBeUndefined();
    expect(ui.anyText(/unavailable|failed|try again|route/i)).toBe(false);
  });

  it('closes the kitchen for a special day, then lists it and removes it', async () => {
    mockApi.getOverride.mockRejectedValue(new AppApiError('SCHEDULE_OVERRIDE_NOT_FOUND', 'Not found', 404));
    mockApi.putOverride.mockResolvedValue({kitchenId: KITCHEN_ID, serviceDate: isoDate(1), closed: true, reason: 'Diwali', windows: []});
    mockApi.deleteOverride.mockResolvedValue(undefined);
    await mount();

    await ui.press('Add a special day');
    await ui.press('Tomorrow');
    await ui.settle();
    expect(mockApi.getOverride).toHaveBeenCalledWith(isoDate(1));
    await act(async () => {
      tree.root.findAllByType(TextInput).find(input => input.props.accessibilityLabel === 'Reason (optional)')!.props.onChangeText('Diwali');
    });
    await ui.press('Save');
    await ui.settle();

    expect(mockApi.putOverride).toHaveBeenCalledWith(isoDate(1), {closed: true, reason: 'Diwali', windows: []});
    expect(ui.has('Special day saved')).toBe(true);
    expect(ui.byPrefix('Tomorrow · Diwali')?.props.accessibilityLabel).toBe('Tomorrow · Diwali, Closed');

    await ui.press('Tomorrow · Diwali');
    await ui.settle();
    await ui.press('Remove special day');
    await ui.settle();
    expect(mockApi.deleteOverride).toHaveBeenCalledWith(isoDate(1));
    expect(ui.byPrefix('Tomorrow · Diwali')).toBeUndefined();
  });

  it('opens a special day with its own hours', async () => {
    mockApi.getOverride.mockRejectedValue(new AppApiError('SCHEDULE_OVERRIDE_NOT_FOUND', 'Not found', 404));
    mockApi.putOverride.mockResolvedValue({kitchenId: KITCHEN_ID, serviceDate: isoDate(2), closed: false, reason: null, windows: []});
    await mount();
    await ui.press('Add a special day');
    await ui.press('Tomorrow');
    await ui.settle();
    await ui.toggle('Closed all day', false);
    await ui.press('Closing time 1');
    await ui.press('3:00 PM');
    await ui.press('Save');
    await ui.settle();
    expect(mockApi.putOverride).toHaveBeenCalledWith(isoDate(1), {
      closed: false,
      reason: null,
      windows: [{opensAt: '11:00', closesAt: '15:00'}],
    });
  });
});
