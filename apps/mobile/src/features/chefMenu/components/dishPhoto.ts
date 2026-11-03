import {Alert, Linking} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import {toAppApiError} from '../../../core/http/apiError';
import {shrinkPhoto} from '../../../core/media/shrinkPhoto';
import {CHEF_MENU_IMAGE_CONTENT_TYPES, chefMenuApi, type ChefMenuItemImage} from '../api/chefMenuApi';

const MENU_IMAGE_LIMIT_REACHED = 'MENU_IMAGE_LIMIT_REACHED';

export type DishPhoto = ImagePicker.ImagePickerAsset;
export type DishPhotoSource = 'camera' | 'gallery';

/**
 * Takes a photo or picks one, cropped to 4:3. Resolves to the photo, to a plain-words problem,
 * or to null when the chef cancelled or has not allowed access (the permission explanation is shown here).
 */
export async function pickDishPhoto(source: DishPhotoSource): Promise<{photo: DishPhoto} | {error: string} | null> {
  const camera = source === 'camera';
  try {
    const permission = camera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        camera ? 'Camera access needed' : 'Photo access needed',
        camera
          ? 'Allow camera access for Craves in your phone settings to take this photo.'
          : 'Allow photo access for Craves in your phone settings to choose this photo.',
        [{text: 'Not now', style: 'cancel'}, {text: 'Open settings', onPress: () => Linking.openSettings()}],
      );
      return null;
    }
    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.9,
    };
    const result = camera
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
    const photo = result.canceled ? undefined : result.assets[0];
    if (!photo) {
      return null;
    }
    if (photo.mimeType && !(CHEF_MENU_IMAGE_CONTENT_TYPES as readonly string[]).includes(photo.mimeType)) {
      return {error: 'Choose a JPEG, PNG or WebP image.'};
    }
    return {photo};
  } catch {
    return {
      error: camera
        ? 'The camera could not be opened. Please try again.'
        : 'The photo library could not be opened. Please try again.',
    };
  }
}

/** Deletes dish photos one by one. One that will not delete is left: the new photo is already saved, so the save must not fail. */
async function removeImages(menuItemId: string, images: readonly ChefMenuItemImage[]): Promise<void> {
  for (const image of images) {
    try {
      await chefMenuApi.deleteImage(menuItemId, image.id);
    } catch {
      // Left in place: it can be cleared on the next photo change.
    }
  }
}

/**
 * Sends the photo as the dish's main one and then deletes the dish's old photos, so they do not pile up to the server's
 * limit of 5. False when it did not upload (the dish itself is already saved), 'limit' when the dish is full of photos
 * that could not be cleared.
 */
export async function uploadDishPhoto(
  menuItemId: string,
  photo: DishPhoto,
  oldImages: readonly ChefMenuItemImage[] = [],
): Promise<boolean | 'limit'> {
  try {
    const file = await shrinkPhoto(photo, `craves-dish-${menuItemId}.jpg`);
    const send = () => {
      const formData = new FormData();
      formData.append('file', file as unknown as Blob);
      return chefMenuApi.uploadImage(menuItemId, formData, true);
    };
    let stale = oldImages;
    try {
      await send();
    } catch (error) {
      const extras = stale.filter(image => !image.primary);
      if (toAppApiError(error).code !== MENU_IMAGE_LIMIT_REACHED || extras.length === 0) {
        throw error;
      }
      // A dish saved by an older build can already hold 5 photos: free the extra ones (not the cover), then send once more.
      await removeImages(menuItemId, extras);
      stale = stale.filter(image => image.primary);
      await send();
    }
    await removeImages(menuItemId, stale);
    return true;
  } catch (error) {
    return toAppApiError(error).code === MENU_IMAGE_LIMIT_REACHED ? 'limit' : false;
  }
}
