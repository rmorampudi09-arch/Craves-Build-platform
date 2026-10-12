import React from 'react';
import {Alert, Image, Switch, Text, TextInput} from 'react-native';
import renderer, {act, type ReactTestInstance} from 'react-test-renderer';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {AppApiError} from '../../../core/http/apiError';
import type {ChefMenuItem} from '../api/chefMenuApi';
import {ChefToastProvider} from '../../chefShell/components/ui';
import {ChefAddMenuItemScreen} from './ChefAddMenuItemScreen';
import {ChefDishFormScreen} from './ChefDishFormScreen';
import {ChefEditMenuItemScreen} from './ChefEditMenuItemScreen';
import {ChefMenuItemDetailScreen} from './ChefMenuItemDetailScreen';

const mockPicker = {
  requestMediaLibraryPermissionsAsync: jest.fn(),
  requestCameraPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
};
const mockApi = {
  listItems: jest.fn(),
  createItem: jest.fn(),
  replaceItem: jest.fn(),
  updateAvailability: jest.fn(),
  uploadImage: jest.fn(),
  deleteItem: jest.fn(),
};
// Stands in for the navigator: going back is stopped by usePreventRemove while it is on, like the real one.
let mockPrevent: {enabled: boolean; callback?: (event: {data: {action: unknown}}) => void} = {enabled: false};
const mockLeft = jest.fn();
const mockNavigation = {
  goBack: jest.fn(() => {
    if (mockPrevent.enabled) {
      mockPrevent.callback?.({data: {action: {type: 'GO_BACK'}}});
    } else {
      mockLeft();
    }
  }),
  replace: jest.fn(),
  navigate: jest.fn(),
  dispatch: jest.fn(),
};

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNavigation,
  usePreventRemove: (enabled: boolean, callback: (event: {data: {action: unknown}}) => void) => {
    mockPrevent = {enabled, callback};
  },
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: require('react-native').View,
  useSafeAreaInsets: () => ({top: 0, right: 0, bottom: 0, left: 0}),
}));
jest.mock('../../../design/reducedMotion', () => ({useReducedMotionPreference: () => false}));
jest.mock('../../../app/store/hooks', () => ({useAppSelector: () => 'user-1'}));
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: (...args: unknown[]) => mockPicker.requestMediaLibraryPermissionsAsync(...args),
  requestCameraPermissionsAsync: (...args: unknown[]) => mockPicker.requestCameraPermissionsAsync(...args),
  launchImageLibraryAsync: (...args: unknown[]) => mockPicker.launchImageLibraryAsync(...args),
  launchCameraAsync: (...args: unknown[]) => mockPicker.launchCameraAsync(...args),
}));
jest.mock('../api/chefMenuApi', () => ({
  ...jest.requireActual('../api/chefMenuApi'),
  chefMenuApi: {
    listItems: (...args: unknown[]) => mockApi.listItems(...args),
    createItem: (...args: unknown[]) => mockApi.createItem(...args),
    replaceItem: (...args: unknown[]) => mockApi.replaceItem(...args),
    updateAvailability: (...args: unknown[]) => mockApi.updateAvailability(...args),
    uploadImage: (...args: unknown[]) => mockApi.uploadImage(...args),
    deleteItem: (...args: unknown[]) => mockApi.deleteItem(...args),
  },
}));

