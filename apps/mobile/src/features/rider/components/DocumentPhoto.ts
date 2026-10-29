import {Alert, Linking} from 'react-native';
import * as ImagePicker from 'expo-image-picker';

export interface PhotoWords {
  title: string;
  take: string;
  gallery: string;
  cancel: string;
  denied: string;
  openSettings: string;
}

// Below 1 the picker saves a new file: JPEG, or PNG for a PNG. Those are formats the server takes (riderApi.live).
const QUALITY = 0.7;

async function takePhoto(words: PhotoWords): Promise<string | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    Alert.alert(words.denied, undefined, [
      {text: words.cancel, style: 'cancel'},
      {text: words.openSettings, onPress: () => Linking.openSettings().catch(() => undefined)},
    ]);
    return null;
  }
  const shot = await ImagePicker.launchCameraAsync({cameraType: ImagePicker.CameraType.back, mediaTypes: ['images'], quality: QUALITY});
  return shot.canceled ? null : (shot.assets[0]?.uri ?? null);
}

// The system photo picker needs no storage permission.
async function fromGallery(): Promise<string | null> {
  const picked = await ImagePicker.launchImageLibraryAsync({mediaTypes: ['images'], quality: QUALITY});
  return picked.canceled ? null : (picked.assets[0]?.uri ?? null);
}

/**
 * Asks how to add a document photo: with the back camera, or one already on the phone (a rider often has their PAN or RC
 * photographed). Resolves to the photo, or null when the rider cancels or refuses the camera (then they were told how to
 * allow it). Android shows the last button on the right, so "Take a photo" leads.
 */
export function chooseDocumentPhoto(words: PhotoWords): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const pick = (source: () => Promise<string | null>) => () => {
      source().then(resolve, reject);
    };
    Alert.alert(
      words.title,
      undefined,
      [
        {text: words.cancel, style: 'cancel', onPress: () => resolve(null)},
        {text: words.gallery, onPress: pick(fromGallery)},
        {text: words.take, onPress: pick(() => takePhoto(words))},
      ],
      {cancelable: true, onDismiss: () => resolve(null)},
    );
  });
}
