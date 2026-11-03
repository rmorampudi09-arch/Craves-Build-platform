import {ImageManipulator, SaveFormat} from 'expo-image-manipulator';
import {chefMenuApi} from '../api/chefMenuApi';
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
let append: jest.SpyInstance;
const sentFile = () => append.mock.calls[0][1] as {uri: string; name: string; type: string};

beforeEach(() => {
  jest.clearAllMocks();
  append =jest.spyOn(FormData.prototype, 'append').mockImplementation(() => undefined);
  jest.spyOn(chefMenuApi, 'uploadImage').mockResolvedValue({} as never);
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
});