const ID = '123e4567-e89b-42d3-a456-426614174001';
const NEW_ID = '123e4567-e89b-42d3-a456-426614174002';
const dish = (overrides: Partial<ChefMenuItem> = {}): ChefMenuItem => ({
  id: ID,
  kitchenId: '123e4567-e89b-42d3-a456-426614174099',
  itemName: 'Dum Chicken biriyani',
  description: 'Slow cooked',
  category: 'Biryani',
  foodType: 'NON_VEG',
  price: 160,
  currency: 'INR',
  servesCount: 1,
  preparationTimeMinutes: 30,
  spiceLevel: 'MEDIUM',
  unitPackageWeightGrams: 450,
  thermoboxRequired: false,
  available: true,
  status: 'ACTIVE',
  images: [
    {
      id: '123e4567-e89b-42d3-a456-426614174050',
      menuItemId: ID,
      blobContainer: 'menu',
      blobName: 'a.jpg',
      contentType: 'image/jpeg',
      fileSizeBytes: 100,
      publicUrl: 'https://example.test/dum.jpg',
      sortOrder: 0,
      primary: true,
      createdAt: '2026-10-01T10:00:00Z',
    },
  ],
  createdAt: '2026-10-01T10:00:00Z',
  updatedAt: '2026-10-01T10:00:00Z',
  ...overrides,
});
const DUM = dish();
const DRAFT = dish({id: '123e4567-e89b-42d3-a456-426614174003', itemName: 'Tomato curry', status: 'DRAFT', available: false});

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

