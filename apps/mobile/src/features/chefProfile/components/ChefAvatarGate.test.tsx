import React from 'react';
import {Text} from 'react-native';
import renderer, {act} from 'react-test-renderer';
import {QueryClient, QueryClientProvider, onlineManager} from '@tanstack/react-query';
import {AppApiError} from '../../../core/http/apiError';
import type {ChefKitchenProfile} from '../api/chefProfileApi';
import {chefProfileKitchenQueryPrefix} from '../state/chefProfileQuery';
import {deferred, screenQueries} from '../testing/screenTestKit';
import {ChefAvatarGate} from './ChefAvatarGate';

jest.setTimeout(20_000);

const mockGetKitchen = jest.fn();
const mockSetAvatar = jest.fn();
let mockState: {auth: {identity: Record<string, unknown> | null}};

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: require('react-native').View,
  useSafeAreaInsets: () => ({top: 0, right: 0, bottom: 0, left: 0}),
}));
jest.mock('../../../app/store/hooks', () => ({
  useAppSelector: (select: (state: unknown) => unknown) => select(mockState),
}));
jest.mock('../api/chefProfileApi', () => ({
  chefProfileApi: {
    getKitchen: (...args: unknown[]) => mockGetKitchen(...args),
    setAvatar: (...args: unknown[]) => mockSetAvatar(...args),
  },
}));

const KITCHEN: ChefKitchenProfile = {
  id: '11111111-1111-4111-8111-111111111111',
  identityId: '22222222-2222-4222-8222-222222222222',
  kitchenName: 'Relangi mavayya kitchen',
  displayName: 'Relangi',
  description: null,
  phoneNumber: null,
  email: null,
  addressLine1: '5-67, Lane 16, KPHB',
  addressLine2: null,
  landmark: null,
  areaName: 'KPHB',
  city: 'Hyderabad',
  state: 'Telangana',
  postalCode: '500085',
  latitude: null,
  longitude: null,
  status: 'ACTIVE',
  createdAt: '2026-08-01T07:00:00Z',
  updatedAt: '2026-08-09T08:00:00Z',
  chefPhotoUrl: null,
};
const withFace = (n: string): ChefKitchenProfile => ({
  ...KITCHEN,
  chefPhotoUrl: `https://m/public/chef-avatars/chef-avatar-${n}.jpg`,
});

// What the server does: once a face is saved, the kitchen is read back with it.
const saved = (face: ChefKitchenProfile) => {
  mockGetKitchen.mockResolvedValue(face);
  return face;
};

let tree: renderer.ReactTestRenderer;
let client: QueryClient;
const ui = screenQueries(() => tree);
const buttonState = (label: string) => ui.byLabel(label)?.props.accessibilityState;

async function mount() {
  client = new QueryClient({defaultOptions: {queries: {retry: false, gcTime: Infinity}}});
  await act(async () => {
    tree = renderer.create(
      <QueryClientProvider client={client}>
        <ChefAvatarGate>
          <Text>Workspace</Text>
        </ChefAvatarGate>
      </QueryClientProvider>,
    );
  });
  await ui.settle();
}

