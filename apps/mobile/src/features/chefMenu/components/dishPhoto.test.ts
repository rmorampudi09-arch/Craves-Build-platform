import {ImageManipulator, SaveFormat} from 'expo-image-manipulator';
import {AppApiError} from '../../../core/http/apiError';
import {chefMenuApi, type ChefMenuItemImage} from '../api/chefMenuApi';
import {DishPhoto, uploadDishPhoto} from './dishPhoto';

const mockResize = jest.fn();
const mockSave = jest.fn();
jest.mock('expo-image-manipulator', () => ({
  SaveFormat: {JPEG: 'jpeg'},
  ImageManipulator: {manipulate: jest.fn()},
}));

const DISH_ID = '11111111-1111-4111-8111-111111111111';
const photo = (width: number, height: number): DishPhoto =>
  ({uri: 'file:///camera/IMG_1.jpg', width, height, fileName: 'IMG_1.jpg', mimeType: 'image/jpeg'}) as DishPhoto;
const image = (n: number, primary: boolean): ChefMenuItemImage =>
  ({id: `123e4567-e89b-42d3-a456-42661417405${n}`, menuItemId: DISH_ID, primary}) as ChefMenuItemImage;
const limit = () => new AppApiError('MENU_IMAGE_LIMIT_REACHED', 'A dish can have up to 5 photos', 409);
let append: jest.SpyInstance;
const sentFile = () => append.mock.calls[0][1] as {uri: string; name: string; type: string};

beforeEach(() => {
  jest.clearAllMocks();
  append =jest.spyOn(FormData.prototype, 'append').mockImplementation(() => undefined);
  jest.spyOn(chefMenuApi, 'uploadImage').mockResolvedValue({} as never);
  jest.spyOn(chefMenuApi, 'deleteImage').mockResolvedValue(undefined);
  const context = {resize: mockResize, renderAsync: jest.fn(async () => ({saveAsync: mockSave}))};
  mockResize.mockReturnValue(context);
  mockSave.mockResolvedValue({uri: 'file:///cache/small.jpg', width: 1600, height: 1200});
  jest.mocked(ImageManipulator.manipulate).mockReturnValue(context as never);
});

afterEach(() => jest.restoreAllMocks());

describe('uploadDishPhoto', () => {
  it('shrinks a full-size camera photo to the 1600 px the server keeps before sending it', async () => {
    await expect(uploadDishPhoto(DISH_ID, photo(8160, 6120))).resolves.toBe(true);

    expect(mockResize).toHaveBeenCalledWith({width: 1600});
    expect(mockSave).toHaveBeenCalledWith({compress: 0.8, format: SaveFormat.JPEG});
    expect(sentFile()).toEqual({uri: 'file:///cache/small.jpg', name: `craves-dish-${DISH_ID}.jpg`, type: 'image/jpeg'});
  });

  it('shrinks a tall photo by its height', async () => {
    await uploadDishPhoto(DISH_ID, photo(3000, 4000));

    expect(mockResize).toHaveBeenCalledWith({height: 1600});
  });

  it('keeps the size of a photo that is already small, and still sends a compressed JPEG', async () => {
    await uploadDishPhoto(DISH_ID, photo(1200, 900));

    expect(mockResize).not.toHaveBeenCalled();
    expect(sentFile().uri).toBe('file:///cache/small.jpg');
  });

  it('sends the original photo when it cannot be shrunk', async () => {
    mockSave.mockRejectedValueOnce(new Error('out of memory'));

    await expect(uploadDishPhoto(DISH_ID, photo(8160, 6120))).resolves.toBe(true);

    expect(sentFile()).toEqual({uri: 'file:///camera/IMG_1.jpg', name: 'IMG_1.jpg', type: 'image/jpeg'});
  });

  it('reports false when the upload fails, as before', async () => {
    jest.mocked(chefMenuApi.uploadImage).mockRejectedValueOnce(new Error('timeout of 45000ms exceeded'));

    await expect(uploadDishPhoto(DISH_ID, photo(8160, 6120))).resolves.toBe(false);
  });

  describe('replacing the dish photo', () => {
    it('deletes the old photos of the dish once the new one is saved', async () => {
      const old = [image(1, true), image(2, false)];

      await expect(uploadDishPhoto(DISH_ID, photo(1200, 900), old)).resolves.toBe(true);

      expect(chefMenuApi.deleteImage).toHaveBeenCalledTimes(2);
      expect(chefMenuApi.deleteImage).toHaveBeenCalledWith(DISH_ID, old[0].id);
      expect(chefMenuApi.deleteImage).toHaveBeenCalledWith(DISH_ID, old[1].id);
    });

    it('keeps the old photos when the new one did not upload', async () => {
      jest.mocked(chefMenuApi.uploadImage).mockRejectedValueOnce(new Error('offline'));

      await expect(uploadDishPhoto(DISH_ID, photo(1200, 900), [image(1, true)])).resolves.toBe(false);

      expect(chefMenuApi.deleteImage).not.toHaveBeenCalled();
    });

    it('still reports the photo saved when an old one cannot be deleted', async () => {
      jest.mocked(chefMenuApi.deleteImage).mockRejectedValue(new Error('offline'));

      await expect(uploadDishPhoto(DISH_ID, photo(1200, 900), [image(1, true), image(2, false)])).resolves.toBe(true);

      expect(chefMenuApi.deleteImage).toHaveBeenCalledTimes(2);
    });

    it('frees the extra photos of a dish already at the limit, then sends the new one and drops the old cover', async () => {
      const old = [image(1, true), image(2, false), image(3, false)];
      jest.mocked(chefMenuApi.uploadImage).mockRejectedValueOnce(limit());

      await expect(uploadDishPhoto(DISH_ID, photo(1200, 900), old)).resolves.toBe(true);

      expect(chefMenuApi.uploadImage).toHaveBeenCalledTimes(2);
      expect(jest.mocked(chefMenuApi.deleteImage).mock.calls.map(call => call[1])).toEqual([old[1].id, old[2].id, old[0].id]);
    });

    it('reports the limit when there is nothing it may delete', async () => {
      jest.mocked(chefMenuApi.uploadImage).mockRejectedValue(limit());

      await expect(uploadDishPhoto(DISH_ID, photo(1200, 900), [image(1, true)])).resolves.toBe('limit');

      expect(chefMenuApi.uploadImage).toHaveBeenCalledTimes(1);
      expect(chefMenuApi.deleteImage).not.toHaveBeenCalled();
    });
  });
});
