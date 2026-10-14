import React from 'react';
import {ScrollView, TextInput} from 'react-native';
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
const mockNavigate = jest.fn();
const mockDispatch = jest.fn();
let mockBeforeRemove: ((event: {preventDefault: () => void; data: {action: unknown}}) => void) | undefined;
const mockApi = {getKitchen: jest.fn(), replaceKitchen: jest.fn(), uploadPhoto: jest.fn(), deletePhoto: jest.fn(), setAvatar: jest.fn()};
const mockPickPhoto = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    goBack: mockGoBack,
    navigate: mockNavigate,
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
    setAvatar: (...args: unknown[]) => mockApi.setAvatar(...args),
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
  kitchenPhotoUrls: ['https://cdn.example.test/kitchen.jpg'],
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
    expect(ui.has('Your picture')).toBe(true);
    expect(ui.has('Overall kitchen')).toBe(true);
    expect(ui.has('Cooking setup')).toBe(true);
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

  it('changes the house, street and landmark in a sheet and saves them with the rest, keeping the pin', async () => {
    await mount();
    await ui.press('Change');
    await act(async () => {
      input('Flat / house number / building').props.onChangeText('9-1, Lake Road');
      input('Landmark').props.onChangeText('Near the temple');
    });
    await ui.press('Use this address');
    expect(ui.has('9-1, Lake Road')).toBe(true);
    await ui.press('Save changes');
    await ui.settle();
    expect(mockApi.replaceKitchen.mock.calls[0][0]).toMatchObject({
      addressLine1: '9-1, Lake Road',
      landmark: 'Near the temple',
      areaName: 'Vasanthnagar',
      city: 'Hyderabad',
      postalCode: '500085',
      latitude: 17.49,
      longitude: 78.39,
    });
  });

  it('shows the area, city, PIN code and state as read-only, and sends moving the kitchen to support', async () => {
    await mount();
    await ui.press('Change');
    for (const label of ['Area', 'City', 'PIN code', 'State']) {
      expect(ui.has(label)).toBe(true);
      expect(tree.root.findAllByType(TextInput).some(node => node.props.accessibilityLabel === label)).toBe(false);
    }
    for (const value of ['Vasanthnagar', 'Hyderabad', '500085', 'Telangana']) {
      expect(ui.has(value)).toBe(true);
    }
    await ui.press('To move your kitchen, contact support');
    await ui.settle();
    expect(mockNavigate).toHaveBeenCalledWith('ChefSupportTicket', {topic: 'Move my kitchen'});
    expect(ui.byLabel('Use this address')).toBeUndefined();
  });

  it('keeps the sheet open and says what is missing when the house number is cleared', async () => {
    await mount();
    await ui.press('Change');
    await act(async () => {
      input('Flat / house number / building').props.onChangeText('');
    });
    await ui.press('Use this address');
    expect(ui.has('Address line 1 is required.')).toBe(true);
    expect(ui.byLabel('Use this address')).toBeDefined();
  });

  it('saves with the status and pin the kitchen has now, not the ones from when the form opened', async () => {
    await mount();
    // The chef closed the kitchen on Home while this form was open.
    mockApi.getKitchen.mockResolvedValue({...KITCHEN, status: 'INACTIVE', latitude: 18.1, longitude: 79.2});
    await type('Kitchen name', 'Relangi Andhra Kitchen');
    await ui.press('Save changes');
    await ui.settle();
    expect(mockApi.replaceKitchen).toHaveBeenCalledTimes(1);
    expect(mockApi.replaceKitchen.mock.calls[0][0]).toMatchObject({
      kitchenName: 'Relangi Andhra Kitchen',
      status: 'INACTIVE',
      latitude: 18.1,
      longitude: 79.2,
    });
  });

  it('does not save, and says why, when Craves paused the kitchen after the form opened', async () => {
    await mount();
    mockApi.getKitchen.mockResolvedValue({...KITCHEN, status: 'SUSPENDED'});
    await type('Kitchen name', 'Relangi Andhra Kitchen');
    await ui.press('Save changes');
    await ui.settle();
    expect(mockApi.replaceKitchen).not.toHaveBeenCalled();
    expect(ui.has('Craves has paused your kitchen, so its details cannot be changed right now.')).toBe(true);
    expect(mockGoBack).not.toHaveBeenCalled();
    // The form is now in the same state as one opened on a paused kitchen: locked, with its edits still on screen.
    expect(input('Kitchen name').props.editable).toBe(false);
    expect(input('Kitchen name').props.value).toBe('Relangi Andhra Kitchen');
    expect(saveEnabled()).toBe(false);
  });

  it('does not save when the kitchen cannot be read just before saving', async () => {
    await mount();
    mockApi.getKitchen.mockRejectedValue(new Error('network'));
    await type('Kitchen name', 'Relangi Andhra Kitchen');
    await ui.press('Save changes');
    await ui.settle();
    expect(mockApi.replaceKitchen).not.toHaveBeenCalled();
    expect(ui.has("We couldn't save your changes. Please try again.")).toBe(true);
  });

  it('saves a change to the name even when the stored about text is already over its limit', async () => {
    await mount({...KITCHEN, description: 'x'.repeat(2_100)});
    await type('Kitchen name', 'Relangi Andhra Kitchen');
    await ui.press('Save changes');
    await ui.settle();
    expect(mockApi.replaceKitchen).toHaveBeenCalledTimes(1);
    expect(ui.anyText(/too long/)).toBe(false);
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

  it('adds a kitchen photo into the empty slot, with no way to remove one', async () => {
    mockPickPhoto.mockResolvedValue({photo: {uri: 'file:///k.jpg', fileName: 'k.jpg', mimeType: 'image/jpeg'}});
    // The kitchen the server holds: a photo change is what the next read returns.
    let server: ChefKitchenProfile = PUBLISHED;
    mockApi.getKitchen.mockImplementation(async () => server);
    mockApi.uploadPhoto.mockImplementation(async () => (server = {
      ...PUBLISHED,
      kitchenPhotoUrls: ['https://cdn.example.test/kitchen.jpg', 'https://cdn.example.test/setup.jpg'],
    }));
    await mount(PUBLISHED, false);
    await ui.press('Cooking setup');
    expect(ui.has('Remove photo')).toBe(false);
    await ui.press('Choose from gallery');
    await ui.settle();
    expect(mockPickPhoto).toHaveBeenCalledWith('gallery');
    expect(mockApi.uploadPhoto).toHaveBeenCalledWith('KITCHEN', {uri: 'file:///k.jpg', name: 'k.jpg', type: 'image/jpeg'});
    expect(ui.has('Photo saved')).toBe(true);
    expect(mockApi.deletePhoto).not.toHaveBeenCalled();
  });

  it('shows the support message, and no photo sheet, when a filled kitchen photo is tapped', async () => {
    await mount(PUBLISHED);
    await ui.press('Overall kitchen');
    await ui.settle();
    expect(ui.has("Kitchen photos can't be changed. To change one, contact Craves support.")).toBe(true);
    expect(ui.has('Take a photo')).toBe(false);
    expect(mockApi.uploadPhoto).not.toHaveBeenCalled();
  });

  it('asks for the overall kitchen photo first, so a photo never lands under the wrong label', async () => {
    await mount({...PUBLISHED, kitchenPhotoUrl: null, kitchenPhotoUrls: []});
    await ui.press('Cooking setup');
    await ui.settle();
    expect(ui.has('Add the overall kitchen photo first.')).toBe(true);
    expect(ui.has('Take a photo')).toBe(false);
  });

  it('reads the kitchen again after the server says the photos are locked, so the tiles show what it holds', async () => {
    mockPickPhoto.mockResolvedValue({photo: {uri: 'file:///k.jpg', fileName: 'k.jpg', mimeType: 'image/jpeg'}});
    mockApi.uploadPhoto.mockRejectedValue(new AppApiError('KITCHEN_PHOTOS_LOCKED', 'locked', 409));
    await mount(PUBLISHED);
    const readsBefore = mockApi.getKitchen.mock.calls.length;
    await ui.press('Cooking setup');
    await ui.press('Take a photo');
    await ui.settle();
    expect(mockApi.getKitchen.mock.calls.length).toBeGreaterThan(readsBefore);
  });

  it('shows the support message when the server says kitchen photos are locked', async () => {
    mockPickPhoto.mockResolvedValue({photo: {uri: 'file:///k.jpg', fileName: 'k.jpg', mimeType: 'image/jpeg'}});
    mockApi.uploadPhoto.mockRejectedValue(new AppApiError('KITCHEN_PHOTOS_LOCKED', 'locked', 409));
    await mount(PUBLISHED);
    await ui.press('Cooking setup');
    await ui.press('Take a photo');
    await ui.settle();
    expect(ui.has("Kitchen photos can't be changed. To change one, contact Craves support.")).toBe(true);
  });

  describe('Your picture', () => {
    const FACE_04 = {...PUBLISHED, chefPhotoUrl: 'https://cdn.example.test/public/chef-avatars/chef-avatar-04.jpg'};
    const FACE_17 = {...PUBLISHED, chefPhotoUrl: 'https://cdn.example.test/public/chef-avatars/chef-avatar-17.jpg'};

    it('opens the faces with the current one picked, and offers no camera, gallery or remove', async () => {
      await mount(FACE_04);
      await ui.press('Your picture');
      expect(ui.has('Change your picture')).toBe(true);
      expect(ui.byLabel('Picture 4')?.props.accessibilityState.selected).toBe(true);
      expect(ui.byLabel('Picture 17')?.props.accessibilityState.selected).toBe(false);
      for (const label of ['Take a photo', 'Choose from gallery', 'Remove photo']) {
        expect(ui.byLabel(label)).toBeUndefined();
      }
    });

    it('keeps Cancel and Save outside the scrolling faces, so they never sit below the fold', async () => {
      await mount(FACE_04);
      await ui.press('Your picture');
      // The screen's own ScrollView holds the whole sheet too, so take the innermost one around the faces.
      const scroll = tree.root
        .findAllByType(ScrollView)
        .filter(node => node.findAll(n => n.props.accessibilityLabel === 'Picture 1').length > 0)
        .pop()!;
      expect(scroll).toBeDefined();
      for (const label of ['Cancel', 'Save']) {
        expect(ui.byLabel(label)).toBeDefined();
        expect(scroll.findAll(node => node.props.accessibilityLabel === label)).toHaveLength(0);
      }
    });

    it('saves a new face, says so, and never uploads a photo of the chef', async () => {
      mockApi.setAvatar.mockResolvedValue(FACE_17);
      await mount(FACE_04);
      await ui.press('Your picture');
      await ui.press('Picture 17');
      await ui.press('Save');
      await ui.settle();
      expect(mockApi.setAvatar).toHaveBeenCalledTimes(1);
      expect(mockApi.setAvatar.mock.calls[0][0]).toBe('chef-avatar-17');
      expect(mockApi.uploadPhoto).not.toHaveBeenCalled();
      expect(ui.has('Picture saved')).toBe(true);
      expect(ui.has('Change your picture')).toBe(false);
    });

    it('keeps the old face when the chef cancels', async () => {
      await mount(FACE_04);
      await ui.press('Your picture');
      await ui.press('Picture 17');
      await ui.press('Cancel');
      expect(mockApi.setAvatar).not.toHaveBeenCalled();
      expect(ui.has('Change your picture')).toBe(false);
      // Opening it again starts from the saved face, not the one that was dropped.
      await ui.press('Your picture');
      expect(ui.byLabel('Picture 4')?.props.accessibilityState.selected).toBe(true);
    });

    it('keeps Save switched off until a face is picked', async () => {
      await mount(PUBLISHED);
      await ui.press('Your picture');
      expect(ui.byLabel('Save')?.props.accessibilityState.disabled).toBe(true);
      await ui.press('Picture 2');
      expect(ui.byLabel('Save')?.props.accessibilityState.disabled).toBe(false);
    });

    it('says the picture could not be saved when the server refuses', async () => {
      mockApi.setAvatar.mockRejectedValue(new Error('network'));
      await mount(FACE_04);
      await ui.press('Your picture');
      await ui.press('Picture 17');
      await ui.press('Save');
      await ui.settle();
      expect(ui.has("We couldn't save your picture. Please try again.")).toBe(true);
    });
  });

  it('says a photo could not be saved, and does nothing when the chef cancels', async () => {
    mockPickPhoto.mockResolvedValue({photo: {uri: 'file:///k.jpg', fileName: 'k.jpg', mimeType: 'image/jpeg'}});
    mockApi.uploadPhoto.mockRejectedValue(new Error('network'));
    await mount(PUBLISHED);
    await ui.press('Cooking setup');
    await ui.press('Take a photo');
    await ui.settle();
    expect(mockPickPhoto).toHaveBeenCalledWith('camera');
    expect(ui.has("We couldn't save that photo. Please try again.")).toBe(true);

    mockPickPhoto.mockResolvedValue(null);
    mockApi.uploadPhoto.mockClear();
    await ui.press('Cooking setup');
    await ui.press('Choose from gallery');
    await ui.settle();
    expect(mockApi.uploadPhoto).not.toHaveBeenCalled();
  });

  it('marks the photos Coming soon, not tappable, while the server does not send photo fields', async () => {
    await mount();
    expect(ui.byLabel('Your picture')).toBeUndefined();
    expect(ui.byLabel('Overall kitchen')).toBeUndefined();
    expect(ui.byLabel('Cooking setup')).toBeUndefined();
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
