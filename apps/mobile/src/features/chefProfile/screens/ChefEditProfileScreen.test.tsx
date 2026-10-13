import React from 'react';
import {TextInput} from 'react-native';
import renderer, {act} from 'react-test-renderer';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {AppApiError} from '../../../core/http/apiError';
import {ChefToastProvider} from '../../chefShell/components/ui';
import type {ChefKitchenProfile} from '../api/chefProfileApi';
import {ChefEditProfileDraftProvider} from '../state/ChefEditProfileDraftProvider';
import {deferred, screenQueries} from '../testing/screenTestKit';
import {ChefEditProfileScreen} from './ChefEditProfileScreen';

jest.setTimeout(20_000);

const mockGoBack = jest.fn();
const mockDispatch = jest.fn();
let mockBeforeRemove: ((event: {preventDefault: () => void; data: {action: unknown}}) => void) | undefined;
const mockApi = {getKitchen: jest.fn(), replaceKitchen: jest.fn(), uploadPhoto: jest.fn(), deletePhoto: jest.fn()};
const mockPickPhoto = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    goBack: mockGoBack,
    dispatch: mockDispatch,
    addListener: (_name: string, callback: typeof mockBeforeRemove) => {
      mockBeforeRemove = callback;
      return () => {
        mockBeforeRemove = undefined;
      };
    },
  }),
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: require('react-native').View,
  useSafeAreaInsets: () => ({top: 0, right: 0, bottom: 0, left: 0}),
}));
jest.mock('../../../design/reducedMotion', () => ({useReducedMotionPreference: () => false}));
jest.mock('../../../app/store/hooks', () => ({
  useAppSelector: (select: (state: unknown) => unknown) => select({auth: {identity: {id: 'user-1'}}}),
}));
jest.mock('../api/chefProfileApi', () => ({
  ...jest.requireActual('../api/chefProfileApi'),
  chefProfileApi: {
    getKitchen: (...args: unknown[]) => mockApi.getKitchen(...args),
    replaceKitchen: (...args: unknown[]) => mockApi.replaceKitchen(...args),
    uploadPhoto: (...args: unknown[]) => mockApi.uploadPhoto(...args),
    deletePhoto: (...args: unknown[]) => mockApi.deletePhoto(...args),
  },
}));
jest.mock('../../chefMenu/components/dishPhoto', () => ({pickDishPhoto: (...args: unknown[]) => mockPickPhoto(...args)}));

const KITCHEN: ChefKitchenProfile = {
  id: '11111111-1111-4111-8111-111111111111',
  identityId: '22222222-2222-4222-8222-222222222222',
  kitchenName: 'Relangi mavayya kitchen',
  displayName: 'Relangi',
  description: 'Brings smile on your face',
  phoneNumber: '+919876523365',
  email: null,
  addressLine1: '5-67, Lane 16, KPHB',
  addressLine2: null,
  landmark: null,
  areaName: 'Vasanthnagar',
  city: 'Hyderabad',
  state: 'Telangana',
  postalCode: '500085',
  latitude: 17.49,
  longitude: 78.39,
  status: 'ACTIVE',
  createdAt: '2026-08-01T07:00:00Z',
  updatedAt: '2026-08-09T08:00:00Z',
};
const PUBLISHED: ChefKitchenProfile = {
  ...KITCHEN,
  chefPhotoUrl: null,
  kitchenPhotoUrl: 'https://cdn.example.test/kitchen.jpg',
  cuisines: ['Andhra', 'Biryani'],
  serviceAreas: ['KPHB'],
  socialLinks: {instagram: null, facebook: null, youtube: null, website: null},
};

let tree: renderer.ReactTestRenderer;
const ui = screenQueries(() => tree);
const input = (label: string) => tree.root.findAllByType(TextInput).find(node => node.props.accessibilityLabel === label)!;
const type = (label: string, text: string) =>
  act(async () => {
    input(label).props.onChangeText(text);
  });
// A switched-off button keeps its onPress, so "on" means the button says it is not disabled.
const saveEnabled = () =>
  tree.root.findAll(
    node =>
      node.props.accessibilityLabel === 'Save changes' &&
      typeof node.props.onPress === 'function' &&
      node.props.accessibilityState?.disabled === false,
  ).length > 0;

