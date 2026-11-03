import {ImageManipulator, SaveFormat} from 'expo-image-manipulator';
import type {ImagePickerAsset} from 'expo-image-picker';

// The servers keep chef photos at 1600 px on the long edge; anything larger only slows the upload.
const MAX_EDGE = 1600;

export type PhotoToShrink = Pick<ImagePickerAsset, 'uri' | 'width' | 'height'> & Partial<Pick<ImagePickerAsset, 'fileName' | 'mimeType'>>;

/**
 * A full-size camera photo (often 8+ MB) is too big for the server's size limits or too slow over mobile data,
 * so it is shrunk to a JPEG first. If shrinking fails, the original is sent.
 */
export async function shrinkPhoto(photo: PhotoToShrink, name: string): Promise<{uri: string; name: string; type: string}> {
  try {
    const context = ImageManipulator.manipulate(photo.uri);
    if (Math.max(photo.width, photo.height) > MAX_EDGE) {
      context.resize(photo.width >= photo.height ? {width: MAX_EDGE} : {height: MAX_EDGE});
    }
    const image = await context.renderAsync();
    const small = await image.saveAsync({compress: 0.8, format: SaveFormat.JPEG});
    return {uri: small.uri, name, type: 'image/jpeg'};
  } catch {
    return {uri: photo.uri, name: photo.fileName?.trim() || name, type: photo.mimeType || 'image/jpeg'};
  }
}
