import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {AppApiError} from '../../../core/http/apiError';
import {ChefToastProvider} from '../../chefShell/components/ui';
import {screenQueries} from '../../chefProfile/testing/screenTestKit';
import {ChefAppPreferencesScreen} from './ChefAppPreferencesScreen';

jest.setTimeout(20_000);

const mockGoBack = jest.fn();
const mockPrefs = {list: jest.fn(), set: jest.fn()};
const mockSettings = {get: jest.fn(), update: jest.fn()};
const mockSound = {read: jest.fn(), write: jest.fn()};

jest.mock('@react-navigation/native', () => ({useNavigation: () => ({navigate: jest.fn(), goBack: mockGoBack})}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: require('react-native').View,
  useSafeAreaInsets: () => ({top: 0, right: 0, bottom: 0, left: 0}),
}));
jest.mock('../../../design/reducedMotion', () => ({useReducedMotionPreference: () => false}));
jest.mock('../../../app/store/hooks', () => ({
  useAppSelector: (select: (state: unknown) => unknown) => select({auth: {identity: {id: 'user-1'}}}),
}));
jest.mock('../api/notificationPreferencesApi', () => ({
  ...jest.requireActual('../api/notificationPreferencesApi'),
  notificationPreferencesApi: {
    list: (...args: unknown[]) => mockPrefs.list(...args),
    set: (...args: unknown[]) => mockPrefs.set(...args),
  },
}));
jest.mock('../api/chefKitchenSettingsApi', () => ({
  ...jest.requireActual('../api/chefKitchenSettingsApi'),
  chefKitchenSettingsApi: {
    get: (...args: unknown[]) => mockSettings.get(...args),
    update: (...args: unknown[]) => mockSettings.update(...args),
  },
}));
jest.mock('../storage/newOrderSoundStorage', () => ({
  newOrderSoundStorage: {
    read: (...args: unknown[]) => mockSound.read(...args),
    write: (...args: unknown[]) => mockSound.write(...args),
  },
}));

const NOT_PUBLISHED = new AppApiError('HTTP_404', 'Not found', 404);
let tree: renderer.ReactTestRenderer;
const ui = screenQueries(() => tree);

async function mount() {
  await act(async () => {
    tree = renderer.create(
      <QueryClientProvider client={new QueryClient({defaultOptions: {queries: {retry: false, gcTime: Infinity}}})}>
        <ChefToastProvider>
          <ChefAppPreferencesScreen />
        </ChefToastProvider>
      </QueryClientProvider>,
    );
  });
  await ui.settle();
}