const textIn = (node: unknown): string => {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textIn).join('');
  const instance = node as ReactTestInstance;
  return instance.type === Text ? textIn(instance.props.children) : '';
};
const lines = () => {
  const all = tree.root.findAllByType(Text);
  return all.filter(node => !all.some(outer => outer !== node && outer.findAllByType(Text).includes(node))).map(node => textIn(node.props.children));
};
const has = (text: string) => lines().includes(text);
const withLabel = (label: string): ReactTestInstance | undefined =>
  tree.root.findAll(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function')[0];
const press = (label: string) => {
  const target = withLabel(label);
  if (!target) throw new Error(`No button labelled "${label}"`);
  // The handler's own promise is not awaited: a save the test holds open would never let the press finish.
  return act(async () => {
    target.props.onPress();
  });
};
const input = (label: string): ReactTestInstance => {
  const found = tree.root.findAllByType(TextInput).find(field => field.props.accessibilityLabel === label);
  if (!found) throw new Error(`No field labelled "${label}"`);
  return found;
};
const type = (label: string, value: string) => act(async () => input(label).props.onChangeText(value));
const leave = (label: string) => act(async () => input(label).props.onBlur());
const settle = () => act(async () => new Promise<void>(resolve => setTimeout(resolve, 0)));
const dishSwitch = () => tree.root.findAllByType(Switch).find(node => node.props.accessibilityLabel === 'Dum Chicken biriyani availability');

type Params = {menuItemId: string} | {copyOfMenuItemId: string} | undefined;
async function mount(mode: 'add' | 'edit', params: Params, items: ChefMenuItem[] = [DUM, DRAFT]) {
  mockApi.listItems.mockResolvedValue(items);
  const client = new QueryClient({defaultOptions: {queries: {retry: false, gcTime: Infinity}}});
  await act(async () => {
    tree = renderer.create(
      <QueryClientProvider client={client}>
        <ChefToastProvider>
          <ChefDishFormScreen
            mode={mode}
            navigation={mockNavigation as never}
            route={{key: 'k', name: mode === 'add' ? 'ChefAddMenuItem' : 'ChefEditMenuItem', params} as never}
          />
        </ChefToastProvider>
      </QueryClientProvider>,
    );
  });
  await settle();
}

async function fillRequired() {
  await type('Dish name', 'Tomato curry');
  await press('Curry');
  await type('Price', '50');
  await type('Ready in', '20');
  await type('Packed weight', '400');
}

describe('ChefDishFormScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrevent = {enabled: false};
    mockPicker.requestMediaLibraryPermissionsAsync.mockResolvedValue({granted: true});
    mockPicker.requestCameraPermissionsAsync.mockResolvedValue({granted: true});
  });
  afterEach(() => act(() => tree.unmount()));

  describe('add', () => {
    it('shows required fields first with the board labels, the optional extras, and Save draft / Publish dish', async () => {
      await mount('add', undefined);
      expect(has('New dish')).toBe(true);
      expect(['Dish name', 'Price', 'Ready in', 'Packed weight', 'Description', 'Serves'].map(label => Boolean(input(label)))).toEqual(
        Array(6).fill(true),
      );
      expect(['Veg', 'Non-veg', 'Egg', 'Biryani', 'Curry', 'Tiffin', 'Snacks', 'Rice', 'More categories'].map(label => Boolean(withLabel(label)))).toEqual(
        Array(9).fill(true),
      );
      expect(withLabel('Save draft')).toBeTruthy();
      expect(withLabel('Publish dish')).toBeTruthy();
      expect(withLabel('Add a photo')).toBeTruthy();
      expect(has('Take a photo or choose from gallery')).toBe(true);
      expect(lines().join(' ')).not.toMatch(/Item name|Packaged|full replacement|backend|Thermobox/i);
    });

    it('shows what is missing under each field as you leave it, and clears it once fixed', async () => {
      await mount('add', undefined);
      expect(has('Enter the dish name.')).toBe(false);
      await leave('Dish name');
      await leave('Price');
      await leave('Packed weight');
      expect(has('Enter the dish name.')).toBe(true);
      expect(has('Enter a price.')).toBe(true);
      expect(has('Enter the packed weight in grams.')).toBe(true);
      await type('Dish name', 'Homestyle dal rice');
      await leave('Dish name');
      expect(has('Enter the dish name.')).toBe(false);
    });

    it('Publish dish creates the dish ACTIVE and on, once, then goes back and says it is live', async () => {
      await mount('add', undefined);
      await fillRequired();
      const save = deferred<ChefMenuItem>();
      mockApi.createItem.mockReturnValue(save.promise);
      const publish = withLabel('Publish dish')!;
      await act(async () => {
        publish.props.onPress();
        publish.props.onPress();
      });
      await settle();
      expect(mockApi.createItem).toHaveBeenCalledTimes(1);
      expect(mockApi.createItem).toHaveBeenCalledWith({
        itemName: 'Tomato curry',
        description: null,
        category: 'Curry',
        foodType: 'VEG',
        price: 50,
        servesCount: null,
        preparationTimeMinutes: 20,
        spiceLevel: null,
        unitPackageWeightGrams: 400,
        thermoboxRequired: false,
        available: true,
        status: 'ACTIVE',
      });
      await act(async () => save.resolve(dish({id: NEW_ID, itemName: 'Tomato curry', images: []})));
      await settle();
      expect(mockLeft).toHaveBeenCalledTimes(1);
      expect(has('Tomato curry is live')).toBe(true);
      expect(mockApi.uploadImage).not.toHaveBeenCalled();
    });

    it('Save draft creates a DRAFT that customers cannot see', async () => {
      await mount('add', undefined);
      await fillRequired();
      mockApi.createItem.mockResolvedValue(dish({id: NEW_ID, itemName: 'Tomato curry', status: 'DRAFT', available: false}));
      await press('Save draft');
      await settle();
      expect(mockApi.createItem).toHaveBeenCalledWith(expect.objectContaining({status: 'DRAFT', available: false}));
      expect(has('Draft saved')).toBe(true);
      expect(mockLeft).toHaveBeenCalledTimes(1);
    });

    it('does not create anything while a required field is empty', async () => {
      await mount('add', undefined);
      await type('Dish name', 'Tomato curry');
      await press('Publish dish');
      await settle();
      expect(mockApi.createItem).not.toHaveBeenCalled();
      expect(has('Choose a category.')).toBe(true);
      expect(has('Enter a price.')).toBe(true);
      expect(mockLeft).not.toHaveBeenCalled();
    });

    it('the chip Snacks saves the stored value Snakes, and More categories shows the rest', async () => {
      await mount('add', undefined);
      expect(withLabel('Roti & Chapati')).toBeUndefined();
      // "More…" opens more choices; it is a button, not one of the choices.
      expect(withLabel('More categories')!.props.accessibilityRole).toBe('button');
      expect(withLabel('More categories')!.props.accessibilityState).toBeUndefined();
      expect(withLabel('Curry')!.props.accessibilityRole).toBe('radio');
      await press('More categories');
      expect(['Roti & Chapati', 'Sweet Item', 'Fast Food'].map(label => Boolean(withLabel(label)))).toEqual([true, true, true]);
      await type('Dish name', 'Murukku');
      await press('Snacks');
      await type('Price', '40');
      await type('Packed weight', '200');
      mockApi.createItem.mockResolvedValue(dish({id: NEW_ID, itemName: 'Murukku', category: 'Snakes'}));
      await press('Publish dish');
      await settle();
      expect(mockApi.createItem).toHaveBeenCalledWith(expect.objectContaining({category: 'Snakes'}));
      expect(lines().join(' ')).not.toContain('Snakes');
    });

    it('asks "Discard changes?" when leaving with typed text, and leaves freely when nothing was typed', async () => {
      await mount('add', undefined);
      await press('Close');
      expect(mockLeft).toHaveBeenCalledTimes(1);

      mockLeft.mockClear();
      await type('Dish name', 'Tomato');
      await press('Close');
      expect(mockLeft).not.toHaveBeenCalled();
      expect(has('Discard changes?')).toBe(true);

      await press('Keep editing');
      expect(has('Discard changes?')).toBe(false);
      expect(mockNavigation.dispatch).not.toHaveBeenCalled();

      await press('Close');
      await press('Discard');
      expect(mockNavigation.dispatch).toHaveBeenCalledWith({type: 'GO_BACK'});
    });

    it('offers Take photo and Choose from gallery, and uploads the chosen photo as the primary one after the dish is created', async () => {
      await mount('add', undefined);
      await press('Add a photo');
      expect(has('Take photo')).toBe(true);
      expect(has('Choose from gallery')).toBe(true);
      mockPicker.launchCameraAsync.mockResolvedValue({
        canceled: false,
        assets: [{uri: 'file:///camera.jpg', mimeType: 'image/jpeg', fileName: 'camera.jpg'}],
      });
      await press('Take photo');
      await settle();
      expect(mockPicker.requestCameraPermissionsAsync).toHaveBeenCalledTimes(1);
      expect(mockPicker.launchCameraAsync).toHaveBeenCalledWith(expect.objectContaining({allowsEditing: true, aspect: [4, 3]}));
      expect(tree.root.findAllByType(Image).some(image => image.props.source?.uri === 'file:///camera.jpg')).toBe(true);
      expect(withLabel('Change photo')).toBeTruthy();

      await fillRequired();
      mockApi.createItem.mockResolvedValue(dish({id: NEW_ID, itemName: 'Tomato curry', images: []}));
      mockApi.uploadImage.mockResolvedValue({});
      await press('Publish dish');
      await settle();
      expect(mockApi.uploadImage).toHaveBeenCalledTimes(1);
      expect(mockApi.uploadImage).toHaveBeenCalledWith(NEW_ID, expect.anything(), true);
      expect(has('Tomato curry is live')).toBe(true);
    });

    it('picks from the gallery with the same crop, and Remove photo takes the choice back', async () => {
      await mount('add', undefined);
      mockPicker.launchImageLibraryAsync.mockResolvedValue({
        canceled: false,
        assets: [{uri: 'file:///gallery.jpg', mimeType: 'image/jpeg'}],
      });
      await press('Add a photo');
      await press('Choose from gallery');
      await settle();
      expect(mockPicker.requestMediaLibraryPermissionsAsync).toHaveBeenCalledTimes(1);
      expect(mockPicker.launchImageLibraryAsync).toHaveBeenCalledWith(expect.objectContaining({allowsEditing: true, aspect: [4, 3]}));
      await press('Change photo');
      await press('Remove photo');
      await settle();
      expect(withLabel('Add a photo')).toBeTruthy();
    });

    it('explains when the camera is not allowed and never opens it', async () => {
      const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
      mockPicker.requestCameraPermissionsAsync.mockResolvedValue({granted: false});
      await mount('add', undefined);
      await press('Add a photo');
      await press('Take photo');
      await settle();
      expect(alert).toHaveBeenCalledWith('Camera access needed', expect.any(String), expect.any(Array));
      expect(mockPicker.launchCameraAsync).not.toHaveBeenCalled();
      alert.mockRestore();
    });

    it('rejects a photo type the server does not take', async () => {
      await mount('add', undefined);
      mockPicker.launchImageLibraryAsync.mockResolvedValue({canceled: false, assets: [{uri: 'file:///a.gif', mimeType: 'image/gif'}]});
      await press('Add a photo');
      await press('Choose from gallery');
      await settle();
      expect(has('Choose a JPEG, PNG or WebP image.')).toBe(true);
      expect(withLabel('Add a photo')).toBeTruthy();
    });

    it('keeps the dish saved and says the photo needs adding again when the upload fails', async () => {
      await mount('add', undefined);
      mockPicker.launchImageLibraryAsync.mockResolvedValue({canceled: false, assets: [{uri: 'file:///g.jpg', mimeType: 'image/jpeg'}]});
      await press('Add a photo');
      await press('Choose from gallery');
      await settle();
      await fillRequired();
      mockApi.createItem.mockResolvedValue(dish({id: NEW_ID, itemName: 'Tomato curry', images: []}));
      mockApi.uploadImage.mockRejectedValue(new Error('offline'));
      await press('Publish dish');
      await settle();
      expect(mockApi.createItem).toHaveBeenCalledTimes(1);
      expect(has("Tomato curry is saved, but the photo didn't upload. Open the dish to add it again.")).toBe(true);
      expect(mockLeft).toHaveBeenCalledTimes(1);
    });

    it('stays on the form with a plain message when the dish could not be saved', async () => {
      await mount('add', undefined);
      await fillRequired();
      mockApi.createItem.mockRejectedValue(new AppApiError('MENU_ITEM_CONFLICT', 'You already have a dish with this name.', 409));
      await press('Publish dish');
      await settle();
      expect(has('You already have a dish with this name.')).toBe(true);
      expect(mockLeft).not.toHaveBeenCalled();
      expect(withLabel('Publish dish')).toBeTruthy();
    });

    it('opens pre-filled as "Copy of <name>" when duplicating, without the photo', async () => {
      await mount('add', {copyOfMenuItemId: ID});
      expect(input('Dish name').props.value).toBe('Copy of Dum Chicken biriyani');
      expect(input('Price').props.value).toBe('160');
      expect(input('Ready in').props.value).toBe('30');
      expect(input('Packed weight').props.value).toBe('450');
      expect(withLabel('Add a photo')).toBeTruthy();
      mockApi.createItem.mockResolvedValue(dish({id: NEW_ID, itemName: 'Copy of Dum Chicken biriyani', images: []}));
      await press('Publish dish');
      await settle();
      expect(mockApi.createItem).toHaveBeenCalledWith(
        expect.objectContaining({itemName: 'Copy of Dum Chicken biriyani', category: 'Biryani', foodType: 'NON_VEG', status: 'ACTIVE', available: true}),
      );
    });
  });

  describe('edit', () => {
    it('opens with the dish, its photo and its switch, and Save changes waits for a change', async () => {
      await mount('edit', {menuItemId: ID});
      expect(has('Dum Chicken biriyani')).toBe(true);
      expect(input('Dish name').props.value).toBe('Dum Chicken biriyani');
      expect(input('Price').props.value).toBe('160');
      expect(input('Ready in').props.value).toBe('30');
      expect(tree.root.findAllByType(Image).some(image => image.props.source?.uri === 'https://example.test/dum.jpg')).toBe(true);
      expect(withLabel('Change photo')).toBeTruthy();
      expect(has('On · customers can order')).toBe(true);
      expect(has('Live on your kitchen page')).toBe(true);
      expect(dishSwitch()!.props.value).toBe(true);
      expect(withLabel('Save changes')!.props.accessibilityState.disabled).toBe(true);
      expect(withLabel('Save draft')).toBeUndefined();
      expect(lines().join(' ')).not.toMatch(/ACTIVE|NON_VEG|Backend|replacement/);
    });

    it('Save changes sends the whole dish back keeping its status and currency, then goes back', async () => {
      await mount('edit', {menuItemId: ID});
      await type('Price', '170');
      expect(withLabel('Save changes')!.props.accessibilityState.disabled).toBe(false);
      mockApi.replaceItem.mockResolvedValue(dish({price: 170}));
      await press('Save changes');
      await settle();
      expect(mockApi.replaceItem).toHaveBeenCalledTimes(1);
      expect(mockApi.replaceItem).toHaveBeenCalledWith(
        ID,
        expect.objectContaining({itemName: 'Dum Chicken biriyani', price: 170, status: 'ACTIVE', currency: 'INR', available: true, preparationTimeMinutes: 30}),
      );
      expect(has('Changes saved')).toBe(true);
      expect(mockLeft).toHaveBeenCalledTimes(1);
    });

    it('the switch saves at once like the list one, and a later Save keeps what the switch set', async () => {
      await mount('edit', {menuItemId: ID});
      mockApi.updateAvailability.mockResolvedValue(dish({available: false}));
      mockApi.listItems.mockResolvedValue([dish({available: false}), DRAFT]);
      await act(async () => {
        dishSwitch()!.props.onValueChange(false);
      });
      await settle();
      expect(mockApi.updateAvailability).toHaveBeenCalledWith(ID, {available: false});
      expect(has('Dum Chicken biriyani is off')).toBe(true);
      expect(has('Off · customers can\'t order')).toBe(true);
      expect(withLabel('Save changes')!.props.accessibilityState.disabled).toBe(true);

      await type('Price', '175');
      mockApi.replaceItem.mockResolvedValue(dish({price: 175, available: false}));
      await press('Save changes');
      await settle();
      expect(mockApi.replaceItem).toHaveBeenCalledWith(ID, expect.objectContaining({price: 175, available: false}));
    });

    it('Save changes waits while the switch is still being saved', async () => {
      await mount('edit', {menuItemId: ID});
      await type('Price', '170');
      expect(withLabel('Save changes')!.props.accessibilityState.disabled).toBe(false);
      const patch = deferred<ChefMenuItem>();
      mockApi.updateAvailability.mockReturnValue(patch.promise);
      await act(async () => {
        dishSwitch()!.props.onValueChange(false);
      });
      await settle();
      expect(withLabel('Save changes')!.props.accessibilityState.disabled).toBe(true);
      mockApi.listItems.mockResolvedValue([dish({available: false}), DRAFT]);
      await act(async () => patch.resolve(dish({available: false})));
      await settle();
      expect(withLabel('Save changes')!.props.accessibilityState.disabled).toBe(false);
    });

    describe('with a new photo', () => {
      const choosePhoto = async () => {
        mockPicker.launchImageLibraryAsync.mockResolvedValue({canceled: false, assets: [{uri: 'file:///new.jpg', mimeType: 'image/jpeg'}]});
        await press('Change photo');
        await press('Choose from gallery');
        await settle();
      };

      it('a double tap on Save changes uploads a photo-only change once', async () => {
        await mount('edit', {menuItemId: ID});
        await choosePhoto();
        expect(withLabel('Save changes')!.props.accessibilityState.disabled).toBe(false);
        const upload = deferred<unknown>();
        mockApi.uploadImage.mockReturnValue(upload.promise);
        const save = withLabel('Save changes')!;
        await act(async () => {
          save.props.onPress();
          save.props.onPress();
        });
        await settle();
        await act(async () => upload.resolve({}));
        await settle();
        expect(mockApi.uploadImage).toHaveBeenCalledTimes(1);
        expect(mockApi.uploadImage).toHaveBeenCalledWith(ID, expect.anything(), true);
        expect(mockApi.replaceItem).not.toHaveBeenCalled();
        expect(has('Changes saved')).toBe(true);
        expect(mockLeft).toHaveBeenCalledTimes(1);
      });

      it('keeps the saved text, stays on the form and lets the photo be sent again when the upload fails', async () => {
        await mount('edit', {menuItemId: ID});
        await type('Price', '170');
        await choosePhoto();
        mockApi.replaceItem.mockResolvedValue(dish({price: 170}));
        mockApi.uploadImage.mockRejectedValue(new Error('offline'));
        await press('Save changes');
        await settle();
        expect(mockApi.replaceItem).toHaveBeenCalledTimes(1);
        expect(mockApi.uploadImage).toHaveBeenCalledTimes(1);
        expect(has("The new photo didn't upload. Your other changes are saved. Try the photo again.")).toBe(true);
        expect(mockLeft).not.toHaveBeenCalled();
        expect(has('Changes saved')).toBe(false);
        // The price is saved, so only the photo is left to send.
        expect(input('Price').props.value).toBe('170');
        expect(withLabel('Save changes')!.props.accessibilityState.disabled).toBe(false);

        mockApi.uploadImage.mockResolvedValue({});
        await press('Save changes');
        await settle();
        expect(mockApi.uploadImage).toHaveBeenCalledTimes(2);
        expect(mockApi.replaceItem).toHaveBeenCalledTimes(1);
        expect(has("The new photo didn't upload. Your other changes are saved. Try the photo again.")).toBe(false);
        expect(has('Changes saved')).toBe(true);
        expect(mockLeft).toHaveBeenCalledTimes(1);
      });
    });

    it('asks "Discard changes?" when leaving with unsaved edits', async () => {
      await mount('edit', {menuItemId: ID});
      await press('Go back');
      expect(mockLeft).toHaveBeenCalledTimes(1);

      mockLeft.mockClear();
      await type('Dish name', 'Dum Chicken biryani');
      await press('Go back');
      expect(has('Discard changes?')).toBe(true);
      expect(mockLeft).not.toHaveBeenCalled();
    });

    it('a draft shows Publish dish, which saves it ACTIVE and on in the same save', async () => {
      await mount('edit', {menuItemId: DRAFT.id});
      expect(has('Draft · customers can\'t see it yet')).toBe(true);
      expect(tree.root.findAllByType(Switch).filter(node => node.props.accessibilityLabel === 'Tomato curry availability')).toHaveLength(0);
      mockApi.replaceItem.mockResolvedValue(dish({id: DRAFT.id, itemName: 'Tomato curry'}));
      await press('Publish dish');
      await settle();
      expect(mockApi.replaceItem).toHaveBeenCalledTimes(1);
      expect(mockApi.replaceItem).toHaveBeenCalledWith(DRAFT.id, expect.objectContaining({status: 'ACTIVE', available: true}));
      expect(has('Tomato curry is live')).toBe(true);
      expect(mockLeft).toHaveBeenCalledTimes(1);
    });

    it('stays on the form with a plain message when the changes could not be saved', async () => {
      await mount('edit', {menuItemId: ID});
      await type('Price', '170');
      mockApi.replaceItem.mockRejectedValue(new Error('offline'));
      await press('Save changes');
      await settle();
      expect(has('The dish could not be saved. Check your details and try again.')).toBe(true);
      expect(mockLeft).not.toHaveBeenCalled();
    });

    it('says so when the dish is not on the menu any more', async () => {
      await mount('edit', {menuItemId: '123e4567-e89b-42d3-a456-426614179999'});
      expect(has('This dish is not on your menu any more')).toBe(true);
      expect(withLabel('Go back')).toBeTruthy();
    });

    describe('the ⋮ menu', () => {
      const openMenu = async () => {
        await press('Dish options');
        expect(has('Duplicate dish')).toBe(true);
      };

      it('Duplicate dish opens the add form pre-filled', async () => {
        await mount('edit', {menuItemId: ID});
        await openMenu();
        await press('Duplicate dish');
        await settle();
        expect(mockNavigation.replace).toHaveBeenCalledWith('ChefAddMenuItem', {copyOfMenuItemId: ID});
      });

      it('Delete dish asks first, deletes once, then goes back to the list and says so', async () => {
        await mount('edit', {menuItemId: ID});
        await openMenu();
        await press('Delete dish');
        await settle();
        expect(has('Delete Dum Chicken biriyani?')).toBe(true);
        expect(has("Customers won't see it any more. If it's in a meal plan, change the plan first.")).toBe(true);
        expect(mockApi.deleteItem).not.toHaveBeenCalled();

        const removal = deferred<void>();
        mockApi.deleteItem.mockReturnValue(removal.promise);
        const confirm = withLabel('Delete dish')!;
        await act(async () => {
          confirm.props.onPress();
          confirm.props.onPress();
        });
        await settle();
        expect(mockApi.deleteItem).toHaveBeenCalledTimes(1);
        expect(mockApi.deleteItem).toHaveBeenCalledWith(ID);
        mockApi.listItems.mockResolvedValue([DRAFT]);
        await act(async () => removal.resolve());
        await settle();
        expect(mockLeft).toHaveBeenCalledTimes(1);
        expect(has('Dum Chicken biriyani deleted')).toBe(true);
      });

      it('says "Deleting dishes is coming soon." when the route is not published yet, and stays', async () => {
        await mount('edit', {menuItemId: ID});
        await openMenu();
        await press('Delete dish');
        await settle();
        mockApi.deleteItem.mockRejectedValue(new AppApiError('HTTP_404', 'Not found', 404));
        await press('Delete dish');
        await settle();
        expect(has('Deleting dishes is coming soon.')).toBe(true);
        expect(mockLeft).not.toHaveBeenCalled();
        expect(has('Delete Dum Chicken biriyani?')).toBe(false);
      });

      it('says why a dish could not be deleted and keeps it', async () => {
        await mount('edit', {menuItemId: ID});
        await openMenu();
        await press('Delete dish');
        await settle();
        mockApi.deleteItem.mockRejectedValue(new AppApiError('MENU_ITEM_IN_PLAN', 'Conflict', 409));
        await press('Delete dish');
        await settle();
        expect(has("We couldn't delete Dum Chicken biriyani. If it's in a meal plan, change the plan first.")).toBe(true);
        expect(mockLeft).not.toHaveBeenCalled();
      });
    });
  });
});