async function mount(kitchen: ChefKitchenProfile = KITCHEN, serve = true) {
  if (serve) {
    mockApi.getKitchen.mockResolvedValue(kitchen);
  }
  await act(async () => {
    tree = renderer.create(
      <QueryClientProvider client={new QueryClient({defaultOptions: {queries: {retry: false, gcTime: Infinity}}})}>
        <ChefToastProvider>
          <ChefEditProfileDraftProvider>
            <ChefEditProfileScreen />
          </ChefEditProfileDraftProvider>
        </ChefToastProvider>
      </QueryClientProvider>,
    );
  });
  await ui.settle();
  await ui.settle();
}

describe('ChefEditProfileScreen (Kitchen details)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockBeforeRemove = undefined;
    mockApi.replaceKitchen.mockImplementation(async (request: Record<string, unknown>) => ({...KITCHEN, ...request}));
  });
  afterEach(() => act(() => tree.unmount()));

  it('shows the kitchen in one form: photos, name, about, contact and address', async () => {
    await mount();
    expect(ui.has('Photos')).toBe(true);
    expect(ui.has('Your photo')).toBe(true);
    expect(ui.has('Kitchen photo')).toBe(true);
    expect(input('Kitchen name').props.value).toBe('Relangi mavayya kitchen');
    expect(input('About your kitchen').props.value).toBe('Brings smile on your face');
    expect(ui.has('25 / 2000')).toBe(true);
    expect(input('Your name').props.value).toBe('Relangi');
    expect(input('Phone').props.value).toBe('+919876523365');
    expect(ui.has('Kitchen address')).toBe(true);
    expect(ui.has('5-67, Lane 16, KPHB')).toBe(true);
    expect(ui.has('Vasanthnagar, Hyderabad, Telangana, 500085')).toBe(true);
    expect(saveEnabled()).toBe(false);
    expect(ui.anyText(/KitchenProfileRequest|contract|backend|route/i)).toBe(false);
  });

  it('keeps Save changes switched off until something changes, then saves the whole kitchen in one PUT and goes back', async () => {
    await mount();
    await type('Kitchen name', 'Relangi Andhra Kitchen');
    expect(saveEnabled()).toBe(true);
    await ui.press('Save changes');
    await ui.settle();

    expect(mockApi.replaceKitchen).toHaveBeenCalledTimes(1);
    expect(mockApi.replaceKitchen.mock.calls[0][0]).toEqual({
      kitchenName: 'Relangi Andhra Kitchen',
      displayName: 'Relangi',
      description: 'Brings smile on your face',
      phoneNumber: '+919876523365',
      email: null,
      addressLine1: '5-67, Lane 16, KPHB',
      addressLine2: null,
      landmark: null,
      areaName: 'Vasanthnagar',
      city: 'Hyderabad',
      state: 'Telangana',
      postalCode: '500085',
      latitude: 17.49,
      longitude: 78.39,
      status: 'ACTIVE',
    });
    expect(ui.has('Kitchen details saved')).toBe(true);
    expect(mockGoBack).toHaveBeenCalled();
  });

  it('does not save a kitchen with no name and says what is missing', async () => {
    await mount();
    await type('Kitchen name', '   ');
    await ui.press('Save changes');
    expect(mockApi.replaceKitchen).not.toHaveBeenCalled();
    expect(ui.has('Kitchen name is required.')).toBe(true);
  });

  it('keeps the changes and says so when saving fails, without showing the error text from the server', async () => {
    mockApi.replaceKitchen.mockRejectedValue(new AppApiError('VALIDATION_FAILED', 'kitchenProfileRequest.city must not be blank', 400));
    await mount();
    await type('Kitchen name', 'New name');
    await ui.press('Save changes');
    await ui.settle();
    expect(ui.has("We couldn't save your changes. Please try again.")).toBe(true);
    expect(ui.anyText(/kitchenProfileRequest|VALIDATION/)).toBe(false);
    expect(input('Kitchen name').props.value).toBe('New name');
    expect(mockGoBack).not.toHaveBeenCalled();
  });

  it('saves only once when Save changes is pressed twice', async () => {
    const pending = deferred<ChefKitchenProfile>();
    mockApi.replaceKitchen.mockReturnValue(pending.promise);
    await mount();
    await type('Kitchen name', 'Other name');
    await ui.press('Save changes');
    await ui.press('Save changes');
    expect(mockApi.replaceKitchen).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve({...KITCHEN, kitchenName: 'Other name'}));
  });

  it('changes the address in a sheet and saves it with the rest', async () => {
    await mount();
    await ui.press('Change');
    await act(async () => {
      input('Flat / house number / building').props.onChangeText('9-1, Lake Road');
      input('PIN code').props.onChangeText('500081');
    });
    await ui.press('Use this address');
    expect(ui.has('9-1, Lake Road')).toBe(true);
    await ui.press('Save changes');
    await ui.settle();
    expect(mockApi.replaceKitchen.mock.calls[0][0]).toMatchObject({addressLine1: '9-1, Lake Road', postalCode: '500081', latitude: 17.49});
  });

  it('keeps the sheet open and says what is missing when the address has no street or city', async () => {
    await mount();
    await ui.press('Change');
    await act(async () => {
      input('City').props.onChangeText('');
    });
    await ui.press('Use this address');
    expect(ui.has('City is required.')).toBe(true);
    expect(ui.byLabel('Use this address')).toBeDefined();
  });

  it('shows cuisines, delivery areas and links once the server sends them, and saves them', async () => {
    await mount(PUBLISHED);
    expect(ui.has('What you cook')).toBe(true);
    expect(ui.has('Delivery areas')).toBe(true);
    expect(ui.has('Social links')).toBe(true);
    await ui.press('Tiffins');
    await ui.press('+ Add');
    await act(async () => {
      input('Add a cuisine').props.onChangeText('Pulao');
    });
    await ui.press('Add');
    await ui.press('+ Add area');
    await act(async () => {
      input('Add a delivery area').props.onChangeText('Miyapur');
    });
    await ui.press('Add');
    await type('Instagram', 'https://instagram.com/relangi');
    await ui.press('Save changes');
    await ui.settle();

    const request = mockApi.replaceKitchen.mock.calls[0][0];
    expect(request.cuisines).toEqual(['Andhra', 'Biryani', 'Tiffins', 'Pulao']);
    expect(request.serviceAreas).toEqual(['KPHB', 'Miyapur']);
    expect(request.socialLinks).toEqual({instagram: 'https://instagram.com/relangi', facebook: null, youtube: null, website: null});
  });

  it('takes a cuisine off when its chip is tapped again', async () => {
    await mount(PUBLISHED);
    await ui.press('Biryani');
    await ui.press('Save changes');
    await ui.settle();
    expect(mockApi.replaceKitchen.mock.calls[0][0].cuisines).toEqual(['Andhra']);
  });

  it('does not save a link that does not start with https://', async () => {
    await mount(PUBLISHED);
    await type('Website', 'http://relangi.example');
    await ui.press('Save changes');
    expect(mockApi.replaceKitchen).not.toHaveBeenCalled();
    expect(ui.has('Website link must start with https://')).toBe(true);
  });

  it('shows cuisines, areas and links as Coming soon while the server does not send them', async () => {
    await mount();
    expect(ui.has('What you cook')).toBe(true);
    expect(ui.has('Delivery areas')).toBe(true);
    expect(ui.lines().filter(line => line === 'Coming soon').length).toBeGreaterThanOrEqual(4);
    expect(ui.byLabel('+ Add')).toBeUndefined();
    expect(ui.has('Social links')).toBe(false);
  });

  it('adds a kitchen photo from the gallery, shows it, and removes it again', async () => {
    mockPickPhoto.mockResolvedValue({photo: {uri: 'file:///k.jpg', fileName: 'k.jpg', mimeType: 'image/jpeg'}});
    // The kitchen the server holds: a photo change is what the next read returns.
    let server: ChefKitchenProfile = PUBLISHED;
    mockApi.getKitchen.mockImplementation(async () => server);
    mockApi.uploadPhoto.mockImplementation(async () => (server = {...PUBLISHED, chefPhotoUrl: 'https://cdn.example.test/chef.jpg'}));
    mockApi.deletePhoto.mockImplementation(async () => (server = {...PUBLISHED, chefPhotoUrl: null}));
    await mount(PUBLISHED, false);
    await ui.press('Your photo');
    await ui.press('Choose from gallery');
    await ui.settle();
    expect(mockPickPhoto).toHaveBeenCalledWith('gallery');
    expect(mockApi.uploadPhoto).toHaveBeenCalledWith('CHEF', {uri: 'file:///k.jpg', name: 'k.jpg', type: 'image/jpeg'});
    expect(ui.has('Photo saved')).toBe(true);

    await ui.press('Your photo');
    await ui.press('Remove photo');
    await ui.settle();
    expect(mockApi.deletePhoto).toHaveBeenCalledWith('CHEF');
    expect(ui.has('Photo removed')).toBe(true);
  });

  it('says a photo could not be saved, and does nothing when the chef cancels', async () => {
    mockPickPhoto.mockResolvedValue({photo: {uri: 'file:///k.jpg', fileName: 'k.jpg', mimeType: 'image/jpeg'}});
    mockApi.uploadPhoto.mockRejectedValue(new Error('network'));
    await mount(PUBLISHED);
    await ui.press('Kitchen photo');
    await ui.press('Take a photo');
    await ui.settle();
    expect(mockPickPhoto).toHaveBeenCalledWith('camera');
    expect(ui.has("We couldn't save that photo. Please try again.")).toBe(true);

    mockPickPhoto.mockResolvedValue(null);
    mockApi.uploadPhoto.mockClear();
    await ui.press('Kitchen photo');
    await ui.press('Choose from gallery');
    await ui.settle();
    expect(mockApi.uploadPhoto).not.toHaveBeenCalled();
  });

  it('marks the photos Coming soon, not tappable, while the server does not send photo fields', async () => {
    await mount();
    expect(ui.byLabel('Your photo')).toBeUndefined();
    expect(ui.byLabel('Kitchen photo')).toBeUndefined();
  });

  it('asks before leaving with unsaved changes, and leaves freely when nothing changed', async () => {
    await mount();
    const clean = {preventDefault: jest.fn(), data: {action: {type: 'GO_BACK'}}};
    act(() => mockBeforeRemove!(clean));
    expect(clean.preventDefault).not.toHaveBeenCalled();

    await type('Kitchen name', 'Changed');
    const event = {preventDefault: jest.fn(), data: {action: {type: 'GO_BACK'}}};
    act(() => mockBeforeRemove!(event));
    expect(event.preventDefault).toHaveBeenCalled();
    expect(ui.has('Leave without saving?')).toBe(true);

    await ui.press('Keep editing');
    expect(mockDispatch).not.toHaveBeenCalled();
    act(() => mockBeforeRemove!(event));
    await ui.press('Leave');
    expect(mockDispatch).toHaveBeenCalledWith({type: 'GO_BACK'});
  });

  it('locks the form when Craves has paused the kitchen', async () => {
    await mount({...KITCHEN, status: 'SUSPENDED'});
    expect(ui.anyText(/Craves has paused your kitchen/)).toBe(true);
    expect(input('Kitchen name').props.editable).toBe(false);
    expect(saveEnabled()).toBe(false);
  });

  it('shows a retry card, not Coming soon, when the kitchen cannot be loaded', async () => {
    mockApi.getKitchen.mockRejectedValue(new AppApiError('KITCHEN_PROFILE_NOT_FOUND', 'Kitchen profile was not found', 404));
    await act(async () => {
      tree = renderer.create(
        <QueryClientProvider client={new QueryClient({defaultOptions: {queries: {retry: false, gcTime: Infinity}}})}>
          <ChefToastProvider>
            <ChefEditProfileDraftProvider>
              <ChefEditProfileScreen />
            </ChefEditProfileDraftProvider>
          </ChefToastProvider>
        </QueryClientProvider>,
      );
    });
    await ui.settle();
    await ui.settle();
    expect(ui.has("We couldn't load this")).toBe(true);
    expect(ui.byLabel('Try again')).toBeDefined();
    expect(ui.anyText(/Coming soon/)).toBe(false);
  });
});