describe('ChefAppPreferencesScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSound.read.mockResolvedValue(true);
    mockSound.write.mockResolvedValue(undefined);
    mockPrefs.list.mockResolvedValue([{channel: 'EMAIL', enabled: false, updatedAt: null}]);
    mockSettings.get.mockResolvedValue({autoAcceptOrders: false, defaultPrepMinutes: 20});
  });
  afterEach(() => act(() => tree.unmount()));

  it('shows the three groups with the saved values and marks what is not built yet', async () => {
    await mount();
    expect(ui.has('Notifications')).toBe(true);
    expect(ui.has('Orders')).toBe(true);
    expect(ui.has('App')).toBe(true);
    expect(ui.switchFor('New order sound')?.props.value).toBe(true);
    expect(ui.switchFor('Push notifications')?.props.value).toBe(true);
    expect(ui.switchFor('Email')?.props.value).toBe(false);
    expect(ui.switchFor('Accept orders automatically')?.props.value).toBe(false);
    expect(ui.byPrefix('Default cooking time')?.props.accessibilityLabel).toContain('20 min');
    // SMS, Language and Theme cannot be changed yet: no switch, nothing to tap, and a "Coming soon" chip each.
    expect(ui.switchFor('SMS')).toBeUndefined();
    expect(ui.byPrefix('Language')).toBeUndefined();
    expect(ui.byPrefix('Theme')).toBeUndefined();
    expect(ui.lines().filter(line => line === 'Coming soon')).toHaveLength(3);
    expect(ui.anyText(/English/)).toBe(true);
  });

  it('saves a notification channel and puts the switch back when the save fails', async () => {
    mockPrefs.set.mockResolvedValueOnce({channel: 'PUSH', enabled: false, updatedAt: null});
    await mount();
    await ui.toggle('Push notifications', false);
    await ui.settle();
    expect(mockPrefs.set).toHaveBeenCalledWith('PUSH', false);
    expect(ui.switchFor('Push notifications')?.props.value).toBe(false);

    mockPrefs.set.mockRejectedValueOnce(new Error('network'));
    await ui.toggle('Email', true);
    await ui.settle();
    expect(ui.switchFor('Email')?.props.value).toBe(false);
    expect(ui.has("We couldn't save that. Please try again.")).toBe(true);
  });

  it('keeps the new order sound on the phone and never calls the server for it', async () => {
    await mount();
    await ui.toggle('New order sound', false);
    expect(mockSound.write).toHaveBeenCalledWith('user-1', false);
    expect(ui.switchFor('New order sound')?.props.value).toBe(false);
    expect(mockPrefs.set).not.toHaveBeenCalled();
    expect(mockSettings.update).not.toHaveBeenCalled();
  });

  it('asks before turning on automatic acceptance, and only then saves it with the cooking time', async () => {
    mockSettings.update.mockResolvedValue({autoAcceptOrders: true, defaultPrepMinutes: 20});
    await mount();
    await ui.toggle('Accept orders automatically', true);
    expect(ui.has('Accept new orders automatically?')).toBe(true);
    expect(ui.has('Orders are accepted with your cooking time while your kitchen is open.')).toBe(true);
    expect(mockSettings.update).not.toHaveBeenCalled();

    await ui.press('Not now');
    expect(mockSettings.update).not.toHaveBeenCalled();
    expect(ui.switchFor('Accept orders automatically')?.props.value).toBe(false);

    await ui.toggle('Accept orders automatically', true);
    await ui.press('Turn on');
    await ui.settle();
    expect(mockSettings.update).toHaveBeenCalledWith({autoAcceptOrders: true, defaultPrepMinutes: 20});
    expect(ui.switchFor('Accept orders automatically')?.props.value).toBe(true);
  });

  it('turns automatic acceptance off without asking', async () => {
    mockSettings.get.mockResolvedValue({autoAcceptOrders: true, defaultPrepMinutes: 20});
    mockSettings.update.mockResolvedValue({autoAcceptOrders: false, defaultPrepMinutes: 20});
    await mount();
    await ui.toggle('Accept orders automatically', false);
    await ui.settle();
    expect(mockSettings.update).toHaveBeenCalledWith({autoAcceptOrders: false, defaultPrepMinutes: 20});
  });

  it('picks a default cooking time from the sheet and saves it', async () => {
    mockSettings.update.mockResolvedValue({autoAcceptOrders: false, defaultPrepMinutes: 30});
    await mount();
    await ui.press('Default cooking time');
    await ui.press('30 min');
    await ui.settle();
    expect(mockSettings.update).toHaveBeenCalledWith({autoAcceptOrders: false, defaultPrepMinutes: 30});
    expect(ui.byPrefix('Default cooking time')?.props.accessibilityLabel).toContain('30 min');
  });

  it('shows Not set when no cooking time was chosen yet', async () => {
    mockSettings.get.mockResolvedValue({autoAcceptOrders: false, defaultPrepMinutes: null});
    await mount();
    expect(ui.byPrefix('Default cooking time')?.props.accessibilityLabel).toContain('Not set');
  });

  it('shows Coming soon, not an error, for each group whose route is not published', async () => {
    mockPrefs.list.mockRejectedValue(NOT_PUBLISHED);
    mockSettings.get.mockRejectedValue(NOT_PUBLISHED);
    await mount();
    expect(ui.has('Notification settings are on their way')).toBe(true);
    expect(ui.has('Order settings are on their way')).toBe(true);
    expect(ui.switchFor('Push notifications')).toBeUndefined();
    expect(ui.switchFor('Accept orders automatically')).toBeUndefined();
    // The phone-only sound setting still works.
    expect(ui.switchFor('New order sound')).toBeDefined();
    expect(ui.anyText(/unavailable|failed|try again|route/i)).toBe(false);
  });
});