describe('the routes that share the form', () => {
  const route = (name: string, params?: object) => ({key: 'k', name, params}) as never;
  const render = async (element: React.ReactElement) => {
    mockApi.listItems.mockResolvedValue([DUM]);
    await act(async () => {
      tree = renderer.create(
        <QueryClientProvider client={new QueryClient({defaultOptions: {queries: {retry: false, gcTime: Infinity}}})}>
          <ChefToastProvider>{element}</ChefToastProvider>
        </QueryClientProvider>,
      );
    });
    await settle();
  };
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrevent = {enabled: false};
  });
  afterEach(() => act(() => tree.unmount()));

  it('ChefAddMenuItem opens the form as a new dish', async () => {
    await render(<ChefAddMenuItemScreen navigation={mockNavigation as never} route={route('ChefAddMenuItem')} />);
    expect(has('New dish')).toBe(true);
    expect(withLabel('Publish dish')).toBeTruthy();
  });

  it('ChefEditMenuItem opens the same form on the dish', async () => {
    await render(<ChefEditMenuItemScreen navigation={mockNavigation as never} route={route('ChefEditMenuItem', {menuItemId: ID})} />);
    expect(has('Dum Chicken biriyani')).toBe(true);
    expect(withLabel('Save changes')).toBeTruthy();
  });

  it('ChefMenuItemDetail (old links and notifications) hands over to the edit form with the same dish', async () => {
    await render(<ChefMenuItemDetailScreen navigation={mockNavigation as never} route={route('ChefMenuItemDetail', {menuItemId: ID})} />);
    expect(mockNavigation.replace).toHaveBeenCalledTimes(1);
    expect(mockNavigation.replace).toHaveBeenCalledWith('ChefEditMenuItem', {menuItemId: ID});
  });
});
