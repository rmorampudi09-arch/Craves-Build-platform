import {Alert, Linking} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import {CHEF_MENU_IMAGE_CONTENT_TYPES, chefMenuApi} from '../api/chefMenuApi';

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

/** Sends the photo as the dish's main one. False when it did not upload (the dish itself is already saved). */
export async function uploadDishPhoto(menuItemId: string, photo: DishPhoto): Promise<boolean> {
  try {
    const formData = new FormData();
    formData.append(
      'file',
      {
        uri: photo.uri,
        name: photo.fileName?.trim() || `craves-dish-${menuItemId}.jpg`,
        type: photo.mimeType || 'image/jpeg',
      } as unknown as Blob,
    );
    await chefMenuApi.uploadImage(menuItemId, formData, true);
    return true;
  } catch {
    return false;
  }
}
