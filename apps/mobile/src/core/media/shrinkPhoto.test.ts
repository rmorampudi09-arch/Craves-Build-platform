import {ImageManipulator, SaveFormat} from 'expo-image-manipulator';
import {shrinkPhoto, type PhotoToShrink} from './shrinkPhoto';

const mockResize = jest.fn();
const mockSave = jest.fn();
jest.mock('expo-image-manipulator', () => ({
  SaveFormat: {JPEG: 'jpeg'},
  ImageManipulator: {manipulate: jest.fn()},
}));

const photo = (width: number, height: number): PhotoToShrink => ({
  uri: 'file:///camera/IMG_1.jpg',
  width,
  height,
  fileName: 'IMG_1.jpg',
  mimeType: 'image/jpeg',
});

beforeEach(() => {
  jest.clearAllMocks();
  const context = {resize: mockResize, renderAsync: jest.fn(async () => ({saveAsync: mockSave}))};
  mockResize.mockReturnValue(context);
  mockSave.mockResolvedValue({uri: 'file:///cache/small.jpg', width: 1600, height: 1200});
  jest.mocked(ImageManipulator.manipulate).mockReturnValue(context as never);
});

describe('shrinkPhoto', () => {
  it('shrinks a wide photo to 1600 px and returns a JPEG under the name given', async () => {
    await expect(shrinkPhoto(photo(8160, 6120), 'craves-photo.jpg')).resolves.toEqual({
      uri: 'file:///cache/small.jpg',
      name: 'craves-photo.jpg',
      type: 'image/jpeg',
    });
    expect(mockResize).toHaveBeenCalledWith({width: 1600});
    expect(mockSave).toHaveBeenCalledWith({compress: 0.8, format: SaveFormat.JPEG});
  });

  it('shrinks a tall photo by its height', async () => {
    await shrinkPhoto(photo(3000, 4000), 'craves-photo.jpg');

    expect(mockResize).toHaveBeenCalledWith({height: 1600});
  });

  it('keeps the size of a photo that is already small but still compresses it', async () => {
    await expect(shrinkPhoto(photo(1200, 900), 'craves-photo.jpg')).resolves.toMatchObject({uri: 'file:///cache/small.jpg'});

    expect(mockResize).not.toHaveBeenCalled();
  });

  it('returns the original photo when it cannot be shrunk', async () => {
    mockSave.mockRejectedValueOnce(new Error('out of memory'));

    await expect(shrinkPhoto(photo(8160, 6120), 'craves-photo.jpg')).resolves.toEqual({
      uri: 'file:///camera/IMG_1.jpg',
      name: 'IMG_1.jpg',
      type: 'image/jpeg',
    });
  });

  it('names an original that has no file name or type', async () => {
    mockSave.mockRejectedValueOnce(new Error('out of memory'));

    await expect(shrinkPhoto({uri: 'file:///a', width: 4000, height: 3000}, 'craves-photo.jpg')).resolves.toEqual({
      uri: 'file:///a',
      name: 'craves-photo.jpg',
      type: 'image/jpeg',
    });
  });
});