describe('ChefAvatarGate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockState = {auth: {identity: {id: KITCHEN.identityId, roles: ['CHEF'], status: 'ACTIVE'}}};
    mockGetKitchen.mockResolvedValue(KITCHEN);
  });
  afterEach(() => {
    act(() => onlineManager.setOnline(true));
    act(() => tree.unmount());
  });

  it('asks for a face, saves it and opens the workspace', async () => {
    mockSetAvatar.mockImplementation(async () => saved(withFace('04')));
    await mount();
    expect(ui.has('Choose your profile picture')).toBe(true);
    expect(ui.has('Customers see this picture with your name on your kitchen page. You can change it any time.')).toBe(true);
    expect(ui.has('Workspace')).toBe(false);
    expect(buttonState('Continue')?.disabled).toBe(true);

    await ui.press('Picture 4');
    expect(buttonState('Continue')?.disabled).toBe(false);
    await ui.press('Continue');
    await ui.settle();

    expect(mockSetAvatar).toHaveBeenCalledTimes(1);
    expect(mockSetAvatar.mock.calls[0][0]).toBe('chef-avatar-04');
    expect(ui.has('Workspace')).toBe(true);
    expect(ui.has('Choose your profile picture')).toBe(false);
  });

  it('keeps the button busy while the save is out and ignores a second press', async () => {
    const save = deferred<ChefKitchenProfile>();
    mockSetAvatar.mockReturnValue(save.promise);
    await mount();
    await ui.press('Picture 2');
    await ui.press('Continue');
    expect(buttonState('Continue')?.busy).toBe(true);
    await ui.press('Continue');
    expect(mockSetAvatar).toHaveBeenCalledTimes(1);
    await act(async () => save.resolve(saved(withFace('02'))));
    await ui.settle();
    expect(ui.has('Workspace')).toBe(true);
  });

  it('a failed save shows Not now, which opens the workspace', async () => {
    mockSetAvatar.mockRejectedValue(new AppApiError('NOT_FOUND', 'not found', 404));
    await mount();
    expect(ui.byLabel('Not now')).toBeUndefined();

    await ui.press('Picture 4');
    await ui.press('Continue');
    await ui.settle();

    expect(ui.has("We couldn't save your picture. Please try again.")).toBe(true);
    expect(ui.byLabel('Try again')).toBeDefined();
    expect(ui.has('Workspace')).toBe(false);
    await ui.press('Not now');
    expect(ui.has('Workspace')).toBe(true);
    expect(ui.has('Choose your profile picture')).toBe(false);
  });

  it('Try again after a failure saves the same face', async () => {
    mockSetAvatar.mockRejectedValueOnce(new Error('offline')).mockImplementationOnce(async () => saved(withFace('04')));
    await mount();
    await ui.press('Picture 4');
    await ui.press('Continue');
    await ui.settle();
    await ui.press('Try again');
    await ui.settle();
    expect(mockSetAvatar).toHaveBeenCalledTimes(2);
    expect(mockSetAvatar.mock.calls[1][0]).toBe('chef-avatar-04');
    expect(ui.has("We couldn't save your picture. Please try again.")).toBe(false);
    expect(ui.has('Workspace')).toBe(true);
  });

  it('keeps asking when a later background read of the kitchen fails', async () => {
    await mount();
    await ui.press('Picture 4');
    mockGetKitchen.mockRejectedValue(new AppApiError('INTERNAL', 'down', 500));
    await act(async () => {
      await client.refetchQueries({queryKey: chefProfileKitchenQueryPrefix});
    });
    expect(ui.has('Choose your profile picture')).toBe(true);
    expect(buttonState('Continue')?.disabled).toBe(false);
  });

  it('a chef with a face goes straight in', async () => {
    mockGetKitchen.mockResolvedValue(withFace('04'));
    await mount();
    expect(ui.has('Workspace')).toBe(true);
    expect(ui.has('Choose your profile picture')).toBe(false);
  });

  it('a kitchen that fails to load goes straight in', async () => {
    mockGetKitchen.mockRejectedValue(new AppApiError('INTERNAL', 'down', 500));
    await mount();
    expect(ui.has('Workspace')).toBe(true);
    expect(ui.has('Choose your profile picture')).toBe(false);
  });

  it('a server that sends no picture field goes straight in', async () => {
    const older: Partial<ChefKitchenProfile> = {...KITCHEN};
    delete older.chefPhotoUrl;
    mockGetKitchen.mockResolvedValue(older);
    await mount();
    expect(ui.has('Workspace')).toBe(true);
    expect(ui.has('Choose your profile picture')).toBe(false);
  });

  it('a suspended kitchen goes straight in', async () => {
    mockGetKitchen.mockResolvedValue({...KITCHEN, status: 'SUSPENDED'});
    await mount();
    expect(ui.has('Workspace')).toBe(true);
    expect(ui.has('Choose your profile picture')).toBe(false);
  });

  it('a kitchen read that never starts (no signed-in chef) goes straight in instead of waiting', async () => {
    mockState = {auth: {identity: null}};
    await mount();
    expect(mockGetKitchen).not.toHaveBeenCalled();
    expect(ui.has('Workspace')).toBe(true);
    expect(ui.has('Preparing Chef workspace')).toBe(false);
  });

  it('an offline chef (kitchen read paused) goes straight in instead of waiting', async () => {
    act(() => onlineManager.setOnline(false));
    await mount();
    expect(mockGetKitchen).not.toHaveBeenCalled();
    expect(ui.has('Workspace')).toBe(true);
    expect(ui.has('Preparing Chef workspace')).toBe(false);
  });

  it('shows Preparing Chef workspace while the kitchen loads', async () => {
    const load = deferred<ChefKitchenProfile>();
    mockGetKitchen.mockReturnValue(load.promise);
    await mount();
    expect(ui.has('Preparing Chef workspace')).toBe(true);
    expect(ui.has('Workspace')).toBe(false);
    await act(async () => load.resolve(withFace('04')));
    await ui.settle();
    expect(ui.has('Workspace')).toBe(true);
  });
});
